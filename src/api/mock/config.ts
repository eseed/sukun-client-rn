import type { PaymentFailureReason } from '../types';

/**
 * Mock knobs, in their own module so every part of the mock backend can read the same clock.
 *
 * Addon price windows and hold expiry both depend on "now", and a test that advances the clock
 * has to move all of them together. Keeping this out of `index.ts` avoids an import cycle between
 * the api surface and the pricing engine it calls.
 */
export const mockConfig = {
  /** Simulated round-trip time, so loading states are exercised in the real app. */
  latencyMs: 320,
  /** How long after `payments.initiate` the simulated provider webhook lands. */
  settleDelayMs: 4000,
  /**
   * What the simulated webhook says when it lands. `paid` captures; `failed` declines, which
   * fails the order the way the backend does on a decline; `stuck` never lands at all, the
   * attempt staying `pending` until the hold runs out, as when the bank's verification page
   * never returns to Paymob.
   */
  paymentOutcome: 'paid' as 'paid' | 'failed' | 'stuck',
  /** `failureReason` reported for a `failed` outcome. Null models a backend that sends none. */
  paymentFailureReason: null as PaymentFailureReason | null,
  now: (): number => Date.now(),
};

/** Puts the payment knobs back, for tests that change them. */
export function resetMockPaymentConfig(): void {
  mockConfig.paymentOutcome = 'paid';
  mockConfig.paymentFailureReason = null;
}

/** The mock's current time as a Date, for anything that compares against ISO timestamps. */
export function mockNow(): Date {
  return new Date(mockConfig.now());
}
