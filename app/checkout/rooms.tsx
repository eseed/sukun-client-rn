import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Badge,
  BackButton,
  BulletHeading,
  Button,
  CheckCircle,
  InlineError,
  ResourceState,
  Screen,
  SelectableCard,
  StepLabel,
  Text,
} from '../../src/components/ui';
import {
  AddRecipient,
  PeopleHeading,
  useAddTicketToCart,
  type AddedRecipient,
} from '../../src/components/checkout/RecipientPicker';
import { useAddon, useCart, useEvent, useReplaceCartAddons } from '../../src/hooks/queries';
import { useCheckoutAccess } from '../../src/hooks/useCheckoutAccess';
import { useCheckoutSteps } from '../../src/hooks/useCheckoutSteps';
import { isAccommodation, isSendableAddonLine } from '../../src/lib/addons';
import { messageForError } from '../../src/lib/errors';
import { formatDate, formatEgp } from '../../src/lib/format';
import { formatPhoneLocal } from '../../src/lib/phone';
import { useCheckoutStore, type DraftAddon } from '../../src/stores/checkout';
import { colors, space } from '../../src/theme/tokens';
import type { CartAddonInput, CartAddonRecipient, CartAttendee } from '../../src/api/types';

/**
 * Design screen 14 · Room occupancy.
 *
 * Accommodation is bought by the room, and every room has to be full before checkout: a double
 * sleeps two, and the backend rejects a half-filled one (`ROOM_OCCUPANCY_UNFILLED`). One person
 * can only be in one room for the event, so anyone already placed drops out of the remaining
 * rooms' pickers rather than failing later.
 *
 * Every accommodation line in the cart is filled in here, not just the first. Nothing stops a
 * buyer taking a lodge room and a tent, and a second line left unfilled produces a cart that
 * passes this screen and can never be paid for.
 *
 * The buyer does not have to be in the room they are paying for.
 */

/** What a line's catalogue entry turned out to say, reported up by the card that fetched it. */
interface LineFacts {
  ready: boolean;
  occupancy: number;
  roomType: string;
}

interface Person {
  key: string;
  target: CartAddonRecipient;
  name: string;
  note: string;
  hasAccommodation: boolean;
}

export default function RoomsScreen() {
  const router = useRouter();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const validEventId =
    typeof eventId === 'string' && /^[A-Za-z0-9_-]+$/.test(eventId) ? eventId : undefined;

  const access = useCheckoutAccess();
  const steps = useCheckoutSteps(validEventId);
  const cartId = useCheckoutStore((s) => s.cartId);
  const addons = useCheckoutStore((s) => s.addons);
  const setAddonRooms = useCheckoutStore((s) => s.setAddonRooms);

  const cartQuery = useCart(cartId ?? undefined);
  const eventQuery = useEvent(validEventId);
  const replaceAddons = useReplaceCartAddons();
  const addTicketFor = useAddTicketToCart(validEventId);

  const [external, setExternal] = useState<Person[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [facts, setFacts] = useState<Record<string, LineFacts>>({});

  const roomLines = useMemo(
    () => addons.filter((line) => line.type === 'accommodation'),
    [addons],
  );

  const attendees = useMemo(() => cartQuery.data?.attendees ?? [], [cartQuery.data]);
  const event = eventQuery.data;
  const eventTitle = event?.title ?? 'this event';

  /** The tier somebody's ticket in this cart is for, which is how design 14 labels a person. */
  const tierNameFor = useMemo(() => {
    const tierByItem = new Map(
      (cartQuery.data?.tickets ?? []).map((ticket) => [ticket.cartTicketItemId, ticket.tierId]),
    );
    return (attendee: CartAttendee) =>
      event?.tiers.find((item) => item.id === tierByItem.get(attendee.cartTicketItemId))?.name ??
      null;
  }, [cartQuery.data, event]);

  const people: Person[] = useMemo(
    () => [
      ...attendees.map((attendee) => {
        const tierName = tierNameFor(attendee);
        const who = attendee.attendeeType === 'buyer' ? 'you' : 'in this cart';
        return {
          key: attendee.cartAttendeeId,
          target: { cartAttendeeId: attendee.cartAttendeeId } as CartAddonRecipient,
          name: attendee.name,
          note: tierName ? `${tierName} · ${who}` : who,
          hasAccommodation: false,
        };
      }),
      ...external,
    ],
    [attendees, external, tierNameFor],
  );

  /** Each card fetches its own catalogue entry; this is how the screen learns its occupancy. */
  const report = useCallback((optionId: string, next: LineFacts) => {
    setFacts((current) => {
      const previous = current[optionId];
      if (
        previous &&
        previous.ready === next.ready &&
        previous.occupancy === next.occupancy &&
        previous.roomType === next.roomType
      ) {
        return current;
      }
      return { ...current, [optionId]: next };
    });
  }, []);

  // Seeds one empty room per unit bought, on every accommodation line, so the screen always shows
  // exactly what has to be filled.
  const shape = roomLines.map((line) => `${line.optionId}:${line.quantity}`).join('|');
  useEffect(() => {
    for (const line of roomLines) {
      const rooms = line.rooms ?? [];
      if (rooms.length === line.quantity) continue;
      setAddonRooms(
        line.optionId,
        Array.from({ length: line.quantity }, (_unused, index) => rooms[index] ?? { occupants: [] }),
      );
    }
    // Only the set of lines and their sizes matter; re-running on every room edit would undo it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shape]);

  /**
   * The cart is gone: it expired, or this screen was reached without one. Nothing here can be
   * retried, so the way out is back to the event to pick tickets and extras again.
   */
  const expired = (
    <Screen scroll contentStyle={styles.content}>
      <BackButton onPress={() => router.back()} style={styles.back} />
      <ResourceState
        status="error"
        errorTitle="This checkout has expired"
        errorMessage="Start again from the event to pick your tickets and extras."
        retryLabel={validEventId ? 'Back to the event' : 'Find an event'}
        onRetry={() =>
          router.replace(
            validEventId ? (`/event/${validEventId}` as never) : ('/(tabs)/discover' as never),
          )
        }
      />
    </Screen>
  );

  /** The cart is fine, the room is not: send the buyer back to the extras step to pick one. */
  const noRoom = (
    <Screen scroll contentStyle={styles.content}>
      <BackButton onPress={() => router.back()} style={styles.back} />
      <ResourceState
        status="error"
        errorTitle="That room is no longer in your cart"
        errorMessage="Pick a room again from the extras step."
        retryLabel="Back to extras"
        onRetry={() => router.replace(`/checkout/addons?eventId=${validEventId}` as never)}
      />
    </Screen>
  );

  // Both of these run before the loading guard. `useCart` is disabled without a cart id, and a
  // disabled TanStack Query v5 query reports `isPending` forever, so either gap would otherwise
  // hold this screen on a spinner that can never resolve. The catalogue is gated on `isLoading`
  // for the same reason, one level down, in the card that fetches it.
  if (!cartId || !validEventId) return expired;
  if (roomLines.length === 0) return noRoom;

  if (access.loading || cartQuery.isLoading) {
    return (
      <Screen>
        <ResourceState status="loading" loadingLabel="Loading your room..." />
      </Screen>
    );
  }

  if (!cartQuery.data) return expired;

  const cart = cartQuery.data;
  const orderFull = event ? attendees.length >= event.maxTicketsPerOrder : true;

  const allResolved = roomLines.every((line) => facts[line.optionId]?.ready);
  // A line whose option came back with no occupancy is not an accommodation option any more.
  if (allResolved && roomLines.some((line) => (facts[line.optionId]?.occupancy ?? 0) === 0)) {
    return noRoom;
  }

  const occupancyOf = (line: DraftAddon) => facts[line.optionId]?.occupancy ?? 0;
  const key = (target: CartAddonRecipient) => target.cartAttendeeId ?? target.ticketId ?? '';

  // One room per person for the whole event, so this spans every line, not just the one in hand.
  const placed = new Set(
    roomLines.flatMap((line) =>
      (line.rooms ?? []).flatMap((room) => room.occupants.map((occupant) => key(occupant))),
    ),
  );

  function toggle(line: DraftAddon, roomIndex: number, target: CartAddonRecipient) {
    const occupancy = occupancyOf(line);
    const rooms = line.rooms ?? [];
    const next = rooms.map((room, index) => {
      if (index !== roomIndex) return room;
      const has = room.occupants.some((occupant) => key(occupant) === key(target));
      if (has) {
        return { occupants: room.occupants.filter((occupant) => key(occupant) !== key(target)) };
      }
      if (room.occupants.length >= occupancy) return room;
      return { occupants: [...room.occupants, target] };
    });
    setAddonRooms(line.optionId, next);
  }

  const allFull =
    allResolved &&
    roomLines.every((line) => {
      const occupancy = occupancyOf(line);
      const rooms = line.rooms ?? [];
      return (
        occupancy > 0 &&
        rooms.length === line.quantity &&
        rooms.every((room) => room.occupants.length === occupancy)
      );
    });

  /** Artboard 15's "Room not yet full": the first room short of occupants, and what to do. */
  function shortfallMessage(): string | null {
    for (const line of roomLines) {
      const occupancy = occupancyOf(line);
      if (occupancy === 0) continue;
      const rooms = line.rooms ?? [];
      for (const [index, room] of rooms.entries()) {
        if (room.occupants.length === occupancy) continue;
        const missing = occupancy - room.occupants.length;
        const roomType = facts[line.optionId]?.roomType ?? '';
        const name = roomType ? `${line.addonName} · ${roomType}` : line.addonName;
        const which = line.quantity > 1 ? `${name} (room ${index + 1})` : name;
        const fix =
          missing === 1
            ? 'Add one more occupant to check out.'
            : `Add ${missing} more occupants to check out.`;
        return `${which} is ${room.occupants.length} of ${occupancy} filled. ${fix}`;
      }
    }
    return null;
  }

  function toInput(line: DraftAddon): CartAddonInput {
    return {
      optionId: line.optionId,
      quantity: line.quantity,
      ...(line.type === 'accommodation'
        ? { rooms: line.rooms ?? [] }
        : { assignments: line.assignments ?? [] }),
    };
  }

  function onAdded(added: AddedRecipient) {
    setExternal((current) =>
      current.some((person) => person.key === added.ticketId)
        ? current
        : [
            ...current,
            {
              key: added.ticketId,
              target: { ticketId: added.ticketId },
              // The server never sends a name; this one is the buyer's own contact label.
              name: added.name || formatPhoneLocal(added.phoneNumber),
              note: `Has a ticket to ${eventTitle}`,
              hasAccommodation: added.hasAccommodation,
            },
          ],
    );
  }

  async function onContinue() {
    setError(null);
    if (!cartId) {
      setError('This checkout has expired. Go back and start again.');
      return;
    }

    try {
      // Everything is whole by this point, but the filter is the same one the earlier step
      // uses: a line that somehow arrived here unfinished must not turn Continue into a 400.
      await replaceAddons.mutateAsync({
        cartId,
        addons: addons.filter(isSendableAddonLine).map(toInput),
      });
    } catch (err) {
      setError(messageForError(err));
      return;
    }

    router.push(`/checkout/review?eventId=${validEventId}` as never);
  }

  const singleRoom = roomLines.length === 1 && roomLines[0]!.quantity === 1;
  const onlyOccupancy = roomLines.length === 1 ? occupancyOf(roomLines[0]!) : 0;
  const shortfall = shortfallMessage();

  return (
    <Screen scroll contentStyle={styles.content}>
      <BackButton onPress={() => router.back()} style={styles.back} />

      <StepLabel>{`Checkout · step ${steps.addonsStep ?? 3} of ${steps.total}`}</StepLabel>
      <View style={styles.heading}>
        <BulletHeading title={singleRoom ? 'Fill your room' : 'Fill your rooms'} size="md" />
      </View>
      <Text style={styles.lead}>
        {roomLines.length === 1 && onlyOccupancy > 0
          ? onlyOccupancy === 1
            ? `This room sleeps one. Whoever is in it needs a ticket to ${eventTitle}.`
            : `This room sleeps ${onlyOccupancy}. Everyone in it needs a ticket to ${eventTitle}.`
          : `Every room has to be full, and everyone in one needs a ticket to ${eventTitle}.`}
      </Text>

      {roomLines.map((line) => (
        <RoomLineCard
          key={line.optionId}
          eventId={validEventId}
          line={line}
          people={people}
          placed={placed}
          onReport={report}
          onToggle={(roomIndex, target) => toggle(line, roomIndex, target)}
        />
      ))}

      <AddRecipient
        cartId={cartId}
        eventTitle={eventTitle}
        refuseRoomHolders
        canAddTicket={!orderFull}
        alreadyInOrder={(phoneNumber) =>
          cart.attendees.some((attendee) => attendee.phoneNumber === phoneNumber)
        }
        onAdded={onAdded}
        onAddTicket={addTicketFor}
      />

      {shortfall ? <InlineError message={shortfall} /> : null}
      {error ? <InlineError message={error} /> : null}

      <View style={styles.spacer} />

      <Text variant="metaSm" color={colors.textMuted} style={styles.rule}>
        One room per person. Rooms must be full before you can pay.
      </Text>

      <Button
        label={allFull ? 'Continue' : 'Room not full yet'}
        disabled={!allFull}
        loading={replaceAddons.isPending}
        onPress={onContinue}
      />
    </Screen>
  );
}

/**
 * One accommodation line: its catalogue entry, and a picker per room it bought.
 *
 * The fetch lives here rather than in the screen because the number of lines is not known until
 * render, and a hook cannot be called in a loop. It reports what it found upward so the screen
 * can gate Continue on every line at once.
 */
function RoomLineCard({
  eventId,
  line,
  people,
  placed,
  onReport,
  onToggle,
}: {
  eventId: string;
  line: DraftAddon;
  people: Person[];
  placed: Set<string>;
  onReport: (optionId: string, facts: LineFacts) => void;
  onToggle: (roomIndex: number, target: CartAddonRecipient) => void;
}) {
  const addonQuery = useAddon(eventId, line.addonId);
  const option = addonQuery.data?.options.find((item) => item.id === line.optionId);
  const room = option && isAccommodation(option) ? option : null;

  // `isLoading` rather than `isPending`: this query is switched off without an addon id, and a
  // disabled query is pending forever, which would report this line as never resolved.
  const ready = !addonQuery.isLoading;
  const occupancy = room?.occupancy ?? 0;
  const roomType = room?.roomType ?? '';

  useEffect(() => {
    onReport(line.optionId, { ready, occupancy, roomType });
  }, [line.optionId, ready, occupancy, roomType, onReport]);

  if (!ready) {
    return (
      <Text variant="metaSm" color={colors.textMuted} style={styles.schedule}>
        Loading {line.addonName}...
      </Text>
    );
  }

  if (!room) return null;

  const key = (target: CartAddonRecipient) => target.cartAttendeeId ?? target.ticketId ?? '';
  const rooms = line.rooms ?? [];
  const nights = room.nights === 1 ? '1 night' : `${room.nights} nights`;
  const price = option?.priceEgpNow ? ` · ${formatEgp(option.priceEgpNow)}` : '';

  return (
    <View>
      <Text style={styles.lineName}>
        {line.addonName} · {room.roomType}
      </Text>
      <Text variant="metaSm" color={colors.textMuted}>
        {nights}
        {price}
      </Text>
      <Text variant="metaSm" color={colors.textMuted} style={styles.schedule}>
        Check-in {formatDate(room.checkInDate)} · Check-out {formatDate(room.checkOutDate)}
      </Text>

      {rooms.map((current, roomIndex) => (
        <View key={roomIndex} style={styles.room}>
          <View style={styles.roomTop}>
            <Text style={styles.roomName}>
              {rooms.length === 1 ? 'Your room' : `Room ${roomIndex + 1}`}
            </Text>
            <Badge
              label={`${current.occupants.length} of ${occupancy} assigned`}
              tone={current.occupants.length === occupancy ? 'sage' : 'gold'}
            />
          </View>

          <PeopleHeading />

          {people.map((person) => {
            const inThisRoom = current.occupants.some(
              (occupant) => key(occupant) === key(person.target),
            );
            // Already in another room here, or in one bought earlier: one room per person.
            const elsewhere = !inThisRoom && placed.has(key(person.target));
            const blocked = elsewhere || person.hasAccommodation;

            return (
              <SelectableCard
                key={person.key}
                selected={inThisRoom}
                disabled={blocked || (!inThisRoom && current.occupants.length >= occupancy)}
                onPress={() => onToggle(roomIndex, person.target)}
              >
                <CheckCircle selected={inThisRoom} />
                <View style={styles.personBody}>
                  <Text style={styles.personName}>{person.name}</Text>
                  <Text variant="metaSm" color={colors.textMuted}>
                    {person.hasAccommodation
                      ? 'Already has a room for this event'
                      : elsewhere
                        ? 'Already in another room'
                        : person.note}
                  </Text>
                </View>
                {blocked ? <Badge label="Blocked" tone="rose" /> : null}
              </SelectableCard>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: space.s7 },
  back: { marginBottom: space.s3 },
  heading: { marginTop: space.s2 },
  lead: { color: colors.textMuted, marginTop: space.s2, marginBottom: space.s4 },
  lineName: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  schedule: { marginBottom: space.s4 },
  room: { marginBottom: space.s5, gap: space.s2 },
  roomTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  roomName: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  personBody: { flex: 1, marginLeft: space.s3 },
  personName: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  spacer: { flex: 1, minHeight: space.s4 },
  rule: { marginBottom: space.s3 },
});
