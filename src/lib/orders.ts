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
