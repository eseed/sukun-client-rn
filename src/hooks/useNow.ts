import { useEffect, useState } from 'react';

/**
 * The time, refreshed every `intervalMs`: for labels that follow the clock loosely, such as a
 * schedule's LIVE pill and the calendar's time rule, not for countdowns.
 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}
