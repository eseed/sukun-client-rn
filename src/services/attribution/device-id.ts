import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { SECURE_KEYS } from '../../lib/secure-storage';

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let deviceIdPromise: Promise<string | null> | null = null;

/** Load or create the opaque Sukun UUID; never substitute a Kochava or hardware identifier. */
export function getOrCreateSukunDeviceId(): Promise<string | null> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return Promise.resolve(null);
  if (deviceIdPromise) return deviceIdPromise;

  deviceIdPromise = (async () => {
    const stored = await SecureStore.getItemAsync(SECURE_KEYS.acquisitionDeviceId);
    if (stored && UUID_V4_PATTERN.test(stored)) return stored;

    const deviceId = Crypto.randomUUID();
    if (!UUID_V4_PATTERN.test(deviceId))
      throw new Error('UUID generation returned an invalid value');

    await SecureStore.setItemAsync(SECURE_KEYS.acquisitionDeviceId, deviceId);
    const persisted = await SecureStore.getItemAsync(SECURE_KEYS.acquisitionDeviceId);
    if (persisted !== deviceId) throw new Error('Sukun installation ID was not persisted');
    return deviceId;
  })().finally(() => {
    deviceIdPromise = null;
  });

  return deviceIdPromise;
}
