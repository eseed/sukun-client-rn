import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { CountryCode } from 'libphonenumber-js/mobile';
import {
  BackButton,
  BulletHeading,
  Button,
  OptionSheet,
  PhoneField,
  ResourceState,
  Screen,
  SelectField,
  StepLabel,
  Text,
  TextField,
} from '../../src/components/ui';
import { GroupSavingNote } from '../../src/components/checkout/GroupDiscount';
import { useContacts, type PickedContact } from '../../src/hooks/useContacts';
import {
  useCart,
  useCreateCart,
  useEvent,
  useGroupQuote,
  useReplaceCartAddons,
  useReplaceCartTickets,
  useValidateGuests,
} from '../../src/hooks/queries';
import { reassignToRefreshedCart } from '../../src/components/checkout/RecipientPicker';
import { isSendableAddonLine } from '../../src/lib/addons';
import { useCheckoutSteps } from '../../src/hooks/useCheckoutSteps';
import { useCartNotEditableRecovery } from '../../src/hooks/useCartNotEditableRecovery';
import { track } from '../../src/lib/analytics';
import { messageForCode, messageForError } from '../../src/lib/errors';
import {
  countryOf,
  DEFAULT_COUNTRY,
  formatPhoneLocal,
  nationalDigitsOf,
  normalizePhone,
  phoneErrorMessage,
  phoneProblem,
  toE164,
} from '../../src/lib/phone';
import { useAuthStore } from '../../src/stores/auth';
import {
  type DraftGuest,
  guestSlots,
  ticketsInput,
  useCheckoutStore,
} from '../../src/stores/checkout';
import {
  useHoldsTicketForEvent,
  useOwnTicketForEvent,
} from '../../src/hooks/useHoldsTicketForEvent';
import { colors, fontFamily, radius, space } from '../../src/theme/tokens';
import { useCheckoutAccess } from '../../src/hooks/useCheckoutAccess';

/** One ticket holder as typed: a name and a WhatsApp number. */
interface PersonRow {
  key: string;
  name: string;
  country: CountryCode;
  national: string;
  fromContacts: boolean;
  /**
   * A child's guardian, as "Comes with" offers it: `buyer`, `row:<key>` (an adult friend
   * here) or `ticket:<id>` (the buyer's own ticket from before). Empty means the first offered.
   */
  guardian?: string;
  /** The pass this friend's ticket is on, so rows keep the order they were added in. */
  tierId?: string;
}

interface RowErrors {
  name?: string;
  phone?: string;
}

const BLANK_ROW: PersonRow = {
  key: '',
  name: '',
  country: DEFAULT_COUNTRY,
  national: '',
  fromContacts: false,
};

let rowKey = 0;
function newRow(seed?: Partial<PersonRow>): PersonRow {
  rowKey += 1;
  return {
    key: `person-${rowKey}`,
    name: '',
    country: DEFAULT_COUNTRY,
    national: '',
    fromContacts: false,
    ...seed,
  };
}

/** A number already known (a draft guest, a contact) as the row's country and digits. */
function rowFromNumber(phoneNumber: string, name: string, fromContacts: boolean): PersonRow {
  return newRow({
    name,
    country: (countryOf(phoneNumber) as CountryCode | null) ?? DEFAULT_COUNTRY,
    national: nationalDigitsOf(phoneNumber),
    fromContacts,
  });
}

/** The row's number in E.164, or null while it is not a valid one. */
function e164Of(row: Pick<PersonRow, 'country' | 'national'>): string | null {
  if (phoneProblem(row.national, row.country) !== null) return null;
  return normalizePhone(toE164(row.national, row.country), row.country);
}

function nameProblem(name: string): string | undefined {
  return name.trim().length >= 2 ? undefined : 'Enter their full name';
}

function phoneRowProblem(row: PersonRow): string | undefined {
  const problem = phoneProblem(row.national, row.country);
  if (problem === null) return undefined;
  return problem === 'empty'
    ? 'Enter their WhatsApp number'
    : (phoneErrorMessage(row.national, row.country) ?? messageForCode('GUEST_PHONE_INVALID'));
}

/**
 * Design screen 09 · Checkout, "Who's coming?" (owner's call, 2026-10-11; the website's
 * `GuestsPage`). Every ticket holder on one form: the buyer first ("You", read only), then a row
 * per friend with a full name and a WhatsApp number, typed or filled from the phone's contacts.
 * A child on a children's pass has a name and "Comes with" (an adult here, or the buyer's ticket
 * from before), and no number: they come in on that adult's QR. Friends are added or taken off
 * here, a ticket each. A buyer who already holds a ticket has no row: every ticket is a friend's.
 *
 * Continue checks the adults with the server (your own number, a friend who already has a
 * ticket) and builds the cart. Nothing here reveals whether a number is registered (rule 4):
 * every row looks and behaves the same.
 */
export default function GuestsScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const validEventId =
    typeof eventId === 'string' && /^[A-Za-z0-9_-]+$/.test(eventId) ? eventId : undefined;
  // The form is laid out from whether the buyer already holds a ticket (their own row, or a
  // friend's in its place), so it waits for that answer rather than rebuilding under the buyer.
  const { isPending } = useHoldsTicketForEvent(validEventId ?? null);
  if (isPending) {
    return (
      <Screen>
        <ResourceState status="loading" loadingLabel="Loading who's coming..." />
      </Screen>
    );
  }
  return <GuestsForm />;
}

function GuestsForm() {
  const router = useRouter();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const validEventId =
    typeof eventId === 'string' && /^[A-Za-z0-9_-]+$/.test(eventId) ? eventId : undefined;
  const access = useCheckoutAccess();

  const tierId = useCheckoutStore((s) => s.tierId);
  const quantity = useCheckoutStore((s) => s.quantity);
  const setQuantity = useCheckoutStore((s) => s.setQuantity);
  const draftGuests = useCheckoutStore((s) => s.guests);
  const replaceGuests = useCheckoutStore((s) => s.replaceGuests);
  const otherTiers = useCheckoutStore((s) => s.otherTiers);
  const setOtherTierCount = useCheckoutStore((s) => s.setOtherTierCount);
  const setBuyerTakesTicket = useCheckoutStore((s) => s.setBuyerTakesTicket);
  const cartId = useCheckoutStore((s) => s.cartId);
  const setCartId = useCheckoutStore((s) => s.setCartId);
  const setAddons = useCheckoutStore((s) => s.setAddons);
  const user = useAuthStore((s) => s.user);
  const buyerPhone = user?.phoneNumber ?? null;

  const { pickContact, canPickContact } = useContacts();
  const validateGuests = useValidateGuests();
  const cartQuery = useCart(cartId ?? undefined);
  const createCart = useCreateCart();
  const replaceTickets = useReplaceCartTickets();
  const replaceAddons = useReplaceCartAddons();
  const recoverFromCartNotEditable = useCartNotEditableRecovery(validEventId);
  const steps = useCheckoutSteps(validEventId);
  const { data: event } = useEvent(validEventId);

  // Already holding a ticket for this event means none of these are yours.
  const { holdsTicket, isPending: holdsTicketPending } = useHoldsTicketForEvent(
    validEventId ?? null,
  );
  // A child can come with the buyer's ticket from before.
  const ownTicket = useOwnTicketForEvent(validEventId ?? null);
  const youTakeTicket = !holdsTicket;
  useEffect(() => {
    if (!holdsTicketPending) setBuyerTakesTicket(youTakeTicket);
  }, [holdsTicketPending, setBuyerTakesTicket, youTakeTicket]);

  const slots = guestSlots(quantity, youTakeTicket);
  // Which pass each friend's ticket is on: the main pass's first (beyond the buyer's own), then
  // every other pass's in the event's order (owner's call 2026-10-11: groups can mix passes).
  const othersCount = Object.values(otherTiers).reduce((sum, count) => sum + count, 0);
  const mainFriendSlots = Math.max(0, quantity - othersCount - (youTakeTicket ? 1 : 0));
  const orderedOthers = Object.entries(otherTiers).sort(
    ([left], [right]) =>
      (event?.tiers.findIndex((tier) => tier.id === left) ?? 0) -
      (event?.tiers.findIndex((tier) => tier.id === right) ?? 0),
  );
  const passOrderTiers: string[] = [
    ...Array.from({ length: mainFriendSlots }, () => tierId ?? ''),
    ...orderedOthers.flatMap(([id, count]) => Array.from({ length: count }, () => id)),
  ].slice(0, slots);
  const mixed = orderedOthers.length > 0;
  // Mixed passes are priced by the server as a whole for the saving note.
  const mixedQuote = useGroupQuote(
    validEventId,
    mixed && tierId
      ? [
          ...(quantity - othersCount > 0 ? [{ tierId, quantity: quantity - othersCount }] : []),
          ...orderedOthers.map(([id, count]) => ({ tierId: id, quantity: count })),
        ]
      : null,
  );
  const tierOf = (id: string) => event?.tiers.find((tier) => tier.id === id);

  // The draft's friends, each back in a slot on their own pass.
  const [friends, setFriends] = useState<PersonRow[]>(() => {
    const unused = [...draftGuests];
    const rows: PersonRow[] = [];
    for (const [index, slotTier] of passOrderTiers.entries()) {
      const at = unused.findIndex((guest) => (guest.tierId ?? tierId) === slotTier);
      const guest = at >= 0 ? unused.splice(at, 1)[0] : undefined;
      const row = guest
        ? guest.child
          ? {
              ...BLANK_ROW,
              key: `friend-slot-${index}`,
              name: guest.name,
              guardian: guest.guardian ?? '',
            }
          : rowFromNumber(guest.phoneNumber, guest.name, guest.fromContacts)
        : { ...BLANK_ROW, key: `friend-slot-${index}` };
      rows.push({ ...row, tierId: slotTier });
    }
    // A child's guardian is kept by row here, so it follows the friend while their number is edited.
    return rows.map((row) => {
      if (!row.guardian?.startsWith('phone:')) return row;
      const number = row.guardian.slice('phone:'.length);
      const adult = rows.find((other) => !other.guardian && e164Of(other) === number);
      return { ...row, guardian: adult ? `row:${adult.key}` : '' };
    });
  });
  // One row per friend's ticket: rows nobody has typed in yet are blank, made when first edited.
  const shownFriends = Array.from(
    { length: slots },
    (_, index) => friends[index] ?? { ...BLANK_ROW, key: `friend-slot-${index}` },
  );
  // Which pass each row is on: its own while that pass still has the ticket, else whatever is
  // left, in pass order. A friend added here goes last instead of among their pass's rows.
  const slotTiers: string[] = (() => {
    const left = [...passOrderTiers];
    const taken = shownFriends.map((row) => {
      const at = row.tierId === undefined ? -1 : left.indexOf(row.tierId);
      return at >= 0 ? left.splice(at, 1)[0]! : null;
    });
    return taken.map((tier) => tier ?? left.shift() ?? '');
  })();

  const [errors, setErrors] = useState<Record<string, RowErrors>>({});
  const [formError, setFormError] = useState<string | null>(null);
  // The server's refusals, by number, so they follow the person if the rows move.
  const [serverIssues, setServerIssues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [numberChoice, setNumberChoice] = useState<{
    rowKey: string;
    contact: PickedContact;
  } | null>(null);

  const tier = event?.tiers.find((item) => item.id === tierId);
  // The order's cap, and what the main pass has left beside the other passes' tickets.
  const quantityLimit = event
    ? Math.min(
        event.maxTicketsPerOrder,
        othersCount + (tier?.quantityRemaining ?? event.maxTicketsPerOrder),
      )
    : quantity;
  // At least one ticket: the buyer's own, or one for a friend once they hold a ticket.
  const minQuantity = 1;

  if (access.loading || access.blocked)
    return (
      <Screen>
        <View />
      </Screen>
    );

  if (!validEventId || !tierId) {
    return (
      <Screen contentStyle={styles.content}>
        <BackButton onPress={() => router.back()} style={styles.back} />
        <Text variant="titleSm">Checkout link is incomplete</Text>
        <Text variant="bodyMuted" style={styles.blurb}>
          Go back and choose an event again.
        </Text>
      </Screen>
    );
  }
  const checkoutEventId = validEventId;
  const mainTierId = tierId;

  function updateFriend(key: string, change: Partial<PersonRow>) {
    const index = shownFriends.findIndex((row) => row.key === key);
    if (index < 0) return;
    setFormError(null);
    setFriends((rows) => {
      const next = [...rows];
      // Keyed as the blank row was, so the field being typed in keeps its focus.
      while (next.length <= index) next.push({ ...BLANK_ROW, key: `friend-slot-${next.length}` });
      next[index] = { ...next[index]!, ...change };
      return next;
    });
    setErrors(({ [key]: _cleared, ...rest }) => rest);
  }

  function addFriend() {
    if (quantity >= quantityLimit) return;
    setFormError(null);
    // A friend on the main pass, at the bottom where the button is.
    setFriends([
      ...shownFriends.map((row, index) => ({ ...row, tierId: slotTiers[index] })),
      newRow({ tierId: mainTierId }),
    ]);
    setQuantity(quantity + 1);
  }

  function removeFriend(key: string) {
    if (quantity <= minQuantity) return;
    setFormError(null);
    const index = shownFriends.findIndex((row) => row.key === key);
    const slotTier = slotTiers[index];
    setFriends((rows) => rows.filter((_, rowIndex) => rowIndex !== index));
    // The rows below move up a place, so their messages would point at the wrong person.
    setErrors({});
    // Their ticket comes off their own pass.
    if (slotTier && slotTier !== mainTierId)
      setOtherTierCount(slotTier, (otherTiers[slotTier] ?? 1) - 1);
    else setQuantity(quantity - 1);
  }

  /** Fills a friend's row from the phone's contacts (the OS picker: one person, no list). */
  async function fillFromContacts(key: string) {
    const result = await pickContact();
    if (result.status === 'cancelled') return;
    if (result.status === 'no-number') {
      setFormError(`${result.name || 'That contact'} has no mobile number saved. Type it instead.`);
      return;
    }
    if (result.status === 'no-permission') {
      setFormError(
        result.canAskAgain
          ? 'Sukun needs access to your contacts to open your address book. Type their details instead.'
          : 'Contacts access is turned off for Sukun. Turn it on in Settings, or type their details.',
      );
      return;
    }
    if (result.status !== 'picked') {
      setFormError("We couldn't open your contacts. Type their details instead.");
      return;
    }
    const only = result.contact.numbers.length === 1 ? result.contact.numbers[0] : undefined;
    if (only) {
      const row = rowFromNumber(only, result.contact.name, true);
      updateFriend(key, {
        name: row.name,
        country: row.country,
        national: row.national,
        fromContacts: true,
      });
    } else {
      // A ticket binds to exactly one number, so several are a question worth asking.
      setNumberChoice({ rowKey: key, contact: result.contact });
    }
  }

  function isChildSlot(index: number): boolean {
    return Boolean(tierOf(slotTiers[index] ?? '')?.isChildren);
  }

  /**
   * Who a child can come with (owner's call, 2026-10-11): the buyer's own ticket here, an adult
   * friend here (once they have a name or number), or the buyer's ticket from before.
   */
  function guardianOptions(): { value: string; label: string }[] {
    const options: { value: string; label: string }[] = [];
    if (youTakeTicket) options.push({ value: 'buyer', label: 'You' });
    else if (ownTicket) options.push({ value: `ticket:${ownTicket.id}`, label: 'You' });
    shownFriends.forEach((row, index) => {
      if (isChildSlot(index)) return;
      const number = e164Of(row);
      const label = row.name.trim() || (number ? formatPhoneLocal(number) : '');
      if (!label) return;
      options.push({ value: `row:${row.key}`, label });
    });
    return options;
  }

  /** The draft keeps a friend guardian by number (`phone:<E.164>`), as the cart is built. */
  function draftGuardian(value: string): string {
    if (!value.startsWith('row:')) return value;
    const adult = shownFriends.find((row) => row.key === value.slice('row:'.length));
    const number = adult ? e164Of(adult) : null;
    return number ? `phone:${number}` : 'buyer';
  }

  /** A child's guardian as chosen, or the first one offered. */
  function guardianOf(row: PersonRow, options: { value: string }[]): string | null {
    const chosen = row.guardian ? options.find((option) => option.value === row.guardian) : null;
    return (chosen ?? options[0])?.value ?? null;
  }

  /** Everything wrong on the form, row by row, or nothing. */
  function check(): Record<string, RowErrors> {
    const found: Record<string, RowErrors> = {};
    const seen = new Set<string>();
    const childNames = new Set<string>();
    const options = guardianOptions();
    for (const [index, row] of shownFriends.entries()) {
      if (isChildSlot(index)) {
        // A child: a name (one per child) and someone to come with, no number.
        let name = nameProblem(row.name);
        const key = row.name.trim().toLowerCase();
        if (!name && childNames.has(key)) name = 'Two children have this name. Add a surname.';
        childNames.add(key);
        const phone = guardianOf(row, options) ? undefined : 'Add an adult for them to come with';
        if (name || phone) found[row.key] = { name, phone };
        continue;
      }
      const name = nameProblem(row.name);
      let phone = phoneRowProblem(row);
      const number = e164Of(row);
      if (!phone && number) {
        if (number === buyerPhone) phone = messageForCode('GUEST_IS_BUYER');
        else if (seen.has(number)) phone = messageForCode('GUEST_DUPLICATE');
        seen.add(number);
      }
      if (name || phone) found[row.key] = { name, phone };
    }
    return found;
  }

  async function onContinue() {
    setFormError(null);
    setServerIssues({});
    const found = check();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setFormError('Fill in a full name and WhatsApp number for everyone.');
      return;
    }

    const options = guardianOptions();
    const nextGuests: DraftGuest[] = shownFriends.map((row, index) => {
      const slotTier = slotTiers[index];
      const onPass = slotTier && slotTier !== mainTierId ? { tierId: slotTier } : {};
      if (isChildSlot(index)) {
        return {
          phoneNumber: '',
          name: row.name.trim(),
          fromContacts: false,
          child: true,
          guardian: draftGuardian(guardianOf(row, options) ?? 'buyer'),
          ...onPass,
        };
      }
      return {
        phoneNumber: e164Of(row)!,
        name: row.name.trim(),
        fromContacts: row.fromContacts,
        ...onPass,
      };
    });
    replaceGuests(nextGuests);

    // Children have no number to check; the server checks their guardian with the cart.
    const adults = nextGuests.filter((guest) => !guest.child);
    setSaving(true);
    try {
      if (adults.length > 0) {
        const result = await validateGuests.mutateAsync({
          eventId: checkoutEventId,
          guests: adults.map((guest) => ({ phoneNumber: guest.phoneNumber })),
        });
        if (!result.valid) {
          // Pin each refusal to the person it is about, so it can be swapped for somebody else.
          const byNumber: Record<string, string> = {};
          for (const issue of result.issues) {
            const guest = adults[issue.guestIndex];
            if (guest) byNumber[guest.phoneNumber] = issue.error;
          }
          setServerIssues(byNumber);
          setFormError(
            Object.keys(byNumber).length === 1
              ? messageForCode(result.issues[0]?.error)
              : 'Some of these friends cannot be added. Swap them for someone else.',
          );
          return;
        }
      }

      // The cart is created here: the first point at which the selection is complete enough to
      // send, and `PUT /tickets` needs every recipient at once.
      const cart = cartId ? { id: cartId } : await createCart.mutateAsync(checkoutEventId);
      setCartId(cart.id);

      // Snapshotted before the edit: `PUT /carts/:id/tickets` wipes the cart's extras and makes
      // no promise that a person keeps the same `cartAttendeeId`.
      const state = useCheckoutStore.getState();
      const draft = state.addons.map((line) => ({ ...line }));
      const before = cartQuery.data?.attendees ?? [];
      const refreshed = await replaceTickets.mutateAsync({
        cartId: cart.id,
        tickets: ticketsInput(
          mainTierId,
          { quantity: state.quantity, guests: state.guests, buyerTakesTicket: youTakeTicket },
          state.otherTiers,
        ),
      });

      // Stepping back to swap one person is not a decision to drop the extras: they are
      // re-pointed at the refreshed cart, and only the person who changed loses theirs.
      if (draft.length > 0) {
        const reassigned = reassignToRefreshedCart(draft, before, refreshed.attendees);
        setAddons(reassigned);
        const sendable = reassigned.filter(isSendableAddonLine);
        if (sendable.length > 0) {
          await replaceAddons.mutateAsync({
            cartId: cart.id,
            addons: sendable.map((line) => ({
              optionId: line.optionId,
              quantity: line.quantity,
              ...(line.type === 'accommodation'
                ? { rooms: line.rooms ?? [] }
                : { assignments: line.assignments ?? [] }),
            })),
          });
        }
      }
    } catch (err) {
      if (recoverFromCartNotEditable(err)) return;
      setFormError(messageForError(err));
      return;
    } finally {
      setSaving(false);
    }

    track('guests_added', {
      event_id: checkoutEventId,
      guest_count: nextGuests.length,
      contacts_guest_count: adults.filter((guest) => guest.fromContacts).length,
      manual_guest_count: adults.filter((guest) => !guest.fromContacts).length,
      child_count: nextGuests.length - adults.length,
    });

    router.push(
      steps.hasAddons
        ? `/checkout/addons?eventId=${checkoutEventId}`
        : `/checkout/review?eventId=${checkoutEventId}`,
    );
  }

  const hasChildren = slotTiers.some((id) => tierOf(id)?.isChildren);

  return (
    <Screen scroll contentStyle={styles.content}>
      <BackButton onPress={() => router.back()} style={styles.back} />

      <StepLabel>{`Checkout · step 2 of ${steps.total}`}</StepLabel>
      <View style={styles.heading}>
        <BulletHeading title="Who's coming?" size="md" />
      </View>

      <Text variant="bodyMuted" style={styles.blurb}>
        {hasChildren
          ? 'A full name for everyone, and a WhatsApp number for each adult: tickets arrive on WhatsApp. Children come in with an adult.'
          : !youTakeTicket
            ? 'You already have a ticket, so these are all for friends. Tickets arrive on WhatsApp.'
            : slots === 0
              ? 'This ticket is yours. Add friends if they are coming.'
              : `A full name and WhatsApp number for each of the ${quantity} tickets. Tickets arrive on WhatsApp.`}
      </Text>

      <View style={styles.people}>
        {youTakeTicket ? (
          <View style={styles.person}>
            <Text style={styles.personLabel}>You</Text>
            <View style={styles.readOnly}>
              <Text style={styles.readOnlyName}>{user?.fullName || 'You'}</Text>
              <Text variant="metaSm" color={colors.textMuted}>
                {buyerPhone ? formatPhoneLocal(buyerPhone) : ''}
              </Text>
            </View>
          </View>
        ) : null}

        {shownFriends.map((row, index) => {
          const slotTier = tierOf(slotTiers[index] ?? '');
          const child = Boolean(slotTier?.isChildren);
          // Counted per kind, so it reads "Friend 1", "Friend 2", "Child 1".
          const ordinal = slotTiers
            .slice(0, index + 1)
            .filter((id) => Boolean(tierOf(id)?.isChildren) === child).length;
          const rowErrors = errors[row.key];
          const number = child ? null : e164Of(row);
          const issue = number ? serverIssues[number] : undefined;
          const options = child ? guardianOptions() : [];
          const label = `${child ? 'Child' : 'Friend'} ${ordinal}`;
          return (
            <View key={row.key} style={styles.person} testID={`person-${label}`}>
              <View style={styles.personHeader}>
                <Text style={styles.personLabel}>
                  {label}
                  {mixed && slotTier ? (
                    <Text style={styles.personPass}>{` · ${slotTier.name}`}</Text>
                  ) : null}
                </Text>
                <View style={styles.personActions}>
                  {canPickContact && !child ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Choose ${label} from contacts`}
                      hitSlop={8}
                      onPress={() => void fillFromContacts(row.key)}
                    >
                      <Text style={styles.personLink}>From contacts</Text>
                    </Pressable>
                  ) : null}
                  {quantity > minQuantity ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${label}`}
                      hitSlop={8}
                      onPress={() => removeFriend(row.key)}
                    >
                      <Text style={styles.personLink}>Remove</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
              <TextField
                label="Full name"
                value={row.name}
                autoCapitalize="words"
                autoCorrect={false}
                textContentType="name"
                accessibilityLabel={`${label} full name`}
                onChangeText={(name) => updateFriend(row.key, { name })}
                error={rowErrors?.name ?? null}
              />
              {child ? (
                // No number for a child: they come in with an adult's QR.
                <View>
                  <SelectField
                    label="Comes with"
                    value={guardianOf(row, options)}
                    options={options}
                    placeholder="Add an adult first"
                    onChange={(guardian) => updateFriend(row.key, { guardian })}
                    error={rowErrors?.phone ?? null}
                  />
                  <Text variant="metaSm" color={colors.textMuted} style={styles.hint}>
                    They come in with this adult&apos;s QR code.
                  </Text>
                </View>
              ) : (
                <PhoneField
                  label="WhatsApp number"
                  country={row.country}
                  onCountryChange={(country) => updateFriend(row.key, { country, national: '' })}
                  national={row.national}
                  onNationalChange={(national) => updateFriend(row.key, { national })}
                  error={rowErrors?.phone ?? (issue ? messageForCode(issue) : null)}
                />
              )}
            </View>
          );
        })}
      </View>

      {quantity < quantityLimit ? (
        <Button
          label={slots === 0 ? 'Bring a friend' : 'Add another friend'}
          variant="secondary"
          onPress={addFriend}
          style={styles.addFriend}
        />
      ) : null}

      <GroupSavingNote
        tiers={event?.groupDiscounts}
        groupPrices={tier?.groupPrices}
        quantity={quantity}
        maxTickets={quantityLimit}
        {...(mixed ? { quote: mixedQuote.data ?? null } : {})}
        style={styles.saving}
      />

      <OptionSheet
        visible={numberChoice !== null}
        title={numberChoice?.contact.name || 'Which number?'}
        options={(numberChoice?.contact.numbers ?? []).map((number) => ({
          value: number,
          label: formatPhoneLocal(number),
        }))}
        selectedValue={null}
        onSelect={(number) => {
          if (!numberChoice) return;
          const row = rowFromNumber(number, numberChoice.contact.name, true);
          updateFriend(numberChoice.rowKey, {
            name: row.name,
            country: row.country,
            national: row.national,
            fromContacts: true,
          });
        }}
        onClose={() => setNumberChoice(null)}
      />

      {formError ? (
        <Text variant="metaSm" color={colors.rose700} style={styles.error}>
          {formError}
        </Text>
      ) : null}

      <Button
        label="Continue"
        onPress={() => void onContinue()}
        loading={saving}
        // Until the ticket check settles, the buyer's own row may be one too many.
        disabled={holdsTicketPending}
        style={styles.continue}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 24, paddingBottom: 32 },
  back: { marginBottom: 18 },
  heading: { marginTop: 6, marginBottom: 10 },
  blurb: { marginBottom: 18 },
  people: { gap: space.s3 },
  person: {
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: radius.card,
    backgroundColor: colors.bgSurface,
    padding: space.s4,
    gap: space.s3,
  },
  personHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.s3,
  },
  personLabel: {
    flexShrink: 1,
    fontSize: 11,
    letterSpacing: 11 * 0.16,
    textTransform: 'uppercase',
    fontFamily: fontFamily.bodyMedium,
    color: colors.textPrimary,
  },
  personPass: {
    textTransform: 'none',
    letterSpacing: 0,
    fontFamily: fontFamily.body,
    color: colors.textMuted,
  },
  personActions: { flexDirection: 'row', gap: space.s4 },
  personLink: {
    fontSize: 13,
    fontFamily: fontFamily.bodyMedium,
    color: colors.textPrimary,
    textDecorationLine: 'underline',
  },
  readOnly: { gap: 2 },
  readOnlyName: { fontSize: 15, fontFamily: fontFamily.bodyMedium, color: colors.textPrimary },
  hint: { marginTop: 6 },
  addFriend: { marginTop: space.s4 },
  saving: { marginTop: space.s4 },
  error: { marginTop: space.s4 },
  continue: { marginTop: space.s5 },
});
