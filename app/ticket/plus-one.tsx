import type { CountryCode } from 'libphonenumber-js/mobile';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  BackButton,
  BulletHeading,
  Button,
  InlineError,
  PhoneField,
  Screen,
  StepLabel,
  Text,
  TextField,
} from '../../src/components/ui';
import { useInvitePlusOne, useTicket } from '../../src/hooks/queries';
import { useContacts } from '../../src/hooks/useContacts';
import { track } from '../../src/lib/analytics';
import { messageForError } from '../../src/lib/errors';
import {
  countryOf,
  DEFAULT_COUNTRY,
  isValidPhone,
  nationalDigitsOf,
  phoneErrorMessage,
  toE164,
} from '../../src/lib/phone';
import { colors } from '../../src/theme/tokens';

/**
 * Names the person a guest is bringing. Reached from the plus one panel on a claimed ticket
 * whose invitation includes one.
 *
 * The plus one is sent an invitation of their own, which they claim or decline like any other.
 * What happens next reads the same whoever the number belongs to (CLAUDE.md rule 4): the backend
 * reaches a number with no account over WhatsApp (rule 6), and one with an account sees it in
 * the app, and neither is said here.
 *
 * The address book is the OS picker, for one person, and nothing more (see `useContacts`).
 */
export default function InvitePlusOneScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const ticketId = typeof id === 'string' && /^[A-Za-z0-9_-]+$/.test(id) ? id : undefined;
  const ticketQuery = useTicket(ticketId);
  const invite = useInvitePlusOne();
  const { pickContact, canPickContact } = useContacts();

  const [name, setName] = useState('');
  const [country, setCountry] = useState<CountryCode>(DEFAULT_COUNTRY);
  const [national, setNational] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function close() {
    if (router.canGoBack()) router.back();
    else if (ticketId) router.replace(`/ticket/${ticketId}`);
    else router.replace('/(tabs)/tickets');
  }

  async function fromContacts() {
    setError(null);
    const result = await pickContact();
    if (result.status === 'cancelled') return;
    if (result.status === 'failed') {
      setError("We couldn't open your contacts. Try again, or type their number.");
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
    if (result.contact.name) setName(result.contact.name);
    if (first) {
      const picked = countryOf(first);
      if (picked) setCountry(picked);
      setNational(nationalDigitsOf(first));
      setPhoneError(null);
    }
  }

  async function onSend() {
    setError(null);
    const trimmed = name.trim();
    const phoneE164 = toE164(national, country);
    const nameProblem = trimmed.length === 0 ? 'Add their name.' : null;
    const phoneProblem = isValidPhone(phoneE164, country)
      ? null
      : phoneErrorMessage(national, country);
    setNameError(nameProblem);
    setPhoneError(phoneProblem);
    if (nameProblem || phoneProblem || !ticketId) return;

    try {
      await invite.mutateAsync({ ticketId, plusOne: { name: trimmed, phoneNumber: phoneE164 } });
      track('plus_one_invited', { ticket_id: ticketId });
      close();
    } catch (err) {
      setError(messageForError(err));
    }
  }

  const eventTitle = ticketQuery.data?.event.title;

  return (
    <Screen scroll contentStyle={styles.content}>
      <BackButton onPress={close} style={styles.back} />

      <StepLabel>{eventTitle ?? 'Your invitation'}</StepLabel>
      <View style={styles.heading}>
        <BulletHeading title="Invite your plus one" size="lg" />
      </View>
      <Text variant="bodyMuted" style={styles.blurb}>
        They get an invitation of their own to claim, for the same ticket as yours. Your add-ons
        stay with your ticket, and they can&apos;t bring anyone else.
      </Text>

      <View style={styles.fields}>
        <TextField
          label="Their name"
          value={name}
          onChangeText={(value) => {
            setName(value);
            if (nameError) setNameError(null);
          }}
          placeholder="Full name"
          autoCapitalize="words"
          textContentType="name"
          error={nameError}
        />
        <PhoneField
          label="Their mobile number"
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
      </View>

      <View style={styles.footer}>
        {error ? <InlineError message={error} /> : null}
        <Button label="Send invitation" onPress={() => void onSend()} loading={invite.isPending} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },
  back: {
    marginBottom: 10,
  },
  heading: {
    marginTop: 8,
    marginBottom: 10,
  },
  blurb: {
    marginBottom: 24,
  },
  fields: {
    gap: 16,
  },
  contacts: {
    alignSelf: 'flex-start',
  },
  contactsLabel: {
    textDecorationLine: 'underline',
  },
  footer: {
    marginTop: 'auto',
    paddingTop: 24,
    gap: 12,
  },
});
