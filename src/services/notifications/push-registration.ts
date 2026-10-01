import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { ApiError } from '../../api/live/http';
import { registerLivePushToken } from '../../api/live/push-tokens';
import { trackPushRegistration } from './push-registration-state';

const REGISTRATION_ATTEMPTS = 3;
const MAX_RETRY_DELAY_MS = 5_000;
let permissionRequest: Promise<boolean> | null = null;

function hasPermission(permissions: Notifications.NotificationPermissionsStatus): boolean {
  return (
    permissions.granted ||
    permissions.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  );
}

async function performPermissionRequest(): Promise<boolean> {
  const platform = Platform.OS;
  if (platform !== 'ios' && platform !== 'android') return false;

  let stage = 'notification permission lookup';
  try {
    if (platform === 'android') {
      stage = 'Android notification channel setup';
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    let permissions: Notifications.NotificationPermissionsStatus | null = null;
    try {
      permissions = await Notifications.getPermissionsAsync();
    } catch {
      // A failed lookup is not evidence that the user has already allowed notifications.
      console.warn('[push] notification permission lookup failed');
    }
    if (permissions && hasPermission(permissions)) return true;

    stage = 'notification permission request';
    permissions = await Notifications.requestPermissionsAsync();
    return hasPermission(permissions);
  } catch {
    console.warn(`[push] ${stage} failed`);
    return false;
  }
}

/** Ask on each app start until permission is granted; coalesce simultaneous callers. */
export function requestNotificationPermission(): Promise<boolean> {
  if (permissionRequest) return permissionRequest;

  permissionRequest = performPermissionRequest().finally(() => {
    permissionRequest = null;
  });
  return permissionRequest;
}

/** Ask for an Expo Push Token after notification permission and the Android channel are ready. */
export async function getExpoPushToken(
  devicePushToken?: Notifications.DevicePushToken,
): Promise<string | null> {
  const platform = Platform.OS;
  if (platform !== 'ios' && platform !== 'android') return null;

  let stage = 'token lookup';
  try {
    stage = 'notification permission';
    if (!(await requestNotificationPermission())) return null;

    stage = 'Expo project configuration';
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) {
      console.warn('[push] Expo project ID is missing');
      return null;
    }

    stage = 'Expo token lookup';
    const result = await Notifications.getExpoPushTokenAsync({
      projectId,
      ...(devicePushToken ? { devicePushToken } : {}),
    });
    return result.data || null;
  } catch {
    // Push is optional; permission, credential, and network failures stay out of auth flows.
    console.warn(`[push] ${stage} failed`);
    return null;
  }
}

function isTransientRegistrationError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return true;
  return error.status === 429 || error.status >= 500;
}

function retryDelayMs(error: unknown, attempt: number): number {
  const retryAfterSeconds = error instanceof ApiError ? error.retryAfterSeconds : undefined;
  return Math.min(
    retryAfterSeconds && retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : 1000 * 2 ** attempt,
    MAX_RETRY_DELAY_MS,
  );
}

/** Register with bounded transient retries; failures never surface through sign-in or startup. */
export function registerExpoPushToken(
  input: {
    token: string;
    platform: 'ios' | 'android';
    deviceId: string;
    appVersion?: string;
  },
  isSessionCurrent: () => boolean,
): Promise<boolean> {
  return trackPushRegistration(async (signal) => {
    for (let attempt = 0; attempt < REGISTRATION_ATTEMPTS; attempt += 1) {
      if (signal.aborted || !isSessionCurrent()) return false;

      try {
        await registerLivePushToken(input, signal);
        return true;
      } catch (error) {
        if (
          signal.aborted ||
          !isSessionCurrent() ||
          attempt === REGISTRATION_ATTEMPTS - 1 ||
          !isTransientRegistrationError(error)
        ) {
          if (!signal.aborted && isSessionCurrent()) {
            console.warn('[push] server token registration failed');
          }
          return false;
        }
        await new Promise<void>((resolve) => {
          const finish = () => {
            clearTimeout(timeout);
            signal.removeEventListener('abort', finish);
            resolve();
          };
          const timeout = setTimeout(finish, retryDelayMs(error, attempt));
          signal.addEventListener('abort', finish, { once: true });
        });
      }
    }

    return false;
  });
}
