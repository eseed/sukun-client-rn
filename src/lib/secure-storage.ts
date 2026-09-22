import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Session tokens live in the device keychain. `expo-secure-store` has no web implementation,
 * so the web target (used for design review only) falls back to an in-memory map — never
 * localStorage, which would persist tokens in the browser.
 */

const memory = new Map<string, string>();
const isWeb = Platform.OS === 'web';

export async function getSecureItem(key: string): Promise<string | null> {
  if (isWeb) return memory.get(key) ?? null;
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function setSecureItem(key: string, value: string): Promise<void> {
  if (isWeb) {
    memory.set(key, value);
    return;
  }
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    // A keychain write failure must not break sign-in; the session stays in memory.
  }
}

export async function deleteSecureItem(key: string): Promise<void> {
  if (isWeb) {
    memory.delete(key);
    return;
  }
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // Nothing to do — the caller is signing out either way.
  }
}

export const SECURE_KEYS = {
  accessToken: 'sukun.accessToken',
  refreshToken: 'sukun.refreshToken',
  analyticsConsent: 'sukun.analyticsConsent',
  setupDeferred: 'sukun.setupDeferred',
  guestBrowsing: 'sukun.guestBrowsing',
  /**
   * The last value `public/app-config` gave for this platform's guest path. Distinct from
   * `guestBrowsing` above, which records that this visitor took "Skip login": one is the
   * feature's availability, the other is a person's choice within it. See `src/stores/flags.ts`.
   */
  allowGuestBrowsing: 'sukun.allowGuestBrowsing',
  acquisitionDeviceId: 'sukun.acquisition.deviceId',
  acquisitionDeviceRegistered: 'sukun.acquisition.deviceRegistered',
  acquisitionDeviceIdentityInvalid: 'sukun.acquisition.deviceIdentityInvalid',
  acquisitionAttributionState: 'sukun.acquisition.attributionState',
} as const;
