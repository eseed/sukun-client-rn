import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Badge,
  BackButton,
  BulletHeading,
  Button,
  Card,
  InlineError,
  ResourceState,
  Screen,
  StepLabel,
  Text,
} from '../../src/components/ui';
import {
  AddRecipient,
  PeopleHeading,
  RecipientPicker,
  useAddTicketToCart,
  type AddedRecipient,
  type Recipient,
} from '../../src/components/checkout/RecipientPicker';
import { useCart, useEvent, useReplaceCartAddons } from '../../src/hooks/queries';
import { isSendableAddonLine } from '../../src/lib/addons';
import { useCheckoutAccess } from '../../src/hooks/useCheckoutAccess';
import { useCheckoutSteps } from '../../src/hooks/useCheckoutSteps';
import { messageForError } from '../../src/lib/errors';
import { formatPhoneLocal } from '../../src/lib/phone';
import { useCheckoutStore } from '../../src/stores/checkout';
import { colors, space } from '../../src/theme/tokens';
import type { CartAddonInput, CartAttendee } from '../../src/api/types';

/**
 * Design screen 13 · Assign add-ons.
 *
 * Every unit goes to exactly one person, and Continue stays shut until they all have one: that is
 * the backend's rule (`ADDON_ASSIGNMENT_COUNT_MISMATCH`), and enforcing it here means the buyer
 * finds out on this screen rather than at the till.
 *
 * The standing list is the people in this order, nothing more. Anybody else is added the way the
 * guests step adds them: the native OS contact picker, one deliberate choice, and a lookup of
 * that single number (P0.1 handoff decision 13). The address book is never swept, and the server
 * never returns a name, so every label here comes from the device's own contacts.
 *
 * A number that cannot take an extra is refused in one sentence with no reason attached. An
 * unregistered number and a registered one without a ticket are the same answer and must stay
 * indistinguishable (CLAUDE.md rule 4).
 */
export default function AssignAddonsScreen() {
  const router = useRouter();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const validEventId =
    typeof eventId === 'string' && /^[A-Za-z0-9_-]+$/.test(eventId) ? eventId : undefined;

  const access = useCheckoutAccess();
  const steps = useCheckoutSteps(validEventId);
  const cartId = useCheckoutStore((s) => s.cartId);
  const addons = useCheckoutStore((s) => s.addons);
  const setAddonAssignments = useCheckoutStore((s) => s.setAddonAssignments);

  const cartQuery = useCart(cartId ?? undefined);
  const eventQuery = useEvent(validEventId);
  const replaceAddons = useReplaceCartAddons();
  const addTicketFor = useAddTicketToCart(validEventId);

  const [external, setExternal] = useState<Recipient[]>([]);
  const [error, setError] = useState<string | null>(null);
  /** Lines the buyer has touched, so the "Auto" badge stops claiming credit for their choice. */
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const attendees = useMemo(() => cartQuery.data?.attendees ?? [], [cartQuery.data]);
  const event = eventQuery.data;
  const eventTitle = event?.title ?? 'this event';
  const buyerAttendee = attendees.find((attendee) => attendee.attendeeType === 'buyer');

  /** The tier somebody's ticket in this cart is for, which is how the design labels a person. */
  const tierNameFor = useMemo(() => {
    const tierByItem = new Map(
      (cartQuery.data?.tickets ?? []).map((ticket) => [ticket.cartTicketItemId, ticket.tierId]),
    );
    return (attendee: CartAttendee) => {
      const tier = event?.tiers.find((item) => item.id === tierByItem.get(attendee.cartTicketItemId));
      return tier?.name ?? null;
    };
  }, [cartQuery.data, event]);

  /** People in this cart, who can always receive an extra: their ticket is in the same order. */
  const inCart: Recipient[] = useMemo(
    () =>
      attendees.map((attendee) => {
        const tierName = tierNameFor(attendee);
        const who = attendee.attendeeType === 'buyer' ? 'you' : 'in this cart';
        return {
          key: attendee.cartAttendeeId,
          target: { cartAttendeeId: attendee.cartAttendeeId },
          name: attendee.name,
          note: tierName ? `${tierName} · ${who}` : who,
          eligible: true,
          hasAccommodation: false,
        };
      }),
    [attendees, tierNameFor],
  );

  const people = [...inCart, ...external];
  // Rooms are filled in on their own screen, where occupancy is the constraint.
  const lines = addons.filter((line) => line.type !== 'accommodation');
  const rooms = addons.filter((line) => line.type === 'accommodation');

  /**
   * Design 13 pre-fills the buyer into the first unit of every extra and badges it "Auto". Seeded
   * once per line, so taking it back off stays taken off.
   */
  const seeded = useRef(new Set<string>());
  useEffect(() => {
    if (!buyerAttendee) return;
    for (const line of lines) {
      if (seeded.current.has(line.optionId)) continue;
      seeded.current.add(line.optionId);
      if ((line.assignments ?? []).length > 0) continue;
      setAddonAssignments(line.optionId, [
        { cartAttendeeId: buyerAttendee.cartAttendeeId, quantity: 1 },
      ]);
    }
    // Seeding is a one-shot per line; re-running it on every render would fight the buyer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buyerAttendee?.cartAttendeeId, lines.length]);

  const assignedCount = (optionId: string) =>
    (addons.find((line) => line.optionId === optionId)?.assignments ?? []).reduce(
      (total, assignment) => total + (assignment.quantity ?? 1),
      0,
    );

  const allAssigned = lines.every((line) => assignedCount(line.optionId) === line.quantity);
  // A disabled CTA has the same black fill as a live one, so the label is the only thing that
  // can say why it will not move. The rooms step does the same.
  const unassigned = lines.reduce(
    (total, line) => total + (line.quantity - assignedCount(line.optionId)),
    0,
  );

  /**
   * The cart is gone: it expired, or this screen was reached without one. There is nothing to
   * retry, so the way out is back to the event to pick tickets and extras again.
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

  // Answered before the loading guard: `useCart` is disabled without a cart id, and a disabled
  // TanStack Query v5 query reports `isPending` forever, so a missing cart would otherwise hold
  // this screen on a spinner that can never resolve. A missing event id lands here too, since
  // Continue has nowhere to go without one.
  if (!cartId || !validEventId) return expired;

  if (access.loading || cartQuery.isLoading) {
    return (
      <Screen>
        <ResourceState status="loading" loadingLabel="Loading your cart..." />
      </Screen>
    );
  }

  if (!cartQuery.data) return expired;

  const cart = cartQuery.data;
  const orderFull = event ? attendees.length >= event.maxTicketsPerOrder : true;

  function toInput(line: (typeof addons)[number]): CartAddonInput {
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
              eligible: true,
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
      // Room lines are still empty here: their occupants are chosen on the next screen, and
      // the server refuses an unfilled one outright. They travel with the rooms step's own save.
      await replaceAddons.mutateAsync({
        cartId,
        addons: addons.filter(isSendableAddonLine).map(toInput),
      });
    } catch (err) {
      setError(messageForError(err));
      return;
    }

    router.push(
      rooms.length > 0
        ? (`/checkout/rooms?eventId=${validEventId}` as never)
        : (`/checkout/review?eventId=${validEventId}` as never),
    );
  }

  return (
    <Screen scroll contentStyle={styles.content}>
      <BackButton onPress={() => router.back()} style={styles.back} />

      <StepLabel>{`Checkout · step ${steps.addonsStep ?? 3} of ${steps.total}`}</StepLabel>
      <View style={styles.heading}>
        <BulletHeading title="Who gets what?" size="md" />
      </View>
      <Text style={styles.lead}>
        {buyerAttendee
          ? "Every extra is attached to one person's ticket. Yours is assigned automatically."
          : "Every extra is attached to one person's ticket."}
      </Text>

      {lines.map((line) => (
        <View key={line.optionId} style={styles.line}>
          <View style={styles.lineTop}>
            <Text style={styles.lineName}>
              {line.addonName} · {line.optionLabel}
            </Text>
            <Badge
              label={`${assignedCount(line.optionId)} of ${line.quantity}`}
              tone={assignedCount(line.optionId) === line.quantity ? 'sage' : 'gold'}
            />
          </View>

          <PeopleHeading />
          <RecipientPicker
            people={people}
            unitCount={line.quantity}
            assignments={line.assignments ?? []}
            autoKey={touched[line.optionId] ? null : (buyerAttendee?.cartAttendeeId ?? null)}
            onChange={(assignments) => {
              setTouched((current) => ({ ...current, [line.optionId]: true }));
              setAddonAssignments(line.optionId, assignments);
            }}
          />
        </View>
      ))}

      {/* Nothing to assign here when the cart holds only rooms: that is the next screen's job. */}
      {lines.length > 0 ? (
        <AddRecipient
          cartId={cartId}
          eventTitle={eventTitle}
          canAddTicket={!orderFull}
          alreadyInOrder={(phoneNumber) =>
            cart.attendees.some((attendee) => attendee.phoneNumber === phoneNumber)
          }
          onAdded={onAdded}
          onAddTicket={addTicketFor}
        />
      ) : null}

      {rooms.length > 0 ? (
        <Card style={styles.roomsNote}>
          <Text variant="metaSm" color={colors.textMuted}>
            {rooms.length === 1 ? 'Your room is' : 'Your rooms are'} filled in on the next step.
          </Text>
        </Card>
      ) : null}

      {error ? <InlineError message={error} /> : null}

      <View style={styles.spacer} />

      <Text variant="metaSm" color={colors.textMuted} style={styles.rule}>
        {`A person can only get an extra if they hold a ticket to ${eventTitle} or are getting one in this cart.`}
      </Text>

      <Button
        label={
          allAssigned
            ? 'Continue'
            : `${unassigned} ${unassigned === 1 ? 'extra' : 'extras'} still to assign`
        }
        disabled={!allAssigned}
        loading={replaceAddons.isPending}
        onPress={onContinue}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: space.s7 },
  back: { marginBottom: space.s3 },
  heading: { marginTop: space.s2 },
  lead: { color: colors.textMuted, marginTop: space.s2, marginBottom: space.s4 },
  line: { marginBottom: space.s5 },
  lineTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.s2,
  },
  lineName: { fontSize: 15, fontWeight: '600', color: colors.textPrimary, flexShrink: 1 },
  roomsNote: { marginTop: space.s4, marginBottom: space.s4 },
  spacer: { flex: 1, minHeight: space.s4 },
  rule: { marginBottom: space.s3 },
});
