import type { PaymentStatus } from '../api/types';

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
 * The last attempt has not settled at Paymob yet, so any new one would be refused. The screen
 * waits for it rather than offering a button that cannot work.
 */
export function isPaymentUnsettled(status: PaymentStatus | undefined): boolean {
  if (!status) return false;
  return (
    status.paymentStatus === 'creating' ||
    status.paymentStatus === 'provider_status_unknown' ||
    status.paymentStatus === 'confirming'
  );
}
