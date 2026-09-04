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
  now: (): number => Date.now(),
};

/** The mock's current time as a Date, for anything that compares against ISO timestamps. */
export function mockNow(): Date {
  return new Date(mockConfig.now());
}
