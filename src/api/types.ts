/**
 * Domain types mirroring the NestJS backend DTOs at `../sukun-backend` (branch `staging`):
 *   - `src/api/public/events/dto/**`
 *   - `src/api/mobile/{auth,users,orders,tickets,payments,account-lifecycle,reference}/dto/**`
 *
 * Money is always a decimal string in EGP, exactly as the backend sends it. Never parse it
 * to a float for display — see `formatEgp` in `src/lib/format.ts`.
 */

/* ------------------------------------------------------------------ enums */

/** `modules/app-users/enums/app-user-status.enum.ts` */
export type AppUserStatus = 'pending_profile' | 'active' | 'suspended' | 'deleted';

/** `modules/app-users/enums/app-user-gender.enum.ts` */
export type AppUserGender = 'male' | 'female' | 'prefer_not_to_say';

/** `modules/orders/enums/order-status.enum.ts` */
export type OrderStatus =
  'awaiting_payment' | 'paid' | 'failed' | 'expired' | 'cancelled' | 'refunded';

/** `modules/tickets/enums/ticket-status.enum.ts` */
export type TicketStatus = 'pending_claim' | 'active' | 'voided' | 'refunded';

/** `modules/tickets/enums/ticket-usage-status.enum.ts` */
export type TicketUsageStatus =
  'usable' | 'pending_claim' | 'selfie_required' | 'profile_incomplete' | 'voided' | 'refunded';

/** `modules/tickets/enums/ticket-source.enum.ts` */
export type TicketSource = 'order' | 'invitation';

/** `ListPublicEventsQueryDto` PUBLIC_STATE_VALUES */
export type PublicEventState =
  | 'draft'
  | 'published'
  | 'on_sale'
  | 'sold_out'
  | 'sales_closed'
  | 'live'
  | 'completed'
  | 'cancelled';

/** States accepted by `ListPublicEventsQueryDto`; draft events are never public. */
export type PublicEventQueryState = Exclude<PublicEventState, 'draft'>;

/* ------------------------------------------------------------------ user */

export interface Area {
  id: string;
  code: string;
  name: string;
}

/** `AppUserAreaResponseDto` as returned by the mobile API. */
export interface LiveArea {
  id: number;
  code: string;
  name: string;
}

/** `MobileCurrentUserResponseDto` */
export interface CurrentUser {
  id: string;
  phoneNumber: string;
  fullName: string | null;
  email: string | null;
  emailVerified: boolean;
  dateOfBirth: string | null;
  gender: AppUserGender | null;
  area: Area | null;
  selfieUploaded: boolean;
  selfieUrl: string | null;
  selfieExpiresAt: string | null;
  /** Consent to Sukun marketing messages on WhatsApp — Meta requires an explicit opt-in. */
  marketingOptIn: boolean;
  profileComplete: boolean;
  status: AppUserStatus;
}

/** App-facing profile update. The live adapter converts `areaId` to the numeric wire id. */
export interface UpdateProfileInput {
  fullName?: string;
  email?: string;
  dateOfBirth?: string;
  gender?: AppUserGender;
  areaId?: string;
  areaCode?: string;
  marketingOptIn?: boolean;
}

/* ------------------------------------------------------------------ auth */

/** `OtpRequestedResponseDto` */
export interface OtpRequested {
  sent: boolean;
  expiresInSeconds: number;
  resendAfterSeconds: number;
}

/** `MobileSessionTokensResponseDto` */
export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresInSeconds: number;
  refreshTokenExpiresInSeconds: number;
}

/** `MobileCurrentUserResponseDto` as returned by the mobile API. */
export interface LiveCurrentUser extends Omit<CurrentUser, 'area'> {
  area: LiveArea | null;
}

/** `UpdateAppUserProfileRequestDto` on the wire. */
export interface LiveUpdateProfileInput {
  fullName?: string;
  email?: string;
  dateOfBirth?: string;
  gender?: AppUserGender;
  areaId?: number;
  areaCode?: string;
  marketingOptIn?: boolean;
}

/** `UserProjectionDto`, returned inside OTP authentication responses. */
export interface UserProjection {
  id: string;
  phoneNumber: string;
  status: AppUserStatus;
  profileComplete: boolean;
  emailVerified: boolean;
}

/** `MobileAuthenticatedResponseDto` */
export interface Authenticated {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresInSeconds: number;
  refreshTokenExpiresInSeconds: number;
  user: UserProjection;
  isNewUser: boolean;
}

/** `AppUserSelfieResponseDto` */
export interface SelfieResponse {
  selfieUrl: string;
  expiresAt: string;
  selfieUploaded: boolean;
  profileComplete: boolean;
  status: AppUserStatus;
}

/** `SendEmailVerificationResponseDto` */
export interface EmailVerificationSent {
  queued: boolean;
  expiresInSeconds: number;
}

/** `VerifyEmailResponseDto` */
export interface EmailVerificationResult {
  verified: boolean;
}

/** `PublicEventMetaResponseDto` */
export interface EventMeta {
  title: string;
  tagline: string | null;
  coverImageUrl: string | null;
  startDate: string;
  endDate: string;
  venueName: string | null;
}

/* ---------------------------------------------------------------- events */

/** `PublicEventListItemResponseDto` */
export interface EventListItem {
  id: string;
  slug: string;
  title: string;
  tagline: string | null;
  coverImageUrl: string | null;
  state: PublicEventQueryState;
  startDate: string;
  endDate: string;
  venueName: string | null;
  priceFromEgp: string | null;
  tags: string[];
  isSoldOut: boolean;
}

/** `PublicEventDayResponseDto` */
export interface EventDay {
  id: string;
  dayDate: string;
  label: string | null;
  startsAt: string;
  endsAt: string;
  gatesOpenAt: string | null;
}

/** `PublicEventTierDayResponseDto` */
export interface EventTierDay {
  id: string;
  dayDate: string;
  label: string | null;
}

/** `PublicEventTierResponseDto` */
export interface EventTier {
  id: string;
  name: string;
  description: string | null;
  priceEgp: string;
  availabilityStatus:
    'available' | 'expired' | 'inactive' | 'not_yet_open' | 'quantity_limit_reached' | 'sold_out';
  isPurchasable: boolean;
  available: number;
  quantityRemaining: number | null;
  days: EventTierDay[];
}

/** `PublicEventDetailVenueDto` */
export interface EventVenue {
  name: string | null;
  address: string | null;
  latitude: string | null;
  longitude: string | null;
}

export interface EventGalleryItem {
  id: string;
  url: string;
  label: string | null;
  altText: string | null;
  orderIndex: number;
}

/** `PublicEventDetailResponseDto` */
export interface EventDetail {
  id: string;
  slug: string;
  title: string;
  tagline: string | null;
  descriptionHtml: string;
  coverImageUrl: string | null;
  state: PublicEventState;
  startDate: string;
  endDate: string;
  venue: EventVenue | null;
  tags: string[];
  whatToBring: string | null;
  terms: string | null;
  cancellationPolicy: string | null;
  vatEnabled: boolean;
  maxTicketsPerOrder: number;
  salesOpenAt: string | null;
  salesCloseAt: string | null;
  days: EventDay[];
  gallery: EventGalleryItem[];
  documents: { id: string; label: string | null; url: string; orderIndex: number }[];
  youtubeLinks: string[];
  tiers: EventTier[];
  priceFromEgp: string | null;
}

export interface ListEventsQuery {
  cursor?: string | null;
  limit?: number;
  state?: PublicEventQueryState[];
  tag?: string[];
  upcoming?: boolean;
  startsFrom?: string;
  startsTo?: string;
  endsFrom?: string;
  endsTo?: string;
  salesCloseFrom?: string;
  salesCloseTo?: string;
}

/** Wire DTO for `PublicEventDetailResponseDto`. */
export interface LiveEventDetail extends Omit<EventDetail, 'tiers' | 'documents'> {
  documents: { id: string; label: string | null; url: string; orderIndex: number }[];
  tiers: (Omit<EventTier, 'availabilityStatus'> & {
    availabilityStatus:
      'available' | 'expired' | 'inactive' | 'not_yet_open' | 'quantity_limit_reached' | 'sold_out';
  })[];
}

/* ---------------------------------------------------------------- orders */

/** `CreateOrderGuestRequestDto` */
export interface OrderGuestInput {
  phoneNumber: string;
  name: string;
  tierId: string;
}

/** `CreateOrderRequestDto` */
export interface CreateOrderInput {
  eventId: string;
  /**
   * The tier the buyer is taking for themselves, or null when every ticket in the order is for
   * someone else - which is the shape once you already hold a ticket for the event.
   */
  buyerTierId: string | null;
  items: { tierId: string; quantity: number }[];
  guests: OrderGuestInput[];
  promoCode?: string;
}

/** `MobileOrderItemResponseDto` */
export interface OrderItem {
  tierId: string;
  quantity: number;
  unitPriceEgp: string;
  lineTotalEgp: string;
}

/** `MobileOrderGuestResponseDto` */
export interface OrderGuest {
  phoneNumber: string;
  name: string;
  tierId: string;
}

/** `MobileOrderDetailResponseDto` */
export interface OrderDetail {
  id: string;
  orderNumber: string;
  eventId: string;
  status: OrderStatus;
  buyerTierId: string | null;
  subtotalEgp: string;
  discountEgp: string;
  netEgp: string;
  vatRate: string;
  vatEgp: string;
  totalEgp: string;
  currency: string;
  holdExpiresAt: string;
  createdAt: string;
  items: OrderItem[];
  guests: OrderGuest[];
  /**
   * Present only on the create response. Creating an order already opens a Paymob intention, so
   * the sheet can be presented straight from here; calling `payments.initiate` for the same order
   * is rejected with `PAYMENT_CONFIRMATION_PENDING` because that intention is already active.
   */
  payment?: PaymentIntent | null;
}

/** `MobileOrderSummaryResponseDto` */
export interface OrderSummary {
  id: string;
  orderNumber: string;
  eventId: string;
  status: OrderStatus;
  totalEgp: string;
  currency: string;
  holdExpiresAt: string;
  createdAt: string;
}

/**
 * `GuestValidationIssueResponseDto`. `error` is a server-side code; the app maps it to copy
 * in `src/lib/errors.ts`. Note that no code ever discloses whether a phone number belongs to
 * a registered user — see rule 4 in CLAUDE.md.
 */
export interface GuestValidationIssue {
  guestIndex: number;
  error: string;
}

/** `GuestValidationIssueResponseDto` on the wire. */
export interface LiveGuestValidationIssue {
  guestIndex: number;
  error:
    'INVALID_PHONE_NUMBER' | 'DUPLICATE_IN_ORDER' | 'SAME_AS_BUYER' | 'GUEST_ALREADY_HAS_TICKET';
}

/** `ValidateGuestRequestDto` */
export interface GuestValidationInput {
  phoneNumber: string;
}

/** `ValidateGuestsResponseDto` */
export interface GuestValidationResult {
  valid: boolean;
  issues: GuestValidationIssue[];
}

/** `ValidatePromoCodeResponseDto` */
export interface PromoValidationResult {
  valid: boolean;
  code: string;
  discountAmountEgp: string;
  discountAppliedEgp: string;
  fullyApplied: boolean;
  items: { tierId: string; discountAmountEgp: string }[];
}

/**
 * A server-computed price preview for the checkout review screen.
 *
 * NOT a backend DTO: the staging API prices an order only at `POST /orders`. The mock
 * computes this the same way the server does so the review screen can show a total before
 * the order exists. When live, this is implemented by creating the order (which returns the
 * authoritative figures) — never by adding client-side arithmetic.
 */
export interface PricePreview {
  subtotalEgp: string;
  discountEgp: string;
  netEgp: string;
  vatRate: string;
  vatEgp: string;
  totalEgp: string;
  currency: string;
  promoCode: string | null;
}

/* --------------------------------------------------------------- tickets */

export interface TicketEvent {
  id: string;
  slug: string;
  title: string;
  coverImageUrl: string | null;
  venueName: string | null;
  venueLat: number | null;
  venueLng: number | null;
}

export interface TicketDay {
  id: string;
  date: string;
  startsAt: string;
  gatesOpenAt: string | null;
}

/** `MobileTicketResponseDto` */
export interface Ticket {
  id: string;
  ticketNumber: string;
  status: TicketStatus;
  usageStatus: TicketUsageStatus;
  source: TicketSource;
  event: TicketEvent;
  tier: { id: string; name: string };
  days: TicketDay[];
  holderName: string;
  orderNumber: string | null;
  purchasedBy: { name: string; isSelf: boolean } | null;
  issuedAt: string;
}

/**
 * The rotating entry QR payload.
 *
 * PENDING BACKEND — there is no entry-pass endpoint on `staging` yet
 * (`MobileTicketsController` exposes list / detail / claim only). The mock issues a signed-
 * looking payload that rotates on `refreshAfterSeconds` so the screen, its timer, and its
 * rotation behaviour are all real. Wire to the endpoint when it lands.
 */
export interface EntryPass {
  ticketId: string;
  payload: string;
  issuedAt: string;
  expiresAt: string;
  refreshAfterSeconds: number;
}

/* -------------------------------------------------------------- payments */

/** `PaymentInitiateResponseDto` */
export interface PaymentIntent {
  paymentId: string;
  provider: 'paymob';
  presentationMode: string;
  clientSecret: string;
  publicKey: string;
  providerIntentionId: string;
  providerOrderId: string | null;
  amountEgp: string;
  currency: string;
  expiresAt: string;
}

/** `PaymentStatusResponseDto` */
export interface PaymentStatus {
  orderStatus: OrderStatus;
  paymentStatus:
    | 'creating'
    | 'pending'
    | 'provider_status_unknown'
    | 'captured'
    | 'failed'
    | 'expired'
    | 'refunded'
    | 'voided';
  ticketsIssued: number;
  paidAt: string | null;
}

/* ----------------------------------------------------- account lifecycle */

/** `AccountDeletionPreviewResponseDto` */
export interface AccountDeletionPreview {
  affectedEvents: { id: string; title: string; startsAt: string; ticketCount: number }[];
  activeTicketCount: number;
  requiresForfeitConfirmation: boolean;
  pendingPaymentOrderCount: number;
  deletionBlockedByPendingPayment: boolean;
  dataRetainedDays: number;
  ticketsRestoredAfterAccountRestore: boolean;
}

/** Wire DTO for `MobileTicketResponseDto`, including its optional properties. */
export interface LiveTicket {
  id: string;
  ticketNumber: string;
  status: TicketStatus;
  usageStatus: TicketUsageStatus;
  source: TicketSource;
  event: {
    id: string;
    slug: string;
    title: string;
    coverImageUrl: string | null;
    venueName: string | null;
    venueLat: number | null;
    venueLng: number | null;
  };
  tier: { id: string; name: string };
  days: { id: string; date: string; startsAt: string; gatesOpenAt: string | null }[];
  holderName: string;
  orderNumber: string | null;
  purchasedBy: { name: string; isSelf: boolean } | null;
  issuedAt: string;
}

/** `ConfirmAccountRestorationRequestDto` */
export interface AccountRestorationInput {
  phoneNumber: string;
  otpCode: string;
}

/* ------------------------------------------------------------ pagination */

export interface CursorPage<T> {
  data: T[];
  meta: {
    limit: number;
    hasNextPage: boolean;
    nextCursor: string | null;
  };
}
