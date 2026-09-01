import { isOrderCancellable } from '../orders';
import type { PaymentStatus } from '../../api/types';

function status(partial: Partial<PaymentStatus>): PaymentStatus {
  return {
    orderStatus: 'awaiting_payment',
    paymentStatus: '',
    ticketsIssued: 0,
    paidAt: null,
    ...partial,
  };
}

describe('isOrderCancellable', () => {
  it('allows a cancel when no attempt has been opened', () => {
    expect(isOrderCancellable(status({}))).toBe(true);
  });

  it('allows a cancel once the attempt has settled as failed or expired', () => {
    expect(isOrderCancellable(status({ paymentStatus: 'failed' }))).toBe(true);
    expect(isOrderCancellable(status({ orderStatus: 'expired', paymentStatus: 'expired' }))).toBe(
      true,
    );
  });

  it('refuses while the attempt is still with the provider', () => {
    for (const paymentStatus of ['creating', 'pending', 'provider_status_unknown'] as const) {
      expect(isOrderCancellable(status({ paymentStatus }))).toBe(false);
    }
  });

  it('refuses once the order is paid, cancelled or refunded', () => {
    expect(isOrderCancellable(status({ orderStatus: 'paid', paymentStatus: 'captured' }))).toBe(
      false,
    );
    expect(isOrderCancellable(status({ orderStatus: 'cancelled', paymentStatus: 'voided' }))).toBe(
      false,
    );
    expect(isOrderCancellable(undefined)).toBe(false);
  });
});
