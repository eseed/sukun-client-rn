import {
  useMutation,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { api, API_MODE } from '../api';
import type {
  AccountRestorationInput,
  CreateOrderInput,
  CurrentUser,
  EntryPass,
  EventListItem,
  GuestValidationInput,
  ListEventsQuery,
  OrderStatus,
  PaymentStatus,
  TicketStatus,
  UpdateProfileInput,
} from '../api/types';
import {
  getAuthSessionGeneration,
  isCurrentSignedInSession,
  useAuthStore,
} from '../stores/auth';
import { HeldOrderError } from '../lib/errors';

/**
 * The only data surface screens are allowed to touch. Each hook wraps one api method, so
 * swapping mock → live changes nothing here and nothing in any screen.
 */

export const queryKeys = {
  me: ['me'] as const,
  areas: ['areas'] as const,
  events: (query?: ListEventsQuery) => ['events', query ?? {}] as const,
  event: (identifier: string) => ['event', identifier] as const,
  eventMeta: (identifier: string) => ['event-meta', identifier] as const,
  order: (orderId: string) => ['order', orderId] as const,
  orders: ['orders'] as const,
  ordersPage: (limit?: number) => ['orders', { limit: limit ?? null }] as const,
  paymentStatus: (orderId: string) => ['payment-status', orderId] as const,
  selfie: ['selfie'] as const,
  ticketsRoot: ['tickets'] as const,
  tickets: (statuses?: TicketStatus[]) => ['tickets', statuses ?? null] as const,
  ticket: (ticketId: string) => ['ticket', ticketId] as const,
  entryPass: (ticketId: string) => ['entry-pass', ticketId] as const,
  pricePreview: (
    eventId: string,
    items: { tierId: string; quantity: number }[],
    promoCode?: string | null,
  ) => ['price-preview', eventId, items, promoCode ?? null] as const,
  deletionPreview: ['deletion-preview'] as const,
};

/* -------------------------------------------------------------- reference */

export function useAreas() {
  return useQuery({
    queryKey: queryKeys.areas,
    queryFn: () => api.reference.areas(),
    staleTime: 60 * 60 * 1000,
  });
}

/* ------------------------------------------------------------------ auth */

export function useRequestOtp() {
  return useMutation({
    mutationFn: (phoneNumber: string) => api.auth.requestOtp(phoneNumber),
  });
}

export function useVerifyOtp() {
  const signIn = useAuthStore((s) => s.signIn);
  const setUser = useAuthStore((s) => s.setUser);
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { phoneNumber: string; code: string; deviceId?: string }) =>
      api.auth.verifyOtp(input.phoneNumber, input.code, input.deviceId),
    onSuccess: async (result) => {
      // OTP verification returns a minimal UserProjectionDto. Fetch the full profile projection
      // after persisting the new tokens so onboarding receives all required fields.
      const projection: CurrentUser = {
        id: result.user.id,
        phoneNumber: result.user.phoneNumber,
        fullName: null,
        email: null,
        emailVerified: result.user.emailVerified,
        dateOfBirth: null,
        gender: null,
        area: null,
        selfieUploaded: false,
        selfieUrl: null,
        selfieExpiresAt: null,
        // The verify/restore projections do not carry consent; the `me` fetch that follows
        // replaces this placeholder with the stored value.
        marketingOptIn: false,
        profileComplete: result.user.profileComplete,
        status: result.user.status,
      };
      await signIn(
        { accessToken: result.accessToken, refreshToken: result.refreshToken },
        projection,
      );
      const generation = getAuthSessionGeneration();
      if (!isCurrentSignedInSession(generation)) return;
      client.setQueryData(queryKeys.me, projection);
      const user = await api.auth.me();
      if (!isCurrentSignedInSession(generation)) return;
      setUser(user);
      client.setQueryData(queryKeys.me, user);
    },
  });
}

export function useMe(options?: { enabled?: boolean }) {
  const signedIn = useAuthStore((s) => s.status === 'signed-in');
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: () => api.auth.me(),
    enabled: signedIn && (options?.enabled ?? true),
  });
}

/* --------------------------------------------------------------- profile */

export function useUpdateProfile() {
  const setUser = useAuthStore((s) => s.setUser);
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProfileInput) => api.profile.update(input),
    onSuccess: (user: CurrentUser) => {
      setUser(user);
      client.setQueryData(queryKeys.me, user);
    },
  });
}

export function useUploadSelfie() {
  const setUser = useAuthStore((s) => s.setUser);
  const client = useQueryClient();
  return useMutation({
    mutationFn: (uri: string) => api.profile.uploadSelfie(uri),
    onSuccess: (user: CurrentUser) => {
      setUser(user);
      client.setQueryData(queryKeys.me, user);
      void client.invalidateQueries({ queryKey: queryKeys.selfie });
      void client.invalidateQueries({ queryKey: queryKeys.ticketsRoot });
    },
  });
}

export function useSelfie(options?: { enabled?: boolean }) {
  const signedIn = useAuthStore((s) => s.status === 'signed-in');
  return useQuery({
    queryKey: queryKeys.selfie,
    queryFn: () => api.profile.getSelfie(),
    enabled: signedIn && (options?.enabled ?? true),
  });
}

export function useSendEmailVerification() {
  return useMutation({ mutationFn: () => api.profile.sendEmailVerification() });
}

export function useVerifyEmail() {
  const setUser = useAuthStore((s) => s.setUser);
  const client = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => api.profile.verifyEmail(token),
    onSuccess: async () => {
      const user = await api.auth.me();
      setUser(user);
      client.setQueryData(queryKeys.me, user);
    },
  });
}

/* ---------------------------------------------------------------- events */

/**
 * Paginated events.
 *
 * The backend's timeline cursor is not a stable sequence: at the future→past handoff it
 * re-emits the boundary page, then resets to the very first page, and `hasNextPage` stays
 * `true` forever. Left alone that yields duplicate React keys and an infinite scroll that
 * never ends, so the pages are flattened here — deduplicated by id, and `hasNextPage` is
 * withdrawn as soon as a page contributes nothing new.
 */
export function useEvents(query?: ListEventsQuery) {
  const result = useInfiniteQuery({
    queryKey: queryKeys.events(query),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => api.events.list({ ...query, cursor: pageParam }),
    getNextPageParam: (lastPage) =>
      lastPage.meta.hasNextPage ? lastPage.meta.nextCursor ?? undefined : undefined,
  });

  const pages = result.data?.pages;

  const { events, exhausted } = useMemo(() => {
    const seen = new Set<string>();
    const unique: EventListItem[] = [];
    let addedByLastPage = 0;

    (pages ?? []).forEach((page, pageIndex) => {
      const isLastPage = pageIndex === (pages?.length ?? 0) - 1;
      for (const event of page.data) {
        if (seen.has(event.id)) continue;
        seen.add(event.id);
        unique.push(event);
        if (isLastPage) addedByLastPage += 1;
      }
    });

    // A page that repeated only what we already had means the cursor has wrapped.
    return {
      events: unique,
      exhausted: (pages?.length ?? 0) > 1 && addedByLastPage === 0,
    };
  }, [pages]);

  return {
    ...result,
    events,
    hasNextPage: result.hasNextPage && !exhausted,
  };
}

export function useRequestAccountRestorationOtp() {
  return useMutation({
    mutationFn: (phoneNumber: string) => api.auth.requestAccountRestorationOtp(phoneNumber),
  });
}

export function useConfirmAccountRestoration() {
  const signIn = useAuthStore((s) => s.signIn);
  const setUser = useAuthStore((s) => s.setUser);
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: AccountRestorationInput) => api.auth.confirmAccountRestoration(input),
    onSuccess: async (result) => {
      const projection: CurrentUser = {
        id: result.user.id,
        phoneNumber: result.user.phoneNumber,
        fullName: null,
        email: null,
        emailVerified: result.user.emailVerified,
        dateOfBirth: null,
        gender: null,
        area: null,
        selfieUploaded: false,
        selfieUrl: null,
        selfieExpiresAt: null,
        // The verify/restore projections do not carry consent; the `me` fetch that follows
        // replaces this placeholder with the stored value.
        marketingOptIn: false,
        profileComplete: result.user.profileComplete,
        status: result.user.status,
      };
      await signIn(
        { accessToken: result.accessToken, refreshToken: result.refreshToken },
        projection,
      );
      const generation = getAuthSessionGeneration();
      if (!isCurrentSignedInSession(generation)) return;
      client.setQueryData(queryKeys.me, projection);
      const user = await api.auth.me();
      if (!isCurrentSignedInSession(generation)) return;
      setUser(user);
      client.setQueryData(queryKeys.me, user);
    },
  });
}

export function useEvent(identifier: string | undefined) {
  return useQuery({
    queryKey: queryKeys.event(identifier ?? ''),
    queryFn: () => api.events.detail(identifier as string),
    enabled: Boolean(identifier),
  });
}

export function useEventMeta(identifier: string | undefined) {
  return useQuery({
    queryKey: queryKeys.eventMeta(identifier ?? ''),
    queryFn: () => api.events.meta(identifier as string),
    enabled: Boolean(identifier),
  });
}

/* ---------------------------------------------------------------- orders */

/** Server-computed totals for the review screen. Never derive these in a component. */
export function usePricePreview(input: {
  eventId: string | undefined;
  items: { tierId: string; quantity: number }[];
  promoCode?: string | null;
}) {
  const { eventId, items, promoCode } = input;
  const signedIn = useAuthStore((s) => s.status === 'signed-in');
  return useQuery({
    queryKey: queryKeys.pricePreview(eventId ?? '', items, promoCode),
    queryFn: () =>
      api.orders.previewPrice({
        eventId: eventId as string,
        items,
        promoCode: promoCode ?? undefined,
      }),
     // Staging has no preview endpoint. Live checkout creates the order on the review CTA,
     // which is the first server-authoritative pricing response.
     enabled: API_MODE !== 'live' && signedIn && Boolean(eventId) && items.length > 0,
  });
}

export function useValidateGuests() {
  return useMutation({
    mutationFn: (input: { eventId: string; guests: GuestValidationInput[] }) =>
      api.orders.validateGuests(input.eventId, input.guests),
  });
}

export function useValidatePromoCode() {
  return useMutation({
    mutationFn: (input: {
      items: { tierId: string; quantity: number }[];
      promoCode: string;
    }) => api.orders.validatePromoCode(input.items, input.promoCode),
  });
}

/**
 * The one order state that still holds capacity. `awaiting_payment` is also the only status the
 * backend's duplicate guard looks at, so it is the only one worth searching for here.
 *
 * This used to read `['awaiting_payment', 'processing', 'paid']`. `processing` is not a member
 * of the backend's `order_status` enum at all, and `paid` meant an already-paid order could be
 * picked up and handed back to be paid a second time.
 */
const HELD_ORDER_STATUS: OrderStatus = 'awaiting_payment';

/**
 * A held order is minutes old by construction — the hold expires in about a quarter of an hour
 * — and the list is newest-first, so one generous page always covers it.
 */
const HELD_ORDER_SEARCH_LIMIT = 50;

/**
 * Creates the order, and on refusal identifies the order already holding the capacity.
 *
 * The backend refuses a second order for an event only while an earlier one is still
 * `awaiting_payment`, and when that order is semantically identical to the request it returns
 * the order with a 200 rather than an error. So `409 DUPLICATE_ACTIVE_ORDER` carries a precise
 * meaning: *you are holding an order that is not what you just asked for.*
 *
 * This used to answer that by silently substituting the held order and handing it straight to
 * the payment sheet — charging for a basket the buyer never chose. It now surfaces a
 * `HeldOrderError` carrying that order's id so the screen can name the situation and offer to
 * continue it. The id has to be looked up: the server puts `existingOrderId` in the exception's
 * `messageArgs`, which the error envelope does not emit.
 */
export function useCreateOrder() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateOrderInput) => {
      try {
        return await api.orders.create(input);
      } catch (error) {
        const code =
          typeof error === 'object' && error !== null && 'code' in error
            ? (error as { code?: unknown }).code
            : undefined;
        if (code !== 'DUPLICATE_ACTIVE_ORDER') throw error;

        const page = await api.orders.list(undefined, HELD_ORDER_SEARCH_LIMIT);
        const held = page.data.find(
          (order) => order.eventId === input.eventId && order.status === HELD_ORDER_STATUS,
        );
        throw new HeldOrderError(held?.id ?? null);
      }
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.orders });
    },
  });
}

export function useOrder(orderId: string | undefined) {
  const signedIn = useAuthStore((s) => s.status === 'signed-in');
  return useQuery({
    queryKey: queryKeys.order(orderId ?? ''),
    queryFn: () => api.orders.detail(orderId as string),
    enabled: signedIn && Boolean(orderId),
  });
}

export function useOrders(options?: { limit?: number; enabled?: boolean }) {
  const signedIn = useAuthStore((s) => s.status === 'signed-in');
  const limit = options?.limit;
  return useInfiniteQuery({
    queryKey: queryKeys.ordersPage(limit),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => api.orders.list(pageParam, limit),
    getNextPageParam: (lastPage) =>
      lastPage.meta.hasNextPage ? lastPage.meta.nextCursor ?? undefined : undefined,
    enabled: signedIn && (options?.enabled ?? true),
  });
}

export function useCancelOrder() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) => api.orders.cancel(orderId),
    onSuccess: (order) => {
      client.setQueryData(queryKeys.order(order.id), order);
      void client.invalidateQueries({ queryKey: queryKeys.orders });
    },
  });
}

/* -------------------------------------------------------------- payments */

export function useInitiatePayment() {
  return useMutation({
    mutationFn: (orderId: string) => api.payments.initiate(orderId),
  });
}

/**
 * Polls order status after the provider sheet closes. An order is `paid` only once the
 * server has seen the webhook — a client redirect proves nothing (CLAUDE.md rule 9).
 */
export function usePaymentStatus(orderId: string | undefined, options?: { poll?: boolean }) {
  const poll = options?.poll ?? false;
  const signedIn = useAuthStore((s) => s.status === 'signed-in');
  const client = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.paymentStatus(orderId ?? ''),
    queryFn: () => api.payments.status(orderId as string),
    enabled: signedIn && Boolean(orderId) && poll,
    refetchInterval: (currentQuery) =>
      isPaymentTerminal(currentQuery.state.data) ? false : 2000,
  });

  useEffect(() => {
    if (!query.data || !isPaymentTerminal(query.data) || !orderId) return;
    const invalidations = [
      client.invalidateQueries({ queryKey: queryKeys.order(orderId) }),
      client.invalidateQueries({ queryKey: queryKeys.orders }),
    ];
    if (query.data.orderStatus === 'paid') {
      invalidations.push(client.invalidateQueries({ queryKey: queryKeys.ticketsRoot }));
    }
    void Promise.all(invalidations);
  }, [client, orderId, query.data]);

  return query;
}

function isPaymentTerminal(status: PaymentStatus | undefined): boolean {
  if (!status) return false;
  return (
    status.orderStatus === 'paid' ||
    status.orderStatus === 'failed' ||
    status.orderStatus === 'expired' ||
    status.orderStatus === 'cancelled' ||
    status.orderStatus === 'refunded'
  );
}

export function useRetryPayment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) => api.payments.retry(orderId),
    onSuccess: (_intent, orderId) => {
      void client.invalidateQueries({ queryKey: queryKeys.paymentStatus(orderId) });
      void client.invalidateQueries({ queryKey: queryKeys.order(orderId) });
      void client.invalidateQueries({ queryKey: queryKeys.orders });
    },
  });
}

/* --------------------------------------------------------------- tickets */

export function useTickets(statuses?: TicketStatus[]) {
  const signedIn = useAuthStore((s) => s.status === 'signed-in');
  return useQuery({
    queryKey: queryKeys.tickets(statuses),
    queryFn: async () => {
      let page = await api.tickets.list(statuses ? { statuses } : undefined);
      const tickets = [...page.data];

      while (page.meta.hasNextPage && page.meta.nextCursor) {
        page = await api.tickets.list(
          statuses
            ? { statuses, cursor: page.meta.nextCursor }
            : { cursor: page.meta.nextCursor },
        );
        tickets.push(...page.data);
      }

      return { ...page, data: tickets };
    },
    enabled: signedIn,
  });
}

export function useTicket(ticketId: string | undefined) {
  const signedIn = useAuthStore((s) => s.status === 'signed-in');
  return useQuery({
    queryKey: queryKeys.ticket(ticketId ?? ''),
    queryFn: () => api.tickets.detail(ticketId as string),
    enabled: signedIn && Boolean(ticketId),
  });
}

export function useClaimTicket() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (ticketId: string) => api.tickets.claim(ticketId),
    onSuccess: (ticket) => {
      client.setQueryData(queryKeys.ticket(ticket.id), ticket);
      void client.invalidateQueries({ queryKey: queryKeys.ticketsRoot });
    },
  });
}

/**
 * The rotating entry pass. Refetches on the cadence the server dictates, so a screenshot
 * goes stale (CLAUDE.md rule 3).
 *
 * PENDING BACKEND — served by the mock only; see `EntryPass` in `src/api/types.ts`.
 */
export function useEntryPass(
  ticketId: string | undefined,
  options?: Partial<UseQueryOptions<EntryPass>>,
) {
  const signedIn = useAuthStore((s) => s.status === 'signed-in');
  return useQuery({
    queryKey: queryKeys.entryPass(ticketId ?? ''),
    queryFn: () => api.tickets.entryPass(ticketId as string),
    ...options,
    enabled: signedIn && Boolean(ticketId) && (options?.enabled ?? true),
    refetchInterval: (query) =>
      query.state.error ? false : (query.state.data?.refreshAfterSeconds ?? 30) * 1000,
  });
}

/* --------------------------------------------------------------- account */

export function useDeletionPreview(enabled = true) {
  const signedIn = useAuthStore((s) => s.status === 'signed-in');
  return useQuery({
    queryKey: queryKeys.deletionPreview,
    queryFn: () => api.account.deletionPreview(),
    enabled: signedIn && enabled,
  });
}

export function useRequestDeletionOtp() {
  return useMutation({ mutationFn: () => api.account.requestDeletionOtp() });
}

export function useDeleteAccount() {
  const signOut = useAuthStore((s) => s.signOut);
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { code: string; reason?: string; confirmForfeit?: boolean }) =>
      api.account.delete(input.code, input.reason, input.confirmForfeit),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: queryKeys.deletionPreview });
      await signOut();
    },
  });
}
