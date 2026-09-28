import * as Application from 'expo-application';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { API_MODE } from '../../api';
import {
  getAuthSessionGeneration,
  isCurrentSignedInSession,
  useAuthStore,
} from '../../stores/auth';
import { getOrCreateSukunDeviceId } from '../attribution/device-id';
import { getExpoPushToken, registerExpoPushToken } from './push-registration';

export function PushTokenRegistration() {
  const status = useAuthStore((state) => state.status);
  const appUserId = useAuthStore((state) => state.user?.id);

  useEffect(() => {
    const platform = Platform.OS;
    if (
      API_MODE !== 'live' ||
      status !== 'signed-in' ||
      !appUserId ||
      (platform !== 'ios' && platform !== 'android')
    ) {
      return;
    }

    const sessionGeneration = getAuthSessionGeneration();
    const appVersion = Application.nativeApplicationVersion || undefined;
    let active = true;
    let lastRegisteredToken: string | null = null;
    let tokenBeingRegistered: string | null = null;
    let tokenLookup: Promise<string | null> | null = null;

    const isSessionCurrent = () => active && isCurrentSignedInSession(sessionGeneration);

    const registerCurrentToken = async (
      devicePushToken?: Notifications.DevicePushToken,
    ): Promise<void> => {
      if (!isSessionCurrent()) return;
      // The native token listener handles rotation; foregrounding should only retry a failed
      // lookup or registration, not ask Expo for the same token every time.
      if (
        !devicePushToken &&
        (lastRegisteredToken !== null || tokenBeingRegistered !== null || tokenLookup !== null)
      ) {
        return;
      }

      let token: string | null;
      if (devicePushToken) {
        token = await getExpoPushToken(devicePushToken);
      } else {
        tokenLookup ??= getExpoPushToken().finally(() => {
          tokenLookup = null;
        });
        token = await tokenLookup;
      }
      if (
        !token ||
        token === lastRegisteredToken ||
        token === tokenBeingRegistered ||
        !isSessionCurrent()
      ) {
        return;
      }
      tokenBeingRegistered = token;

      try {
        const deviceId = await getOrCreateSukunDeviceId();
        if (!deviceId || !isSessionCurrent()) return;

        const registered = await registerExpoPushToken(
          {
            token,
            platform,
            deviceId,
            ...(appVersion ? { appVersion } : {}),
          },
          isSessionCurrent,
        );
        if (registered && isSessionCurrent()) lastRegisteredToken = token;
      } catch {
        // A missing token or installation ID must never interfere with normal app use.
        console.warn('[push] installation registration failed');
      } finally {
        if (tokenBeingRegistered === token) tokenBeingRegistered = null;
      }
    };

    let tokenSubscription: ReturnType<typeof Notifications.addPushTokenListener> | undefined;
    try {
      tokenSubscription = Notifications.addPushTokenListener((devicePushToken) => {
        void registerCurrentToken(devicePushToken);
      });
    } catch {
      // Some development environments do not provide a native token-change event.
    }
    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') void registerCurrentToken();
    });
    void registerCurrentToken();

    return () => {
      active = false;
      tokenSubscription?.remove();
      appStateSubscription.remove();
    };
  }, [appUserId, status]);

  return null;
}
