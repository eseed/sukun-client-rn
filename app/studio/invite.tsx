import type { CountryCode } from 'libphonenumber-js/mobile';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, Share, StyleSheet, View } from 'react-native';
import type { ClassBookingInviteMode } from '../../src/api/studio-types';
import {
  BranchLine,
  RadioCard,
  SectionLabel,
  studioStyles,
} from '../../src/components/studio/StudioUi';
import { BackButton, Button, InlineError, PhoneField, Screen, Text } from '../../src/components/ui';
import { useClassSession, useCreateClassInvite } from '../../src/hooks/studio';
import { useContacts } from '../../src/hooks/useContacts';
import { track } from '../../src/lib/analytics';
import {
  countryOf,
  DEFAULT_COUNTRY,
  isValidPhone,
  nationalDigitsOf,
  phoneErrorMessage,
  toE164,
} from '../../src/lib/phone';
import {
  branchColor,
  classWhenShort,
  newIdempotencyKey,
  studioErrorMessage,
} from '../../src/lib/studio';
import { useAuthStore } from '../../src/stores/auth';
import { colors } from '../../src/theme/tokens';

/**
 * Design `invite-friend` (P4 · BKG-19): invite a friend to a class you're booked on.
 *
 * - "Yes, I've got them": the friend is booked now on one of your passes (`host_pays`).
 * - "No, just invite them": a spot is held for 2 hours, or until booking closes, for them to
 *   pay (`friend_pays`).
 *
 * Sukun sends no WhatsApp or SMS for this (rule sc-8-6): once the invitation exists, the phone's
 * own share sheet opens with its link, and the client sends it themselves. The link opens the
 * class in the app, or on the website. Rules sc-8-1 to sc-8-11: up to 5 per booking, not your own
 * number, not someone already booked or invited, the friend must fit the class's age range.
 */
export default function InviteFriendScreen() {
  const router = useRouter();
  const { bookingId, sessionId } = useLocalSearchParams<{ bookingId: string; sessionId: string }>();
  const session = useClassSession(sessionId).data;
  const hostName = useAuthStore((s) => s.user?.fullName ?? '');
  const create = useCreateClassInvite();
  const { pickContact, canPickContact } = useContacts();
  const [country, setCountry] = useState<CountryCode>(DEFAULT_COUNTRY);
  const [national, setNational] = useState('');
  const [friendName, setFriendName] = useState<string | undefined>(undefined);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ClassBookingInviteMode>('host_pays');
  const key = useRef(newIdempotencyKey());

  const packageName = session?.myBooking?.packageName;

  async function fromContacts() {
    setError(null);
    const result = await pickContact();
    if (result.status === 'cancelled') return;
    if (result.status !== 'picked') {
      setError(
        result.status === 'no-permission'
          ? 'Contacts access is off for Sukun. Type their number instead.'
          : result.status === 'no-number'
            ? `${result.name || 'That contact'} has no mobile number saved. Type it instead.`
            : "We couldn't open your contacts. Type their number instead.",
      );
      return;
    }
    const [first] = result.contact.numbers;
    if (first) {
      const picked = countryOf(first);
      if (picked) setCountry(picked);
      setNational(nationalDigitsOf(first));
      setFriendName(result.contact.name || undefined);
      setPhoneError(null);
    }
  }

  async function send() {
    setError(null);
    const phone = toE164(national, country);
    const problem = isValidPhone(phone, country) ? null : phoneErrorMessage(national, country);
    setPhoneError(problem);
    if (problem || !bookingId || !session) return;
    try {
      const invite = await create.mutateAsync({
        bookingId,
        input: { friendPhoneNumber: phone, friendName, mode, idempotencyKey: key.current },
      });
      track('studio_friend_invited', { mode });
      key.current = newIdempotencyKey();
      if (invite.shareUrl) {
        const host = hostName.split(' ')[0];
        await Share.share({
          message: `${host ? `${host} invited you` : "You're invited"} to ${session.title}, ${classWhenShort(
            session.startsAt,
          )} at ${session.branch.name}. ${
            mode === 'host_pays' ? "You're booked." : 'Your spot is held for 2 hours.'
          } ${invite.shareUrl}`,
        }).catch(() => undefined);
      }
      router.back();
    } catch (err) {
      setError(studioErrorMessage(err));
    }
  }

  return (
    <Screen scroll contentStyle={styles.content}>
      <BackButton onPress={() => router.back()} />
      <Text style={[studioStyles.title, styles.title]}>
        Invite a friend{session ? ` to ${session.title}` : ''}
      </Text>
      {session ? (
        <>
          <Text style={[studioStyles.muted, styles.sub]}>{classWhenShort(session.startsAt)}</Text>
          <BranchLine
            text={[session.room?.name, session.branch.name].filter(Boolean).join(' · ')}
            color={branchColor(session.branch.colorHex)}
          />
        </>
      ) : null}

      <View style={styles.field}>
        <PhoneField
          label="Their WhatsApp number"
          country={country}
          onCountryChange={(next) => {
            setCountry(next);
            setPhoneError(null);
          }}
          national={national}
          onNationalChange={(value) => {
            setNational(value);
            setFriendName(undefined);
            setPhoneError(null);
          }}
          error={phoneError}
        />
        {canPickContact ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => void fromContacts()}
            hitSlop={10}
            style={styles.contacts}
          >
            <Text style={styles.contactsLabel}>Choose from contacts</Text>
          </Pressable>
        ) : null}
      </View>

      <SectionLabel label="Use one of your passes?" />
      <RadioCard
        selected={mode === 'host_pays'}
        onPress={() => setMode('host_pays')}
        title="Yes, I've got them"
        sub={`Uses 1 pass${packageName ? ` from ${packageName}` : ''}. They're booked right away.`}
      />
      <RadioCard
        selected={mode === 'friend_pays'}
        onPress={() => setMode('friend_pays')}
        title="No, just invite them"
        sub="They'll pay. We hold a spot for 2 hours."
      />
      <Text style={[studioStyles.muted, styles.hint]}>
        You send the invitation yourself: we&apos;ll open your phone&apos;s share options with the
        link.
      </Text>

      {error ? <InlineError message={error} /> : null}
      <Button
        label="Send invitation"
        loading={create.isPending}
        disabled={!national}
        onPress={() => void send()}
        style={styles.cta}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20 },
  title: { marginTop: 14 },
  sub: { marginTop: 6 },
  field: { marginTop: 18 },
  contacts: { marginTop: 8, alignSelf: 'flex-start' },
  contactsLabel: { color: colors.sky500, fontSize: 13, textDecorationLine: 'underline' },
  hint: { marginTop: 6 },
  cta: { marginTop: 18 },
});
