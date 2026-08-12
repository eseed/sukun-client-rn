import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Platform, StyleSheet, View } from 'react-native';
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
 * paymob-reactnative is a native module (Android data binding, an iOS pod) — it doesn't run
 * in Expo Go and isn't bundleable for web, so it's required lazily and only off-web. On web
 * or in Expo Go, `paymob` stays null and `onPay` reports the platform as unsupported instead
 * of throwing the SDK's own linking error.
 */
// A static import would evaluate the native module's linking check on every platform.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const paymob = Platform.OS === 'web' ? null : require('paymob-reactnative');
const Paymob = paymob?.default ?? null;
const PaymentStatus = paymob?.PaymentStatus ?? null;

/**
 * Design screen 11 · Payment.
 *
 * PENDING BACKEND — Paymob is not wired on staging; the mock settles a simulated webhook a
 * few seconds after the sheet opens.
 *
 * The design draws card number / expiry / CVV fields inline. Those are rendered here as a
 * non-editable preview of what Paymob's own sheet will ask for, and never collect input: the
 * app hands card entry to `Paymob.presentPayVC`, and the SDK's result is UI feedback only —
 * the order is paid only once the server confirms the webhook (CLAUDE.md rule 9). Taking card
 * details in-process would put the app in PCI scope, and trusting the SDK's own status would
 * let a client-side result stand in for settlement, same as trusting a redirect would.
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

  useEffect(() => {
    if (!Paymob) return;
    return () => Paymob.removeSdkListener();
  }, []);

  async function onPay() {
    if (!orderId) return;
    setError(null);

    if (!Paymob) {
      setError('Payment needs the Sukun app — it isn’t available here.');
      return;
    }

    try {
      const intent = await initiate.mutateAsync(orderId);

      // Branding must be set before `presentPayVC` — the SDK ignores changes made after.
      Paymob.setAppName('Sukun');
      Paymob.setButtonBackgroundColor(colors.gold500);
      Paymob.setButtonTextColor(colors.creme);

      // Feedback only, not settlement: `usePaymentStatus` polling the webhook decides that.
      Paymob.setSdkListener((result: string) => {
        if (result === PaymentStatus.FAIL || result === PaymentStatus.CANCELLED) {
          setPolling(false);
          setError('The payment did not go through. Nothing was charged.');
        }
      });

      Paymob.presentPayVC(intent.clientSecret, intent.publicKey);
      setPolling(true);
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
