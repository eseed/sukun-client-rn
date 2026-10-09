import type { CountryCode } from 'libphonenumber-js/mobile';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { BuyerRoom, RoomOccupant } from '../src/api/types';
import {
  Badge,
  BackButton,
  BulletHeading,
  Button,
  Card,
  InlineError,
  PhoneField,
  ResourceState,
  Screen,
  StepLabel,
  Text,
} from '../src/components/ui';
import { useAddRoomOccupant, useEvent, useEventRooms } from '../src/hooks/queries';
import { useContacts } from '../src/hooks/useContacts';
import { track } from '../src/lib/analytics';
import { messageForError } from '../src/lib/errors';
import { formatDate } from '../src/lib/format';
import {
  countryOf,
  DEFAULT_COUNTRY,
  formatPhoneLocal,
  isValidPhone,
  nationalDigitsOf,
  phoneErrorMessage,
  toE164,
} from '../src/lib/phone';
import { colors, space } from '../src/theme/tokens';

/**
 * `/rooms?eventId=`: the rooms the signed-in account paid for at an event, and their empty places.
 *
 * Roommates are optional at checkout, so a room can be paid for with places left. Its buyer fills
 * them here, one WhatsApp number at a time, with people who hold a ticket to the event. Reached
 * from the ticket screen and the receipt, which show the way here only while a place is free.
 *
 * A number with no ticket is refused in the same words whether or not it has an account
 * (CLAUDE.md rule 4), and nobody placed by number is ever named by the server.
 */
export default function RoomsScreen() {
  const router = useRouter();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const validEventId =
    typeof eventId === 'string' && /^[A-Za-z0-9_-]+$/.test(eventId) ? eventId : undefined;
  const roomsQuery = useEventRooms(validEventId);
  const eventQuery = useEvent(validEventId);
  const rooms = roomsQuery.data ?? [];

  function close() {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/tickets');
  }

  return (
    <Screen scroll contentStyle={styles.content}>
      <BackButton onPress={close} style={styles.back} />

      <StepLabel>{eventQuery.data?.title ?? 'Your stay'}</StepLabel>
      <View style={styles.heading}>
        <BulletHeading title={rooms.length > 1 ? 'Your rooms' : 'Your room'} size="lg" />
      </View>
      <Text variant="bodyMuted" style={styles.lead}>
        Ticket holders only.
      </Text>

      <ResourceState
        status={
          !validEventId || roomsQuery.isError
            ? 'error'
            : roomsQuery.isLoading
              ? 'loading'
              : 'success'
        }
        loadingLabel="Loading your room..."
        errorMessage="We couldn't load your rooms."
        onRetry={() => void roomsQuery.refetch()}
      >
        {rooms.length === 0 ? (
          <Text variant="bodyMuted">You have no rooms for this event.</Text>
        ) : (
          <View style={styles.rooms}>
            {rooms.map((room) => (
              <RoomCard key={room.roomId} room={room} />
            ))}
          </View>
        )}
      </ResourceState>
    </Screen>
  );
}

function occupantName(occupant: RoomOccupant): string {
  if (occupant.isYou) return 'You';
  if (occupant.displayName) return occupant.displayName;
  return occupant.phoneNumber ? formatPhoneLocal(occupant.phoneNumber) : 'Guest';
}

function RoomCard({ room }: { room: BuyerRoom }) {
  const full = room.openPlaces === 0;
  return (
    <Card style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.roomName}>
          {room.addonName} · {room.roomType}
        </Text>
        <Badge
          label={`${room.occupants.length} of ${room.capacity}`}
          tone={full ? 'sage' : 'gold'}
        />
      </View>
      <Text variant="metaSm" color={colors.textMuted}>
        Check-in {formatDate(room.checkInDate)} · Check-out {formatDate(room.checkOutDate)}
      </Text>

      <View style={styles.people}>
        {room.occupants.map((occupant) => (
          <Text key={occupant.ticketId} style={styles.person}>
            {occupantName(occupant)}
          </Text>
        ))}
        {Array.from({ length: room.openPlaces }, (_unused, index) => (
          <Text key={`open-${index}`} variant="meta" color={colors.textMuted}>
            Free spot
          </Text>
        ))}
      </View>

      {room.canAddOccupants ? <AddRoommate room={room} /> : null}
    </Card>
  );
}

/** One WhatsApp number, typed or picked from contacts, for the room's next free spot. */
function AddRoommate({ room }: { room: BuyerRoom }) {
  const add = useAddRoomOccupant();
  const { pickContact, canPickContact } = useContacts();
  const [country, setCountry] = useState<CountryCode>(DEFAULT_COUNTRY);
  const [national, setNational] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function fromContacts() {
    setError(null);
    const result = await pickContact();
    if (result.status === 'cancelled') return;
    if (result.status === 'failed') {
      setError("We couldn't open your contacts. Type their number instead.");
      return;
    }
    if (result.status === 'no-permission') {
      setError('Contacts access is off for Sukun. Type their number instead.');
      return;
    }
    if (result.status === 'no-number') {
      setError(`${result.name || 'That contact'} has no mobile number saved. Type it instead.`);
      return;
    }
    const [first] = result.contact.numbers;
    if (first) {
      const picked = countryOf(first);
      if (picked) setCountry(picked);
      setNational(nationalDigitsOf(first));
      setPhoneError(null);
    }
  }

  async function onAdd() {
    setError(null);
    const phoneE164 = toE164(national, country);
    const problem = isValidPhone(phoneE164, country) ? null : phoneErrorMessage(national, country);
    setPhoneError(problem);
    if (problem) return;
    try {
      await add.mutateAsync({ roomId: room.roomId, phoneNumber: phoneE164 });
      track('room_occupant_added', { event_id: room.eventId });
      setNational('');
    } catch (err) {
      setError(messageForError(err));
    }
  }

  return (
    <View style={styles.adder}>
      <PhoneField
        label="Their WhatsApp number"
        country={country}
        onCountryChange={(next) => {
          setCountry(next);
          if (phoneError) setPhoneError(null);
        }}
        national={national}
        onNationalChange={(value) => {
          setNational(value);
          if (phoneError) setPhoneError(null);
        }}
        error={phoneError}
      />
      {canPickContact ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => void fromContacts()}
          hitSlop={{ top: 10, bottom: 10, left: 16, right: 16 }}
          style={styles.contacts}
        >
          <Text variant="meta" color={colors.textPrimary} style={styles.contactsLabel}>
            Choose from contacts
          </Text>
        </Pressable>
      ) : null}
      {error ? <InlineError message={error} /> : null}
      <Button label="Add to room" onPress={() => void onAdd()} loading={add.isPending} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: space.s7,
  },
  back: {
    marginBottom: 10,
  },
  heading: {
    marginTop: 8,
    marginBottom: 6,
  },
  lead: {
    marginBottom: 20,
  },
  rooms: {
    gap: space.s4,
  },
  card: {
    gap: space.s2,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.s3,
  },
  roomName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  people: {
    gap: space.s1,
    marginTop: space.s2,
  },
  person: {
    fontSize: 15,
    color: colors.textPrimary,
  },
  adder: {
    gap: space.s3,
    marginTop: space.s3,
  },
  contacts: {
    alignSelf: 'flex-start',
  },
  contactsLabel: {
    textDecorationLine: 'underline',
  },
});
