import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Kicker, StudioNote, TextAction, studioStyles } from '../../src/components/studio/StudioUi';
import { Button, InlineError, ResourceState, Screen, Text } from '../../src/components/ui';
import { useHardwareBack } from '../../src/components/checkout/checkoutNavigation';
import { useInitiatePayment, useRetryPayment } from '../../src/hooks/queries';
import { useStudioCheckout } from '../../src/hooks/studio';
import { useHoldCountdown } from '../../src/hooks/useHoldCountdown';
import { usePaymobSheet } from '../../src/hooks/usePaymobSheet';
import { track } from '../../src/lib/analytics';
import { formatCountdown, formatEgp } from '../../src/lib/format';
import { studioErrorMessage } from '../../src/lib/studio';
import { colors } from '../../src/theme/tokens';

/**
 * Design `paymob` (P4): pays a Studio order through the same Paymob sheet as events (card only,
 * no saved cards; CLAUDE.md rule 9). The server's checkout (`GET mobile/studio/checkouts/:id`)
 * says what to do next, and "paid" is the server's word alone, after Paymob's webhook.
 *
 * Closing the sheet without paying keeps the spot held as an incomplete booking, shown in
 * Bookings and on Studio home with "Continue booking", until the hold runs out (sc-4-6). Once it
 * has, "Try payment again" takes a fresh hold, while the class can still be checked into.
 */
export default function StudioPayScreen() {
  const router = useRouter();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const sheet = usePaymobSheet();
  const [sheetOpened, setSheetOpened] = useState(false);
  const order = useStudioCheckout(orderId, true);
  const data = order.data;
  const initiate = useInitiatePayment();
  const retry = useRetryPayment();
  const { secondsLeft, expired } = useHoldCountdown(data?.holdExpiresAt);
  const opened = useRef(false);

  const leave = () => router.replace('/(tabs)/studio');
  useHardwareBack(leave);

  const paid = data?.paymentState === 'paid' || data?.paymentState === 'not_required';
  useEffect(() => {
    if (!paid || !orderId) return;
    track('studio_order_paid', { withClass: Boolean(data?.booking) });
    router.replace(`/studio/booked?orderId=${orderId}`);
  }, [data?.booking, orderId, paid, router]);

  // Each verdict from the sheet is checked with the server before the screen acts on it.
  useEffect(() => {
    if (sheet.outcomeAt !== null) void order.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet.outcomeAt]);

  const openSheet = async (mode: 'initiate' | 'retry') => {
    if (!orderId) return;
    const intent =
      mode === 'retry' ? await retry.mutateAsync(orderId) : await initiate.mutateAsync(orderId);
    // No `orderId`: the launch-time payment recovery reads event orders only.
    setSheetOpened(sheet.present(intent));
    void order.refetch();
  };

  // Open the sheet once, as soon as the order is ready for it.
  useEffect(() => {
    if (opened.current || !data) return;
    if (data.nextAction === 'initiate' || data.nextAction === 'continue_existing_payment') {
      opened.current = true;
      void Promise.resolve()
        .then(() => openSheet('initiate'))
        .catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const action = data?.nextAction;
  const busy = initiate.isPending || retry.isPending;
  const error = initiate.error ?? retry.error;
  const declined = sheet.outcome === 'fail' || sheet.outcome === 'cancelled';

  return (
    <Screen contentStyle={styles.content}>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <Kicker>Payment</Kicker>
      <Text style={studioStyles.title}>{data ? `Pay ${formatEgp(data.totalEgp)}` : 'Payment'}</Text>
      <Text style={[studioStyles.muted, styles.sub]}>Secured by Paymob · charged in EGP</Text>

      <ResourceState
        status={order.isPending ? 'loading' : order.isError ? 'error' : 'success'}
        loadingLabel="Getting your order..."
        errorMessage={studioErrorMessage(order.error)}
        onRetry={() => void order.refetch()}
      >
        {data ? (
          <View style={styles.body}>
            {data.booking && data.holdExpiresAt && !expired && !paid ? (
              <StudioNote tone="gold">
                This spot is held for you for {formatCountdown(secondsLeft)}
              </StudioNote>
            ) : null}

            {action === 'wait_for_confirmation' || sheet.outcome === 'pending' || paid ? (
              <View style={styles.waiting}>
                <ActivityIndicator color={colors.accentGold} />
                <Text style={studioStyles.muted}>Checking with your bank...</Text>
              </View>
            ) : null}

            {action === 'contact_support' ? (
              <StudioNote tone="sky">
                We received your payment and are finishing your order. If it doesn&apos;t appear in
                a few minutes, contact Sukun for assistance.
              </StudioNote>
            ) : null}

            {action === 'new_checkout' ? (
              <StudioNote tone="rose">
                This order can&apos;t be paid any more. Start again from the class or the packages.
              </StudioNote>
            ) : null}

            {declined && !paid && action !== 'wait_for_confirmation' ? (
              <StudioNote tone="rose">
                Payment didn&apos;t go through. Nothing was charged. You can try again.
              </StudioNote>
            ) : null}

            {error ? <InlineError message={studioErrorMessage(error)} /> : null}

            <View style={styles.buttons}>
              {action === 'initiate' || action === 'continue_existing_payment' ? (
                <Button
                  label={`Pay ${formatEgp(data.totalEgp)}`}
                  variant="accent"
                  loading={busy}
                  disabled={!sheet.available}
                  onPress={() => void openSheet('initiate').catch(() => undefined)}
                />
              ) : null}
              {action === 'retry_payment' ? (
                <Button
                  label="Try payment again"
                  variant="accent"
                  loading={busy}
                  disabled={!sheet.available}
                  onPress={() => void openSheet('retry').catch(() => undefined)}
                />
              ) : null}
              {!sheet.available ? (
                <Text style={studioStyles.muted}>Paying needs the Sukun app on a phone.</Text>
              ) : null}
              <TextAction
                label={
                  data.booking && !paid && action !== 'new_checkout'
                    ? 'Pay later'
                    : 'Back to Studio'
                }
                onPress={leave}
              />
              {sheetOpened && data.booking && !paid ? (
                <Text style={[studioStyles.muted, styles.center]}>
                  Not paying now? Your spot stays held until the timer runs out, then it&apos;s
                  released.
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}
      </ResourceState>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20 },
  sub: { marginTop: 6 },
  body: { marginTop: 20, gap: 14 },
  waiting: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  buttons: { gap: 10, marginTop: 10 },
  center: { textAlign: 'center' },
});
