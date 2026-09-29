import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Ticket } from '../src/api/types';
import { FlowerCorner } from '../src/components/checkout/FlowerCorner';
import { Button, Card, InlineError, ResourceState, Screen, Text } from '../src/components/ui';
import { useClaimTicket } from '../src/hooks/queries';
import { useClaimableTickets } from '../src/hooks/useClaimableTickets';
import { track } from '../src/lib/analytics';
import { messageForError } from '../src/lib/errors';
import { formatDateRange } from '../src/lib/format';
import { useClaimPromptStore } from '../src/stores/claimPrompt';
import { colors, fontFamily, space } from '../src/theme/tokens';

/**
 * A ticket Sukun granted, waiting for its holder to claim it.
 *
 * `ClaimGate` (in the tabs layout) opens this before anything else once a signed-in holder has
 * one. Claiming is what makes a granted ticket theirs: sign-in binds a ticket a friend bought
 * for the number but never one Sukun granted, which is how the admin sees how many of the
 * tickets it gave out were taken. Every waiting ticket is claimed in one go, since each of them
 * is already the caller's by phone.
 *
 * "Not now" is always offered. The screen comes back the next time the app is opened, and the
 * ticket can also be claimed from its entry pass in My tickets.
 */
export default function ClaimScreen() {
  const router = useRouter();
  const { tickets, query } = useClaimableTickets();
  const claimTicket = useClaimTicket();
  const markShown = useClaimPromptStore((s) => s.markShown);
  const setOpen = useClaimPromptStore((s) => s.setOpen);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setOpen(true);
    return () => setOpen(false);
  }, [setOpen]);

  useEffect(() => {
    if (tickets.length > 0) markShown(tickets.map((ticket) => ticket.id));
  }, [markShown, tickets]);

  function close() {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/discover');
  }

  function onNotNow() {
    track('ticket_claim_deferred', { ticket_count: tickets.length });
    close();
  }

  async function onClaim() {
    setError(null);
    setClaiming(true);
    const claimed: Ticket[] = [];
    try {
      for (const ticket of tickets) {
        claimed.push(await claimTicket.mutateAsync(ticket.id));
        track('ticket_claimed', {
          ticket_id: ticket.id,
          event_id: ticket.event.id,
          source: ticket.source,
        });
      }
    } catch (err) {
      // A ticket revoked since the list was fetched drops out of it; the rest stay to claim.
      setError(messageForError(err));
      setClaiming(false);
      void query.refetch();
      return;
    }

    setClaiming(false);
    const [only] = claimed;
    if (claimed.length === 1 && only) router.replace(`/ticket/${only.id}`);
    else router.replace('/(tabs)/tickets');
  }

  if (query.isPending) {
    return (
      <Screen contentStyle={styles.stateScreen}>
        <ResourceState status="loading" loadingLabel="Loading your tickets..." />
      </Screen>
    );
  }

  if (query.isError || tickets.length === 0) {
    return (
      <Screen contentStyle={styles.stateScreen}>
        <ResourceState
          status={query.isError ? 'error' : 'empty'}
          errorMessage={messageForError(query.error)}
          onRetry={() => void query.refetch()}
          emptyTitle="No tickets to claim"
          emptyMessage="Your tickets are in My tickets."
        />
        <Button label="Done" variant="secondary" onPress={close} style={styles.stateAction} />
      </Screen>
    );
  }

  const count = tickets.length;
  const one = count === 1;

  return (
    <Screen scroll contentStyle={styles.content}>
      <FlowerCorner />
      <View style={styles.body}>
        <Text variant="eyebrow">From Sukun</Text>
        <Text variant="titleLg">
          {one ? 'You have a ticket to claim' : `You have ${count} tickets to claim`}
        </Text>
        <Text variant="bodyMuted">
          {one
            ? 'Sukun has given you a ticket. Claim it to add it to your tickets.'
            : 'Sukun has given you these tickets. Claim them to add them to your tickets.'}
        </Text>

        <View style={styles.tickets}>
          {tickets.map((ticket) => (
            <GrantedTicket key={ticket.id} ticket={ticket} />
          ))}
        </View>
      </View>

      <View style={styles.footer}>
        {error ? <InlineError message={error} /> : null}
        <Button
          label={one ? 'Claim ticket' : `Claim ${count} tickets`}
          variant="accent"
          loading={claiming}
          onPress={() => void onClaim()}
        />
        <Button label="Not now" variant="secondary" disabled={claiming} onPress={onNotNow} />
      </View>
    </Screen>
  );
}

function GrantedTicket({ ticket }: { ticket: Ticket }) {
  const first = ticket.days[0]?.date;
  const last = ticket.days[ticket.days.length - 1]?.date ?? first;
  const dates = first && last ? formatDateRange(first, last) : null;
  const details = [dates, ticket.event.venueName].filter(Boolean).join(' · ');

  return (
    <Card elevated style={styles.card}>
      <Text style={styles.event}>{ticket.event.title}</Text>
      <Text style={styles.tier}>{ticket.tier.name}</Text>
      {details ? <Text variant="meta">{details}</Text> : null}
      {ticket.addonCount > 0 ? (
        <Text variant="meta">
          Includes {ticket.addonCount} {ticket.addonCount === 1 ? 'add-on' : 'add-ons'}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  /* `flexGrow`, not `flex`: this is a scroll container's content (see AnalyticsConsentScreen). */
  content: {
    flexGrow: 1,
    justifyContent: 'space-between',
  },
  body: {
    marginTop: space.s8,
    gap: space.s3,
  },
  tickets: {
    marginTop: space.s3,
    gap: space.s3,
  },
  card: {
    gap: space.s1,
  },
  event: {
    fontSize: 11,
    letterSpacing: 11 * 0.12,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  tier: {
    fontSize: 19,
    fontFamily: fontFamily.bodyMedium,
    color: colors.textPrimary,
  },
  footer: {
    gap: space.s4,
    paddingTop: space.s5,
    paddingBottom: space.s2,
  },
  stateScreen: {
    flex: 1,
    justifyContent: 'center',
  },
  stateAction: {
    marginTop: space.s5,
  },
});
