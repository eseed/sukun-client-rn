import { Pressable, StyleSheet, View } from 'react-native';
import type { EventListItem } from '../../api/types';
import { formatDateRange } from '../../lib/format';
import { designAsset, type DesignAssetKey } from '../../theme/assets';
import { colors, shadow } from '../../theme/tokens';
import { ImageSlot, OverlayPill, Text } from '../ui';

/**
 * The featured card on Discover — square corners, `--shadow-card`, a 170px image with the
 * "On sale now" pill, then eyebrow / display-italic title / meta.
 */
export function FeaturedEventCard({
  event,
  onPress,
  imageKey = 'featuredTulua',
}: {
  event: EventListItem;
  onPress: () => void;
  imageKey?: DesignAssetKey;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.featured, pressed && styles.pressed]}
    >
      <ImageSlot
        source={event.coverImageUrl ? { uri: event.coverImageUrl } : designAsset(imageKey)}
        height={170}
        tint={colors.sage100}
      >
        {event.state === 'on_sale' ? (
          <View style={styles.featuredPill}>
            <OverlayPill label="On sale now" />
          </View>
        ) : null}
      </ImageSlot>

      <View style={styles.featuredBody}>
        {event.tagline ? (
          <Text variant="eyebrow" color={colors.rose500} style={styles.featuredEyebrow}>
            {event.tagline}
          </Text>
        ) : null}
        <Text variant="titleCard" style={styles.featuredTitle}>
          {event.title}
        </Text>
        <Text variant="meta">
          {formatDateRange(event.startDate, event.endDate)}
          {event.venueName ? ` · ${event.venueName}` : ''}
        </Text>
      </View>
    </Pressable>
  );
}

/** A row in "More gatherings": 64px rounded thumbnail, eyebrow, title, meta. */
export function EventListRow({
  event,
  onPress,
  imageKey,
}: {
  event: EventListItem;
  onPress: () => void;
  imageKey?: DesignAssetKey;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <ImageSlot
        source={event.coverImageUrl ? { uri: event.coverImageUrl } : imageKey ? designAsset(imageKey) : null}
        tint={colors.sky100}
        style={styles.thumb}
      />
      <View style={styles.rowBody}>
        {event.tagline ? (
          <Text style={styles.rowEyebrow} color={colors.rose500}>
            {event.tagline}
          </Text>
        ) : null}
        <Text style={styles.rowTitle}>{event.title}</Text>
        <Text style={styles.rowMeta}>
          {formatDateRange(event.startDate, event.endDate)}
          {event.venueName ? ` · ${event.venueName}` : ''}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  featured: {
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    overflow: 'hidden',
    ...shadow.card,
  },
  featuredPill: {
    position: 'absolute',
    top: 12,
    left: 12,
  },
  featuredBody: {
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 18,
  },
  featuredEyebrow: {
    marginBottom: 6,
  },
  featuredTitle: {
    marginBottom: 5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 10,
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 12,
    flexShrink: 0,
  },
  rowBody: {
    flex: 1,
  },
  rowEyebrow: {
    fontSize: 11,
    letterSpacing: 11 * 0.08,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  rowMeta: {
    fontSize: 12.5,
    color: colors.textMuted,
  },
  pressed: {
    opacity: 0.9,
  },
});
