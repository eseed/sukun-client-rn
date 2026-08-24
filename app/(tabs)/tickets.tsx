import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import type { TicketStatus } from '../../src/api/types';
import { StyleSheet, View } from 'react-native';
import { BulletHeading, ResourceState, Screen } from '../../src/components/ui';
import { TicketCard } from '../../src/components/tickets/TicketCard';
import { useTickets } from '../../src/hooks/queries';

/**
 * Design screen 13 · My tickets.
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
    const byKey = new Map<string, { lead: (typeof tickets)[number]; count: number }>();
    for (const ticket of tickets) {
      const key = `${ticket.orderNumber ?? ticket.id}:${ticket.tier.id}`;
      const existing = byKey.get(key);
      if (existing) {
        existing.count += 1;
        // Prefer a usable ticket as the card's lead, so tapping opens a real entry pass.
        if (existing.lead.usageStatus !== 'usable' && ticket.usageStatus === 'usable') {
          existing.lead = ticket;
        }
      } else {
        byKey.set(key, { lead: ticket, count: 1 });
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
          {groups.map(({ lead, count }) => (
            <TicketCard
              key={lead.id}
              ticket={lead}
              ticketCount={count}
              onPress={() => router.push(`/ticket/${lead.id}`)}
            />
          ))}
        </View>
      </ResourceState>
    </Screen>
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
