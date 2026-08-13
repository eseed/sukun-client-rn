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
 * Live backend implementation. Endpoint paths and DTO shapes are verified against the staging
 * OpenAPI schema (`GET /api/docs-json` on the deployed backend) — see each method. Two methods
 * have no endpoint yet and throw a clearly-labelled error rather than guessing a URL — see
 * `NOT_IMPLEMENTED` below.
 */

function notImplemented(what: string): never {
  throw new ApiError(
    'NOT_IMPLEMENTED',
    `${what} has no endpoint on the backend yet. Run in mock mode (EXPO_PUBLIC_API_MODE=mock).`,
    501,
  );
}

/** `AppUserAreaResponseDto` — the backend's area id is a smallint; the app's is a string. */
interface RawArea {
  id: number;
  code: string;
  name: string;
}

function mapArea(area: RawArea): Area {
  return { id: String(area.id), code: area.code, name: area.name };
}

/** `MobileCurrentUserResponseDto`, before its numeric area id is normalised to a string. */
type RawCurrentUser = Omit<CurrentUser, 'area'> & { area: RawArea | null };

function mapCurrentUser(user: RawCurrentUser): CurrentUser {
  return { ...user, area: user.area ? mapArea(user.area) : null };
}

/** `MobileAuthenticatedResponseDto` / `MobileSessionTokensResponseDto` — flat, not nested. */
interface RawSessionTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresInSeconds: number;
  refreshTokenExpiresInSeconds: number;
}

function mapSessionTokens(raw: RawSessionTokens): SessionTokens {
  return {
    accessToken: raw.accessToken,
    refreshToken: raw.refreshToken,
    expiresIn: raw.accessTokenExpiresInSeconds,
  };
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

    // POST mobile/auth/otp/verify. The response's `user` is a thin projection (no fullName,
    // area, selfie, ...), so we fetch the full profile with the fresh token before it's
    // persisted to secure storage — see `request`'s `token` override.
    async verifyOtp(phoneNumber, code, deviceId): Promise<Authenticated> {
      const raw = await request<RawSessionTokens & { isNewUser: boolean }>(
        'mobile/auth/otp/verify',
        { method: 'POST', body: { phoneNumber, code, deviceId }, auth: false },
      );
      const user = await request<RawCurrentUser>('mobile/auth/me', {
        auth: false,
        token: raw.accessToken,
      });
      return { tokens: mapSessionTokens(raw), user: mapCurrentUser(user) };
    },

    // POST mobile/auth/refresh
    refresh: async (refreshToken) =>
      mapSessionTokens(
        await request<RawSessionTokens>('mobile/auth/refresh', {
          method: 'POST',
          body: { refreshToken },
          auth: false,
        }),
      ),

    // GET mobile/auth/me
    me: async () => mapCurrentUser(await request<RawCurrentUser>('mobile/auth/me')),

    // POST mobile/auth/logout → 204
    logout: () => request<void>('mobile/auth/logout', { method: 'POST' }),

    // POST mobile/auth/logout-all → 204
    logoutAll: () => request<void>('mobile/auth/logout-all', { method: 'POST' }),
  },

  profile: {
    // MobileAppUserProfileController — PATCH mobile/users/me/profile
    async update(input: UpdateProfileInput): Promise<CurrentUser> {
      const raw = await request<RawCurrentUser>('mobile/users/me/profile', {
        method: 'PATCH',
        body: {
          fullName: input.fullName,
          email: input.email,
          dateOfBirth: input.dateOfBirth,
          gender: input.gender,
          // `UpdateAppUserProfileRequestDto.areaId` is numeric; the app's is a string id.
          areaId: input.areaId !== undefined ? Number(input.areaId) : undefined,
          areaCode: input.areaCode,
        },
      });
      return mapCurrentUser(raw);
    },

    // PUT mobile/users/me/selfie (multipart, field name `file`). The response is a signed
    // selfie URL, not the user — re-fetch `me` for the current profile shape.
    async uploadSelfie(uri: string): Promise<CurrentUser> {
      const form = new FormData();
      const name = uri.split('/').pop() ?? 'selfie.jpg';
      const type = name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
      // React Native's FormData accepts this file descriptor shape.
      form.append('file', { uri, name, type } as unknown as Blob);
      await request<unknown>('mobile/users/me/selfie', { method: 'PUT', form });
      return mapCurrentUser(await request<RawCurrentUser>('mobile/auth/me'));
    },

    // MobileAppUserEmailController — POST mobile/users/me/email/send-verification
    sendEmailVerification: () =>
      request<void>('mobile/users/me/email/send-verification', { method: 'POST' }),
  },

  reference: {
    // MobileReferenceController — GET mobile/reference/areas
    areas: async () => (await request<RawArea[]>('mobile/reference/areas')).map(mapArea),
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
     * `POST mobile/orders`, which also holds capacity, so it cannot stand in for a preview.
     * The checkout screens that used to call this now create the real order (`pass.tsx`
     * multiplies the public per-tier price for its running subtotal instead; `review.tsx`
     * creates the order itself for the authoritative total) — see those files.
     */
    previewPrice: () => notImplemented('Order price preview'),

    // MobileOrdersController — POST mobile/orders/validate-guests. The endpoint only takes a
    // phone number per guest; name/tierId are collected for `create` but not sent here.
    validateGuests: (eventId: string, guests: OrderGuestInput[]) =>
      request<GuestValidationResult>('mobile/orders/validate-guests', {
        method: 'POST',
        body: { eventId, guests: guests.map((g) => ({ phoneNumber: g.phoneNumber })) },
      }),

    // POST mobile/orders/validate-promo-code
    validatePromoCode: (items, promoCode) =>
      request<PromoValidationResult>('mobile/orders/validate-promo-code', {
        method: 'POST',
        body: { items, promoCode },
      }),

    // POST mobile/orders → 201 first time, 200 on identical retry
    create: (input: CreateOrderInput) =>
      request<OrderDetail>('mobile/orders', { method: 'POST', body: input }),

    // GET mobile/orders/:orderId
    detail: (orderId) => request<OrderDetail>(`mobile/orders/${orderId}`),

    // GET mobile/orders
    list: (cursor, limit) =>
      request<CursorPage<OrderSummary>>('mobile/orders', {
        query: { cursor: cursor ?? undefined, limit },
      }),

    // POST mobile/orders/:orderId/cancel
    cancel: (orderId) =>
      request<OrderDetail>(`mobile/orders/${orderId}/cancel`, { method: 'POST' }),
  },

  payments: {
    // MobilePaymentsController (path `mobile/orders/:orderId/payment`) — POST .../initiate
    initiate: (orderId) =>
      request<PaymentIntent>(`mobile/orders/${orderId}/payment/initiate`, { method: 'POST' }),

    // GET mobile/orders/:orderId/payment/status
    status: (orderId) => request<PaymentStatus>(`mobile/orders/${orderId}/payment/status`),

    // MobilePaymentRetriesController — POST mobile/orders/:orderId/retry-payment
    retry: (orderId) =>
      request<PaymentIntent>(`mobile/orders/${orderId}/retry-payment`, { method: 'POST' }),
  },

  tickets: {
    // MobileTicketsController — GET mobile/tickets
    list: (params) =>
      request<CursorPage<Ticket>>('mobile/tickets', {
        query: {
          statuses: params?.statuses,
          cursor: params?.cursor ?? undefined,
          limit: params?.limit,
        },
      }),

    // GET mobile/tickets/:ticketId
    detail: (ticketId) => request<Ticket>(`mobile/tickets/${ticketId}`),

    // POST mobile/tickets/:ticketId/claim
    claim: (ticketId) => request<Ticket>(`mobile/tickets/${ticketId}/claim`, { method: 'POST' }),

    /**
     * PENDING BACKEND — the rotating entry pass has no endpoint. `MobileTicketsController`
     * exposes list / detail / claim only. Expected shape is `EntryPass` in `../types`.
     */
    entryPass: () => notImplemented('Rotating entry pass'),
  },

  account: {
    // MobileAppUserAccountLifecycleController (path `mobile/users/me`) — GET .../deletion-preview
    deletionPreview: () =>
      request<AccountDeletionPreview>('mobile/users/me/deletion-preview'),

    // POST mobile/users/me/deletion/otp/request
    requestDeletionOtp: () =>
      request<OtpRequested>('mobile/users/me/deletion/otp/request', { method: 'POST' }),

    // DELETE mobile/users/me. `confirmForfeit` is sent unconditionally: the delete screen
    // already warns unconditionally that active tickets are forfeited before this fires.
    delete: (code, reason) =>
      request<void>('mobile/users/me', {
        method: 'DELETE',
        body: { otpCode: code, confirmForfeit: true, reason },
      }),
  },
};
