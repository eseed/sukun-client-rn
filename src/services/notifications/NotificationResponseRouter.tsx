import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { landingFromLinks, type NotificationLanding } from './deep-link';
import { openNotificationLanding } from './open-landing';

const MAX_SEEN_RESPONSES = 32;

// Pushes arrive in the foreground without OS UI unless the app installs a handler.
if (Platform.OS === 'ios' || Platform.OS === 'android') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Where a tapped push lands: `data.landingLink` when the admin chose more than the event page,
 * else the bare event link in `data.deepLink` (`sukun://tickets` comes as `landingLink` alone).
 */
export function landingFromResponse(
  response: Notifications.NotificationResponse,
): NotificationLanding | null {
  if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return null;

  const data: unknown = response.notification.request.content.data;
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;

  const { landingLink, deepLink } = data as Record<string, unknown>;
  return landingFromLinks(landingLink, deepLink);
}

function responseKey(response: Notifications.NotificationResponse): string {
  return JSON.stringify([
    response.notification.request.identifier,
    response.notification.date,
    response.actionIdentifier,
  ]);
}

/** Displays foreground pushes and maps only validated Sukun links to in-app routes. */
export function NotificationResponseRouter() {
  const router = useRouter();
  const seenResponses = useRef(new Set<string>());

  useEffect(() => {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;

    let active = true;
    const handleResponse = (response: Notifications.NotificationResponse) => {
      if (!active) return;

      const key = responseKey(response);
      if (seenResponses.current.has(key)) {
        void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
        return;
      }
      seenResponses.current.add(key);
      if (seenResponses.current.size > MAX_SEEN_RESPONSES) {
        const oldest = seenResponses.current.values().next().value;
        if (oldest) seenResponses.current.delete(oldest);
      }

      const landing = landingFromResponse(response);
      if (landing) openNotificationLanding(router, landing);
      void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
    };

    const subscription = Notifications.addNotificationResponseReceivedListener(handleResponse);
    void Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) handleResponse(response);
      })
      .catch(() => undefined);

    return () => {
      active = false;
      subscription.remove();
    };
  }, [router]);

  return null;
}
