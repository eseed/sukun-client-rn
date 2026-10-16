import { Pressable, StyleSheet, View } from 'react-native';
import type { AddonSummary, TicketAddon } from '../../api/types';
import { stayPhotos } from '../../lib/addons';
import { formatDateRangeShort } from '../../lib/format';
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

/**
 * The same box for a holder who already has their room: one room per person, so it shows the
 * room they have rather than offering another, and leads to the ticket it is on.
 */
export function BookedStayBox({
  room,
  photoUrl,
  onPress,
}: {
  /** The room on the holder's ticket, or `null` when the server says there is one but not which. */
  room: TicketAddon | null;
  photoUrl: string | null;
  onPress: () => void;
}) {
  const detail = room?.room
    ? `${room.label} · ${formatDateRangeShort(room.room.checkInDate, room.room.checkOutDate)}`
    : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Your stay is booked${detail ? `: ${detail}` : ''}. See it on your ticket`}
      onPress={onPress}
      style={({ pressed }) => [styles.box, pressed ? styles.pressed : null]}
    >
      <View style={styles.booked}>
        {photoUrl ? (
          <ImageSlot
            source={{ uri: photoUrl }}
            height={BOOKED_PHOTO_SIZE}
            style={styles.bookedPhoto}
          />
        ) : null}
        <View style={styles.bookedBody}>
          <Text style={styles.title}>Your stay is booked</Text>
          {detail ? <Text style={styles.names}>{detail}</Text> : null}
          <Text style={styles.bookedLink}>See it on your ticket →</Text>
        </View>
      </View>
    </Pressable>
  );
}

const BOOKED_PHOTO_SIZE = 56;

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
  booked: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  bookedPhoto: {
    borderRadius: 10,
    overflow: 'hidden',
    width: BOOKED_PHOTO_SIZE,
  },
  bookedBody: {
    flex: 1,
  },
  /* The ticket card's call-to-action blue, for the one place this box leads. */
  bookedLink: {
    color: colors.accentSky,
    fontFamily: fontFamily.bodyMedium,
    fontSize: 13,
    marginTop: 6,
  },
  actionChevron: { color: colors.textMuted, fontSize: 20 },
});
