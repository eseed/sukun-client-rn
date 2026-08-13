import type { SukunApi } from '../contract';
import type {
  AccountDeletionPreview,
  Authenticated,
  CreateOrderInput,
  CurrentUser,
  CursorPage,
  EventListItem,
  EventMeta,
  EmailVerificationResult,
  EmailVerificationSent,
  GuestValidationInput,
  ListEventsQuery,
  OrderDetail,
  OrderSummary,
  OtpRequested,
  PaymentIntent,
  PaymentStatus,
  PromoValidationResult,
  SessionTokens,
  SelfieResponse,
  LiveArea,
  LiveCurrentUser,
  LiveEventDetail,
  LiveTicket,
  LiveUpdateProfileInput,
  LiveGuestValidationIssue,
  Ticket,
  UpdateProfileInput,
} from '../types';
import { ApiError, request } from './http';
import { normalizeEgyptianPhone } from '../../lib/phone';

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

function normalizeCurrentUser(user: LiveCurrentUser): CurrentUser {
  return {
    ...user,
    area: user.area ? { ...user.area, id: String(user.area.id) } : null,
  };
}

function normalizePhoneForRequest(phoneNumber: string): string {
  // Preserve invalid input so the backend returns its normal validation error and copy.
  return normalizeEgyptianPhone(phoneNumber) ?? phoneNumber;
}

function toLiveProfileInput(input: UpdateProfileInput): LiveUpdateProfileInput {
  const { areaId, areaCode, ...profile } = input;
  return {
    ...profile,
    ...(areaId !== undefined && areaId !== ''
      ? { areaId: Number(areaId) }
      : areaCode !== undefined && areaCode !== ''
        ? { areaCode }
        : {}),
  };
}

function normalizeTicket(ticket: LiveTicket): Ticket {
  return {
    ...ticket,
    event: {
      id: ticket.event.id,
      slug: ticket.event.slug,
      title: ticket.event.title,
      coverImageUrl: ticket.event.coverImageUrl ?? null,
      venueName: ticket.event.venueName ?? null,
      venueLat: ticket.event.venueLat ?? null,
      venueLng: ticket.event.venueLng ?? null,
    },
    days: ticket.days.map((day) => ({ ...day, gatesOpenAt: day.gatesOpenAt ?? null })),
    orderNumber: ticket.orderNumber ?? null,
    purchasedBy: ticket.purchasedBy ?? null,
  };
}

export const liveApi: SukunApi = {
  auth: {
    // MobileAuthController — POST mobile/auth/otp/request
    requestOtp: (phoneNumber) =>
      request<OtpRequested>('mobile/auth/otp/request', {
        method: 'POST',
        body: { phoneNumber: normalizePhoneForRequest(phoneNumber) },
        auth: false,
      }),

    // POST mobile/auth/otp/verify
    verifyOtp: (phoneNumber, code, deviceId) =>
      request<Authenticated>('mobile/auth/otp/verify', {
        method: 'POST',
        body: { phoneNumber: normalizePhoneForRequest(phoneNumber), code, deviceId },
        auth: false,
      }),

    requestAccountRestorationOtp: (phoneNumber) =>
      request<void>('mobile/auth/account-restoration/otp/request', {
        method: 'POST',
        body: { phoneNumber: normalizePhoneForRequest(phoneNumber) },
        auth: false,
      }),

    confirmAccountRestoration: (input) =>
      request<Authenticated>('mobile/auth/account-restoration/confirm', {
        method: 'POST',
        body: { ...input, phoneNumber: normalizePhoneForRequest(input.phoneNumber) },
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
    me: () => request<LiveCurrentUser>('mobile/auth/me').then(normalizeCurrentUser),

    // POST mobile/auth/logout → 204
    logout: () => request<void>('mobile/auth/logout', { method: 'POST' }),

    // POST mobile/auth/logout-all → 204
    logoutAll: () => request<void>('mobile/auth/logout-all', { method: 'POST' }),
  },

  profile: {
    // MobileAppUserProfileController — PATCH mobile/users/me/profile
    update: (input: UpdateProfileInput) =>
      request<LiveCurrentUser>('mobile/users/me/profile', {
        method: 'PATCH',
        body: toLiveProfileInput(input),
      }).then(normalizeCurrentUser),

    getSelfie: () => request<SelfieResponse>('mobile/users/me/selfie'),

    // PUT mobile/users/me/selfie (multipart, field name `file`). The response is a signed
    // selfie URL, not the user — re-fetch `me` for the current profile shape.
    async uploadSelfie(uri: string): Promise<CurrentUser> {
      const form = new FormData();
      const name = uri.split('/').pop() ?? 'selfie.jpg';
      const type = name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
      // React Native's FormData accepts this file descriptor shape.
      form.append('file', { uri, name, type } as unknown as Blob);
      await request<SelfieResponse>('mobile/users/me/selfie', { method: 'PUT', form });
      return request<LiveCurrentUser>('mobile/auth/me').then(normalizeCurrentUser);
    },

    // MobileAppUserEmailController — POST mobile/users/me/email/send-verification
    sendEmailVerification: () =>
      request<EmailVerificationSent>('mobile/users/me/email/send-verification', { method: 'POST' }),

    verifyEmail: (token) =>
      request<EmailVerificationResult>('mobile/users/me/email/verify', {
        method: 'POST',
        body: { token },
      }),
  },

  reference: {
    // MobileReferenceController — GET mobile/reference/areas
    areas: async () => {
      const result = await request<LiveArea[]>('mobile/reference/areas', { auth: false });
      return result.map((area) => ({ ...area, id: String(area.id) }));
    },
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
          startsFrom: query?.startsFrom,
          startsTo: query?.startsTo,
          endsFrom: query?.endsFrom,
          endsTo: query?.endsTo,
          salesCloseFrom: query?.salesCloseFrom,
          salesCloseTo: query?.salesCloseTo,
        },
      }),

    // GET public/events/:identifier (uuid or slug)
    detail: (identifier) =>
      request<LiveEventDetail>(`public/events/${encodeURIComponent(identifier)}`, { auth: false }),

    meta: (identifier) =>
      request<EventMeta>(`public/events/${encodeURIComponent(identifier)}/meta`, { auth: false }),
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

    // MobileOrdersController — POST orders/validate-guests
    validateGuests: (eventId: string, guests: GuestValidationInput[]) =>
      request<{ valid: boolean; issues: LiveGuestValidationIssue[] }>('mobile/orders/validate-guests', {
        method: 'POST',
        body: {
          eventId,
          guests: guests.map(({ phoneNumber }) => ({
            phoneNumber: normalizePhoneForRequest(phoneNumber),
          })),
        },
      }).then((result) => ({
        valid: result.valid,
        issues: result.issues.map(({ guestIndex, error }) => ({
          guestIndex,
          error: {
            INVALID_PHONE_NUMBER: 'GUEST_PHONE_INVALID',
            DUPLICATE_IN_ORDER: 'GUEST_DUPLICATE',
            SAME_AS_BUYER: 'GUEST_IS_BUYER',
            GUEST_ALREADY_HAS_TICKET: 'GUEST_ALREADY_HAS_TICKET',
          }[error],
        })),
      })),

    // POST mobile/orders/validate-promo-code
    validatePromoCode: (items, promoCode) =>
      request<PromoValidationResult>('mobile/orders/validate-promo-code', {
        method: 'POST',
        body: { items, promoCode },
      }),

    // POST mobile/orders → 201 first time, 200 on identical retry
    create: (input: CreateOrderInput) =>
      request<OrderDetail>('mobile/orders', {
        method: 'POST',
        body: {
          ...input,
          guests: input.guests.map((guest) => ({
            ...guest,
            phoneNumber: normalizePhoneForRequest(guest.phoneNumber),
          })),
        },
      }),

    // GET orders/:orderId
    detail: (orderId) => request<OrderDetail>(`mobile/orders/${orderId}`),

    // GET mobile/orders
    list: (cursor, limit) =>
      request<CursorPage<OrderSummary>>('mobile/orders', {
        query: { cursor: cursor ?? undefined, limit },
      }),

    // POST orders/:orderId/cancel
    cancel: (orderId) =>
      request<OrderDetail>(`mobile/orders/${orderId}/cancel`, { method: 'POST' }),
  },

  payments: {
    // MobilePaymentsController (path `mobile/orders/:orderId/payment`) — POST .../initiate
    initiate: (orderId) =>
      request<PaymentIntent>(`mobile/orders/${orderId}/payment/initiate`, { method: 'POST' }),

    // GET orders/:orderId/payment/status
    status: (orderId) => request<PaymentStatus>(`mobile/orders/${orderId}/payment/status`),

    // MobilePaymentRetriesController — POST mobile/orders/:orderId/retry-payment
    retry: (orderId) =>
      request<PaymentIntent>(`mobile/orders/${orderId}/retry-payment`, { method: 'POST' }),
  },

  tickets: {
    // MobileTicketsController — GET mobile/tickets
    list: (params) =>
      request<CursorPage<LiveTicket>>('mobile/tickets', {
        query: {
          statuses: params?.statuses,
          cursor: params?.cursor ?? undefined,
          limit: params?.limit,
        },
      }).then((page) => ({ ...page, data: page.data.map(normalizeTicket) })),

    // GET tickets/:ticketId
    detail: (ticketId) =>
      request<LiveTicket>(`mobile/tickets/${ticketId}`).then(normalizeTicket),

    // POST tickets/:ticketId/claim
    claim: (ticketId) =>
      request<LiveTicket>(`mobile/tickets/${ticketId}/claim`, { method: 'POST' }).then(normalizeTicket),

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
    requestDeletionOtp: async () => {
      await request<void>('mobile/users/me/deletion/otp/request', { method: 'POST' });
    },

    // DELETE mobile/users/me
    delete: (code, reason, confirmForfeit) =>
      request<void>('mobile/users/me', {
        method: 'DELETE',
        body: { otpCode: code, reason, confirmForfeit },
      }),
  },
};
