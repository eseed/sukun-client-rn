import { isOrderCancellable, isPaymentRetryable, isPaymentUnsettled } from '../orders';
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

describe('isPaymentRetryable', () => {
  it('takes every unpaid order that can still be paid, awaiting ones included', () => {
    for (const orderStatus of ['awaiting_payment', 'failed', 'expired'] as const) {
      expect(isPaymentRetryable(status({ orderStatus, paymentStatus: 'failed' }))).toBe(true);
    }
  });

  it('refuses a paid, cancelled or refunded order', () => {
    for (const orderStatus of ['paid', 'cancelled', 'refunded'] as const) {
      expect(isPaymentRetryable(status({ orderStatus }))).toBe(false);
    }
    expect(isPaymentRetryable(undefined)).toBe(false);
  });
});

describe('isPaymentUnsettled', () => {
  it('waits on an attempt Paymob has not settled, in the live and the mock spelling', () => {
    for (const paymentStatus of ['creating', 'provider_status_unknown', 'confirming'] as const) {
      expect(isPaymentUnsettled(status({ paymentStatus }))).toBe(true);
    }
  });

  it('does not wait on a settled attempt, or on a pending one a new try reuses', () => {
    for (const paymentStatus of ['', 'pending', 'failed', 'expired'] as const) {
      expect(isPaymentUnsettled(status({ paymentStatus }))).toBe(false);
    }
  });
});
