import type { EventDetail, EventListItem, Ticket } from '../api/types';

export interface LiveEventContext {
  eventId: string;
  eventSlug: string;
  event: EventDetail;
  ticket: Ticket;
  activeTicketsForEvent: Ticket[];
}

export type LiveEventContextState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'none' }
  | { status: 'choose'; choices: { event: EventListItem; ticket: Ticket }[] }
  | { status: 'ready'; context: LiveEventContext }
  | { status: 'error'; error: unknown };

export function groupActiveTickets(tickets: Ticket[], eventId: string): Ticket[] {
  const priority = (ticket: Ticket) =>
    ticket.usageStatus === 'usable' ? 0 :
      ticket.usageStatus === 'selfie_required' ? 1 :
        ticket.usageStatus === 'profile_incomplete' ? 2 : 3;
  return tickets
    .filter((ticket) => ticket.status === 'active' && ticket.event.id === eventId)
    .sort((a, b) => priority(a) - priority(b));
}

export function liveEventChoices(events: EventListItem[], tickets: Ticket[], now = Date.now()) {
  const ticketsByEvent = new Map<string, Ticket[]>();
  for (const ticket of tickets) {
    if (ticket.status !== 'active') continue;
    const eventTickets = ticketsByEvent.get(ticket.event.id);
    if (eventTickets) eventTickets.push(ticket);
    else ticketsByEvent.set(ticket.event.id, [ticket]);
  }

  const matching = events
    .filter((event) => event.state === 'live' && ticketsByEvent.has(event.id))
    .map((event) => ({ event, distance: distanceToTicketDays(ticketsByEvent.get(event.id) ?? [], now) }))
    .sort((a, b) => a.distance - b.distance);
  if (!matching.length) return [];
  const nearest = matching[0]?.distance;
  if (nearest === undefined) return [];
  return matching.filter((item) => item.distance === nearest).map(({ event }) => ({
    event,
    ticket: groupActiveTickets(ticketsByEvent.get(event.id) ?? [], event.id)[0]!,
  }));
}

function distanceToTicketDays(tickets: Ticket[], now: number): number {
  let nearest = Number.POSITIVE_INFINITY;
  for (const ticket of tickets) {
    for (const day of ticket.days) {
      const start = Date.parse(day.startsAt);
      if (Number.isFinite(start)) nearest = Math.min(nearest, Math.abs(start - now));
    }
  }
  return nearest;
}

export function happeningNow<T extends { startAt: string; endAt: string }>(blocks: T[], now = Date.now()): T[] {
  return blocks
    .filter((block) => {
      const start = Date.parse(block.startAt);
      const end = Date.parse(block.endAt);
      return Number.isFinite(start) && Number.isFinite(end) && start <= now && now < end;
    })
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
}

export function nextSavedSession<T extends { startAt: string }>(blocks: T[], now = Date.now()): T | undefined {
  return blocks
    .filter((block) => Date.parse(block.startAt) > now)
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))[0];
}

export function overlaps(a: { startAt: string; endAt: string }, b: { startAt: string; endAt: string }): boolean {
  return Date.parse(a.startAt) < Date.parse(b.endAt) && Date.parse(b.startAt) < Date.parse(a.endAt);
}
