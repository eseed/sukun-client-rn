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
  useCancelOrder,
  useInitiatePayment,
  useOrder,
  usePaymentStatus,
  useRetryPayment,
} from '../../src/hooks/queries';
import { HoldTimer } from '../../src/components/checkout/HoldTimer';
import {
  failedPaymentMessage,
  isOrderCancellable,
  isPaymentRetryable,
  isPaymentUnsettled,
} from '../../src/lib/orders';
import { clearPendingPayment } from '../../src/lib/pending-payment';
import { useHoldCountdown } from '../../src/hooks/useHoldCountdown';
import { track } from '../../src/lib/analytics';
import { trackMetaAddPaymentInfo } from '../../src/lib/meta-events';
import { beginPaymentAttempt, trackPaymentFailed } from '../../src/lib/purchase-analytics';
import { messageForError } from '../../src/lib/errors';
import { formatEgp } from '../../src/lib/format';
import { usePaymobSheet } from '../../src/hooks/usePaymobSheet';
import { useCheckoutStore } from '../../src/stores/checkout';
import { designAsset } from '../../src/theme/assets';
import { colors } from '../../src/theme/tokens';

/**
 * Design screen 17 · Payment.
 *
 * The design draws card number / expiry / CVV fields inline, but the SDK owns card entry
 * entirely: `presentPayVC` opens Paymob's own sheet. Rendering dead look-alike fields here only
 * invited people to type into boxes that do nothing, so the screen goes straight from the
 * amount to the pay button.
 *
 * Everything else on the artboard is here verbatim: the step label, the bulleted `Pay <total>`,
 * "Secured by Paymob · charged in EGP", the card artwork, and the gold pay button. The artboard
 * says nothing about add-ons, so neither does this screen: the buyer confirmed the basket line
 * by line on review, and the only number that matters at the till is the one being charged.
 *
 * The cart flow places an order without opening a Paymob intention, so `payments.initiate`
 * always runs before the sheet is presented; nothing here assumes an order arrives with one
 * attached.
 *
 * The payment outcome comes from `Paymob.setSdkListener`, per the SDK documentation:
 * SUCCESS / FAIL / PENDING / CANCELLED (see `usePaymobSheet`, which registers every bit of
 * customisation before `presentPayVC`). The order status query still runs so a PENDING
 * transaction can resolve and so the screen reflects orders that settled elsewhere. Paid is the
 * server's word alone: `orderStatus === 'paid'`, never a client redirect.
 *
 * A FAIL or CANCELLED from the sheet is only what the sheet saw. The bank may still be
 * confirming (the buyer closed a sheet stuck on its verification page), or the card may already
 * have been charged, so the screen asks the server again before it says anything, and while the
 * server still shows the attempt pending it says it is checking rather than "Nothing was
 * charged". The backend refuses a retry over that attempt (`PAYMENT_CONFIRMATION_PENDING`) until
 * the order's hold runs out, so the retry button waits for the same moment.
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
  const cancel = useCancelOrder();

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
  const { expired: holdExpired } = useHoldCountdown(order?.holdExpiresAt);
  /**
   * The server refused a new attempt with PAYMENT_CONFIRMATION_PENDING. That is the "still
   * confirming" state, not an error, and it lasts until the attempt settles or the hold runs out.
   */
  const [refusedOver, setRefusedOver] = useState<string | null>(null);

  // Polls from mount and stops on its own at a terminal state. Gating this on a sheet *this*
  // screen had opened meant arriving here after a PENDING verdict — the one route in — began no
  // polling at all, so the payment never resolved on the screen built to resolve it. A failed
  // order stays watched until its hold ends: the sheet can still take a successful try after the
  // decline the server failed it on, and that buyer belongs on the confirmation screen.
  const statusQuery = usePaymentStatus(validOrderId, {
    poll: true,
    watchUntil: order?.holdExpiresAt ?? null,
  });
  const { data: status, dataUpdatedAt: statusUpdatedAt, refetch: refetchStatus } = statusQuery;

  // Every verdict from the sheet is checked with the server before the screen acts on it.
  const verdictAt = sheet.outcomeAt;
  useEffect(() => {
    if (verdictAt !== null) void refetchStatus();
  }, [refetchStatus, verdictAt]);

  const sheetSaidNo = sdkResult === 'fail' || sdkResult === 'cancelled';
  /** No verdict to check, or the status on screen was fetched after it arrived. */
  const verdictChecked = verdictAt === null || statusUpdatedAt >= verdictAt;

  const settled = sdkResult === 'success' || status?.orderStatus === 'paid';
  const terminal = Boolean(
    settled ||
    (status &&
      (['paid', 'failed', 'expired', 'cancelled', 'refunded'].includes(status.orderStatus) ||
        ['captured', 'failed', 'expired', 'refunded', 'voided'].includes(status.paymentStatus))),
  );
  /** The server has said this attempt did not pay. */
  const serverFailed = Boolean(
    status &&
    (['failed', 'expired', 'cancelled', 'refunded'].includes(status.orderStatus) ||
      ['failed', 'expired', 'refunded', 'voided'].includes(status.paymentStatus)),
  );
  /**
   * Pending at Paymob, which the backend will not let a new attempt replace while the hold runs.
   * Includes the PENDING the sheet itself reports.
   */
  const unsettledAttempt = isPaymentUnsettled(status, holdExpired);
  /**
   * The refusal stands while the server still reports what it did when it refused, and until
   * the hold it was refused under runs out. Any change in the status means the attempt moved.
   */
  const confirmationPending =
    refusedOver !== null && refusedOver === statusKey(status) && !settled && !holdExpired;
  /**
   * Not paid, on the server's word. A closed or declined sheet counts only once the server has
   * been asked since, and only if it has nothing pending: a cancel over an attempt the bank is
   * still confirming is not a failure yet.
   */
  const failed =
    !settled &&
    verdictChecked &&
    !confirmationPending &&
    (serverFailed || (sheetSaidNo && !unsettledAttempt));
  /** Nothing can pay this order any more. */
  const closed = status?.orderStatus === 'cancelled' || status?.orderStatus === 'refunded';
  /**
   * An order still awaiting payment after a declined or closed sheet is not finished with. It
   * used to count as terminal here, which disabled Pay, sent "Try payment again" to a refusal,
   * and hid the cancel that would have freed the buyer.
   */
  const retryable = !settled && !closed && isPaymentRetryable(status);
  /** The bank has not answered yet: the screen says it is checking and offers nothing to tap. */
  const confirming =
    !settled &&
    !closed &&
    !failed &&
    (sdkResult === 'pending' ||
      unsettledAttempt ||
      confirmationPending ||
      (sheetSaidNo && !verdictChecked));

  // A cancelled or refunded order has nothing left to recover on the next launch.
  useEffect(() => {
    if (closed && validOrderId) void clearPendingPayment(validOrderId);
  }, [closed, validOrderId]);

  useEffect(() => {
    if (!settled) return;
    // `purchase_completed` is sent by the confirmation screen, which every paid order reaches
    // whichever screen watched it settle (see `src/lib/purchase-analytics.ts`).
    reset();
    router.replace(`/checkout/confirmation?orderId=${validOrderId}`);
  }, [reset, router, settled, validOrderId]);

  // The sheet's own FAIL or CANCELLED is counted as it arrives, whatever the server goes on to
  // say; a failure the server reports without one is counted as a fail. One per attempt.
  useEffect(() => {
    if (!validOrderId) return;
    if (sdkResult === 'fail' || sdkResult === 'cancelled') {
      trackPaymentFailed(validOrderId, sdkResult);
    } else if (failed) {
      trackPaymentFailed(validOrderId, 'fail');
    }
  }, [failed, sdkResult, validOrderId]);

  /**
   * PAYMENT_CONFIRMATION_PENDING means an attempt is still with the bank. Say so, and keep
   * watching, rather than showing it as an error.
   */
  function stillConfirming(err: unknown): boolean {
    if (errorCodeOf(err) !== 'PAYMENT_CONFIRMATION_PENDING') return false;
    setError(null);
    setRefusedOver(statusKey(status));
    void refetchStatus();
    return true;
  }

  async function onPay() {
    if (!validOrderId) return;
    setError(null);
    setRefusedOver(null);

    if (!sheet.available) {
      setError('Payment needs the Sukun app. It isn’t available here.');
      return;
    }

    try {
      const intent = await initiate.mutateAsync(validOrderId);
      beginPaymentAttempt(validOrderId);
      track('payment_started', {
        order_id: validOrderId,
        total: Number(order?.totalEgp ?? 0),
        currency: order?.currency ?? 'EGP',
      });
      trackMetaAddPaymentInfo(order);
      presentPaymob(intent);
    } catch (err) {
      setSheetPresented(false);
      track('payment_error', { order_id: validOrderId, step: 'initiate', code: errorCodeOf(err) });
      if (stillConfirming(err)) return;
      if (errorCodeOf(err) === 'PAYMENT_ALREADY_COMPLETED') {
        void refetchStatus();
      }
      setError(messageForError(err));
    }
  }

  async function onRetry() {
    if (!validOrderId || !retryable) return;
    setError(null);
    setRefusedOver(null);

    if (!sheet.available) {
      setError('Payment needs the Sukun app. It isn’t available here.');
      return;
    }

    try {
      const intent = await retry.mutateAsync(validOrderId);
      beginPaymentAttempt(validOrderId);
      track('payment_retried', { order_id: validOrderId });
      trackMetaAddPaymentInfo(order);
      presentPaymob(intent);
    } catch (err) {
      setSheetPresented(false);
      track('payment_error', { order_id: validOrderId, step: 'retry', code: errorCodeOf(err) });
      if (stillConfirming(err)) return;
      // A try that went through after all: the refetch sends the buyer to confirmation.
      if (errorCodeOf(err) === 'PAYMENT_ALREADY_COMPLETED') {
        void refetchStatus();
      }
      setError(messageForError(err));
    }
  }

  /**
   * Releases the order and its hold, then clears the checkout: the converted cart cannot be
   * edited again, so the buyer restarts from the event (Discover if it cannot be resolved).
   */
  async function onCancel() {
    if (!validOrderId) return;
    setError(null);
    try {
      await cancel.mutateAsync(validOrderId);
      track('order_cancelled', { order_id: validOrderId });
      void clearPendingPayment(validOrderId);
      const eventId = order?.eventId;
      reset();
      router.replace(eventId ? (`/event/${eventId}` as never) : ('/(tabs)/discover' as never));
    } catch (err) {
      if (stillConfirming(err)) return;
      setError(messageForError(err));
    }
  }

  function presentPaymob(intent: { clientSecret: string; publicKey: string; paymentId?: string }) {
    if (!sheet.available || !validOrderId) return;
    sheet.present(intent, validOrderId);
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
  // `order` is non-null past the guards above, and the total is the server's string, formatted
  // rather than recomputed (CLAUDE.md rule 7).
  const amount = formatEgp(order.totalEgp);
  /*
   * A sheet is up and has not answered yet. Derived rather than latched: the old boolean was
   * set when the sheet opened and cleared nowhere, so a cancelled or declined payment left the
   * Pay button a permanent spinner and "Try payment again" permanently disabled — both actions
   * dead on the screen whose whole purpose is retrying. `present()` resets the outcome to null,
   * so this reads true again for each new attempt without anything to keep in sync.
   */
  const awaitingVerdict = sheetPresented && sdkResult === null;
  const busy = initiate.isPending || retry.isPending || awaitingVerdict;
  /*
   * The cancel button waits for the server to say the attempt has settled. Paymob's CANCELLED
   * verdict is not that: the attempt stays pending until the webhook lands or the five-minute
   * reconciliation sweep fails it, and cancelling before then is refused outright. Showing the
   * button only when it would work is better than handing people a button that 409s.
   */
  const cancellable = !busy && !settled && !confirming && isOrderCancellable(status);
  /** A try the buyer can make right now, as opposed to one still settling at Paymob. */
  const canRetry = failed && retryable && !unsettledAttempt && !confirmationPending;

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
      {/*
        Paymob's sheet has no timeout the app can set and no way for the app to close it, so
        the buyer is told the one exit there is before they need it.
      */}
      <Text variant="metaSm" style={styles.note}>
        If your bank&apos;s verification page doesn&apos;t load, close the sheet with X. We&apos;ll
        check with your bank and update this order.
      </Text>

      {status?.orderStatus === 'awaiting_payment' && !settled ? (
        <HoldTimer holdExpiresAt={order.holdExpiresAt} />
      ) : null}

      {(awaitingVerdict || confirming) && !settled && !closed ? (
        <Text variant="metaSm" color={colors.accentSky} style={styles.note}>
          {awaitingVerdict
            ? 'Waiting for the payment to complete…'
            : sheetSaidNo && !verdictChecked
              ? 'Checking your payment with your bank…'
              : "We're checking with your bank. If you were charged, your ticket will appear here automatically."}
        </Text>
      ) : null}

      {failed || error ? (
        <Text variant="metaSm" color={colors.rose700} style={styles.note}>
          {error ??
            // "Nothing was charged" after a cancel only once the server shows nothing pending.
            (sdkResult === 'cancelled' && !serverFailed
              ? 'Payment was cancelled. Nothing was charged.'
              : status?.orderStatus === 'expired'
                ? 'This payment hold expired. You can try again.'
                : status?.orderStatus === 'cancelled'
                  ? 'This order was cancelled and cannot be paid.'
                  : status?.orderStatus === 'refunded'
                    ? 'This order has been refunded and cannot be paid.'
                    : failedPaymentMessage(status?.failureReason))}
        </Text>
      ) : null}

      <View style={styles.spacer} />

      {canRetry ? (
        <Button
          label="Try payment again"
          variant="accent"
          onPress={() => void onRetry()}
          loading={busy}
          disabled={busy}
        />
      ) : (
        <Button
          label={`Pay ${amount}`}
          variant="accent"
          onPress={onPay}
          loading={busy}
          disabled={terminal || confirming}
        />
      )}

      {cancellable ? (
        <Button
          label="Cancel this order"
          variant="secondary"
          onPress={() => void onCancel()}
          loading={cancel.isPending}
          disabled={cancel.isPending}
          style={styles.retryButton}
        />
      ) : null}
    </Screen>
  );
}

/** The status as one comparable value, to tell when the server's answer has moved. */
function statusKey(status: { orderStatus: string; paymentStatus: string } | undefined): string {
  return status ? `${status.orderStatus}/${status.paymentStatus}` : '';
}

/** The server's error code, for analytics. Codes only: never the message, which can carry input. */
function errorCodeOf(error: unknown): string {
  return typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'string'
    ? (error as { code: string }).code
    : 'UNKNOWN';
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
