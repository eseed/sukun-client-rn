import { Pressable, StyleSheet, View } from 'react-native';
import type { AddonSummary } from '../../api/types';
import { stayPhotos } from '../../lib/addons';
import { colors, fontFamily } from '../../theme/tokens';
import { ImageSlot, Text } from '../ui';

const PHOTO_HEIGHT = 96;

/**
 * "Accommodation available": the event page's add-ons box, when the event sells somewhere to
 * stay. It takes the place of the plain "Add-ons available" line, shows the stays by name with
 * up to two of their photos, and books one (`onPress`), which is the one thing the plain line
 * could not do. Where "Book your stay" leads is the screen's call: it depends on whether the
 * holder already has a ticket.
 *
 * The frame, type and spacing are the add-ons box's own (`app/event/[slug].tsx` `addons`), so
 * the page does not change shape when an event adds a lodge.
 */
export function AccommodationBox({
  stays,
  onPress,
}: {
  /** Available accommodation only (`availableStays`); the box is not drawn without any. */
  stays: readonly AddonSummary[];
  onPress: () => void;
}) {
  const photos = stayPhotos(stays);
  const names = stays.map((stay) => stay.name).join(' · ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Accommodation available: ${names}. Book your stay`}
      onPress={onPress}
      style={({ pressed }) => [styles.box, pressed ? styles.pressed : null]}
    >
      {photos.length > 0 ? (
        <View style={styles.photos}>
          {photos.map((photo) => (
            <ImageSlot
              key={photo.id}
              source={{ uri: photo.url }}
              height={PHOTO_HEIGHT}
              style={styles.photo}
            />
          ))}
        </View>
      ) : null}
      <Text style={styles.title}>Accommodation available</Text>
      <Text style={styles.names}>{names}</Text>
      <View style={styles.action}>
        <Text style={styles.actionLabel}>Book your stay</Text>
        <Text style={styles.actionChevron}>›</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  /* The add-ons box (`app/event/[slug].tsx` `addons`). */
  box: {
    backgroundColor: colors.bgSurface,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  pressed: {
    opacity: 0.85,
  },
  /* Two photos side by side, 8px apart, at the 10px radius the add-on thumbnails use. */
  photos: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  photo: {
    flex: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },
  title: {
    fontSize: 14,
    fontFamily: fontFamily.bodyMedium,
    color: colors.textPrimary,
  },
  names: {
    fontSize: 12.5,
    color: colors.textMuted,
    marginTop: 2,
  },
  /* The ticket card's "Add extras to this ticket ›" row, above a hairline. */
  action: {
    alignItems: 'center',
    borderTopColor: colors.borderDefault,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
  },
  actionLabel: { color: colors.textPrimary, fontFamily: fontFamily.body, fontSize: 14 },
  actionChevron: { color: colors.textMuted, fontSize: 20 },
});
