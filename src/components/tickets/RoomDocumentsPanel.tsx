import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useEventRooms } from '../../hooks/queries';
import { roomAsksForDocuments, roomNeedsDocuments } from '../../lib/room-documents';
import { colors, fontFamily } from '../../theme/tokens';
import { Button, Text } from '../ui';

/**
 * The way to a room's documents, for anyone with a room at the event (its buyer or a guest in
 * it), shown only while a room asks for documents. It says whether something is still missing;
 * once all are in it stays, so the guest can open what was uploaded. On the entry pass and the
 * receipt (narrowed to that order's rooms), beside `RoomSpotsPanel`.
 */
export function RoomDocumentsPanel({ eventId, orderId }: { eventId: string; orderId?: string }) {
  const router = useRouter();
  const roomsQuery = useEventRooms(eventId);
  const asking = (roomsQuery.data ?? []).filter(
    (room) => roomAsksForDocuments(room) && (!orderId || room.orderId === orderId),
  );
  if (asking.length === 0) return null;

  const needed = asking.some(roomNeedsDocuments);

  return (
    <View style={styles.panel}>
      <Text style={styles.label}>{asking.length > 1 ? 'Your rooms' : 'Your room'}</Text>
      <Text style={styles.title}>{needed ? 'Room documents needed' : 'Room documents are in'}</Text>
      <Button
        label={needed ? 'Upload room documents' : 'View room documents'}
        variant={needed ? 'accent' : 'secondary'}
        onPress={() => router.push(`/accommodation?eventId=${eventId}`)}
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
