import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import { api } from '../api';
import type {
  CreateOrderInput,
  CurrentUser,
  EntryPass,
  ListEventsQuery,
  OrderGuestInput,
  TicketStatus,
  UpdateProfileInput,
} from '../api/types';
import { useAuthStore } from '../stores/auth';

/**
 * The only data surface screens are allowed to touch. Each hook wraps one api method, so
 * swapping mock → live changes nothing here and nothing in any screen.
 */

export const queryKeys = {
  me: ['me'] as const,
  areas: ['areas'] as const,
  events: (query?: ListEventsQuery) => ['events', query ?? {}] as const,
  event: (identifier: string) => ['event', identifier] as const,
  order: (orderId: string) => ['order', orderId] as const,
  orders: ['orders'] as const,
  paymentStatus: (orderId: string) => ['payment-status', orderId] as const,
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
  return useMutation({
    mutationFn: (input: { phoneNumber: string; code: string }) =>
      api.auth.verifyOtp(input.phoneNumber, input.code),
    onSuccess: async (result) => {
      await signIn(result.tokens, result.user);
    },
  });
}

export function useMe(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: () => api.auth.me(),
    enabled: options?.enabled ?? true,
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
    },
  });
}

/* ---------------------------------------------------------------- events */

export function useEvents(query?: ListEventsQuery) {
  return useQuery({
    queryKey: queryKeys.events(query),
    queryFn: () => api.events.list(query),
  });
}

export function useEvent(identifier: string | undefined) {
  return useQuery({
    queryKey: queryKeys.event(identifier ?? ''),
    queryFn: () => api.events.detail(identifier as string),
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
  return useQuery({
    queryKey: queryKeys.pricePreview(eventId ?? '', items, promoCode),
    queryFn: () =>
      api.orders.previewPrice({
        eventId: eventId as string,
        items,
        promoCode: promoCode ?? undefined,
      }),
    enabled: Boolean(eventId) && items.length > 0,
  });
}

export function useValidateGuests() {
  return useMutation({
    mutationFn: (input: { eventId: string; guests: OrderGuestInput[] }) =>
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
  return useQuery({
    queryKey: queryKeys.order(orderId ?? ''),
    queryFn: () => api.orders.detail(orderId as string),
    enabled: Boolean(orderId),
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
  return useQuery({
    queryKey: queryKeys.paymentStatus(orderId ?? ''),
    queryFn: () => api.payments.status(orderId as string),
    enabled: Boolean(orderId) && poll,
    refetchInterval: (query) =>
      query.state.data?.orderStatus === 'paid' || query.state.data?.paymentStatus === 'failed'
        ? false
        : 2000,
  });
}

/* --------------------------------------------------------------- tickets */

export function useTickets(statuses?: TicketStatus[]) {
  const signedIn = useAuthStore((s) => s.status === 'signed-in');
  return useQuery({
    queryKey: queryKeys.tickets(statuses),
    queryFn: () => api.tickets.list(statuses ? { statuses } : undefined),
    enabled: signedIn,
  });
}

export function useTicket(ticketId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.ticket(ticketId ?? ''),
    queryFn: () => api.tickets.detail(ticketId as string),
    enabled: Boolean(ticketId),
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
  return useQuery({
    queryKey: queryKeys.entryPass(ticketId ?? ''),
    queryFn: () => api.tickets.entryPass(ticketId as string),
    enabled: Boolean(ticketId),
    refetchInterval: (query) => (query.state.data?.refreshAfterSeconds ?? 30) * 1000,
    ...options,
  });
}

/* --------------------------------------------------------------- account */

export function useDeletionPreview(enabled = true) {
  return useQuery({
    queryKey: queryKeys.deletionPreview,
    queryFn: () => api.account.deletionPreview(),
    enabled,
  });
}

export function useRequestDeletionOtp() {
  return useMutation({ mutationFn: () => api.account.requestDeletionOtp() });
}

export function useDeleteAccount() {
  const signOut = useAuthStore((s) => s.signOut);
  return useMutation({
    mutationFn: (input: { code: string; reason?: string }) =>
      api.account.delete(input.code, input.reason),
    onSuccess: async () => {
      await signOut();
    },
  });
}
