import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
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

  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * The SDK's own verdict — `null` until the sheet reports back. Owned by `usePaymobSheet`, which
   * latches the first verdict of a session so the CANCELLED the sheet emits when it is dismissed
   * cannot overwrite the SUCCESS that preceded it.
   */
  const sheet = usePaymobSheet();
  const sdkResult = sheet.outcome;

  const statusQuery = usePaymentStatus(validOrderId, { poll: polling });
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

  useEffect(() => {
    if (!settled) return;
    reset();
    router.replace(`/checkout/confirmation?orderId=${validOrderId}`);
  }, [reset, router, settled, validOrderId]);

  async function onPay() {
    if (!validOrderId) return;
    setError(null);

    if (!sheet.available) {
      setError('Payment needs the Sukun app — it isn’t available here.');
      return;
    }

    try {
      const intent = await initiate.mutateAsync(validOrderId);
      presentPaymob(intent);
    } catch (err) {
      setPolling(false);
      setError(messageForError(err));
    }
  }

  async function onRetry() {
    if (!validOrderId) return;
    setError(null);
    try {
      const intent = await retry.mutateAsync(validOrderId);
      presentPaymob(intent);
    } catch (err) {
      setPolling(false);
      setError(messageForError(err));
    }
  }

  function presentPaymob(intent: { clientSecret: string; publicKey: string }) {
    if (!sheet.available) return;
    sheet.present(intent);
    setPolling(true);
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
  const busy = initiate.isPending || retry.isPending || polling;

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

      {polling && !failed && !settled ? (
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

