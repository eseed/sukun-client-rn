import { create } from 'zustand';
import { api } from '../api';
import { setAuthFailureHandler } from '../api/live/http';
import type { CurrentUser } from '../api/types';
import { identify, resetAnalytics } from '../lib/analytics';
import { deleteSecureItem, getSecureItem, SECURE_KEYS, setSecureItem } from '../lib/secure-storage';
import { requiresLivingArea } from '../lib/phone';

/**
 * Session state. Tokens live in the keychain; this store holds the in-memory view of who is
 * signed in and how far through onboarding they are.
 *
 * `phoneNumber` is identity (CLAUDE.md rule 1) — `pendingPhone` carries it between the phone
 * screen and the OTP screen before a session exists.
 */

export type AuthStatus = 'loading' | 'signed-out' | 'signed-in';

let clearQueryCache: (() => void) | null = null;
let sessionGeneration = 0;
let secureTransition = Promise.resolve();

function queueSecureTransition(operation: () => Promise<void>): Promise<void> {
  const next = secureTransition.then(operation, operation);
  secureTransition = next.catch(() => undefined);
  return next;
}

export function getAuthSessionGeneration(): number {
  return sessionGeneration;
}

export function isCurrentSignedInSession(generation?: number): boolean {
  return (
    useAuthStore.getState().status === 'signed-in' &&
    (generation === undefined || generation === sessionGeneration)
  );
}

/** Registered by the provider without making the store depend on TanStack Query. */
export function setAuthQueryCacheClearHandler(handler: (() => void) | null): void {
  clearQueryCache = handler;
}

interface AuthState {
  status: AuthStatus;
  user: CurrentUser | null;
  pendingPhone: string | null;
  /**
   * Transient, in-memory only — whether the OTP verification that produced the current
   * session was for a brand-new account. Set by `otp.tsx` right after verifying, read (and
   * cleared) by `selfie.tsx` to fire the `signup_completed` analytics event exactly once, and
   * never persisted or shown in the UI (CLAUDE.md rule 4 is about UI copy, not analytics).
   */
  isNewUser: boolean;
  /**
   * Whether this user asked to browse before finishing registration, by taking the exit out
   * of the selfie step.
   *
   * Persisted, unlike `isNewUser`. The launch redirect in `app/index.tsx` reads it to decide
   * whether an unfinished account lands on its next step or on Discover, and without a stored
   * answer the next cold start would put the selfie demand back in front of someone who has
   * already declined it once, which is the wall guideline 5.1.1(v) objects to. Cleared by
   * signing in, signing out, and finishing the profile, so it can only ever describe the
   * account currently in hand.
   */
  setupDeferred: boolean;
  /**
   * Whether a visitor with no account has already chosen to browse, by taking "Skip login"
   * off the Welcome screen.
   *
   * The sibling of `setupDeferred`, for the case that has no account to hang a deferral on.
   * Welcome is the first thing a new visitor sees and it is meant to be: the product would
   * rather they registered, and the exit is offered quietly rather than advertised. But it is
   * offered *once*. Without a stored answer every cold start put that screen back in front of
   * someone who had already declined it, so the app asked a signed-out visitor to register on
   * launch, forever, which is the wall guideline 5.1.1(v) objects to and what App Store review
   * rejected build 18 for. A guest who has answered gets Discover from then on, and Welcome
   * stays reachable from the Profile tab's sign-in prompt.
   *
   * Deliberately *not* cleared on sign-out: someone who has held an account is not a
   * first-time visitor, and putting the wall back in front of them would re-create the same
   * problem for anyone who signs out.
   */
  guestBrowsing: boolean;

  restore: () => Promise<void>;
  setPendingPhone: (phone: string | null) => void;
  setIsNewUser: (value: boolean) => void;
  deferSetup: () => Promise<void>;
  browseAsGuest: () => Promise<void>;
  signIn: (
    tokens: { accessToken: string; refreshToken: string },
    user: CurrentUser,
  ) => Promise<void>;
  setUser: (user: CurrentUser) => void;
  signOut: (options?: { remote?: boolean }) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'loading',
  isNewUser: false,
  setupDeferred: false,
  guestBrowsing: false,
  user: null,
  pendingPhone: null,

  async restore() {
    const generation = ++sessionGeneration;
    // Both answers are read in the same pass as the tokens, so `status`, `setupDeferred` and
    // `guestBrowsing` land in one `set` and the launch redirect never sees a state whose
    // answer has not loaded yet: that gap would route a signed-in user into the step they had
    // already skipped, and a guest back into the Welcome screen they had already declined.
    const [accessToken, refreshToken, deferred, guest] = await Promise.all([
      getSecureItem(SECURE_KEYS.accessToken),
      getSecureItem(SECURE_KEYS.refreshToken),
      getSecureItem(SECURE_KEYS.setupDeferred),
      getSecureItem(SECURE_KEYS.guestBrowsing),
    ]);
    if (generation !== sessionGeneration) return;
    const setupDeferred = deferred === 'true';
    const guestBrowsing = guest === 'true';
    if (!accessToken && !refreshToken) {
      set({ status: 'signed-out', user: null, setupDeferred: false, guestBrowsing });
      return;
    }
    try {
      const user = await api.auth.me();
      if (generation !== sessionGeneration) return;
      set({
        status: 'signed-in',
        user,
        setupDeferred: setupDeferred && !user.profileComplete,
        guestBrowsing,
      });
      identify(user.id);
    } catch {
      // Keep credentials for a later restore if this was a transient network/API failure.
      if (generation !== sessionGeneration) return;
      const currentUser = useAuthStore.getState().user;
      set({
        status: currentUser ? 'signed-in' : 'signed-out',
        user: currentUser,
        setupDeferred,
        guestBrowsing,
      });
    }
  },

  setPendingPhone(phone) {
    set({ pendingPhone: phone });
  },

  setIsNewUser(value) {
    set({ isNewUser: value });
  },

  /**
   * Record that this user is browsing with an unfinished profile. The session is kept: the
   * number is already verified, and throwing it away would cost the signup this exit exists
   * to preserve. Purchase stays gated on `profileComplete` (CLAUDE.md rule 8), so the selfie
   * is still collected before a ticket can be bought.
   */
  async deferSetup() {
    set({ setupDeferred: true });
    await setSecureItem(SECURE_KEYS.setupDeferred, 'true');
  },

  /**
   * Record that a visitor with no account has chosen to browse. Answering Welcome once is
   * enough: from here the launch redirect sends them to Discover instead of putting the same
   * question back in front of them on every cold start. Nothing else changes, and nothing is
   * waived — purchase is still gated on an account and a complete profile.
   */
  async browseAsGuest() {
    set({ guestBrowsing: true });
    await setSecureItem(SECURE_KEYS.guestBrowsing, 'true');
  },

  async signIn(tokens, user) {
    const generation = ++sessionGeneration;
    await queueSecureTransition(async () => {
      await setSecureItem(SECURE_KEYS.accessToken, tokens.accessToken);
      await setSecureItem(SECURE_KEYS.refreshToken, tokens.refreshToken);
      // A deferral belongs to the account that made it. Whoever signs in here gets asked for
      // the steps they still owe, even on a device where someone else once skipped them.
      await deleteSecureItem(SECURE_KEYS.setupDeferred);
    });
    if (generation !== sessionGeneration) return;
    set({ status: 'signed-in', user, pendingPhone: null, setupDeferred: false });
    identify(user.id);
  },

  setUser(user) {
    // Finishing the profile settles the deferral, so a later launch stops treating this
    // account as one that owes a step.
    if (user.profileComplete && useAuthStore.getState().setupDeferred) {
      set({ user, setupDeferred: false });
      void deleteSecureItem(SECURE_KEYS.setupDeferred);
      return;
    }
    set({ user });
  },

  async signOut(options) {
    const generation = ++sessionGeneration;
    clearQueryCache?.();
    set({ status: 'signed-out', user: null, pendingPhone: null, setupDeferred: false });
    resetAnalytics();

    await queueSecureTransition(async () => {
      if (options?.remote !== false) {
        try {
          await api.auth.logout();
        } catch {
          // Signing out locally matters more than the server round-trip succeeding.
        }
      }
      await deleteSecureItem(SECURE_KEYS.accessToken);
      await deleteSecureItem(SECURE_KEYS.refreshToken);
      await deleteSecureItem(SECURE_KEYS.setupDeferred);
    });

    // A newer sign-in owns the state and tokens now. Never let an older sign-out write it back.
    if (generation !== sessionGeneration) return;
  },
}));

// Token recovery lives in the transport layer; auth owns the local relogin transition.
setAuthFailureHandler(() => {
  void useAuthStore.getState().signOut({ remote: false });
});

/**
 * The six fields that gate purchase (CLAUDE.md rule 8). Email *verification* is not one of
 * them. The server is authoritative via `profileComplete`; this mirrors it so a screen can
 * say which step is missing.
 */
export function missingProfileFields(user: CurrentUser | null): string[] {
  if (!user) return ['full name', 'email', 'date of birth', 'gender', 'area', 'selfie'];
  const missing: string[] = [];
  if (!user.fullName) missing.push('full name');
  if (!user.email) missing.push('email');
  if (!user.dateOfBirth) missing.push('date of birth');
  if (!user.gender) missing.push('gender');
  // Only Egyptian numbers are asked for a living area, so only they can be missing one.
  if (requiresLivingArea(user.phoneNumber) && !user.area) missing.push('area');
  if (!user.selfieUploaded) missing.push('selfie');
  return missing;
}

/** Where an unfinished account resumes: the profile form while any field but the selfie is
 * outstanding, and the selfie step once the rest are in hand.
 *
 * Kept beside `missingProfileFields` so the launch redirect and the resume row on Profile
 * cannot disagree with the purchase gate about how far through the flow someone is.
 */
export function nextOnboardingStep(
  user: CurrentUser | null,
): '/(onboarding)/profile' | '/(onboarding)/selfie' {
  const missing = missingProfileFields(user);
  return missing.some((field) => field !== 'selfie')
    ? '/(onboarding)/profile'
    : '/(onboarding)/selfie';
}
