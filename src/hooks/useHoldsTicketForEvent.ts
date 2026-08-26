import { useMemo } from 'react';
import { useTickets } from './queries';

/**
 * Whether the signed-in user already holds a ticket for this event.
 *
 * It decides who the tickets in a new order are for: a ticket you already hold means the next
 * order is entirely for other people, because the backend allows one usable ticket per phone
 * per event. `pending_claim` counts - it is a ticket someone bought for this number that has
 * not bound to the account yet, and it occupies the same slot.
 */
export function useHoldsTicketForEvent(eventId: string | null): {
  holdsTicket: boolean;
  isPending: boolean;
} {
  const ticketsQuery = useTickets(['active', 'pending_claim']);

  const holdsTicket = useMemo(() => {
    if (!eventId) return false;
    return (ticketsQuery.data?.data ?? []).some((ticket) => ticket.event.id === eventId);
  }, [eventId, ticketsQuery.data]);

  // `isPending` stays true forever for a query that is switched off (nobody signed in), which
  // would leave the guests step's Continue button disabled with nothing to wait for. Only a
  // fetch that is actually in flight counts as undecided.
  return {
    holdsTicket,
    isPending: ticketsQuery.isPending && ticketsQuery.fetchStatus !== 'idle',
  };
}
