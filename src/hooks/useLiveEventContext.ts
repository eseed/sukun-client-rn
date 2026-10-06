import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api } from '../api';
import type { EventDetail, EventListItem, Ticket } from '../api/types';
import { queryKeys } from './queries';
import { groupActiveTickets, liveEventChoices, type LiveEventContextState } from '../lib/live-event';
import { useAuthStore } from '../stores/auth';

async function loadAllTickets(signal: AbortSignal): Promise<Ticket[]> {
  let page = await api.tickets.list({ statuses: ['active'], limit: 100 }, signal);
  const tickets = [...page.data];
  const seen = new Set<string>();
  while (page.meta.hasNextPage && page.meta.nextCursor && !seen.has(page.meta.nextCursor)) {
    seen.add(page.meta.nextCursor);
    page = await api.tickets.list({ statuses: ['active'], limit: 100, cursor: page.meta.nextCursor }, signal);
    tickets.push(...page.data);
  }
  return tickets.filter((ticket) => ticket.status === 'active');
}

let sessionLiveEventChoice: { userId: string; eventId: string } | null = null;

export function setSessionLiveEventChoice(userId: string, eventId: string) {
  sessionLiveEventChoice = { userId, eventId };
}

function clearSessionLiveEventChoice() {
  sessionLiveEventChoice = null;
}

async function loadAllLiveEvents(signal: AbortSignal): Promise<EventListItem[]> {
  let page = await api.events.list({ state: ['live'], limit: 100 }, signal);
  const events = [...page.data];
  const seen = new Set<string>();
  while (page.meta.hasNextPage && page.meta.nextCursor && !seen.has(page.meta.nextCursor)) {
    seen.add(page.meta.nextCursor);
    page = await api.events.list({ state: ['live'], limit: 100, cursor: page.meta.nextCursor }, signal);
    events.push(...page.data);
  }
  return events.filter((event) => event.state === 'live');
}

function ticketEventDistance(tickets: Ticket[], now: number): number {
  let nearest = Number.POSITIVE_INFINITY;
  for (const ticket of tickets) {
    for (const day of ticket.days) {
      const start = Date.parse(day.startsAt);
      if (Number.isFinite(start)) nearest = Math.min(nearest, Math.abs(start - now));
    }
  }
  return nearest;
}

function asEventListItem(event: EventDetail): EventListItem {
  const tiers = event.tiers ?? [];
  return {
    id: event.id,
    slug: event.slug,
    title: event.title,
    tagline: event.tagline,
    coverImageUrl: event.coverImageUrl,
    state: 'live',
    startDate: event.startDate,
    endDate: event.endDate,
    venueName: event.venue?.name ?? null,
    priceFromEgp: event.priceFromEgp,
    tags: event.tags,
    isSoldOut: tiers.length > 0 && tiers.every((tier) => !tier.isPurchasable),
  };
}

async function loadTicketedLiveEvents(
  tickets: Ticket[],
  signal: AbortSignal,
): Promise<{
  choices: { event: EventListItem; ticket: Ticket }[];
  details: Map<string, EventDetail>;
}> {
  const groups = new Map<string, Ticket[]>();
  for (const ticket of tickets) {
    if (ticket.status !== 'active') continue;
    const key = ticket.event.id || ticket.event.slug;
    const group = groups.get(key);
    if (group) group.push(ticket);
    else groups.set(key, [ticket]);
  }

  const candidates = [...groups.values()]
    .map((group) => ({ group, distance: ticketEventDistance(group, Date.now()) }))
    .sort((a, b) => a.distance - b.distance)
    // A holder usually has only a few active event tickets. Bound the fallback so a large
    // account cannot fan out unbounded event-detail requests when the LIVE list is empty.
    .slice(0, 5);

  const checked = await Promise.all(
    candidates.map(async ({ group, distance }) => {
      const first = group[0];
      if (!first) return null;
      try {
        const detail = await api.events.detail(first.event.slug || first.event.id, signal);
        if (detail.state !== 'live') return null;
        return {
          distance,
          event: asEventListItem(detail),
          ticket: group.find((ticket) => ticket.event.id === detail.id) ?? first,
          detail,
        };
      } catch {
        // An old ticket can point to an event detail that is no longer public. Other candidates
        // still get checked, and the LIVE list remains the primary source.
        return null;
      }
    }),
  );

  const live = checked.filter((choice): choice is NonNullable<typeof choice> => choice !== null);
  if (!live.length) return { choices: [], details: new Map() };
  const nearest = Math.min(...live.map((choice) => choice.distance));
  const nearestChoices = live.filter((choice) => choice.distance === nearest);
  return {
    choices: nearestChoices.map(({ event, ticket }) => ({ event, ticket })),
    details: new Map(nearestChoices.map(({ event, detail }) => [event.id, detail])),
  };
}

async function resolveLiveEventContext(selectedEventId: string | null, signal: AbortSignal): Promise<LiveEventContextState> {
  const tickets = await loadAllTickets(signal);
  const activeTickets = tickets.filter((ticket) => ticket.status === 'active');
  if (!activeTickets.length) return { status: 'none' };

  // The public LIVE list is the efficient primary lookup. If it omits a ticket's Event, resolve
  // a bounded set of the holder's own ticketed Events by slug as a fallback; event detail is the
  // authoritative state check and avoids silently sending a holder to Discover on list drift.
  let events: EventListItem[] = [];
  try {
    events = await loadAllLiveEvents(signal);
  } catch {
    // Ticket-specific public detail checks below can still resolve the holder's LIVE Event.
  }
  let choices = liveEventChoices(events, activeTickets);
  let directDetails = new Map<string, EventDetail>();
  if (!choices.length) {
    const fallback = await loadTicketedLiveEvents(activeTickets, signal);
    choices = fallback.choices;
    directDetails = fallback.details;
  }
  if (!choices.length) return { status: 'none' };
  if (choices.length > 1 && !choices.some(({ event }) => event.id === selectedEventId)) {
    return { status: 'choose', choices };
  }
  const selected = choices.find(({ event }) => event.id === selectedEventId) ?? choices[0];
  if (!selected) return { status: 'none' };

  const event = directDetails.get(selected.event.id) ??
    await api.events.detail(selected.event.slug || selected.event.id, signal);
  if (event.state !== 'live') return { status: 'none' };
  const activeTicketsForEvent = activeTickets.filter(
    (ticket) => ticket.event.id === event.id || ticket.event.slug === event.slug,
  );
  const ticket = groupActiveTickets(activeTicketsForEvent, event.id)[0] ?? activeTicketsForEvent[0];
  if (!ticket) return { status: 'none' };
  return {
    status: 'ready',
    context: { eventId: event.id, eventSlug: event.slug, event, ticket, activeTicketsForEvent },
  };
}

/** Resolve an active ticket and a backend-live Event as one cached launch context. */
export function useLiveEventContext(enabled = true, selectedEventId?: string): LiveEventContextState {
  const authStatus = useAuthStore((state) => state.status);
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const selection = selectedEventId ?? (sessionLiveEventChoice?.userId === userId ? sessionLiveEventChoice.eventId : null);
  useEffect(() => {
    if (authStatus === 'signed-out') clearSessionLiveEventChoice();
  }, [authStatus]);
  const query = useQuery({
    queryKey: queryKeys.liveEventContext(userId, selection),
    queryFn: async ({ signal }) => {
      const controller = new AbortController();
      const abort = () => controller.abort();
      if (signal.aborted) abort();
      else signal.addEventListener('abort', abort, { once: true });
      const timeout = setTimeout(abort, 8_000);
      try {
        return await resolveLiveEventContext(selection, controller.signal);
      } finally {
        clearTimeout(timeout);
        signal.removeEventListener('abort', abort);
      }
    },
    enabled: enabled && authStatus === 'signed-in' && Boolean(userId),
    // LIVE state can change while the attendee is already in the app. Refresh this small
    // resolver when the app/browser regains focus so a return banner appears without polling.
    staleTime: 0,
    refetchOnWindowFocus: true,
    retry: false,
  });
  if (authStatus !== 'signed-in') return { status: 'idle' };
  if (!enabled) return { status: 'idle' };
  if (query.data) return query.data;
  if (query.isError) return { status: 'error', error: query.error };
  return { status: 'loading' };
}
