import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import type { Ticket } from '../src/api/types';
import { FlowerCorner } from '../src/components/checkout/FlowerCorner';
import { Button, Card, InlineError, ResourceState, Screen, Text } from '../src/components/ui';
import { useClaimTicket, useDeclineTicket } from '../src/hooks/queries';
import { useClaimableTickets } from '../src/hooks/useClaimableTickets';
import { track } from '../src/lib/analytics';
import { codeForError, messageForError } from '../src/lib/errors';
import { formatDateRange } from '../src/lib/format';
import { ONBOARDING_RESUME_ROUTE, readyToClaim, useAuthStore } from '../src/stores/auth';
import { useClaimPromptStore } from '../src/stores/claimPrompt';
import { colors, fontFamily, space } from '../src/theme/tokens';

/**
 * A ticket Sukun granted, waiting for its holder to claim or decline it.
 *
 * `ClaimGate` (in the tabs layout) opens this before anything else once a signed-in holder has
 * one. Claiming is what makes a granted ticket theirs: sign-in binds a ticket a friend bought
 * for the number but never one Sukun granted, which is how the admin sees how many of the
 * tickets it gave out were taken.
 *
 * Each ticket is answered on its own, because the answers differ:
 * - Claiming takes a seat, so it is offered only while the event could sell one. A sold-out or
 *   off-sale ticket says so on its button (never a faded "Claim").
 * - Claiming needs a complete profile, and cannot skip it: the holder is sent to finish it and
 *   the claim is made when they are back (`readyToClaim`).
 * - "I can't make it" declines, the RSVP no, and is always open.
 *
 * "Not now" is always offered. The screen comes back the next time the app is opened, and the
 * Tickets tab pulses until every invitation is answered.
 */
export default function ClaimScreen() {
  const router = useRouter();
  const { tickets, query } = useClaimableTickets();
  const markShown = useClaimPromptStore((s) => s.markShown);
  const setOpen = useClaimPromptStore((s) => s.setOpen);

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

  function onClaimed(claimed: Ticket) {
    // The last one answered: open it, since that is where the holder's ticket now lives.
    if (tickets.length <= 1) router.replace(`/ticket/${claimed.id}`);
  }

  function onDeclined() {
    if (tickets.length <= 1) router.replace('/(tabs)/tickets');
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
  const onlyInvitedBy = one ? tickets[0]?.invitedBy : null;

  return (
    <Screen scroll contentStyle={styles.content}>
      <FlowerCorner />
      <View style={styles.body}>
        <Text variant="eyebrow">{onlyInvitedBy ? 'Plus one' : 'From Sukun'}</Text>
        <Text variant="titleLg">
          {one ? 'You have a ticket to claim' : `You have ${count} tickets to claim`}
        </Text>
        <Text variant="bodyMuted">
          {onlyInvitedBy
            ? `${onlyInvitedBy.name} invited you as their plus one. Claim your ticket to add it to your tickets, or let them know you can't make it.`
            : one
              ? "Sukun has invited you. Claim your ticket to add it to your tickets, or let us know you can't make it."
              : "Sukun has invited you. Claim each ticket to add it to your tickets, or let us know you can't make it."}
        </Text>

        <View style={styles.tickets}>
          {tickets.map((ticket) => (
            <GrantedTicket
              key={ticket.id}
              ticket={ticket}
              onClaimed={onClaimed}
              onDeclined={onDeclined}
              onChanged={() => void query.refetch()}
            />
          ))}
        </View>
      </View>

      <View style={styles.footer}>
        <Button label="Not now" variant="secondary" onPress={onNotNow} />
      </View>
    </Screen>
  );
}

function GrantedTicket({
  ticket,
  onClaimed,
  onDeclined,
  onChanged,
}: {
  ticket: Ticket;
  onClaimed: (ticket: Ticket) => void;
  onDeclined: () => void;
  onChanged: () => void;
}) {
  const router = useRouter();
  const claimTicket = useClaimTicket();
  const declineTicket = useDeclineTicket();
  const [error, setError] = useState<string | null>(null);

  const first = ticket.days[0]?.date;
  const last = ticket.days[ticket.days.length - 1]?.date ?? first;
  const dates = first && last ? formatDateRange(first, last) : null;
  const details = [dates, ticket.event.venueName].filter(Boolean).join(' · ');
  const soldOut = ticket.claimAvailability === 'sold_out';
  const notOnSale = ticket.claimAvailability === 'not_on_sale';
  const busy = claimTicket.isPending || declineTicket.isPending;

  async function onClaim() {
    setError(null);
    if (!readyToClaim(router, ticket.id)) return;
    try {
      const claimed = await claimTicket.mutateAsync(ticket.id);
      track('ticket_claimed', {
        ticket_id: ticket.id,
        event_id: ticket.event.id,
        source: ticket.source,
      });
      onClaimed(claimed);
    } catch (err) {
      if (codeForError(err) === 'PROFILE_INCOMPLETE') {
        useAuthStore.getState().setPendingClaimTicketId(ticket.id);
        router.push(ONBOARDING_RESUME_ROUTE);
        return;
      }
      // Revoked, sold out or off sale since the list was fetched: the list says which.
      setError(messageForError(err));
      onChanged();
    }
  }

  function confirmDecline() {
    Alert.alert(
      "Can't make it?",
      "We'll let Sukun know and cancel this invitation. This can't be undone.",
      [
        { text: 'Keep my invitation', style: 'cancel' },
        { text: "I can't make it", style: 'destructive', onPress: () => void onDecline() },
      ],
    );
  }

  async function onDecline() {
    setError(null);
    try {
      await declineTicket.mutateAsync(ticket.id);
      track('ticket_declined', { ticket_id: ticket.id, event_id: ticket.event.id });
      onDeclined();
    } catch (err) {
      setError(messageForError(err));
      onChanged();
    }
  }

  return (
    <Card elevated style={styles.card}>
      <Text style={styles.event}>{ticket.event.title}</Text>
      <Text style={styles.tier}>{ticket.tier.name}</Text>
      {details ? <Text variant="meta">{details}</Text> : null}
      {ticket.invitedBy ? <Text variant="meta">Plus one of {ticket.invitedBy.name}</Text> : null}
      {ticket.addonCount > 0 ? (
        <Text variant="meta">
          Includes {ticket.addonCount} {ticket.addonCount === 1 ? 'add-on' : 'add-ons'}
        </Text>
      ) : null}
      {soldOut || notOnSale ? (
        <Text variant="meta" color={colors.rose700}>
          {soldOut
            ? 'This event is sold out, so this ticket can no longer be claimed.'
            : 'You can claim this ticket once tickets for this event are on sale.'}
        </Text>
      ) : null}

      <View style={styles.actions}>
        {error ? <InlineError message={error} /> : null}
        <Button
          label={soldOut ? 'Sold out' : notOnSale ? 'Not on sale yet' : 'Claim ticket'}
          variant="accent"
          loading={claimTicket.isPending}
          disabled={soldOut || notOnSale || declineTicket.isPending}
          onPress={() => void onClaim()}
        />
        <Button
          label="I can't make it"
          variant="secondary"
          loading={declineTicket.isPending}
          disabled={busy}
          onPress={confirmDecline}
        />
      </View>
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
  actions: {
    marginTop: space.s3,
    gap: space.s3,
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
