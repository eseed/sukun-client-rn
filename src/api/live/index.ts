import type { SukunApi } from '../contract';
import { Platform } from 'react-native';
import { File } from 'expo-file-system';
import type {
  AccountDeletionPreview,
  AddonDetail,
  AddonSummary,
  Authenticated,
  Cart,
  CartAddonInput,
  CartPreview,
  CartRecipientLookup,
  CurrentUser,
  CursorPage,
  EventListItem,
  EventMeta,
  EmailVerificationResult,
  EmailVerificationSent,
  EntryPass,
  GuestValidationInput,
  ListEventsQuery,
  OrderDetail,
  OrderSummary,
  OtpRequested,
  PaymentIntent,
  PaymentStatus,
  ReplaceCartTicketsInput,
  SessionTokens,
  SelfieResponse,
  LiveArea,
  LiveCurrentUser,
  LiveEventDetail,
  LiveTicket,
  LiveUpdateProfileInput,
  LiveGuestValidationIssue,
  Ticket,
  TicketAddon,
  TicketAddonContext,
  UpdateProfileInput,
} from '../types';
import { ApiError, request } from './http';
import { normalizePhone } from '../../lib/phone';

/**
 * Live backend implementation. Endpoint paths and DTO shapes are verified against the staging
 * OpenAPI schema (`GET /api/docs-json` on the deployed backend) — see each method. One method
 * has no endpoint yet and throws a clearly-labelled error rather than guessing a URL — see
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
  return normalizePhone(phoneNumber) ?? phoneNumber;
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
      venueMapUrl: ticket.event.venueMapUrl ?? null,
    },
    days: ticket.days.map((day) => ({ ...day, gatesOpenAt: day.gatesOpenAt ?? null })),
    orderNumber: ticket.orderNumber ?? null,
    purchasedBy: ticket.purchasedBy ?? null,
    // Absent on builds served by a backend that predates ticket addon counts, and on any build
    // running with addons switched off, where "no addons" is the honest answer.
    addonCount: ticket.addonCount ?? 0,
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

    // POST mobile/auth/otp/verify. The response contains a projection; fetch the full profile
    // with the new access token so onboarding has the same shape in live and mock mode.
    // A number whose account was deleted registers again through this same call, as a new
    // user: deletion released the number, so nothing is brought back.
    async verifyOtp(phoneNumber, code, deviceId): Promise<Authenticated> {
      const raw = await request<Authenticated>('mobile/auth/otp/verify', {
        method: 'POST',
        body: { phoneNumber: normalizePhoneForRequest(phoneNumber), code, deviceId },
        auth: false,
      });
      await request<LiveCurrentUser>('mobile/auth/me', {
        auth: true,
        token: raw.accessToken,
      });
      return raw;
    },

    // POST mobile/auth/refresh
    refresh: (refreshToken) =>
      request<SessionTokens>('mobile/auth/refresh', {
        method: 'POST',
        body: { refreshToken },
        auth: false,
      }),

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
      if (Platform.OS !== 'web') {
        // Not the `{ uri, name, type }` descriptor React Native's own networking accepts: Expo
        // replaces global `fetch`, and its implementation reads a part's bytes rather than
        // resolving a URI — "`uri` is not supported for React Native's FormData", as its own
        // `convertFormData` puts it. An `expo-file-system` File carries the bytes it wants.
        form.append('file', new File(uri) as unknown as Blob);
      } else {
        const response = await fetch(uri);
        if (!response.ok)
          throw new ApiError(
            'FILE_READ_FAILED',
            'The selfie file could not be read.',
            response.status,
          );
        form.append('file', await response.blob(), name);
      }
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

  addons: {
    // PublicAddonsController — GET public/events/:identifier/addons
    list: (identifier) =>
      request<{ data: AddonSummary[] }>(`public/events/${encodeURIComponent(identifier)}/addons`, {
        auth: false,
      }).then((response) => response.data),

    // GET public/events/:identifier/addons/:addonId
    detail: (identifier, addonId) =>
      request<AddonDetail>(
        `public/events/${encodeURIComponent(identifier)}/addons/${encodeURIComponent(addonId)}`,
        { auth: false },
      ),
  },

  carts: {
    // MobileCheckoutCartController — POST mobile/carts. Creates or reuses the draft cart.
    create: (eventId) => request<Cart>('mobile/carts', { method: 'POST', body: { eventId } }),

    // GET mobile/carts/:cartId
    get: (cartId) => request<Cart>(`mobile/carts/${cartId}`),

    // PUT mobile/carts/:cartId/tickets — full replacement, and it clears the cart's draft addons.
    replaceTickets: (cartId, input: ReplaceCartTicketsInput) =>
      request<Cart>(`mobile/carts/${cartId}/tickets`, {
        method: 'PUT',
        body: {
          ...input,
          guests: input.guests.map((guest) => ({
            ...guest,
            phoneNumber: normalizePhoneForRequest(guest.phoneNumber),
          })),
        },
      }),

    // PUT mobile/carts/:cartId/addons — full replacement of every addon line.
    replaceAddons: (cartId, addons: CartAddonInput[]) =>
      request<Cart>(`mobile/carts/${cartId}/addons`, { method: 'PUT', body: { addons } }),

    // POST mobile/carts/:cartId/recipient-lookup
    lookupRecipients: (cartId, phoneNumbers) =>
      request<{ results: CartRecipientLookup[] }>(`mobile/carts/${cartId}/recipient-lookup`, {
        method: 'POST',
        body: { phoneNumbers: phoneNumbers.map(normalizePhoneForRequest) },
      }).then((response) => response.results),

    // PUT mobile/carts/:cartId/promo-code. The field is `code`, not `promoCode`.
    applyPromo: (cartId, code) =>
      request<Cart>(`mobile/carts/${cartId}/promo-code`, { method: 'PUT', body: { code } }),

    // DELETE mobile/carts/:cartId/promo-code
    removePromo: (cartId) =>
      request<Cart>(`mobile/carts/${cartId}/promo-code`, { method: 'DELETE' }),

    // POST mobile/carts/:cartId/preview — advisory, reserves nothing.
    preview: (cartId) => request<CartPreview>(`mobile/carts/${cartId}/preview`, { method: 'POST' }),

    /**
     * POST mobile/carts/:cartId/place-order.
     *
     * Answers 409 `CART_PRICING_CHANGED` when the price moved under the token, and 409
     * `CART_ACTIVE_ORDER_EXISTS` when this cart already has a pending order. Both are handled by
     * the review screen, never retried silently.
     */
    placeOrder: (cartId, pricingConfirmationToken) =>
      request<OrderDetail>(`mobile/carts/${cartId}/place-order`, {
        method: 'POST',
        body: { pricingConfirmationToken },
      }),

    // DELETE mobile/carts/:cartId
    abandon: (cartId) => request<Cart>(`mobile/carts/${cartId}`, { method: 'DELETE' }),
  },

  orders: {
    // MobileOrdersController — POST orders/validate-guests. Advisory; reserves nothing.
    validateGuests: (eventId: string, guests: GuestValidationInput[]) =>
      request<{ valid: boolean; issues: LiveGuestValidationIssue[] }>(
        'mobile/orders/validate-guests',
        {
          method: 'POST',
          body: {
            eventId,
            guests: guests.map(({ phoneNumber }) => ({
              phoneNumber: normalizePhoneForRequest(phoneNumber),
            })),
          },
        },
      ).then((result) => ({
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
    detail: (ticketId) => request<LiveTicket>(`mobile/tickets/${ticketId}`).then(normalizeTicket),

    // POST tickets/:ticketId/claim
    claim: (ticketId) =>
      request<LiveTicket>(`mobile/tickets/${ticketId}/claim`, { method: 'POST' }).then(
        normalizeTicket,
      ),

    /**
     * PENDING BACKEND — `MobileTicketsController` exposes list / detail / claim only, so this
     * route answers 404 today. It is wired anyway rather than thrown locally on purpose: the
     * day the backend serves it at this path, installed apps start rendering real QRs with no
     * new build. Until then the 404 reaches the screen as `isEntryPassNotIssued`, which shows
     * the "check back" placeholder instead of an error. Response shape: `EntryPass` in
     * `../types` — the endpoint must match that contract, path included.
     */
    entryPass: (ticketId) => request<EntryPass>(`mobile/tickets/${ticketId}/entry-pass`),

    // GET mobile/tickets/:ticketId/addons
    addons: (ticketId, includeRefunded) =>
      request<{ data: TicketAddon[] }>(`mobile/tickets/${ticketId}/addons`, {
        query: { includeRefunded: includeRefunded ? 'true' : undefined },
      }).then((response) => response.data),

    // GET mobile/tickets/:ticketId/addon-context
    addonContext: (ticketId) =>
      request<TicketAddonContext>(`mobile/tickets/${ticketId}/addon-context`),
  },

  account: {
    // MobileAppUserAccountLifecycleController (path `mobile/users/me`) — GET .../deletion-preview
    deletionPreview: () => request<AccountDeletionPreview>('mobile/users/me/deletion-preview'),

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
