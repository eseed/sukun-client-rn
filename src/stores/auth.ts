import { create } from 'zustand';
import { api } from '../api';
import { setAuthFailureHandler } from '../api/live/http';
import type { CurrentUser } from '../api/types';
import {
  deleteSecureItem,
  getSecureItem,
  SECURE_KEYS,
  setSecureItem,
} from '../lib/secure-storage';

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

  restore: () => Promise<void>;
  setPendingPhone: (phone: string | null) => void;
  signIn: (tokens: { accessToken: string; refreshToken: string }, user: CurrentUser) => Promise<void>;
  setUser: (user: CurrentUser) => void;
  signOut: (options?: { remote?: boolean }) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'loading',
  user: null,
  pendingPhone: null,

  async restore() {
    const generation = ++sessionGeneration;
    const [accessToken, refreshToken] = await Promise.all([
      getSecureItem(SECURE_KEYS.accessToken),
      getSecureItem(SECURE_KEYS.refreshToken),
    ]);
    if (generation !== sessionGeneration) return;
    if (!accessToken && !refreshToken) {
      set({ status: 'signed-out', user: null });
      return;
    }
    try {
      const user = await api.auth.me();
      if (generation !== sessionGeneration) return;
      set({ status: 'signed-in', user });
    } catch {
      // Keep credentials for a later restore if this was a transient network/API failure.
      if (generation !== sessionGeneration) return;
      const currentUser = useAuthStore.getState().user;
      set({ status: currentUser ? 'signed-in' : 'signed-out', user: currentUser });
    }
  },

  setPendingPhone(phone) {
    set({ pendingPhone: phone });
  },

  async signIn(tokens, user) {
    const generation = ++sessionGeneration;
    await queueSecureTransition(async () => {
      await setSecureItem(SECURE_KEYS.accessToken, tokens.accessToken);
      await setSecureItem(SECURE_KEYS.refreshToken, tokens.refreshToken);
    });
    if (generation !== sessionGeneration) return;
    set({ status: 'signed-in', user, pendingPhone: null });
  },

  setUser(user) {
    set({ user });
  },

  async signOut(options) {
    const generation = ++sessionGeneration;
    clearQueryCache?.();
    set({ status: 'signed-out', user: null, pendingPhone: null });

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
  if (!user.area) missing.push('area');
  if (!user.selfieUploaded) missing.push('selfie');
  return missing;
}
