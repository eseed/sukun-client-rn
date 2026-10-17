/**
 * Presentation for the notification inbox's unread count: the bell's badge and what a screen
 * reader says for it. The count itself is the server's (`GET mobile/notifications/unread-count`).
 */

/** The most the badge spells out; anything above reads "9+". */
const BADGE_MAX = 9;

/** The bell's badge: nothing at 0 (or for an unknown count), the number up to 9, then "9+". */
export function formatUnreadBadge(count: number | null | undefined): string | null {
  if (!count || !Number.isFinite(count) || count <= 0) return null;
  return count > BADGE_MAX ? `${BADGE_MAX}+` : String(Math.floor(count));
}

/** `"Notifications"`, or `"Notifications, 3 unread"` with the full count, never "9+". */
export function notificationsAccessibilityLabel(count: number | null | undefined): string {
  if (!count || !Number.isFinite(count) || count <= 0) return 'Notifications';
  return `Notifications, ${Math.floor(count)} unread`;
}
