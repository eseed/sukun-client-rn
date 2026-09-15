import {
  useMutation,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { api } from '../api';
import type {
  CartAddonInput,
  CurrentUser,
  EntryPass,
  EventListItem,
  GuestValidationInput,
  ListEventsQuery,
  PaymentStatus,
  ReplaceCartTicketsInput,
  TicketStatus,
  UpdateProfileInput,
} from '../api/types';
import { getAuthSessionGeneration, isCurrentSignedInSession, useAuthStore } from '../stores/auth';

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
  addons: (eventIdentifier: string) => ['addons', eventIdentifier] as const,
  addon: (eventIdentifier: string, addonId: string) =>
    ['addon', eventIdentifier, addonId] as const,
  cartRoot: ['cart'] as const,
  cart: (cartId: string) => ['cart', cartId] as const,
  cartPreview: (cartId: string) => ['cart-preview', cartId] as const,
  ticketAddons: (ticketId: string) => ['ticket-addons', ticketId] as const,
  ticketAddonContext: (ticketId: string) => ['ticket-addon-context', ticketId] as const,
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

/**
 * The backend signs selfie URLs for five minutes. Going stale a minute early means a screen
 * that has been open a while re-signs on its next mount instead of rendering a dead URL.
 */
const SELFIE_URL_STALE_MS = 4 * 60 * 1000;

export function useSelfie(options?: { enabled?: boolean }) {
  const signedIn = useAuthStore((s) => s.status === 'signed-in');
  return useQuery({
    queryKey: queryKeys.selfie,
    queryFn: () => api.profile.getSelfie(),
    enabled: signedIn && (options?.enabled ?? true),
    staleTime: SELFIE_URL_STALE_MS,
  });
}

/**
 * The current user's selfie as an avatar source. Prefers a freshly-signed URL over the one
 * captured in the auth store, which is only as young as the last `me` fetch — and which a
 * profile save blanks out entirely, since that response carries no selfie.
 */
export function useAvatarUri(): string | undefined {
  const user = useAuthStore((s) => s.user);
  const selfie = useSelfie({ enabled: user?.selfieUploaded ?? false });
  return selfie.data?.selfieUrl ?? user?.selfieUrl ?? undefined;
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
      lastPage.meta.hasNextPage ? (lastPage.meta.nextCursor ?? undefined) : undefined,
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

export function useValidateGuests() {
  return useMutation({
    mutationFn: (input: { eventId: string; guests: GuestValidationInput[] }) =>
      api.orders.validateGuests(input.eventId, input.guests),
  });
}

/* ------------------------------------------------------------------ addons */

/** The event's extras catalogue. Public, so it loads before sign-in on the event screen. */
export function useAddons(eventIdentifier: string | undefined) {
  return useQuery({
    queryKey: queryKeys.addons(eventIdentifier ?? ''),
    queryFn: () => api.addons.list(eventIdentifier as string),
    enabled: Boolean(eventIdentifier),
    // An event with no extras is a normal answer, not a failure worth retrying.
    retry: false,
  });
}

export function useAddon(eventIdentifier: string | undefined, addonId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.addon(eventIdentifier ?? '', addonId ?? ''),
    queryFn: () => api.addons.detail(eventIdentifier as string, addonId as string),
    enabled: Boolean(eventIdentifier) && Boolean(addonId),
  });
}

/* -------------------------------------------------------------------- cart */

export function useCart(cartId: string | undefined) {
  const signedIn = useAuthStore((s) => s.status === 'signed-in');
  return useQuery({
    queryKey: queryKeys.cart(cartId ?? ''),
    queryFn: () => api.carts.get(cartId as string),
    enabled: signedIn && Boolean(cartId),
  });
}

export function useCreateCart() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (eventId: string) => api.carts.create(eventId),
    onSuccess: (cart) => {
      client.setQueryData(queryKeys.cart(cart.id), cart);
    },
  });
}

/**
 * Replacing tickets also wipes the cart's draft extras, so this drops the cached preview: the
 * price on screen belongs to a basket that no longer exists.
 */
export function useReplaceCartTickets() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { cartId: string; tickets: ReplaceCartTicketsInput }) =>
      api.carts.replaceTickets(input.cartId, input.tickets),
    onSuccess: (cart) => {
      client.setQueryData(queryKeys.cart(cart.id), cart);
      void client.invalidateQueries({ queryKey: queryKeys.cartPreview(cart.id) });
    },
  });
}

export function useReplaceCartAddons() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { cartId: string; addons: CartAddonInput[] }) =>
      api.carts.replaceAddons(input.cartId, input.addons),
    onSuccess: (cart) => {
      client.setQueryData(queryKeys.cart(cart.id), cart);
      void client.invalidateQueries({ queryKey: queryKeys.cartPreview(cart.id) });
    },
  });
}

/**
 * Which contacts hold a ticket to this event, so someone who bought their own can still be put
 * in a room. Answers nothing about whether a number is registered (CLAUDE.md rule 4).
 */
export function useLookupRecipients() {
  return useMutation({
    mutationFn: (input: { cartId: string; phoneNumbers: string[] }) =>
      api.carts.lookupRecipients(input.cartId, input.phoneNumbers),
  });
}

export function useApplyCartPromo() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { cartId: string; code: string }) =>
      api.carts.applyPromo(input.cartId, input.code),
    onSuccess: (cart) => {
      client.setQueryData(queryKeys.cart(cart.id), cart);
      void client.invalidateQueries({ queryKey: queryKeys.cartPreview(cart.id) });
    },
    // A code the server rejects is an answer, not a blip worth retrying.
    retry: false,
  });
}

export function useRemoveCartPromo() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (cartId: string) => api.carts.removePromo(cartId),
    onSuccess: (cart) => {
      client.setQueryData(queryKeys.cart(cart.id), cart);
      void client.invalidateQueries({ queryKey: queryKeys.cartPreview(cart.id) });
    },
  });
}

/**
 * The server's price for this cart, and the token Place Order needs.
 *
 * A mutation rather than a query on purpose: the token is short-lived and tied to the exact
 * total the buyer was shown, so the preview has to be *taken* at a moment the screen chooses
 * rather than refreshed underneath them while they read it.
 */
export function useCartPreview() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (cartId: string) => api.carts.preview(cartId),
    onSuccess: (preview) => {
      client.setQueryData(queryKeys.cartPreview(preview.cartId), preview);
    },
  });
}

/**
 * Places the order against the exact preview the buyer confirmed.
 *
 * `CART_PRICING_CHANGED` is never retried here. The screen has to re-preview and ask again,
 * because the alternative is charging a total nobody agreed to.
 */
export function usePlaceCartOrder() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { cartId: string; pricingConfirmationToken: string }) =>
      api.carts.placeOrder(input.cartId, input.pricingConfirmationToken),
    onSuccess: (order) => {
      client.setQueryData(queryKeys.order(order.id), order);
      void client.invalidateQueries({ queryKey: queryKeys.orders });
      void client.invalidateQueries({ queryKey: queryKeys.cartRoot });
    },
    retry: false,
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
      lastPage.meta.hasNextPage ? (lastPage.meta.nextCursor ?? undefined) : undefined,
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
    refetchInterval: (currentQuery) => (isPaymentTerminal(currentQuery.state.data) ? false : 2000),
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
          statuses ? { statuses, cursor: page.meta.nextCursor } : { cursor: page.meta.nextCursor },
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
 * PENDING BACKEND — the live route is wired but not deployed, so it answers 404 until the
 * backend adds it; the screen reads that as "not issued yet" and this build picks up the real
 * pass with no rebuild. See `EntryPass` in `src/api/types.ts`.
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

/**
 * Extras attached to a ticket after fulfilment. Read-only in P0.1: `redemptionsAllowed` and
 * `redemptionsUsed` are shown at most, never changed, until the scanner exists.
 */
export function useTicketAddons(ticketId: string | undefined) {
  const signedIn = useAuthStore((s) => s.status === 'signed-in');
  return useQuery({
    queryKey: queryKeys.ticketAddons(ticketId ?? ''),
    queryFn: () => api.tickets.addons(ticketId as string),
    enabled: signedIn && Boolean(ticketId),
    // A build with extras switched off answers not-found, which means "none", not "broken".
    retry: false,
  });
}

/** Starting point for buying extras against a ticket already held. */
export function useTicketAddonContext(ticketId: string | undefined) {
  const signedIn = useAuthStore((s) => s.status === 'signed-in');
  return useQuery({
    queryKey: queryKeys.ticketAddonContext(ticketId ?? ''),
    queryFn: () => api.tickets.addonContext(ticketId as string),
    enabled: signedIn && Boolean(ticketId),
    retry: false,
  });
}

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
  return useMutation({
    mutationFn: (input: { code: string; reason?: string; confirmForfeit?: boolean }) =>
      api.account.delete(input.code, input.reason, input.confirmForfeit),
    /**
     * Deleting the account revokes every session server-side, so there is nothing left to ask
     * it. Invalidating the deletion preview here refetched an authenticated endpoint with a
     * token that had just been revoked: a guaranteed 401, a doomed refresh behind it, and a
     * failure surfacing on a screen whose work had already succeeded. `signOut` empties the
     * query cache anyway, and skips the logout round-trip for the same reason.
     */
    onSuccess: () => signOut({ remote: false }),
  });
}
