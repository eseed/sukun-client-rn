import { create } from 'zustand';
import { api } from '../api';
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

interface AuthState {
  status: AuthStatus;
  user: CurrentUser | null;
  pendingPhone: string | null;

  restore: () => Promise<void>;
  setPendingPhone: (phone: string | null) => void;
  signIn: (tokens: { accessToken: string; refreshToken: string }, user: CurrentUser) => Promise<void>;
  setUser: (user: CurrentUser) => void;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'loading',
  user: null,
  pendingPhone: null,

  async restore() {
    const token = await getSecureItem(SECURE_KEYS.accessToken);
    if (!token) {
      set({ status: 'signed-out', user: null });
      return;
    }
    try {
      const user = await api.auth.me();
      set({ status: 'signed-in', user });
    } catch {
      await deleteSecureItem(SECURE_KEYS.accessToken);
      await deleteSecureItem(SECURE_KEYS.refreshToken);
      set({ status: 'signed-out', user: null });
    }
  },

  setPendingPhone(phone) {
    set({ pendingPhone: phone });
  },

  async signIn(tokens, user) {
    await setSecureItem(SECURE_KEYS.accessToken, tokens.accessToken);
    await setSecureItem(SECURE_KEYS.refreshToken, tokens.refreshToken);
    set({ status: 'signed-in', user, pendingPhone: null });
  },

  setUser(user) {
    set({ user });
  },

  async signOut() {
    try {
      await api.auth.logout();
    } catch {
      // Signing out locally matters more than the server round-trip succeeding.
    }
    await deleteSecureItem(SECURE_KEYS.accessToken);
    await deleteSecureItem(SECURE_KEYS.refreshToken);
    set({ status: 'signed-out', user: null, pendingPhone: null });
  },
}));

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
