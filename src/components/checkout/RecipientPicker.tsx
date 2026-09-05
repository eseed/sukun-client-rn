import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type {
  Cart,
  CartAddonAssignmentInput,
  CartAddonRecipient,
  CartAttendee,
} from '../../api/types';
import {
  useCart,
  useLookupRecipients,
  useReplaceCartAddons,
  useReplaceCartTickets,
  useValidateGuests,
} from '../../hooks/queries';
import { useContacts, type PickedContact } from '../../hooks/useContacts';
import { isSendableAddonLine } from '../../lib/addons';
import { messageForCode, messageForError } from '../../lib/errors';
import { formatPhoneLocal } from '../../lib/phone';
import { useCheckoutStore } from '../../stores/checkout';
import { colors, space } from '../../theme/tokens';
import {
  Badge,
  Button,
  Card,
  CheckCircle,
  InlineError,
  OptionSheet,
  SelectableCard,
  Text,
} from '../ui';

export interface Recipient {
  key: string;
  target: CartAddonRecipient;
  name: string;
  note: string;
  eligible: boolean;
  hasAccommodation: boolean;
}

/** Somebody the buyer picked from the OS contact picker who turned out to hold a ticket. */
export interface AddedRecipient {
  name: string;
  phoneNumber: string;
  ticketId: string;
  hasAccommodation: boolean;
}

/** The heading both assignment screens put over the people list (designs 13 and 14). */
export const PEOPLE_HEADING = 'People in this order';

export function PeopleHeading() {
  return (
    <Text variant="eyebrow" style={styles.peopleHeading}>
      {PEOPLE_HEADING}
    </Text>
  );
}

/**
 * Assigns a line's units to people, one unit at a time (design screen 13).
 *
 * A tap adds a unit for that person and a second tap takes it back, which is how a buyer gives
 * two dinners to one guest without a separate quantity control per row. The picker stops handing
 * out units once the line is fully assigned, so it can never build a request the server would
 * reject for over-assignment.
 *
 * `autoKey` marks the person the screen seeded for the buyer, so design 13's "Auto" badge says
 * what happened. It disappears the moment that line is touched, because from then on the
 * assignment is the buyer's own.
 */
export function RecipientPicker({
  people,
  unitCount,
  assignments,
  autoKey,
  onChange,
}: {
  people: Recipient[];
  unitCount: number;
  assignments: CartAddonAssignmentInput[];
  autoKey?: string | null;
  onChange: (assignments: CartAddonAssignmentInput[]) => void;
}) {
  const assignedTo = (person: Recipient) =>
    assignments.find(
      (assignment) =>
        (assignment.cartAttendeeId !== undefined &&
          assignment.cartAttendeeId === person.target.cartAttendeeId) ||
        (assignment.ticketId !== undefined && assignment.ticketId === person.target.ticketId),
    )?.quantity ?? 0;

  const total = assignments.reduce((sum, assignment) => sum + (assignment.quantity ?? 1), 0);

  function bump(person: Recipient, by: number) {
    const current = assignedTo(person);
    const next = current + by;

    if (next < 0 || (by > 0 && total >= unitCount)) return;

    const without = assignments.filter(
      (assignment) =>
        !(
          (assignment.cartAttendeeId !== undefined &&
            assignment.cartAttendeeId === person.target.cartAttendeeId) ||
          (assignment.ticketId !== undefined && assignment.ticketId === person.target.ticketId)
        ),
    );

    onChange(next === 0 ? without : [...without, { ...person.target, quantity: next }]);
  }

  if (people.length === 0) {
    return (
      <Text variant="metaSm" color={colors.textMuted}>
        Nobody in this cart can take an extra yet. Go back and add who is coming.
      </Text>
    );
  }

  return (
    <View style={styles.list}>
      {people.map((person) => {
        const count = assignedTo(person);
        const full = total >= unitCount && count === 0;

        return (
          <SelectableCard
            key={person.key}
            selected={count > 0}
            disabled={!person.eligible || full}
            onPress={() => bump(person, 1)}
          >
            <CheckCircle selected={count > 0} />
            <View style={styles.body}>
              <Text style={styles.name}>{person.name}</Text>
              <Text variant="metaSm" color={colors.textMuted}>
                {person.note}
              </Text>
            </View>
            {autoKey === person.key && count === 1 ? <Badge label="Auto" tone="sage" /> : null}
            {count > 1 ? <Badge label={`× ${count}`} tone="sage" /> : null}
            {count > 0 ? (
              <Text
                accessibilityRole="button"
                accessibilityLabel={`Remove one from ${person.name}`}
                onPress={() => bump(person, -1)}
                style={styles.remove}
              >
                −
              </Text>
            ) : null}
          </SelectableCard>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------- adding someone else */

export type RefusalKind = 'no-ticket' | 'has-room';

/**
 * Artboard 15's two refusals, written so they work for any name.
 *
 * The "no ticket" sentence is the only answer a lookup can produce for somebody who cannot
 * receive an extra: an unregistered number and a registered one without a ticket both come back
 * `eligible: false` with no reason code, and this copy is deliberately the same for both
 * (CLAUDE.md rule 4). Nothing upstream of it may branch on the difference, because there is
 * none to branch on.
 */
export function refusalMessage(kind: RefusalKind, name: string, eventTitle: string): string {
  return kind === 'has-room'
    ? `${name} already has a room for this event. One room per person.`
    : `${name} needs a ticket to ${eventTitle} before they can get an extra. Add one to this cart.`;
}

/**
 * "Add someone else": the native OS contact picker, then a lookup of exactly the one number the
 * buyer chose.
 *
 * The address book is never swept. The buyer names a person, the server answers for that person
 * only, and anybody who cannot receive an extra is refused to their face rather than quietly
 * dropped from a list (P0.1 handoff decision 13).
 */
export function AddRecipient({
  cartId,
  eventTitle,
  refuseRoomHolders = false,
  canAddTicket,
  alreadyInOrder,
  onAdded,
  onAddTicket,
  label = 'Add someone else',
}: {
  cartId: string;
  eventTitle: string;
  /** The rooms screen also refuses somebody who already has a room: one room per person. */
  refuseRoomHolders?: boolean;
  /** False once the order has as many tickets as the event allows. */
  canAddTicket: boolean;
  alreadyInOrder: (phoneNumber: string) => boolean;
  onAdded: (person: AddedRecipient) => void;
  /** Adds a ticket for this person. Says whether the ticket landed, and what went wrong if not. */
  onAddTicket: (person: { name: string; phoneNumber: string }) => Promise<AddTicketOutcome>;
  label?: string;
}) {
  const { pickContact, canPickContact, openSettings } = useContacts();
  const lookup = useLookupRecipients();

  const [numberChoice, setNumberChoice] = useState<PickedContact | null>(null);
  const [refusal, setRefusal] = useState<{
    kind: RefusalKind;
    name: string;
    phoneNumber: string;
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // Android only, and only once the OS has stopped asking: the message alone is a dead end,
  // because there is no manual number field on this screen to fall back to.
  const [settingsWayOut, setSettingsWayOut] = useState(false);
  const [busy, setBusy] = useState(false);

  /**
   * Looks up the one number the buyer picked, and nothing else.
   *
   * There is a single ineligible branch on purpose. Whatever the server knows about why a number
   * cannot take an extra, it does not say, and neither does this.
   */
  async function resolve(name: string, phoneNumber: string) {
    setMessage(null);
    setRefusal(null);

    // Somebody already in this cart is not a lookup question: their ticket is in this order.
    if (alreadyInOrder(phoneNumber)) {
      setMessage(`${name} is already in this order.`);
      return;
    }

    setBusy(true);
    try {
      const [result] = await lookup.mutateAsync({ cartId, phoneNumbers: [phoneNumber] });

      if (!result || !result.eligible || result.ticketId === null) {
        setRefusal({ kind: 'no-ticket', name, phoneNumber });
        return;
      }
      if (refuseRoomHolders && result.hasAccommodation) {
        setRefusal({ kind: 'has-room', name, phoneNumber });
        return;
      }

      onAdded({
        name,
        phoneNumber,
        ticketId: result.ticketId,
        hasAccommodation: result.hasAccommodation,
      });
    } catch (err) {
      setMessage(messageForError(err));
    } finally {
      setBusy(false);
    }
  }

  /**
   * The OS picker: the whole address book, one person back. Exactly the flow the guests step
   * uses, including the question a contact with several numbers has to be asked, because a
   * ticket binds to one number and guessing picks the landline often enough to matter.
   *
   * iOS opens it without a permission of any kind. Android needs READ_CONTACTS to read the
   * chosen number back and asks for it first, so this is the one path here that can end in a
   * refusal that has nothing to do with the person picked.
   */
  async function openPicker() {
    setMessage(null);
    setRefusal(null);
    setSettingsWayOut(false);

    const result = await pickContact();

    if (result.status === 'cancelled') return;
    if (result.status === 'failed') {
      setMessage("We couldn't open your contacts. Try again in a moment.");
      return;
    }
    if (result.status === 'no-permission') {
      setMessage(
        result.canAskAgain
          ? 'Sukun needs access to your contacts to open your address book.'
          : 'Contacts access is turned off for Sukun. Turn it on in Settings to pick someone.',
      );
      setSettingsWayOut(!result.canAskAgain);
      return;
    }
    if (result.status === 'no-number') {
      setMessage(
        `${result.name || 'That contact'} has no mobile number saved. Pick someone else.`,
      );
      return;
    }

    const { contact } = result;
    const only = contact.numbers.length === 1 ? contact.numbers[0] : undefined;
    if (only) await resolve(contact.name, only);
    else setNumberChoice(contact);
  }

  async function addTicketForRefused() {
    if (!refusal) return;
    setBusy(true);
    try {
      const outcome = await onAddTicket({
        name: refusal.name,
        phoneNumber: refusal.phoneNumber,
      });
      // "They need a ticket" stops being true the moment the ticket is in the cart. Leaving the
      // refusal up next to a message saying they have one now reads as two contradictory answers,
      // so the ticket landing clears it whether or not the rest of the work went through.
      if (outcome.ticketAdded) setRefusal(null);
      if (outcome.problem) setMessage(outcome.problem);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.adder}>
      {canPickContact ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => void openPicker()}
          disabled={busy}
          style={({ pressed }) => (pressed ? styles.addRowPressed : null)}
        >
          <Card>
            <View style={styles.addRow}>
              <Text style={styles.addPlus}>+</Text>
              <Text style={styles.addLabel}>{busy ? 'Checking...' : label}</Text>
            </View>
          </Card>
        </Pressable>
      ) : null}

      {refusal ? (
        <View style={styles.refusal}>
          <InlineError message={refusalMessage(refusal.kind, refusal.name, eventTitle)} />
          <View style={styles.refusalActions}>
            {/*
              A ticket only helps somebody who has none. Offering it to a person who already has
              a room would be a button that can only fail, so that refusal has one way forward.
            */}
            {refusal.kind === 'no-ticket' ? (
              canAddTicket ? (
                <Button
                  label="Add a ticket for them"
                  size="inline"
                  loading={busy}
                  onPress={() => void addTicketForRefused()}
                />
              ) : (
                <Text variant="metaSm" color={colors.textMuted}>
                  {messageForCode('MAX_TICKETS_PER_ORDER_EXCEEDED')}
                </Text>
              )
            ) : null}
            <Button
              label="Choose someone else"
              variant="secondary"
              size="inline"
              disabled={busy}
              onPress={() => void openPicker()}
            />
          </View>
        </View>
      ) : null}

      {message ? (
        <View style={styles.refusal}>
          <InlineError message={message} />
          {settingsWayOut ? (
            <View style={styles.refusalActions}>
              <Button
                label="Open Settings"
                variant="secondary"
                size="inline"
                onPress={openSettings}
              />
            </View>
          ) : null}
        </View>
      ) : null}

      {/*
        Someone saved with a mobile, a landline and a work line is one contact and three numbers,
        and an extra binds to exactly one of them.
      */}
      <OptionSheet
        visible={numberChoice !== null}
        title={numberChoice?.name || 'Which number?'}
        options={(numberChoice?.numbers ?? []).map((number) => ({
          value: number,
          label: formatPhoneLocal(number),
        }))}
        selectedValue={null}
        onSelect={(number) => {
          if (numberChoice) void resolve(numberChoice.name, number);
        }}
        onClose={() => setNumberChoice(null)}
      />
    </View>
  );
}

/* ------------------------------------------- surviving a change of tickets */

/** What "add a ticket for them" managed to do, so the caller can tell the two failures apart. */
export interface AddTicketOutcome {
  /** True once the ticket is in the cart, even if putting the extras back afterwards failed. */
  ticketAdded: boolean;
  /** A message to show, or null when everything went through. */
  problem: string | null;
}

/**
 * "Add a ticket for them": one more ticket on this order, then the extras put straight back.
 *
 * `PUT /carts/:id/tickets` wipes the cart's draft extras and gives no promise that a person keeps
 * the same `cartAttendeeId`, so the draft is snapshotted first, re-pointed at the refreshed
 * cart's attendees, and re-sent in the same breath. Skipping that loses every extra the buyer has
 * picked, without a word.
 *
 * Reports the ticket and the extras separately: the ticket can land while the extras do not.
 */
export function useAddTicketToCart(eventId: string | undefined) {
  const cartId = useCheckoutStore((s) => s.cartId);
  const tierId = useCheckoutStore((s) => s.tierId);
  const quantity = useCheckoutStore((s) => s.quantity);
  const guests = useCheckoutStore((s) => s.guests);
  const buyerTakesTicket = useCheckoutStore((s) => s.buyerTakesTicket);
  const addons = useCheckoutStore((s) => s.addons);
  // Not `setQuantity`: that one clears the addon draft, which is the whole thing being protected
  // here. `addGuestSeat` buys the seat and keeps the extras.
  const addGuestSeat = useCheckoutStore((s) => s.addGuestSeat);
  const upsertAddon = useCheckoutStore((s) => s.upsertAddon);

  const cartQuery = useCart(cartId ?? undefined);
  const replaceTickets = useReplaceCartTickets();
  const replaceAddons = useReplaceCartAddons();
  const validateGuests = useValidateGuests();

  return async function addTicketFor(person: {
    name: string;
    phoneNumber: string;
  }): Promise<AddTicketOutcome> {
    if (!cartId || !eventId || !tierId) {
      return { ticketAdded: false, problem: 'This checkout has expired. Go back and start again.' };
    }

    const nextGuests = [
      ...guests,
      { phoneNumber: person.phoneNumber, name: person.name, fromContacts: true },
    ];

    // The same advisory check the guests step runs, and the same refusals, which never say
    // anything about whether a number is registered (CLAUDE.md rule 4).
    try {
      const verdict = await validateGuests.mutateAsync({
        eventId,
        guests: nextGuests.map((guest) => ({ phoneNumber: guest.phoneNumber })),
      });
      if (!verdict.valid) {
        const mine = verdict.issues.find((issue) => issue.guestIndex === nextGuests.length - 1);
        return {
          ticketAdded: false,
          problem: messageForCode(mine?.error ?? verdict.issues[0]?.error),
        };
      }
    } catch (err) {
      return { ticketAdded: false, problem: messageForError(err) };
    }

    // Snapshotted before the cart is edited: `PUT /carts/:id/tickets` wipes the cart's extras
    // server-side, so this copy is the only surviving record of what the buyer picked.
    const draft = addons.map((line) => ({ ...line }));
    const before = cartQuery.data?.attendees ?? [];

    let refreshed: Cart;
    try {
      refreshed = await replaceTickets.mutateAsync({
        cartId,
        tickets: {
          buyerTierId: buyerTakesTicket ? tierId : null,
          items: [{ tierId, quantity: quantity + 1 }],
          guests: nextGuests.map((guest) => ({
            phoneNumber: guest.phoneNumber,
            name: guest.name,
            tierId,
          })),
        },
      });
    } catch (err) {
      return { ticketAdded: false, problem: messageForError(err) };
    }

    addGuestSeat({ phoneNumber: person.phoneNumber, name: person.name, fromContacts: true });

    const reassigned = reassignToRefreshedCart(draft, before, refreshed.attendees);
    for (const line of reassigned) upsertAddon(line);

    // Only what the server would accept. The draft is half-assigned for most of this flow, and
    // that is the normal state on the assignment steps, not a save worth attempting: sending it
    // answers 400 and told the buyer their extras were lost when nothing had been lost at all.
    const sendable = reassigned.filter(isSendableAddonLine);

    // Nothing finished means the cart never held these lines to begin with, so the ticket edit
    // wiped nothing and there is nothing to put back.
    if (sendable.length === 0) return { ticketAdded: true, problem: null };

    try {
      await replaceAddons.mutateAsync({
        cartId,
        addons: sendable.map((line) => ({
          optionId: line.optionId,
          quantity: line.quantity,
          ...(line.type === 'accommodation'
            ? { rooms: line.rooms ?? [] }
            : { assignments: line.assignments ?? [] }),
        })),
      });
    } catch (err) {
      return {
        ticketAdded: true,
        problem: `${person.name} has a ticket now, but your extras did not save: ${messageForError(err)}`,
      };
    }

    return { ticketAdded: true, problem: null };
  };
}

/**
 * Re-points a draft's assignments at the attendee ids a fresh cart came back with.
 *
 * `PUT /carts/:id/tickets` wipes the cart's draft extras and does not promise to keep the same
 * `cartAttendeeId` for the same person, so an assignment held over that call has to be resolved
 * again. The phone number is what identifies the person across the two lists; it is used here as
 * a lookup at the moment of the edit and never stored as the assignment's identity, which is the
 * distinction the integration guide's section 6 draws.
 *
 * A `ticketId` target belongs to somebody outside the cart and is untouched. An attendee who did
 * not survive the edit loses their units rather than sending an id the server would reject.
 */
export function reassignToRefreshedCart<T extends { assignments?: CartAddonAssignmentInput[]; rooms?: { occupants: CartAddonRecipient[] }[] }>(
  lines: T[],
  before: readonly CartAttendee[],
  after: readonly CartAttendee[],
): T[] {
  const phoneOf = new Map(before.map((a) => [a.cartAttendeeId, a.phoneNumber]));
  const idOf = new Map(after.map((a) => [a.phoneNumber, a.cartAttendeeId]));

  function remap<R extends CartAddonRecipient>(target: R): R | null {
    if (target.cartAttendeeId === undefined) return target;
    const phone = phoneOf.get(target.cartAttendeeId);
    const next = phone ? idOf.get(phone) : undefined;
    if (!next) return null;
    return { ...target, cartAttendeeId: next };
  }

  return lines.map((line) => ({
    ...line,
    ...(line.assignments
      ? {
          assignments: line.assignments
            .map((assignment) => remap(assignment))
            .filter((assignment): assignment is CartAddonAssignmentInput => assignment !== null),
        }
      : {}),
    ...(line.rooms
      ? {
          rooms: line.rooms.map((room) => ({
            occupants: room.occupants
              .map((occupant) => remap(occupant))
              .filter((occupant): occupant is CartAddonRecipient => occupant !== null),
          })),
        }
      : {}),
  }));
}

const styles = StyleSheet.create({
  list: { gap: space.s2 },
  body: { flex: 1, marginLeft: space.s3 },
  name: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  remove: {
    color: colors.textMuted,
    fontSize: 22,
    paddingHorizontal: space.s3,
  },
  peopleHeading: { marginTop: space.s4, marginBottom: space.s2 },
  adder: { gap: space.s2, marginTop: space.s2 },
  addRow: { flexDirection: 'row', alignItems: 'center' },
  addRowPressed: { opacity: 0.7 },
  addPlus: { fontSize: 18, color: colors.textMuted, width: space.s5 },
  addLabel: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  refusal: { gap: space.s2 },
  refusalActions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s2 },
});
