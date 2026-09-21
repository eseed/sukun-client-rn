import { create } from 'zustand';
import { api } from '../api';
import { ALLOW_GUEST_BROWSING_FALLBACK, guestBrowsingFor } from '../lib/flags';
import { getSecureItem, SECURE_KEYS, setSecureItem } from '../lib/secure-storage';

/**
 * Feature flags the backend owns, so changing one is a deploy variable rather than a store
 * release. Today that is the guest path and nothing else.
 *
 * Three sources, in order, and the order is the design:
 *
 *   1. The last answer this device received, from the keychain. Read first because it is
 *      instant and offline, so a launch after the first one never waits on the network to
 *      know which Welcome screen to draw.
 *   2. `public/app-config`, fetched every launch. This is what makes a change take effect
 *      without a build. It overwrites the cache when it differs.
 *   3. `ALLOW_GUEST_BROWSING_FALLBACK`, compiled in from `eas.json`. Used on a first launch
 *      that cannot reach the backend, and only then.
 *
 * The backend's defaults and the compiled fallback agree by construction (iOS open, Android
 * closed), so an app that never reaches the endpoint behaves exactly like one that reaches it
 * and finds nothing set. That is what keeps a backend outage from shipping the configuration
 * App Store review rejected.
 *
 * This is a store rather than a TanStack Query hook because it is read above `QueryProvider`:
 * `app/_layout.tsx` resolves it before the navigator mounts, the same way it resolves the
 * analytics consent answer. Screens read `useAllowGuestBrowsing()`.
 */

/**
 * How long a first launch will wait for the backend before drawing the screen with the
 * compiled fallback. Short on purpose: nothing here is worth a visibly slow cold start, and
 * being wrong for a moment on a first launch costs less than a splash screen that hangs on a
 * bad connection. The fetch is not cancelled, so a late answer still lands.
 */
const FIRST_LAUNCH_TIMEOUT_MS = 2500;

interface FlagsState {
  status: 'loading' | 'ready';
  allowGuestBrowsing: boolean;
  /** Resolve the flags for this launch: cache first, then the network. */
  load: () => Promise<void>;
}

export const useFlagsStore = create<FlagsState>((set, get) => ({
  status: 'loading',
  allowGuestBrowsing: ALLOW_GUEST_BROWSING_FALLBACK,

  async load() {
    // The network half runs whatever the cache says, because refreshing it is the entire
    // point. Failures are swallowed: a flag that cannot be fetched is not an error the person
    // can act on, and the fallback chain already has an answer.
    const fromNetwork = api.config
      .get()
      .then((config) => {
        const allowed = guestBrowsingFor(config.allowGuestBrowsing);
        set({ allowGuestBrowsing: allowed, status: 'ready' });
        void setSecureItem(SECURE_KEYS.allowGuestBrowsing, allowed ? 'true' : 'false');
        return true;
      })
      .catch(() => false);

    const cached = await getSecureItem(SECURE_KEYS.allowGuestBrowsing);
    if (cached === 'true' || cached === 'false') {
      // Only if the network has not already answered, which on a fast connection it may have.
      if (get().status === 'loading') {
        set({ allowGuestBrowsing: cached === 'true', status: 'ready' });
      }
      return;
    }

    // First launch on this device: give the backend a moment, then draw something. The timer
    // is cleared on the way out rather than left to fire, so a fast answer does not hold a
    // pending timeout open behind it.
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        fromNetwork,
        new Promise((resolve) => {
          timer = setTimeout(resolve, FIRST_LAUNCH_TIMEOUT_MS);
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
    if (get().status === 'loading') {
      set({ allowGuestBrowsing: ALLOW_GUEST_BROWSING_FALLBACK, status: 'ready' });
    }
  },
}));

/**
 * Whether this build offers the guest path. The one thing screens should read.
 *
 * Before `load()` resolves this is the compiled fallback, which is why `app/_layout.tsx`
 * holds the navigator back until it does.
 */
export function useAllowGuestBrowsing(): boolean {
  return useFlagsStore((s) => s.allowGuestBrowsing);
}
