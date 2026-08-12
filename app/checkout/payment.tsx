import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import {
  BackButton,
  BulletHeading,
  Button,
  FieldBox,
  FieldLabel,
  Screen,
  StepLabel,
  Text,
} from '../../src/components/ui';
import { useInitiatePayment, useOrder, usePaymentStatus } from '../../src/hooks/queries';
import { messageForError } from '../../src/lib/errors';
import { formatEgp } from '../../src/lib/format';
import { useCheckoutStore } from '../../src/stores/checkout';
import { designAsset } from '../../src/theme/assets';
import { colors } from '../../src/theme/tokens';

/**
 * Design screen 11 · Payment.
 *
 * PENDING BACKEND — Paymob is not wired on staging; the mock settles a simulated webhook a
 * few seconds after the sheet opens.
 *
 * The design draws card number / expiry / CVV fields inline. Those are rendered here as a
 * non-editable preview of what Paymob will ask for, and never collect input: the app must
 * hand card entry to Paymob's hosted sheet and treat the order as paid only when the server
 * confirms the webhook (CLAUDE.md rule 9). Taking card details in-process would put the app
 * in PCI scope and let a client redirect stand in for settlement.
 */
export default function PaymentScreen() {
  const router = useRouter();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();

  const reset = useCheckoutStore((s) => s.reset);
  const { data: order } = useOrder(orderId);
  const initiate = useInitiatePayment();

  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: status } = usePaymentStatus(orderId, { poll: polling });

  // `usePaymentStatus` stops its own interval once the order settles either way, so there is
  // no polling flag to unwind here — the only side effect is leaving for the confirmation.
  const settled = status?.orderStatus === 'paid';
  const failed = status?.paymentStatus === 'failed';

  useEffect(() => {
    if (!settled) return;
    reset();
    router.replace(`/checkout/confirmation?orderId=${orderId}`);
  }, [settled, orderId, router, reset]);

  async function onPay() {
    if (!orderId) return;
    setError(null);
    try {
      const intent = await initiate.mutateAsync(orderId);
      setPolling(true);

      // The hosted Paymob sheet. Its result is ignored on purpose — settlement is decided by
      // the server webhook, which `usePaymentStatus` polls for.
      const checkoutUrl = `https://accept.paymob.com/unifiedcheckout/?publicKey=${intent.publicKey}&clientSecret=${intent.clientSecret}`;
      await WebBrowser.openBrowserAsync(checkoutUrl).catch(() => undefined);
    } catch (err) {
      setPolling(false);
      setError(messageForError(err));
    }
  }

  const card = designAsset('cardSukunOrange');
  const amount = order ? formatEgp(order.totalEgp) : '—';
  const busy = initiate.isPending || polling;

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
        {card ? (
          <Image source={card} style={styles.cardImage} />
        ) : (
          <View style={styles.cardFallback} />
        )}
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
          Waiting for the payment to confirm…
        </Text>
      ) : null}

      {failed || error ? (
        <Text variant="metaSm" color={colors.rose700} style={styles.note}>
          {error ?? 'The payment did not go through. Nothing was charged.'}
        </Text>
      ) : null}

      <View style={styles.spacer} />

      <Button
        label={`Pay ${amount}`}
        variant="accent"
        onPress={onPay}
        loading={busy}
        disabled={!order}
      />
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
  cardFallback: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: colors.gold500,
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
  spacer: {
    flex: 1,
    minHeight: 12,
  },
});
