import { useEffect, useState } from 'react';

/**
 * Seconds left on an order's capacity hold, ticking once a second.
 *
 * The duration is never assumed: the server sets it from `CAPACITY_HOLD_TTL_SECONDS` (900s by
 * default, but configurable per environment) and reports the deadline as `holdExpiresAt` on
 * every order. Retrying a payment restarts the hold with a fresh full TTL, so the remaining
 * time is measured against the order's current deadline on every tick rather than counted down
 * from a remembered start.
 *
 * Reaching zero is not proof the hold is gone: the server expires stale orders on a sweeper,
 * so the release lands some time after the deadline. `expired` therefore means "past the
 * deadline", and the payment status query remains the authority on the order itself.
 */
export function useHoldCountdown(holdExpiresAt: string | undefined | null): {
  secondsLeft: number;
  expired: boolean;
} {
  const deadline = holdExpiresAt ? Date.parse(holdExpiresAt) : Number.NaN;
  // The clock, not the countdown, is the state: the remaining time is derived from the wall
  // clock at render, so a screen resumed after time in the background is right immediately
  // instead of resuming from however many ticks it missed.
  const [, setTick] = useState(0);

  useEffect(() => {
    if (Number.isNaN(deadline)) return;
    const id = setInterval(() => {
      setTick((n) => n + 1);
      if (remaining(deadline) <= 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [deadline]);

  const secondsLeft = remaining(deadline);
  return {
    secondsLeft,
    expired: !Number.isNaN(deadline) && secondsLeft <= 0,
  };
}

function remaining(deadline: number): number {
  if (Number.isNaN(deadline)) return 0;
  return Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
}
