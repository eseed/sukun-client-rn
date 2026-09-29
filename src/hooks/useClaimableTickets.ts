import { useMemo } from 'react';
import type { Ticket } from '../api/types';
import { useTickets } from './queries';

/**
 * A ticket Sukun granted to the signed-in holder that they have not claimed yet.
 *
 * Only a granted ticket waits for its holder: the backend binds one a friend bought for the
 * number at sign-in, and never binds one an admin granted, so the admin can count granted
 * against claimed. The list is holder-scoped on the server, so a pending ticket here is the
 * caller's own, but `source` is still checked: that is the product rule, and it keeps the mock's
 * buyer-side view of tickets sent to guests out of it.
 */
export function isClaimableGrant(ticket: Ticket): boolean {
  return ticket.source === 'invitation' && ticket.usageStatus === 'pending_claim';
}

export function useClaimableTickets() {
  const query = useTickets(['pending_claim']);
  const tickets = useMemo(() => (query.data?.data ?? []).filter(isClaimableGrant), [query.data]);

  return { tickets, query };
}
