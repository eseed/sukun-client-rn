import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import {
  Avatar,
  avatarColor,
  BackButton,
  BulletHeading,
  Button,
  CheckCircle,
  CountryPrefix,
  CountrySheet,
  OptionSheet,
  QuantityStepper,
  Screen,
  SearchIcon,
  StepLabel,
  Text,
} from '../../src/components/ui';
import {
  canReadContacts,
  useContacts,
  type PhoneContact,
  type PickedContact,
} from '../../src/hooks/useContacts';
import { useEvent, useValidateGuests } from '../../src/hooks/queries';
import { track } from '../../src/lib/analytics';
import { messageForCode, messageForError } from '../../src/lib/errors';
import {
  DEFAULT_COUNTRY,
  formatNationalInput,
  formatPhoneLocal,
  normalizePhone,
  phoneErrorMessage,
  phoneProblem,
  sanitizeNationalInput,
  toE164,
} from '../../src/lib/phone';
import type { CountryCode } from 'libphonenumber-js/mobile';
import { useAuthStore } from '../../src/stores/auth';
import { guestSlots, useCheckoutStore } from '../../src/stores/checkout';
import { useHoldsTicketForEvent } from '../../src/hooks/useHoldsTicketForEvent';
import { colors, fontFamily } from '../../src/theme/tokens';
import { useCheckoutAccess } from '../../src/hooks/useCheckoutAccess';

/**
 * A long address book cannot all be rendered at once, and a picker that stutters is a picker
 * nobody gets through. Everything past this is reached by searching.
 */
const MAX_VISIBLE_CONTACTS = 25;

/**
 * Design screen 09 · Checkout, guests.
 *
 * Guests are attached by phone number. A ticket may exist before its owner does — it binds
 * when that number registers (CLAUDE.md rule 2). Nothing on this screen reveals whether a
 * number already has an account: every contact row looks and behaves the same (rule 4).
 *
 * Two invariants keep this screen from ever dead-ending, because contacts permission has
 * more states than a yes/no:
 *
 *   1. Everyone already attached is drawn from the *draft*, never from the address book. A
 *      guest stays visible, and removable, whether contacts were later revoked, narrowed to
 *      a limited selection, or never read at all.
 *   2. Manual entry is always on screen. It needs no permission, so there is always a way
 *      forward no matter what the OS says.
 */
export default function GuestsScreen() {
  const router = useRouter();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const validEventId =
    typeof eventId === 'string' && /^[A-Za-z0-9_-]+$/.test(eventId) ? eventId : undefined;
  const access = useCheckoutAccess();

  const quantity = useCheckoutStore((s) => s.quantity);
  const tierId = useCheckoutStore((s) => s.tierId);
  const setQuantity = useCheckoutStore((s) => s.setQuantity);
  const guests = useCheckoutStore((s) => s.guests);
  const removeGuest = useCheckoutStore((s) => s.removeGuest);
  const addGuest = useCheckoutStore((s) => s.addGuest);
  // Their own number is theirs already, so it is never a guest. Catching it here beats a
  // refusal from the server two screens later.
  const buyerPhone = useAuthStore((s) => s.user?.phoneNumber ?? null);

  const {
    contacts,
    access: contactsAccess,
    loading: contactsLoading,
    request: requestContacts,
    pickContact,
    openSettings,
    canPickContact,
  } = useContacts();
  const validateGuests = useValidateGuests();

  const [manual, setManual] = useState('');
  const [search, setSearch] = useState('');
  // Sticky once they touch the stepper, so adding a ticket here does not hide the control
  // that would take it back off. Arriving with more than one ticket leaves the screen as it was.
  const [ticketsAdjusted, setTicketsAdjusted] = useState(false);
  const [manualCountry, setManualCountry] = useState<CountryCode>(DEFAULT_COUNTRY);
  const [countrySheetOpen, setCountrySheetOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Per-guest refusals from validation, keyed by number so they survive a re-order of the
  // list and disappear the moment that guest is swapped out.
  const [issues, setIssues] = useState<Record<string, string>>({});
  // The person the OS picker handed back, held only while they are asked which of several
  // numbers the ticket is for. One number needs no question and never lands here.
  const [numberChoice, setNumberChoice] = useState<PickedContact | null>(null);

  // Already holding a ticket for this event means none of these are yours, so every one of
  // them is a guest slot rather than quantity minus your own.
  const { holdsTicket, isPending: holdsTicketPending } = useHoldsTicketForEvent(
    validEventId ?? null,
  );
  const setBuyerTakesTicket = useCheckoutStore((s) => s.setBuyerTakesTicket);

  // The draft caps how many guests it will hold, so it needs the same answer this screen uses
  // to count slots - otherwise it silently drops the guest attached to the buyer's own seat.
  useEffect(() => {
    if (!holdsTicketPending) setBuyerTakesTicket(!holdsTicket);
  }, [holdsTicket, holdsTicketPending, setBuyerTakesTicket]);

  // Worth knowing which permission state buyers actually land in, since this is the step that
  // strands them. The status only, never a name or a number (CLAUDE.md, analytics).
  const reportedAccess = useRef<string | null>(null);
  useEffect(() => {
    if (contactsAccess === 'unasked' || reportedAccess.current === contactsAccess) return;
    reportedAccess.current = contactsAccess;
    track('contacts_access', { access: contactsAccess, contact_count: contacts.length });
  }, [contactsAccess, contacts.length]);

  const slots = guestSlots(quantity, !holdsTicket);
  const picked = guests.length;
  const full = picked >= slots;

  // The same ceiling step 1 enforces: the event's per-order cap, and what the tier has left.
  // Until the event loads there is no ceiling to trust, so the stepper cannot go up.
  const { data: event } = useEvent(validEventId);
  const tier = event?.tiers.find((item) => item.id === tierId);
  const quantityLimit = event
    ? Math.min(event.maxTicketsPerOrder, tier?.quantityRemaining ?? event.maxTicketsPerOrder)
    : quantity;
  // Every slot is spoken for, so the only way to bring one more person is one more ticket.
  // Offering it here saves a trip back to step 1.
  const showTicketPicker = slots === 0 || ticketsAdjusted || (full && !holdsTicket);

  const selectedNumbers = useMemo(() => new Set(guests.map((g) => g.phoneNumber)), [guests]);

  /**
   * The attached guests, straight from the draft. Deliberately not derived from `contacts`:
   * that is what used to make a guest unremovable once the address book went away.
   */
  const attached: PhoneContact[] = useMemo(
    () =>
      guests.map((guest) => ({
        id: `guest:${guest.phoneNumber}`,
        name: guest.name,
        phoneNumber: guest.phoneNumber,
      })),
    [guests],
  );

  /** Contacts not yet attached, narrowed by the search box. */
  const suggestions: PhoneContact[] = useMemo(() => {
    const query = search.trim().toLowerCase();
    const digits = query.replace(/\D/g, '');

    const available = contacts.filter(
      (contact) => !selectedNumbers.has(contact.phoneNumber) && contact.phoneNumber !== buyerPhone,
    );

    if (!query) return available;
    return available.filter(
      (contact) =>
        contact.name.toLowerCase().includes(query) ||
        (digits.length > 0 && contact.phoneNumber.includes(digits)),
    );
  }, [buyerPhone, contacts, search, selectedNumbers]);

  const visible = suggestions.slice(0, MAX_VISIBLE_CONTACTS);
  const hidden = suggestions.length - visible.length;

  /**
   * Under limited access the list above holds only the handful of people already shared, so
   * everything it says about what it did not find has to be read in that light.
   */
  const sharedSubsetOnly = contactsAccess === 'limited';

  /** Any change to who is attached invalidates the last verdict from the server. */
  function clearVerdict() {
    setError(null);
  }

  function onAttach(contact: PhoneContact) {
    clearVerdict();
    if (full) {
      setError(
        `You have ${slots} guest ${slots === 1 ? 'slot' : 'slots'} on this order. Remove someone first, or add a ticket.`,
      );
      return;
    }
    if (contact.phoneNumber === buyerPhone) {
      setError(messageForCode('GUEST_IS_BUYER'));
      return;
    }
    addGuest({ phoneNumber: contact.phoneNumber, name: contact.name, fromContacts: true });
    setSearch('');
  }

  function onRemove(phoneNumber: string) {
    clearVerdict();
    setIssues(({ [phoneNumber]: _removed, ...rest }) => rest);
    removeGuest(phoneNumber);
  }

  function onAddManual() {
    clearVerdict();
    // Judged against the country the picker is showing, not against Egypt: a number that is
    // perfectly good in Germany is not a typo, and the message says what is actually wrong.
    const problem = phoneProblem(manual, manualCountry);
    if (problem !== null) {
      setError(
        problem === 'empty'
          ? 'Enter their mobile number.'
          : (phoneErrorMessage(manual, manualCountry) ?? messageForCode('GUEST_PHONE_INVALID')),
      );
      return;
    }
    const e164 = normalizePhone(toE164(manual, manualCountry), manualCountry);
    if (!e164) {
      setError(messageForCode('GUEST_PHONE_INVALID'));
      return;
    }
    if (e164 === buyerPhone) {
      setError(messageForCode('GUEST_IS_BUYER'));
      return;
    }
    if (selectedNumbers.has(e164)) {
      setError(messageForCode('GUEST_DUPLICATE'));
      return;
    }
    if (full) {
      setError(
        `You have ${slots} guest ${slots === 1 ? 'slot' : 'slots'} on this order. Remove someone first, or add a ticket.`,
      );
      return;
    }
    // A number typed by hand may well be in the address book too; keep that name if it is.
    const known = contacts.find((contact) => contact.phoneNumber === e164);
    addGuest({
      phoneNumber: e164,
      name: known?.name ?? formatPhoneLocal(e164),
      fromContacts: Boolean(known),
    });
    setManual('');
  }

  /**
   * Attaches somebody the OS picker handed over. They are not in `contacts` and never will
   * be: the picker grants no access, it just passes on the one person who was tapped. So the
   * guards the list gets for free (already attached, already yours) are applied here instead.
   */
  function attachPicked(name: string, phoneNumber: string) {
    if (phoneNumber === buyerPhone) {
      setError(messageForCode('GUEST_IS_BUYER'));
      return;
    }
    if (selectedNumbers.has(phoneNumber)) {
      setError(messageForCode('GUEST_DUPLICATE'));
      return;
    }
    if (full) {
      setError(
        `You have ${slots} guest ${slots === 1 ? 'slot' : 'slots'} on this order. Remove someone first, or add a ticket.`,
      );
      return;
    }
    addGuest({ phoneNumber, name: name || formatPhoneLocal(phoneNumber), fromContacts: true });
    setSearch('');
  }

  /**
   * The OS picker: the whole address book, no permission, one person back.
   *
   * A dismissal is an answer, not a fault, so it says nothing. Everything else does, because
   * a sheet that closes leaving no guest and no reason reads as a broken screen.
   */
  async function onPickContact() {
    clearVerdict();
    const result = await pickContact();

    if (result.status === 'cancelled') return;
    if (result.status === 'failed') {
      setError("We couldn't open your contacts. Add their number below instead.");
      return;
    }
    if (result.status === 'no-number') {
      setError(
        `${result.name || 'That contact'} has no mobile number saved. Add their number below instead.`,
      );
      return;
    }

    const { contact } = result;
    const only = contact.numbers.length === 1 ? contact.numbers[0] : undefined;
    // One number is not a question worth asking. Several is: a ticket binds to exactly one,
    // and picking the wrong one hands the ticket to a landline.
    if (only) attachPicked(contact.name, only);
    else setNumberChoice(contact);
  }

  async function onContinue() {
    clearVerdict();
    if (!validEventId) {
      setError('This checkout link is incomplete. Go back and choose an event again.');
      return;
    }

    // Every ticket that is not the buyer's own belongs to someone, and the order api refuses
    // an allocation that does not add up. Holding it here keeps that refusal from landing on
    // the review screen, a step too late to pick anybody.
    if (guests.length < slots) {
      setError(
        holdsTicket
          ? slots === 1
            ? 'You already have a ticket for this event, so this one is for a guest. Pick who it is for.'
            : `You already have a ticket for this event, so every ticket here is a guest's. Pick ${slots}.`
          : `Attach a guest to each ticket beyond your own. ${picked} of ${slots} picked.`,
      );
      return;
    }

    if (guests.length > 0) {
      try {
        const result = await validateGuests.mutateAsync({
          eventId: validEventId,
          guests: guests.map((g) => ({ phoneNumber: g.phoneNumber })),
        });
        if (!result.valid) {
          // Pin each refusal to the guest it is about, so "someone here has a ticket already"
          // becomes "this person does" and can be swapped for somebody else.
          const byNumber: Record<string, string> = {};
          for (const issue of result.issues) {
            const guest = guests[issue.guestIndex];
            if (guest) byNumber[guest.phoneNumber] = issue.error;
          }
          setIssues(byNumber);
          const named = Object.keys(byNumber).length;
          setError(
            named === 1
              ? messageForCode(result.issues[0]?.error)
              : 'Some of these guests cannot be added. Swap them for someone else.',
          );
          return;
        }
        setIssues({});
      } catch (err) {
        setError(messageForError(err));
        return;
      }
    }

    track('guests_added', {
      event_id: validEventId,
      guest_count: guests.length,
      contacts_guest_count: guests.filter((g) => g.fromContacts).length,
      manual_guest_count: guests.filter((g) => !g.fromContacts).length,
    });
    router.push(`/checkout/review?eventId=${validEventId}`);
  }

  if (access.loading)
    return (
      <Screen>
        <View />
      </Screen>
    );
  if (access.blocked)
    return (
      <Screen>
        <View />
      </Screen>
    );

  if (!validEventId) {
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

  return (
    <Screen scroll contentStyle={styles.content}>
      <BackButton onPress={() => router.back()} style={styles.back} />

      <StepLabel>Checkout · step 2 of 3</StepLabel>
      <View style={styles.heading}>
        <BulletHeading title="Bringing anyone?" size="md" />
      </View>

      <Text variant="bodyMuted" style={styles.blurb}>
        {slots === 0
          ? 'This ticket is yours. Add more if friends are coming.'
          : holdsTicket
            ? slots === 1
              ? 'You already have a ticket, so this one is for a guest.'
              : `You already have a ticket, so all ${slots} of these are for your guests.`
            : `${slots} of your ${quantity} tickets ${slots === 1 ? 'is' : 'are'} for a guest.`}
      </Text>

      {showTicketPicker ? (
        <View style={styles.friends}>
          <Text style={styles.listHeaderLabel}>Go with friends</Text>
          <Text variant="metaSm" color={colors.textMuted}>
            Every ticket you add is a guest you attach by phone number.
          </Text>
          <View style={styles.friendsRow}>
            <Text style={styles.friendsCount}>
              {quantity} {quantity === 1 ? 'ticket' : 'tickets'}
            </Text>
            <QuantityStepper
              value={quantity}
              min={1}
              max={quantityLimit}
              onChange={(next) => {
                clearVerdict();
                // Changing the ticket count re-cuts the guest list inside the draft, so the
                // last verdict no longer describes this order.
                setIssues({});
                setTicketsAdjusted(true);
                setQuantity(next);
              }}
            />
          </View>
        </View>
      ) : null}

      {slots > 0 ? (
        <>
          <View style={styles.listHeader}>
            <Text style={styles.listHeaderLabel}>Guests</Text>
            <Text style={styles.listHeaderCount}>
              {picked} of {slots} picked
            </Text>
          </View>

          {attached.length > 0 ? (
            <View style={styles.attached}>
              {attached.map((guest) => (
                <GuestRow
                  key={guest.id}
                  contact={guest}
                  selected
                  issue={issues[guest.phoneNumber]}
                  onPress={() => onRemove(guest.phoneNumber)}
                />
              ))}
            </View>
          ) : null}

          {canReadContacts(contactsAccess) && contacts.length > 0 ? (
            <>
              <View style={styles.searchRow}>
                <SearchIcon />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search your contacts"
                  placeholderTextColor={colors.textMuted}
                  autoCorrect={false}
                  style={styles.searchField}
                  accessibilityLabel="Search contacts"
                />
                {search.length > 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Clear contact search"
                    onPress={() => setSearch('')}
                    hitSlop={8}
                  >
                    <Text style={styles.clearSearch}>Clear</Text>
                  </Pressable>
                ) : null}
              </View>

              {visible.map((contact) => (
                <GuestRow
                  key={contact.id}
                  contact={contact}
                  selected={false}
                  onPress={() => onAttach(contact)}
                />
              ))}

              {hidden > 0 ? (
                <Text variant="metaSm" color={colors.textMuted} style={styles.emptyText}>
                  {`Showing ${visible.length} of ${suggestions.length}.`}
                </Text>
              ) : null}

              {suggestions.length === 0 ? (
                <Text variant="metaSm" color={colors.textMuted} style={styles.emptyText}>
                  {search.trim().length === 0
                    ? 'Everyone here is already attached.'
                    : // "No match." would be untrue under limited access: the search only ever
                      // ran against the handful of people shared with the app.
                      sharedSubsetOnly
                      ? 'No match in the contacts you shared.'
                      : 'No match.'}
                </Text>
              ) : null}
            </>
          ) : null}

          <ContactsAccessFooter
            access={contactsAccess}
            loading={contactsLoading}
            contactCount={contacts.length}
            canPickContact={canPickContact}
            onRequest={requestContacts}
            onPickContact={() => void onPickContact()}
            onOpenSettings={openSettings}
          />

          <View style={styles.manualRow}>
            <View style={styles.manualInput}>
              <CountryPrefix
                country={manualCountry}
                onPress={() => setCountrySheetOpen(true)}
                compact
              />
              <TextInput
                value={formatNationalInput(manual, manualCountry)}
                onChangeText={(value) => setManual(sanitizeNationalInput(value, manualCountry))}
                placeholder="Add by phone number"
                placeholderTextColor={colors.textMuted}
                keyboardType="phone-pad"
                style={styles.manualField}
                accessibilityLabel="Guest phone number"
              />
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={onAddManual}
              style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
            >
              <Text style={styles.addLabel}>Add</Text>
            </Pressable>
          </View>
        </>
      ) : null}

      <CountrySheet
        visible={countrySheetOpen}
        selectedCode={manualCountry}
        onSelect={(code) => {
          if (code !== manualCountry) setManual('');
          setManualCountry(code as CountryCode);
        }}
        onClose={() => setCountrySheetOpen(false)}
      />

      {/*
        Someone saved with a mobile, a landline and a work line is one contact and three
        numbers, and a ticket binds to exactly one of them. Guessing picks the landline often
        enough to be worth the question.
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
          if (numberChoice) attachPicked(numberChoice.name, number);
        }}
        onClose={() => setNumberChoice(null)}
      />

      {error ? (
        <Text variant="metaSm" color={colors.rose700} style={styles.error}>
          {error}
        </Text>
      ) : null}

      <Button
        label="Continue"
        onPress={onContinue}
        loading={validateGuests.isPending}
        // `holdsTicket` reads false until the ticket check settles, which understates the slot
        // count by one. Leaving early on that number sends an order a guest short.
        disabled={holdsTicketPending}
        style={styles.continue}
      />
    </Screen>
  );
}

/**
 * One person, whether they came from the address book or a typed number. Attached guests use
 * the identical row: the only difference is that pressing one takes them off the order.
 */
function GuestRow({
  contact,
  selected,
  issue,
  onPress,
}: {
  contact: PhoneContact;
  selected: boolean;
  issue?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={selected ? `Remove ${contact.name}` : `Add ${contact.name} as a guest`}
      onPress={onPress}
      style={[
        styles.contactRow,
        selected ? styles.contactSelected : styles.contactIdle,
        issue ? styles.contactInvalid : null,
      ]}
    >
      <Avatar
        name={contact.name}
        size={38}
        background={avatarColor(contact.phoneNumber)}
        foreground={colors.creme}
      />
      <View style={styles.contactBody}>
        <Text style={styles.contactName}>{contact.name}</Text>
        <Text style={styles.contactPhone}>{formatPhoneLocal(contact.phoneNumber)}</Text>
        {issue ? (
          <Text variant="metaSm" color={colors.rose700}>
            {messageForCode(issue)}
          </Text>
        ) : null}
      </View>
      <CheckCircle selected={selected} />
    </Pressable>
  );
}

/**
 * The one control whose job is to get contacts working, whatever state they are in: an ask the
 * OS will still honour, a trip to Settings when it will not, the OS picker under limited
 * access, or a retry when the read itself failed. Each button says what it does, so only the
 * two states a button cannot explain on its own carry a line of text.
 *
 * Nothing here is a dead end, and none of it is the only way forward, because the number field
 * below never stops working.
 */
function ContactsAccessFooter({
  access,
  loading,
  contactCount,
  canPickContact,
  onRequest,
  onPickContact,
  onOpenSettings,
}: {
  access: ReturnType<typeof useContacts>['access'];
  loading: boolean;
  contactCount: number;
  canPickContact: boolean;
  onRequest: () => void;
  onPickContact: () => void;
  onOpenSettings: () => void;
}) {
  if (access === 'unasked' || access === 'undetermined') {
    return (
      <Button
        label="Add from Contacts"
        variant="secondary"
        onPress={onRequest}
        loading={loading}
        style={styles.contactsButton}
      />
    );
  }

  if (access === 'denied') {
    return (
      <Button
        label="Turn on contacts"
        variant="secondary"
        onPress={onRequest}
        loading={loading}
        style={styles.contactsButton}
      />
    );
  }

  if (access === 'blocked') {
    return (
      <>
        <Text variant="metaSm" color={colors.textMuted} style={styles.emptyText}>
          {Platform.OS === 'ios'
            ? 'Contacts are off for Sukun. Turning them on in Settings restarts the app.'
            : 'Contacts are off for Sukun.'}
        </Text>
        <Button
          label="Open Settings"
          variant="secondary"
          onPress={onOpenSettings}
          style={styles.contactsButton}
        />
      </>
    );
  }

  if (access === 'unavailable') {
    return (
      <>
        <Text variant="metaSm" color={colors.textMuted} style={styles.emptyText}>
          {"We couldn't read your contacts."}
        </Text>
        <Button
          label="Try again"
          variant="secondary"
          onPress={onRequest}
          loading={loading}
          style={styles.contactsButton}
        />
      </>
    );
  }

  return (
    <>
      {contactCount === 0 ? (
        <Text variant="metaSm" color={colors.textMuted} style={styles.emptyText}>
          No mobile numbers in your contacts.
        </Text>
      ) : null}
      {/*
        Limited access only. The list above is the shared subset and cannot grow from in here,
        so this is the way to reach the rest: the OS's own picker, which shows the whole
        address book and passes back the one person tapped without granting anything.
      */}
      {canPickContact && access === 'limited' ? (
        <Button
          label="Choose from all contacts"
          variant="secondary"
          onPress={onPickContact}
          style={styles.contactsButton}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 24,
  },
  back: {
    marginBottom: 18,
  },
  heading: {
    marginTop: 6,
    marginBottom: 8,
  },
  blurb: {
    marginBottom: 20,
  },
  friends: {
    borderWidth: 1.5,
    borderColor: colors.borderDefault,
    backgroundColor: colors.bgSurface,
    borderRadius: 12,
    padding: 16,
    gap: 10,
    marginBottom: 20,
  },
  friendsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  friendsCount: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  listHeaderLabel: {
    fontSize: 12,
    letterSpacing: 12 * 0.08,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  listHeaderCount: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  attached: {
    gap: 6,
    marginBottom: 12,
  },
  emptyText: {
    paddingVertical: 8,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: colors.borderDefault,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: colors.bgSurface,
    marginBottom: 8,
  },
  searchField: {
    flex: 1,
    fontFamily: fontFamily.body,
    fontSize: 14,
    color: colors.textPrimary,
    padding: 0,
  },
  clearSearch: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
  },
  contactsButton: {
    marginTop: 12,
  },
  contactsNotice: {
    marginTop: 10,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    marginBottom: 6,
  },
  contactIdle: {
    borderColor: colors.borderDefault,
    backgroundColor: colors.bgSurface,
  },
  contactSelected: {
    borderColor: colors.black,
    backgroundColor: colors.creme,
  },
  contactInvalid: {
    borderColor: colors.rose700,
  },
  contactBody: {
    flex: 1,
  },
  contactName: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  contactPhone: {
    fontSize: 12,
    color: colors.textMuted,
  },
  continue: {
    marginTop: 24,
  },
  manualRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 20,
  },
  manualInput: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: colors.bgSurface,
  },
  manualField: {
    flex: 1,
    fontFamily: fontFamily.body,
    fontSize: 14,
    color: colors.textPrimary,
    padding: 0,
  },
  addButton: {
    justifyContent: 'center',
    backgroundColor: colors.black,
    borderRadius: 12,
    paddingHorizontal: 20,
  },
  addLabel: {
    color: colors.creme,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 12 * 0.08,
    textTransform: 'uppercase',
  },
  pressed: {
    opacity: 0.85,
  },
  error: {
    marginTop: 12,
  },
});
