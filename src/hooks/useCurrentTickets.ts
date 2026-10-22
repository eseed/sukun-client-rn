import { useMemo } from 'react';
import type { Ticket, TicketStatus } from '../api/types';
import { TIMEZONE } from '../lib/format';
import { useTickets } from './queries';
import { useNow } from './useNow';

/** The Tickets tab's own statuses, so this shares its cache rather than asking again. */
const TICKET_TAB_STATUSES: TicketStatus[] = ['active', 'pending_claim', 'voided', 'refunded'];

/** Today in Cairo as `YYYY-MM-DD`, the form a ticket day's `date` takes. */
function cairoToday(now: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** An active ticket whose last day is today or later: the event is ahead, or under way. */
export function isCurrentTicket(ticket: Ticket, now = Date.now()): boolean {
  if (ticket.status !== 'active') return false;
  const today = cairoToday(now);
  return ticket.days.some((day) => day.date >= today);
}

/**
 * The account's tickets for events that are upcoming or under way (owner's call, 2026-10-22):
 * the tab bar draws Tickets in orange while there are any, and with exactly one card's worth it
 * opens that ticket straight away. Tickets from one order and tier count as one, as the Tickets
 * list draws them.
 */
export function useCurrentTickets(): { tickets: Ticket[]; onlyTicketId: string | null } {
  const { data } = useTickets(TICKET_TAB_STATUSES);
  // Hourly is plenty: it only has to notice a day rolling over.
  const now = useNow(60 * 60 * 1000);
  return useMemo(() => {
    const tickets = (data?.data ?? []).filter((ticket) => isCurrentTicket(ticket, now));
    const cards = new Map<string, Ticket>();
    for (const ticket of tickets) {
      const key = `${ticket.orderNumber ?? ticket.id}:${ticket.tier.id}`;
      const lead = cards.get(key);
      if (!lead || (lead.usageStatus !== 'usable' && ticket.usageStatus === 'usable')) {
        cards.set(key, ticket);
      }
    }
    const only = cards.size === 1 ? [...cards.values()][0] : undefined;
    return { tickets, onlyTicketId: only?.id ?? null };
  }, [data, now]);
}
