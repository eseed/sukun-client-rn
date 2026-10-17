import { useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { queryKeys } from '../../hooks/queries';
import { useAuthStore } from '../../stores/auth';

/**
 * A push that lands while the app is open is a new inbox row: the bell's count and, if it is on
 * screen, the inbox itself are read again. Pushes that arrive in the background are picked up by
 * the foreground refetch instead (`useNotificationUnreadCount`).
 *
 * Nothing here touches the app icon's badge, which the app never sets (owner's call).
 */
export function NotificationInboxSync() {
  const client = useQueryClient();
  const signedIn = useAuthStore((s) => s.status === 'signed-in');

  useEffect(() => {
    if (!signedIn || (Platform.OS !== 'ios' && Platform.OS !== 'android')) return;
    const subscription = Notifications.addNotificationReceivedListener(() => {
      void client.invalidateQueries({ queryKey: queryKeys.notificationsRoot });
    });
    return () => subscription.remove();
  }, [client, signedIn]);

  return null;
}
