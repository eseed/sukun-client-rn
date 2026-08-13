import {
  useMutation,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import { useEffect } from 'react';
import { api } from '../api';
import type {
  AccountRestorationInput,
  CreateOrderInput,
  CurrentUser,
  EntryPass,
  GuestValidationInput,
  ListEventsQuery,
  PaymentStatus,
  TicketStatus,
  UpdateProfileInput,
} from '../api/types';
import {
  getAuthSessionGeneration,
  isCurrentSignedInSession,
  useAuthStore,
} from '../stores/auth';

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

export function useEvents(query?: ListEventsQuery) {
  return useInfiniteQuery({
    queryKey: queryKeys.events(query),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => api.events.list({ ...query, cursor: pageParam }),
    getNextPageParam: (lastPage) =>
      lastPage.meta.hasNextPage ? lastPage.meta.nextCursor ?? undefined : undefined,
  });
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
    enabled: signedIn && Boolean(eventId) && items.length > 0,
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

export function useCreateOrder() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateOrderInput) => api.orders.create(input),
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
