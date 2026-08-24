import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import {
  BackButton,
  BulletHeading,
  Button,
  ResourceState,
  Screen,
  StepLabel,
  Text,
} from '../../src/components/ui';
import {
  useInitiatePayment,
  useOrder,
  usePaymentStatus,
  useRetryPayment,
} from '../../src/hooks/queries';
import { track } from '../../src/lib/analytics';
import { messageForError } from '../../src/lib/errors';
import { formatEgp } from '../../src/lib/format';
import { usePaymobSheet } from '../../src/hooks/usePaymobSheet';
import { useCheckoutStore } from '../../src/stores/checkout';
import { designAsset } from '../../src/theme/assets';
import { colors } from '../../src/theme/tokens';

/**
 * Design screen 11 · Payment.
 *
 * The design draws card number / expiry / CVV fields inline, but the SDK owns card entry
 * entirely: `presentPayVC` opens Paymob's own sheet. Rendering dead look-alike fields here only
 * invited people to type into boxes that do nothing, so the screen goes straight from the
 * amount to the pay button.
 *
 * The payment outcome comes from `Paymob.setSdkListener`, per the SDK documentation:
 * SUCCESS / FAIL / PENDING / CANCELLED. The order status query still runs so a PENDING
 * transaction can resolve and so the screen reflects orders that settled elsewhere.
 */
export default function PaymentScreen() {
  const router = useRouter();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const validOrderId = typeof orderId === 'string' && orderId.length > 0 ? orderId : undefined;

  const reset = useCheckoutStore((s) => s.reset);
  const orderQuery = useOrder(validOrderId);
  const { data: order } = orderQuery;
  const initiate = useInitiatePayment();
  const retry = useRetryPayment();

  /**
   * Whether a sheet has been presented at all. Not the switch for the status query below, which
   * runs from mount because this screen is only ever reached with an order already mid-payment.
   */
  const [sheetPresented, setSheetPresented] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * The SDK's own verdict — `null` until the sheet reports back. Owned by `usePaymobSheet`, which
   * latches the first verdict of a session so the CANCELLED the sheet emits when it is dismissed
   * cannot overwrite the SUCCESS that preceded it.
   */
  const sheet = usePaymobSheet();
  const sdkResult = sheet.outcome;

  // Polls from mount and stops on its own at a terminal state. Gating this on a sheet *this*
  // screen had opened meant arriving here after a PENDING verdict — the one route in — began no
  // polling at all, so the payment never resolved on the screen built to resolve it.
  const statusQuery = usePaymentStatus(validOrderId, { poll: true });
  const { data: status } = statusQuery;

  const settled = sdkResult === 'success' || status?.orderStatus === 'paid';
  const terminal = Boolean(
    settled ||
    (status &&
      (['paid', 'failed', 'expired', 'cancelled', 'refunded'].includes(status.orderStatus) ||
        ['captured', 'failed', 'expired', 'refunded', 'voided'].includes(status.paymentStatus))),
  );
  const failed = Boolean(
    !settled &&
    (sdkResult === 'fail' ||
      sdkResult === 'cancelled' ||
      (status &&
        (['failed', 'expired', 'cancelled', 'refunded'].includes(status.orderStatus) ||
          ['failed', 'expired', 'refunded', 'voided'].includes(status.paymentStatus)))),
  );
  /** SDK reported PENDING: the transaction is still being processed on Paymob's side. */
  const pending = sdkResult === 'pending' && !settled && !failed;

  const trackedSettledRef = useRef(false);
  const trackedFailedRef = useRef(false);

  useEffect(() => {
    if (!settled) return;
    if (!trackedSettledRef.current) {
      trackedSettledRef.current = true;
      if (order) {
        track('purchase_completed', {
          order_id: order.id,
          event_id: order.eventId,
          total: Number(order.totalEgp),
          currency: order.currency,
          item_count: order.items.reduce((sum, item) => sum + item.quantity, 0),
          guest_count: order.guests.length,
          has_promo: Number(order.discountEgp) > 0,
        });
      }
    }
    reset();
    router.replace(`/checkout/confirmation?orderId=${validOrderId}`);
  }, [order, reset, router, settled, validOrderId]);

  useEffect(() => {
    if (!failed || trackedFailedRef.current || !validOrderId) return;
    trackedFailedRef.current = true;
    track('payment_failed', {
      order_id: validOrderId,
      outcome: sdkResult === 'cancelled' ? 'cancelled' : 'fail',
    });
  }, [failed, sdkResult, validOrderId]);

  async function onPay() {
    if (!validOrderId) return;
    setError(null);

    if (!sheet.available) {
      setError('Payment needs the Sukun app. It isn’t available here.');
      return;
    }

    try {
      const intent = await initiate.mutateAsync(validOrderId);
      track('payment_started', {
        order_id: validOrderId,
        total: Number(order?.totalEgp ?? 0),
        currency: order?.currency ?? 'EGP',
      });
      presentPaymob(intent);
    } catch (err) {
      setSheetPresented(false);
      setError(messageForError(err));
    }
  }

  async function onRetry() {
    if (!validOrderId) return;
    setError(null);
    try {
      const intent = await retry.mutateAsync(validOrderId);
      trackedFailedRef.current = false;
      track('payment_retried', { order_id: validOrderId });
      presentPaymob(intent);
    } catch (err) {
      setSheetPresented(false);
      setError(messageForError(err));
    }
  }

  function presentPaymob(intent: { clientSecret: string; publicKey: string }) {
    if (!sheet.available) return;
    sheet.present(intent);
    setSheetPresented(true);
  }

  if (!validOrderId) {
    return (
      <Screen>
        <ResourceState
          status="empty"
          emptyTitle="Payment link is incomplete"
          emptyMessage="Return to checkout and try again."
        />
      </Screen>
    );
  }

  if (orderQuery.isLoading) {
    return (
      <Screen>
        <ResourceState status="loading" loadingLabel="Loading payment..." />
      </Screen>
    );
  }

  if (orderQuery.isError || !order) {
    return (
      <Screen>
        <ResourceState
          status="error"
          errorMessage={messageForError(orderQuery.error)}
          onRetry={() => void orderQuery.refetch()}
        />
      </Screen>
    );
  }

  const card = designAsset('cardSukunOrange');
  const amount = order ? formatEgp(order.totalEgp) : '—';
  /*
   * A sheet is up and has not answered yet. Derived rather than latched: the old boolean was
   * set when the sheet opened and cleared nowhere, so a cancelled or declined payment left the
   * Pay button a permanent spinner and "Try payment again" permanently disabled — both actions
   * dead on the screen whose whole purpose is retrying. `present()` resets the outcome to null,
   * so this reads true again for each new attempt without anything to keep in sync.
   */
  const awaitingVerdict = sheetPresented && sdkResult === null;
  const busy = initiate.isPending || retry.isPending || awaitingVerdict;

  return (
    <Screen scroll contentStyle={styles.content}>
      <BackButton onPress={() => router.back()} style={styles.back} />

      <StepLabel>Payment</StepLabel>
      <View style={styles.heading}>
        <BulletHeading title={`Pay ${amount}`} size="md" />
      </View>

      <Text variant="meta" style={styles.secured}>
        Secured by Paymob · charged in EGP
      </Text>

      <View style={styles.cardArt}>
        <Image source={card} style={styles.cardImage} />
      </View>

      <Text variant="metaSm" style={styles.note}>
        Tapping pay opens Paymob&apos;s secure sheet, where you enter your card.
      </Text>

      {(awaitingVerdict || pending) && !failed && !settled ? (
        <Text variant="metaSm" color={colors.accentSky} style={styles.note}>
          {pending
            ? 'Your payment is still being processed. This can take a moment…'
            : 'Waiting for the payment to complete…'}
        </Text>
      ) : null}

      {failed || error ? (
        <Text variant="metaSm" color={colors.rose700} style={styles.note}>
          {error ??
            (sdkResult === 'cancelled'
              ? 'Payment was cancelled. Nothing was charged.'
              : status?.orderStatus === 'expired'
                ? 'This payment hold expired. You can try again.'
                : status?.orderStatus === 'cancelled'
                  ? 'This order was cancelled and cannot be paid.'
                  : status?.orderStatus === 'refunded'
                    ? 'This order has been refunded and cannot be paid.'
                    : 'The payment did not go through. Nothing was charged.')}
        </Text>
      ) : null}

      <View style={styles.spacer} />

      <Button
        label={`Pay ${amount}`}
        variant="accent"
        onPress={onPay}
        loading={busy}
        disabled={terminal}
      />

      {failed && status?.orderStatus !== 'cancelled' && status?.orderStatus !== 'refunded' ? (
        <Button
          label="Try payment again"
          variant="secondary"
          onPress={() => void onRetry()}
          loading={retry.isPending}
          disabled={busy}
          style={styles.retryButton}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 24,
    flexGrow: 1,
  },
  back: {
    marginBottom: 18,
  },
  heading: {
    marginTop: 6,
    marginBottom: 6,
  },
  secured: {
    marginBottom: 22,
  },
  cardArt: {
    width: '100%',
    height: 192,
    overflow: 'hidden',
    marginBottom: 24,
  },
  cardImage: {
    position: 'absolute',
    width: 394,
    height: 858,
    left: -20,
    top: -172,
  },
  fields: {
    gap: 14,
    marginBottom: 12,
  },
  field: {
    gap: 7,
  },
  row: {
    flexDirection: 'row',
    gap: 14,
  },
  rowItem: {
    flex: 1,
    gap: 7,
  },
  disabledBox: {
    opacity: 0.6,
  },
  note: {
    marginBottom: 8,
  },
  retryButton: {
    marginTop: 12,
  },
  spacer: {
    flex: 1,
    minHeight: 12,
  },
});
