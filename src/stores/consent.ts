import { create } from 'zustand';
import { decideConsent, disableAnalytics, enableAnalytics, track } from '../lib/analytics';
import { requiresPrivacyConsentGate } from '../lib/privacyRegion';
import { getSecureItem, SECURE_KEYS, setSecureItem } from '../lib/secure-storage';

/**
 * The analytics answer, for the whole app rather than for the screen that first asked it.
 *
 * This used to be local state in `app/_layout.tsx`, which meant the answer could be given once
 * at first launch and never revisited: nothing else could read it, so there was nowhere to put
 * a control that changed it. Guideline 5.1.1(ii) requires the opposite, in as many words —
 * "Apps must also provide the customer with an easily accessible and understandable way to
 * withdraw consent" — and the requirement has no regional qualifier, so it covers the users
 * `requiresPrivacyConsentGate` never prompts as well as the ones it does. `app/account/
 * analytics.tsx` is that control, and it reads and writes here.
 *
 * `disableAnalytics` was always able to do the revoking; its own comment says "declined or
 * revoked". Only the way to ask for it was missing.
 */
export type ConsentStatus = 'loading' | 'unknown' | 'granted' | 'denied';

interface ConsentState {
  status: ConsentStatus;
  /** Resolve the answer for this launch: a stored one wins, otherwise the region decides. */
  load: () => Promise<void>;
  /** Record an answer, first or changed, and apply it to both SDKs immediately. */
  answer: (granted: boolean) => Promise<void>;
}

export const useConsentStore = create<ConsentState>((set) => ({
  status: 'loading',

  async load() {
    // The region check is re-run every launch (cheap, offline) rather than cached, but it only
    // governs whether someone who has never answered is asked — a stored answer wins.
    const stored = await getSecureItem(SECURE_KEYS.analyticsConsent);
    const decision = decideConsent(stored, requiresPrivacyConsentGate());

    if (decision === 'granted') {
      enableAnalytics();
      set({ status: 'granted' });
      return;
    }
    if (decision === 'denied') {
      disableAnalytics();
      set({ status: 'denied' });
      return;
    }
    set({ status: 'unknown' });
  },

  async answer(granted) {
    if (granted) {
      // Only the "granted" branch is trackable — turning it off means we cannot record that
      // it was turned off, which is the point of turning it off.
      enableAnalytics();
      track('analytics_consent_answered', { consent_granted: true });
    } else {
      disableAnalytics();
    }

    // State first, storage second: the switch should answer the tap immediately, and the
    // SDKs have already been told either way.
    set({ status: granted ? 'granted' : 'denied' });
    await setSecureItem(SECURE_KEYS.analyticsConsent, granted ? 'granted' : 'denied');
  },
}));
