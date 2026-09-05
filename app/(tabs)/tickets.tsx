import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import type { Ticket, TicketStatus } from '../../src/api/types';
import { StyleSheet, View } from 'react-native';
import { BulletHeading, ResourceState, Screen } from '../../src/components/ui';
import { TicketCard } from '../../src/components/tickets/TicketCard';
import { useAddons, useTickets } from '../../src/hooks/queries';

/**
 * Design screen 20 · My tickets.
 *
 * Tickets are grouped by order + tier so a two-ticket purchase reads as one card, the way
 * the design shows it.
 */
export default function TicketsScreen() {
  const router = useRouter();
  const statuses: TicketStatus[] = ['active', 'pending_claim', 'voided', 'refunded'];
  const ticketsQuery = useTickets(statuses);
  // `isLoading`, not `isPending`: the query is disabled while signed out, and a disabled query
  // stays `isPending` forever — which would render the spinner with nothing ever fetching.
  const { data, isLoading, isError, refetch } = ticketsQuery;

  const groups = useMemo(() => {
    const tickets = data?.data ?? [];
    const byKey = new Map<
      string,
      { lead: (typeof tickets)[number]; count: number; addonCount: number }
    >();
    for (const ticket of tickets) {
      const key = `${ticket.orderNumber ?? ticket.id}:${ticket.tier.id}`;
      const existing = byKey.get(key);
      if (existing) {
        existing.count += 1;
        // The card stands for several tickets, so it reports the extras across all of them.
        existing.addonCount += ticket.addonCount;
        // Prefer a usable ticket as the card's lead, so tapping opens a real entry pass.
        if (existing.lead.usageStatus !== 'usable' && ticket.usageStatus === 'usable') {
          existing.lead = ticket;
        }
      } else {
        byKey.set(key, { lead: ticket, count: 1, addonCount: ticket.addonCount });
      }
    }
    return [...byKey.values()];
  }, [data]);

  return (
    <Screen scroll edges={{ bottom: false }} contentStyle={styles.content}>
      <View style={styles.heading}>
        <BulletHeading title="My tickets" size="md" />
      </View>

      <ResourceState
        status={
          isLoading ? 'loading' : isError ? 'error' : groups.length === 0 ? 'empty' : 'success'
        }
        loadingLabel="Loading your tickets..."
        emptyTitle="No tickets yet"
        emptyMessage="When you buy one or a friend sends you one, it shows up here."
        errorMessage="We couldn't load your tickets."
        onRetry={() => void refetch()}
      >
        <View style={styles.list}>
          {groups.map(({ lead, count, addonCount }) => (
            <TicketGroupCard
              key={lead.id}
              lead={lead}
              ticketCount={count}
              addonCount={addonCount}
              onPress={() => router.push(`/ticket/${lead.id}`)}
              onAddExtras={() => router.push(`/ticket/${lead.id}/extras` as never)}
            />
          ))}
        </View>
      </ResourceState>
    </Screen>
  );
}

/**
 * One card, plus the one thing the ticket DTO cannot tell us: whether this event sells extras
 * at all.
 *
 * Extras have exactly one off state, and it is silent (decision 11): a build with the flag off,
 * and an event with an empty catalogue, both answer with no extras, and neither may leave an
 * entry point behind for the holder to tap into a dead end. `addonCount` is no substitute — it
 * counts what is already attached, not what is on offer, so an event that sells extras the
 * holder has not bought would lose its row.
 *
 * The catalogue endpoint is public and cached by event, so several cards for the same event
 * share one request.
 */
function TicketGroupCard({
  lead,
  ticketCount,
  addonCount,
  onPress,
  onAddExtras,
}: {
  lead: Ticket;
  ticketCount: number;
  addonCount: number;
  onPress: () => void;
  onAddExtras: () => void;
}) {
  const catalogue = useAddons(lead.event.id);
  // Nothing yet, an empty catalogue and a flag-off 404 all read the same way: no entry point.
  const sellsExtras = (catalogue.data?.length ?? 0) > 0;

  return (
    <TicketCard
      ticket={lead}
      ticketCount={ticketCount}
      addonCount={addonCount}
      onPress={onPress}
      onAddExtras={sellsExtras ? onAddExtras : undefined}
    />
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  heading: {
    marginBottom: 20,
  },
  list: {
    gap: 16,
  },
  loading: {
    marginTop: 40,
  },
  empty: {
    marginTop: 8,
  },
});
