import { formatUnreadBadge, notificationsAccessibilityLabel } from '../notifications';

describe('formatUnreadBadge', () => {
  it('hides the badge at zero or an unknown count', () => {
    expect(formatUnreadBadge(0)).toBeNull();
    expect(formatUnreadBadge(undefined)).toBeNull();
    expect(formatUnreadBadge(null)).toBeNull();
    expect(formatUnreadBadge(-2)).toBeNull();
    expect(formatUnreadBadge(Number.NaN)).toBeNull();
  });

  it('spells out one to nine, then caps at 9+', () => {
    expect(formatUnreadBadge(1)).toBe('1');
    expect(formatUnreadBadge(9)).toBe('9');
    expect(formatUnreadBadge(10)).toBe('9+');
    expect(formatUnreadBadge(250)).toBe('9+');
  });
});

describe('notificationsAccessibilityLabel', () => {
  it('names the full unread count, never the capped badge', () => {
    expect(notificationsAccessibilityLabel(0)).toBe('Notifications');
    expect(notificationsAccessibilityLabel(undefined)).toBe('Notifications');
    expect(notificationsAccessibilityLabel(3)).toBe('Notifications, 3 unread');
    expect(notificationsAccessibilityLabel(14)).toBe('Notifications, 14 unread');
  });
});
