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

/** Live mode opens this long before the first day starts, as the entry QR does. */
export const LIVE_MODE_OPENS_BEFORE_MS = 12 * 60 * 60 * 1000;

const RUNNING_STATES: ReadonlySet<EventDetail['state']> = new Set(['on_sale', 'sold_out', 'sales_closed', 'live']);

/**
 * Whether a holder can switch live mode on for this event now. The backend no longer moves
 * events to `live` by itself (owner's call, 2026-10-21: everyone keeps buying while the
 * festival runs), so the event's own days decide: from 12 hours before the first day starts
 * until the last day ends, in any state that is still running. `live` set by hand still counts.
 * Gates-open times are not used: Tulua's Friday has a mistyped one a month early.
 */
export function isEventHappening(event: Pick<EventDetail, 'state' | 'days'>, now = Date.now()): boolean {
  if (event.state === 'live') return true;
  if (!RUNNING_STATES.has(event.state)) return false;
  let first = Number.POSITIVE_INFINITY;
  let last = Number.NEGATIVE_INFINITY;
  for (const day of event.days ?? []) {
    const start = Date.parse(day.startsAt);
    const end = Date.parse(day.endsAt);
    if (Number.isFinite(start)) first = Math.min(first, start);
    if (Number.isFinite(end)) last = Math.max(last, end);
  }
  if (!Number.isFinite(first) || !Number.isFinite(last)) return false;
  return first - LIVE_MODE_OPENS_BEFORE_MS <= now && now < last;
}

export function groupActiveTickets(tickets: Ticket[], eventId: string): Ticket[] {
  const priority = (ticket: Ticket) =>
    ticket.usageStatus === 'usable' ? 0 :
      ticket.usageStatus === 'selfie_required' ? 1 :
        ticket.usageStatus === 'profile_incomplete' ? 2 : 3;
  return tickets
    .filter((ticket) => ticket.status === 'active' && ticket.event.id === eventId)
    .sort((a, b) => priority(a) - priority(b));
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
