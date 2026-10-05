import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import type { Ticket } from '../../api/types';
import { useRemovePlusOne } from '../../hooks/queries';
import { track } from '../../lib/analytics';
import { messageForError } from '../../lib/errors';
import { formatPhoneLocal } from '../../lib/phone';
import { colors, fontFamily } from '../../theme/tokens';
import { Button, InlineError, Text } from '../ui';

/**
 * The plus one on a claimed ticket whose invitation includes one, drawn on the dark entry pass.
 *
 * Their answer shows once they give it, the way an RSVP does. Straight after the guest names
 * them it reads "invited" whoever the number belongs to (CLAUDE.md rule 4).
 */
export function PlusOnePanel({ ticket }: { ticket: Ticket }) {
  const router = useRouter();
  const removePlusOne = useRemovePlusOne();
  const [error, setError] = useState<string | null>(null);

  const guest = ticket.plusOne?.guest ?? null;
  const firstName = guest?.name.trim().split(/\s+/)[0] ?? '';

  function invite() {
    router.push(`/ticket/plus-one?id=${ticket.id}`);
  }

  function confirmRemove() {
    Alert.alert(
      `Remove ${firstName}?`,
      'Their invitation will be cancelled, and you can invite someone else.',
      [
        { text: 'Keep them', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => void remove() },
      ],
    );
  }

  async function remove() {
    setError(null);
    try {
      await removePlusOne.mutateAsync(ticket.id);
      track('plus_one_removed', { ticket_id: ticket.id });
    } catch (err) {
      setError(messageForError(err));
    }
  }

  return (
    <View style={styles.panel}>
      <Text style={styles.label}>Plus one</Text>

      {!guest ? (
        <>
          <Text style={styles.title}>Bring someone with you</Text>
          <Text style={styles.copy}>
            Your invitation includes a plus one. Add their name and number and we&apos;ll send them
            an invitation of their own.
          </Text>
          <Button label="Invite your plus one" variant="accent" onPress={invite} />
        </>
      ) : (
        <>
          <Text style={styles.title}>
            {guest.status === 'claimed'
              ? `${guest.name} is coming`
              : guest.status === 'declined'
                ? `${guest.name} can't make it`
                : `${guest.name} is invited`}
          </Text>
          <Text style={styles.copy}>
            {formatPhoneLocal(guest.phoneE164)}
            {guest.status === 'waiting' ? '. Waiting for them to claim their ticket.' : ''}
          </Text>
          {error ? <InlineError message={error} style={styles.error} /> : null}
          {guest.status === 'waiting' ? (
            <Button
              label={`Remove ${firstName}`}
              variant="secondary"
              onPress={confirmRemove}
              loading={removePlusOne.isPending}
            />
          ) : null}
          {guest.status === 'declined' ? (
            <Button label="Invite someone else" variant="accent" onPress={invite} />
          ) : null}
        </>
      )}
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
  },
  copy: {
    color: colors.textMuted,
    fontFamily: fontFamily.body,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  error: {
    marginBottom: 4,
  },
});
