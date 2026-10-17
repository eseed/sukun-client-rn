import { Pressable, StyleSheet, View } from 'react-native';
import type { AppNotification } from '../../api/types';
import { formatRelativeTime } from '../../lib/format';
import { colors, fontFamily, space } from '../../theme/tokens';
import { Card } from '../ui/Surfaces';
import { Text } from '../ui/Text';

/** Read as sentences: each part ends in a full stop unless it already ends in one. */
function spoken(parts: (string | null)[]): string {
  const present = parts.map((part) => part?.trim() ?? '').filter(Boolean);
  return present
    .map((part, index) => (index < present.length - 1 && !/[.!?]$/.test(part) ? `${part}.` : part))
    .join(' ');
}

/**
 * One inbox row: title, body and how long ago. An unread row is a white card with its title in
 * the medium face and a gold dot; a read one sits back on the page. The difference is never
 * colour alone, and a screen reader hears "Unread" first.
 */
export function NotificationRow({
  notification,
  now,
  opens,
  onPress,
}: {
  notification: AppNotification;
  /** The clock the relative times are measured against, shared by every row. */
  now: number;
  /** Where the tap leads besides marking it read (`landingHint`), or null for nowhere. */
  opens: string | null;
  onPress: () => void;
}) {
  const unread = notification.readAt === null;
  const when = formatRelativeTime(notification.createdAt, now);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={spoken([
        unread ? 'Unread' : null,
        notification.title,
        notification.body,
        when,
      ])}
      accessibilityHint={opens ?? undefined}
      onPress={onPress}
      style={({ pressed }) => [pressed && styles.pressed]}
    >
      <Card style={unread ? styles.card : { ...styles.card, ...styles.read }}>
        <View style={styles.top}>
          <Text
            variant="bodyValue"
            style={[styles.title, unread && styles.titleUnread]}
            numberOfLines={2}
          >
            {notification.title}
          </Text>
          {unread ? <View style={styles.dot} testID="notification-unread-dot" /> : null}
        </View>
        <Text variant="bodyMuted" color={unread ? colors.textPrimary : undefined}>
          {notification.body}
        </Text>
        {when ? <Text variant="metaSm">{when}</Text> : null}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.s2,
  },
  read: {
    backgroundColor: colors.bgPage,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.s3,
  },
  title: {
    flex: 1,
    minWidth: 0,
  },
  titleUnread: {
    fontFamily: fontFamily.bodyMedium,
  },
  dot: {
    width: 8,
    height: 8,
    marginTop: 6,
    borderRadius: 4,
    backgroundColor: colors.accentGold,
  },
  pressed: {
    opacity: 0.75,
  },
});
