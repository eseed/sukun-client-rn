import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useEventRooms } from '../../hooks/queries';
import { colors, fontFamily } from '../../theme/tokens';
import { Button, Text } from '../ui';

/**
 * The way to a room's free spots, shown only while a room this account paid for has one.
 *
 * Roommates are optional at checkout, so this is where they are added later: on the entry pass
 * and on the receipt (narrowed to that order's rooms). Rooms are for ticket holders only, which
 * the room screen and its refusals say; this panel just counts the spots.
 */
export function RoomSpotsPanel({ eventId, orderId }: { eventId: string; orderId?: string }) {
  const router = useRouter();
  const roomsQuery = useEventRooms(eventId);
  const open = (roomsQuery.data ?? []).filter(
    (room) => room.canAddOccupants && (!orderId || room.orderId === orderId),
  );
  const spots = open.reduce((total, room) => total + room.openPlaces, 0);
  if (spots === 0) return null;

  return (
    <View style={styles.panel}>
      <Text style={styles.label}>{open.length > 1 ? 'Your rooms' : 'Your room'}</Text>
      <Text style={styles.title}>{spots === 1 ? '1 free spot' : `${spots} free spots`}</Text>
      <Button
        label="Add a roommate"
        variant="accent"
        onPress={() => router.push(`/rooms?eventId=${eventId}`)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.creme,
    borderRadius: 16,
    padding: 20,
    marginBottom: 22,
    gap: 8,
  },
  label: {
    fontSize: 11,
    letterSpacing: 11 * 0.14,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  title: {
    fontSize: 19,
    fontFamily: fontFamily.bodyMedium,
    color: colors.textPrimary,
    marginBottom: 8,
  },
});
