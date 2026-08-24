import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import {
  Avatar,
  avatarColor,
  BackButton,
  BulletHeading,
  Button,
  CheckCircle,
  CountryPrefix,
  CountrySheet,
  Screen,
  StepLabel,
  Text,
} from '../../src/components/ui';
import { useContacts, type PhoneContact } from '../../src/hooks/useContacts';
import { useValidateGuests } from '../../src/hooks/queries';
import { track } from '../../src/lib/analytics';
import { messageForCode, messageForError } from '../../src/lib/errors';
import {
  DEFAULT_COUNTRY,
  formatNationalInput,
  formatPhoneLocal,
  normalizePhone,
  sanitizeNationalInput,
  toE164,
} from '../../src/lib/phone';
import type { CountryCode } from 'libphonenumber-js/mobile';
import { guestSlots, useCheckoutStore } from '../../src/stores/checkout';
import { colors, fontFamily } from '../../src/theme/tokens';
import { useCheckoutAccess } from '../../src/hooks/useCheckoutAccess';

/**
 * Design screen 09 · Checkout, guests.
 *
 * Guests are attached by phone number. A ticket may exist before its owner does — it binds
 * when that number registers (CLAUDE.md rule 2). Nothing on this screen reveals whether a
 * number already has an account: every contact row looks and behaves the same (rule 4).
 */
export default function GuestsScreen() {
  const router = useRouter();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const validEventId =
    typeof eventId === 'string' && /^[A-Za-z0-9_-]+$/.test(eventId) ? eventId : undefined;
  const access = useCheckoutAccess();

  const quantity = useCheckoutStore((s) => s.quantity);
  const guests = useCheckoutStore((s) => s.guests);
  const toggleGuest = useCheckoutStore((s) => s.toggleGuest);
  const addGuest = useCheckoutStore((s) => s.addGuest);

  const { contacts, permission, loading: contactsLoading, load: loadContacts } = useContacts();
  const validateGuests = useValidateGuests();

  const [manual, setManual] = useState('');
  const [manualCountry, setManualCountry] = useState<CountryCode>(DEFAULT_COUNTRY);
  const [countrySheetOpen, setCountrySheetOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slots = guestSlots(quantity);
  const picked = guests.length;
  const full = picked >= slots;

  const selectedNumbers = useMemo(() => new Set(guests.map((g) => g.phoneNumber)), [guests]);

  /** Contacts, plus any manually-added number so it appears in the same list. */
  const rows: PhoneContact[] = useMemo(() => {
    const manualOnes = guests
      .filter((g) => !g.fromContacts)
      .map((g) => ({ id: g.phoneNumber, name: g.name, phoneNumber: g.phoneNumber }));
    const contactNumbers = new Set(contacts.map((c) => c.phoneNumber));
    return [...manualOnes.filter((m) => !contactNumbers.has(m.phoneNumber)), ...contacts];
  }, [contacts, guests]);

  function onAddManual() {
    setError(null);
    const e164 = normalizePhone(toE164(manual, manualCountry), manualCountry);
    if (!e164) {
      setError(messageForCode('GUEST_PHONE_INVALID'));
      return;
    }
    if (selectedNumbers.has(e164)) {
      setError(messageForCode('GUEST_DUPLICATE'));
      return;
    }
    if (full) {
      setError(`You have ${slots} guest ${slots === 1 ? 'slot' : 'slots'} on this order.`);
      return;
    }
    addGuest({ phoneNumber: e164, name: formatPhoneLocal(e164), fromContacts: false });
    setManual('');
  }

  async function onContinue() {
    setError(null);
    if (!validEventId) {
      setError('This checkout link is incomplete. Go back and choose an event again.');
      return;
    }

    if (guests.length > 0) {
      try {
        const result = await validateGuests.mutateAsync({
          eventId: validEventId,
          guests: guests.map((g) => ({ phoneNumber: g.phoneNumber })),
        });
        if (!result.valid) {
          setError(messageForCode(result.issues[0]?.error));
          return;
        }
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
    <Screen contentStyle={styles.content}>
      <BackButton onPress={() => router.back()} style={styles.back} />

      <StepLabel>Checkout · step 2 of 3</StepLabel>
      <View style={styles.heading}>
        <BulletHeading title="Bringing anyone?" size="md" />
      </View>

      <Text variant="bodyMuted" style={styles.blurb}>
        {slots === 0
          ? 'You bought 1 ticket, so there is no guest to add. Continue to review.'
          : `You bought ${quantity} tickets. Attach ${slots} ${
              slots === 1 ? 'guest' : 'guests'
            } from your contacts.`}
      </Text>

      {slots > 0 ? (
        <>
          <View style={styles.listHeader}>
            <Text style={styles.listHeaderLabel}>Guests</Text>
            <Text style={styles.listHeaderCount}>
              {picked} of {slots} picked
            </Text>
          </View>

          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {rows.map((contact) => {
              const selected = selectedNumbers.has(contact.phoneNumber);
              return (
                <Pressable
                  key={contact.id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  onPress={() =>
                    toggleGuest({
                      phoneNumber: contact.phoneNumber,
                      name: contact.name,
                      fromContacts: true,
                    })
                  }
                  disabled={!selected && full}
                  style={[
                    styles.contactRow,
                    selected ? styles.contactSelected : styles.contactIdle,
                    !selected && full && styles.contactDisabled,
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
                  </View>
                  <CheckCircle selected={selected} />
                </Pressable>
              );
            })}
          </ScrollView>

          {rows.length === 0 ? (
            <View style={styles.emptyList}>
              <Text variant="metaSm" color={colors.textMuted} style={styles.emptyText}>
                {permission === null
                  ? 'Add a guest from your contacts, or enter their number below.'
                  : 'No Egyptian mobile numbers in your contacts. Enter one below.'}
              </Text>
            </View>
          ) : null}

          <View style={styles.spacer} />

          {permission === 'denied' ? (
            // iOS will not re-prompt once access is refused, so the only route left is Settings.
            <Button
              label="Allow contacts in settings"
              variant="secondary"
              onPress={() => void Linking.openSettings()}
              style={styles.contactsButton}
            />
          ) : (
            <Button
              label="Add from Contacts"
              variant="secondary"
              onPress={loadContacts}
              loading={contactsLoading}
              disabled={full}
              style={styles.contactsButton}
            />
          )}

          {permission === 'error' ? (
            <Text variant="metaSm" color={colors.textMuted} style={styles.contactsNotice}>
              {"We couldn't read your contacts. Try again, or enter the number below."}
            </Text>
          ) : null}

          <Text style={styles.manualLabel}>Not in your contacts?</Text>
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
                placeholder="Enter phone number"
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

      {error ? (
        <Text variant="metaSm" color={colors.rose700} style={styles.error}>
          {error}
        </Text>
      ) : null}

      {slots === 0 ? <View style={styles.spacer} /> : null}

      <Button
        label="Continue"
        onPress={onContinue}
        loading={validateGuests.isPending}
        style={styles.continue}
      />
    </Screen>
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
  list: {
    flexGrow: 0,
    maxHeight: 260,
  },
  listContent: {
    gap: 6,
  },
  emptyList: {
    paddingVertical: 18,
  },
  emptyText: {
    textAlign: 'center',
  },
  contactsButton: {
    marginBottom: 18,
  },
  contactsNotice: {
    marginTop: -8,
    marginBottom: 14,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  contactIdle: {
    borderColor: colors.borderDefault,
    backgroundColor: colors.bgSurface,
  },
  contactSelected: {
    borderColor: colors.black,
    backgroundColor: colors.creme,
  },
  contactDisabled: {
    opacity: 0.45,
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
  manualLabel: {
    fontSize: 12,
    letterSpacing: 12 * 0.08,
    textTransform: 'uppercase',
    color: colors.textMuted,
    marginBottom: 8,
  },
  continue: {
    marginTop: 16,
  },
  manualRow: {
    flexDirection: 'row',
    gap: 8,
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
  spacer: {
    flex: 1,
    minHeight: 16,
  },
});
