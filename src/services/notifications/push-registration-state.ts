let pendingRegistrations = 0;
const pendingControllers = new Set<AbortController>();
const drainWaiters = new Set<() => void>();

/** Track push upserts so sign-out can revoke after an already-sent request settles. */
export async function trackPushRegistration<T>(
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  pendingControllers.add(controller);
  pendingRegistrations += 1;
  try {
    return await operation(controller.signal);
  } finally {
    pendingControllers.delete(controller);
    pendingRegistrations -= 1;
    if (pendingRegistrations === 0) {
      for (const resolve of drainWaiters) resolve();
      drainWaiters.clear();
    }
  }
}

export function cancelPendingPushRegistrations(): void {
  for (const controller of pendingControllers) controller.abort();
}

export async function waitForPendingPushRegistrations(): Promise<void> {
  if (pendingRegistrations === 0) return;
  await new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timeout);
      drainWaiters.delete(done);
      resolve();
    };
    const timeout = setTimeout(done, 1_000);
    drainWaiters.add(done);
  });
}
