import type { PaymentFailureReason, PaymentStatus } from '../api/types';

/**
 * Whether the server would accept a cancel for this order right now.
 *
 * `cancelOrder` refuses with `PAYMENT_CONFIRMATION_PENDING` while the latest payment attempt is
 * still `creating` / `pending` / `provider_status_unknown`, and the Paymob sheet reporting
 * CANCELLED tells the backend nothing: the attempt only settles when the webhook lands or the
 * reconciliation sweep (every five minutes) marks it failed. Offering a cancel button in that
 * window would just hand people a 409, so the button waits for a settled attempt.
 *
 * `paymentStatus` is the empty string when no attempt exists at all, which is cancellable.
 */
export function isOrderCancellable(status: PaymentStatus | undefined): boolean {
  if (!status) return false;
  if (!['awaiting_payment', 'failed', 'expired'].includes(status.orderStatus)) return false;
  const attempt = status.paymentStatus;
  return attempt === '' || attempt === 'failed' || attempt === 'expired';
}

/**
 * Whether `retry-payment` would take this order: any unpaid order that can still be paid.
 *
 * An order still awaiting payment after a declined or closed sheet belongs here too. It used to
 * count as finished, which disabled Pay and left a buyer whose card was declined with nothing
 * that worked until the hold ran out. The backend accepts it since September 2026.
 */
export function isPaymentRetryable(status: PaymentStatus | undefined): boolean {
  if (!status) return false;
  return ['awaiting_payment', 'failed', 'expired'].includes(status.orderStatus);
}

/**
 * The last attempt has not settled at Paymob yet, so the server would refuse a new one with
 * `PAYMENT_CONFIRMATION_PENDING`. The screen says it is still confirming rather than offering a
 * button that cannot work.
 *
 * `pending` counts only while the order's hold runs. A pending attempt is an intention Paymob
 * may still settle: the buyer can be on their bank's verification page, in their SMS app for the
 * code, or have closed a sheet that had already charged them. The backend refuses `retry-payment`
 * over it for the rest of the hold, and takes it with a fresh intention once the hold has run
 * out, so the retry button waits for exactly that. `holdExpired` is the caller's clock reading
 * (`useHoldCountdown`), so the answer changes the moment the deadline passes.
 */
export function isPaymentUnsettled(
  status: PaymentStatus | undefined,
  holdExpired = false,
): boolean {
  if (!status) return false;
  if (status.paymentStatus === 'pending') {
    // A failed, expired, cancelled or refunded order is past its hold already.
    return status.orderStatus === 'awaiting_payment' && !holdExpired;
  }
  return (
    status.paymentStatus === 'creating' ||
    status.paymentStatus === 'provider_status_unknown' ||
    status.paymentStatus === 'confirming'
  );
}

/**
 * A pending attempt the buyer can simply reopen: the order still awaits payment and its hold
 * runs, so `payments/initiate` hands back the same live intention and the sheet opens on it
 * again. Closing the sheet before entering a card leaves exactly this, and it must not cost the
 * buyer the rest of the hold. Retry and cancel are still refused over it
 * (`PAYMENT_CONFIRMATION_PENDING`), which is what `isPaymentUnsettled` keeps them from.
 */
export function isPaymentReopenable(
  status: PaymentStatus | undefined,
  holdExpired = false,
): boolean {
  return (
    status?.orderStatus === 'awaiting_payment' && status.paymentStatus === 'pending' && !holdExpired
  );
}

/** What a declined payment says, by the backend's failure category when it sends one. */
const FAILED_PAYMENT_COPY: Record<PaymentFailureReason, string> = {
  declined: 'Your bank declined the payment. Nothing was charged. Try again or use another card.',
  insufficient_funds:
    "The card didn't have enough funds for this payment. Nothing was charged. Try another card.",
  authentication_failed:
    "Your bank couldn't verify the payment. Nothing was charged. You can try again.",
  expired_card: 'This card has expired. Nothing was charged. Try another card.',
  unknown: 'The payment did not go through. Nothing was charged.',
};

/**
 * The copy for a payment the server failed. A reason the app does not know, or none at all (a
 * backend from before `failureReason`), reads as the general message.
 */
export function failedPaymentMessage(reason: PaymentStatus['failureReason']): string {
  return reason && Object.prototype.hasOwnProperty.call(FAILED_PAYMENT_COPY, reason)
    ? FAILED_PAYMENT_COPY[reason]
    : FAILED_PAYMENT_COPY.unknown;
}
