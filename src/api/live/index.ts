import type { SukunApi } from '../contract';
import type {
  AccountDeletionPreview,
  Area,
  Authenticated,
  CreateOrderInput,
  CurrentUser,
  CursorPage,
  EventDetail,
  EventListItem,
  GuestValidationResult,
  ListEventsQuery,
  OrderDetail,
  OrderGuestInput,
  OrderSummary,
  OtpRequested,
  PaymentIntent,
  PaymentStatus,
  PromoValidationResult,
  SessionTokens,
  Ticket,
  UpdateProfileInput,
} from '../types';
import { ApiError, request } from './http';

/**
 * Live backend implementation. Endpoint paths are taken from the NestJS controllers on
 * `../sukun-backend` (branch `staging`) — see each method. Staging is **not deployed yet**,
 * so this is unreachable until `EXPO_PUBLIC_API_BASE_URL` is set; the app runs on
 * `src/api/mock` in the meantime.
 *
 * Every path below is verified against a controller. Two methods have no endpoint yet and
 * throw a clearly-labelled error rather than guessing a URL — see `NOT_IMPLEMENTED` below.
 */

function notImplemented(what: string): never {
  throw new ApiError(
    'NOT_IMPLEMENTED',
    `${what} has no endpoint on the backend yet. Run in mock mode (EXPO_PUBLIC_API_MODE=mock).`,
    501,
  );
}

export const liveApi: SukunApi = {
  auth: {
    // MobileAuthController — POST mobile/auth/otp/request
    requestOtp: (phoneNumber) =>
      request<OtpRequested>('mobile/auth/otp/request', {
        method: 'POST',
        body: { phoneNumber },
        auth: false,
      }),

    // POST mobile/auth/otp/verify
    verifyOtp: (phoneNumber, code, deviceId) =>
      request<Authenticated>('mobile/auth/otp/verify', {
        method: 'POST',
        body: { phoneNumber, code, deviceId },
        auth: false,
      }),

    // POST mobile/auth/refresh
    refresh: (refreshToken) =>
      request<SessionTokens>('mobile/auth/refresh', {
        method: 'POST',
        body: { refreshToken },
        auth: false,
      }),

    // GET mobile/auth/me
    me: () => request<CurrentUser>('mobile/auth/me'),

    // POST mobile/auth/logout → 204
    logout: () => request<void>('mobile/auth/logout', { method: 'POST' }),

    // POST mobile/auth/logout-all → 204
    logoutAll: () => request<void>('mobile/auth/logout-all', { method: 'POST' }),
  },

  profile: {
    // MobileAppUserProfileController — PATCH mobile/users/me/profile
    update: (input: UpdateProfileInput) =>
      request<CurrentUser>('mobile/users/me/profile', { method: 'PATCH', body: input }),

    // PUT mobile/users/me/selfie (multipart, field name `file`)
    async uploadSelfie(uri: string): Promise<CurrentUser> {
      const form = new FormData();
      const name = uri.split('/').pop() ?? 'selfie.jpg';
      const type = name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
      // React Native's FormData accepts this file descriptor shape.
      form.append('file', { uri, name, type } as unknown as Blob);
      await request<unknown>('mobile/users/me/selfie', { method: 'PUT', form });
      return request<CurrentUser>('mobile/auth/me');
    },

    // MobileAppUserEmailController — POST mobile/users/me/email/send-verification
    sendEmailVerification: () =>
      request<void>('mobile/users/me/email/send-verification', { method: 'POST' }),
  },

  reference: {
    // MobileReferenceController — GET mobile/reference/areas
    areas: () => request<Area[]>('mobile/reference/areas'),
  },

  events: {
    // PublicEventsController — GET public/events
    list: (query?: ListEventsQuery) =>
      request<CursorPage<EventListItem>>('public/events', {
        auth: false,
        query: {
          cursor: query?.cursor ?? undefined,
          limit: query?.limit,
          state: query?.state,
          tag: query?.tag,
          upcoming: query?.upcoming,
        },
      }),

    // GET public/events/:identifier (uuid or slug)
    detail: (identifier) =>
      request<EventDetail>(`public/events/${encodeURIComponent(identifier)}`, { auth: false }),
  },

  orders: {
    /**
     * PENDING BACKEND — there is no price-preview endpoint. The server prices only at
     * `POST /orders`, which also holds capacity, so it cannot stand in for a preview on the
     * review screen. Either add `POST orders/preview` server-side, or move the review screen
     * to create the order first and render its authoritative totals.
     */
    previewPrice: () => notImplemented('Order price preview'),

    // MobileOrdersController — POST orders/validate-guests
    validateGuests: (eventId: string, guests: OrderGuestInput[]) =>
      request<GuestValidationResult>('orders/validate-guests', {
        method: 'POST',
        body: { eventId, guests },
      }),

    // POST orders/validate-promo-code
    validatePromoCode: (items, promoCode) =>
      request<PromoValidationResult>('orders/validate-promo-code', {
        method: 'POST',
        body: { items, promoCode },
      }),

    // POST orders → 201 first time, 200 on identical retry
    create: (input: CreateOrderInput) =>
      request<OrderDetail>('orders', { method: 'POST', body: input }),

    // GET orders/:orderId
    detail: (orderId) => request<OrderDetail>(`orders/${orderId}`),

    // GET orders
    list: (cursor, limit) =>
      request<CursorPage<OrderSummary>>('orders', {
        query: { cursor: cursor ?? undefined, limit },
      }),

    // POST orders/:orderId/cancel
    cancel: (orderId) => request<OrderDetail>(`orders/${orderId}/cancel`, { method: 'POST' }),
  },

  payments: {
    // MobilePaymentsController (path `orders/:orderId/payment`) — POST .../initiate
    initiate: (orderId) =>
      request<PaymentIntent>(`orders/${orderId}/payment/initiate`, { method: 'POST' }),

    // GET orders/:orderId/payment/status
    status: (orderId) => request<PaymentStatus>(`orders/${orderId}/payment/status`),

    // MobilePaymentRetriesController — POST mobile/orders/:orderId/retry-payment
    retry: (orderId) =>
      request<PaymentIntent>(`mobile/orders/${orderId}/retry-payment`, { method: 'POST' }),
  },

  tickets: {
    // MobileTicketsController — GET tickets
    list: (params) =>
      request<CursorPage<Ticket>>('tickets', {
        query: {
          statuses: params?.statuses,
          cursor: params?.cursor ?? undefined,
          limit: params?.limit,
        },
      }),

    // GET tickets/:ticketId
    detail: (ticketId) => request<Ticket>(`tickets/${ticketId}`),

    // POST tickets/:ticketId/claim
    claim: (ticketId) => request<Ticket>(`tickets/${ticketId}/claim`, { method: 'POST' }),

    /**
     * PENDING BACKEND — the rotating entry pass has no endpoint. `MobileTicketsController`
     * exposes list / detail / claim only. Expected shape is `EntryPass` in `../types`.
     */
    entryPass: () => notImplemented('Rotating entry pass'),
  },

  account: {
    // MobileAppUserAccountLifecycleController (path `mobile/users/me`) — GET .../deletion-preview
    deletionPreview: () => request<AccountDeletionPreview>('mobile/users/me/deletion-preview'),

    // POST mobile/users/me/deletion/otp/request
    requestDeletionOtp: () =>
      request<OtpRequested>('mobile/users/me/deletion/otp/request', { method: 'POST' }),

    // DELETE mobile/users/me
    delete: (code, reason) =>
      request<void>('mobile/users/me', { method: 'DELETE', body: { code, reason } }),
  },
};
