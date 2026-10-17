import { Pressable, StyleSheet, View } from 'react-native';
import { useNotificationUnreadCount } from '../../hooks/queries';
import { formatUnreadBadge, notificationsAccessibilityLabel } from '../../lib/notifications';
import { colors, fontFamily, radius, space } from '../../theme/tokens';
import { text } from '../../theme/typography';
import { BellIcon } from '../ui/icons';
import { Text } from '../ui/Text';

/** The box the bell sits in: the title's line height, so the header row does not grow. */
const BELL_BOX = 32;
const BADGE_SIZE = 16;

/**
 * The Home header's bell, which opens the notification inbox. Its badge counts unread pushes,
 * hidden at 0 and "9+" above 9, in the gold the app spends on "this needs you" (the Tickets tab's
 * waiting dot). Only rendered for a signed-in account: a guest has no inbox.
 */
export function NotificationBell({ onPress }: { onPress: () => void }) {
  const { data } = useNotificationUnreadCount();
  const count = data?.unreadCount ?? 0;
  const badge = formatUnreadBadge(count);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={notificationsAccessibilityLabel(count)}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.bell, pressed && styles.pressed]}
    >
      <BellIcon size={22} color={colors.textPrimary} />
      {badge ? (
        <View style={styles.badge} testID="notification-badge">
          <Text style={styles.badgeLabel}>{badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bell: {
    width: BELL_BOX,
    height: BELL_BOX,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.75,
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -4,
    minWidth: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: radius.pill,
    paddingHorizontal: space.s1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentGold,
    borderWidth: 1,
    borderColor: colors.bgPage,
  },
  badgeLabel: {
    ...text.tabLabel,
    // Selecting the face, never a numeric weight (see `assets/fonts/README.md`).
    fontFamily: fontFamily.bodyMedium,
    letterSpacing: 0,
    lineHeight: 12,
    color: colors.textPrimary,
  },
});
