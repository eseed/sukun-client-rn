import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api } from '../api';
import type { EventListItem, Ticket } from '../api/types';
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

async function resolveLiveEventContext(selectedEventId: string | null, signal: AbortSignal): Promise<LiveEventContextState> {
  const [tickets, events] = await Promise.all([loadAllTickets(signal), loadAllLiveEvents(signal)]);
  const choices = liveEventChoices(events, tickets);
  if (!choices.length) return { status: 'none' };
  if (choices.length > 1 && !choices.some(({ event }) => event.id === selectedEventId)) {
    return { status: 'choose', choices };
  }
  const selected = choices.find(({ event }) => event.id === selectedEventId) ?? choices[0];
  if (!selected) return { status: 'none' };

  const event = await api.events.detail(selected.event.slug || selected.event.id, signal);
  if (event.state !== 'live') return { status: 'none' };
  const activeTicketsForEvent = groupActiveTickets(tickets, event.id);
  const ticket = activeTicketsForEvent[0];
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
    staleTime: 60_000,
    retry: false,
  });

  if (authStatus !== 'signed-in') return { status: 'idle' };
  if (!enabled) return { status: 'idle' };
  if (query.isFetching) return { status: 'loading' };
  if (query.isError) return { status: 'error', error: query.error };
  return query.data ?? { status: 'none' };
}
