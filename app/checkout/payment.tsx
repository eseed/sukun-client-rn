import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import {
  BackButton,
  BulletHeading,
  Button,
  FieldBox,
  FieldLabel,
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
import { getPaymob } from '../../src/lib/paymob';
import { useCheckoutStore } from '../../src/stores/checkout';
import { designAsset } from '../../src/theme/assets';
import { colors } from '../../src/theme/tokens';

/** Paymob is resolved through a platform-specific adapter so Metro can bundle the web app. */
const paymob = getPaymob();
const Paymob = paymob?.default ?? null;
const PaymentStatus = paymob?.PaymentStatus ?? null;

/**
 * Design screen 11 · Payment.
 *
 * PENDING BACKEND — Paymob is not wired on staging; the mock settles a simulated webhook a
 * few seconds after the hosted checkout opens.
 *
 * The design draws card number / expiry / CVV fields inline. Those are rendered here as a
 * non-editable preview only. Card entry is handed to Paymob's hosted checkout; the order is
 * paid only when the server confirms the webhook (CLAUDE.md rule 9).
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

  const statusQuery = usePaymentStatus(validOrderId, { poll: polling });
  const { data: status } = statusQuery;

  // `usePaymentStatus` stops its own interval once the order settles either way, so there is
  // no polling flag to unwind here — the only side effect is leaving for the confirmation.
  const settled = status?.orderStatus === 'paid';
  const terminal = Boolean(
    status &&
      (['paid', 'failed', 'expired', 'cancelled', 'refunded'].includes(status.orderStatus) ||
        ['captured', 'failed', 'expired', 'refunded', 'voided'].includes(status.paymentStatus)),
  );
  const failed = Boolean(
    status &&
      (['failed', 'expired', 'cancelled', 'refunded'].includes(status.orderStatus) ||
        ['failed', 'expired', 'refunded', 'voided'].includes(status.paymentStatus)),
  );
  const providerCaptured = status?.paymentStatus === 'captured' && !settled && !failed;

  useEffect(() => {
    if (!settled) return;
    reset();
    router.replace(`/checkout/confirmation?orderId=${validOrderId}`);
  }, [reset, router, settled, validOrderId]);

  async function onPay() {
    if (!validOrderId) return;
    setError(null);

    if (!Paymob) {
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
    if (!Paymob) return;
    Paymob.setAppName('Sukun');
    Paymob.setButtonBackgroundColor(colors.gold500);
    Paymob.setButtonTextColor(colors.creme);
    Paymob.setSdkListener((result: string) => {
      if (result === PaymentStatus?.FAIL || result === PaymentStatus?.CANCELLED) {
        setPolling(false);
        setError('The payment did not go through. Nothing was charged.');
      }
    });
    Paymob.presentPayVC(intent.clientSecret, intent.publicKey);
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

  if (orderQuery.isPending) {
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

      <View style={styles.fields} pointerEvents="none">
        <View style={styles.field}>
          <FieldLabel>Card number</FieldLabel>
          <FieldBox style={styles.disabledBox}>
            <Text variant="bodyValue" color={colors.textMuted}>
              •••• •••• •••• ••••
            </Text>
          </FieldBox>
        </View>

        <View style={styles.row}>
          <View style={styles.rowItem}>
            <FieldLabel>Expiry</FieldLabel>
            <FieldBox style={styles.disabledBox}>
              <Text variant="bodyValue" color={colors.textMuted}>
                MM/YY
              </Text>
            </FieldBox>
          </View>
          <View style={styles.rowItem}>
            <FieldLabel>CVV</FieldLabel>
            <FieldBox style={styles.disabledBox}>
              <Text variant="bodyValue" color={colors.textMuted}>
                •••
              </Text>
            </FieldBox>
          </View>
        </View>
      </View>

      <Text variant="metaSm" style={styles.note}>
        Card details are entered in Paymob&apos;s secure sheet, not in Sukun.
      </Text>

      {polling && !failed && !settled ? (
        <Text variant="metaSm" color={colors.accentSky} style={styles.note}>
          {providerCaptured
            ? 'Payment received. Waiting for the server to finish confirming it…'
            : 'Waiting for the server to confirm payment…'}
        </Text>
      ) : null}

      {failed || error ? (
        <Text variant="metaSm" color={colors.rose700} style={styles.note}>
          {error ??
            (status?.orderStatus === 'expired'
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

