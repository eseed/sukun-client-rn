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
  | 'awaiting_payment'
  | 'paid'
  | 'failed'
  | 'expired'
  | 'cancelled'
  | 'refunded';

/** `modules/tickets/enums/ticket-status.enum.ts` */
export type TicketStatus = 'pending_claim' | 'active' | 'voided' | 'refunded';

/** `modules/tickets/enums/ticket-usage-status.enum.ts` */
export type TicketUsageStatus =
  | 'usable'
  | 'pending_claim'
  | 'selfie_required'
  | 'profile_incomplete'
  | 'voided'
  | 'refunded';

/** `modules/tickets/enums/ticket-source.enum.ts` */
export type TicketSource = 'order' | 'invitation';

/** `ListPublicEventsQueryDto` PUBLIC_STATE_VALUES */
export type PublicEventState =
  | 'published'
  | 'on_sale'
  | 'sold_out'
  | 'sales_closed'
  | 'live'
  | 'completed'
  | 'cancelled';

/* ------------------------------------------------------------------ user */

export interface Area {
  id: string;
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
  profileComplete: boolean;
  status: AppUserStatus;
}

/** `UpdateAppUserProfileRequestDto` — partial PATCH */
export interface UpdateProfileInput {
  fullName?: string;
  email?: string;
  dateOfBirth?: string;
  gender?: AppUserGender;
  areaId?: string;
  areaCode?: string;
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
  expiresIn: number;
}

/** `MobileAuthenticatedResponseDto` */
export interface Authenticated {
  tokens: SessionTokens;
  user: CurrentUser;
}

/* ---------------------------------------------------------------- events */

/** `PublicEventListItemResponseDto` */
export interface EventListItem {
  id: string;
  slug: string;
  title: string;
  tagline: string | null;
  coverImageUrl: string | null;
  state: PublicEventState;
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
  availabilityStatus: string;
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
  caption: string | null;
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
  venue: EventVenue;
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
  documents: { id: string; title: string; url: string }[];
  youtubeLinks: string[];
  tiers: EventTier[];
  priceFromEgp: string | null;
}

export interface ListEventsQuery {
  cursor?: string | null;
  limit?: number;
  state?: PublicEventState[];
  tag?: string[];
  upcoming?: boolean;
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
  buyerTierId: string;
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
  buyerTierId: string;
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
  provider: string;
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
  paymentStatus: 'pending' | 'processing' | 'succeeded' | 'failed';
  ticketsIssued: number;
  paidAt: string | null;
}

/* ----------------------------------------------------- account lifecycle */

/** `AccountDeletionPreviewResponseDto` */
export interface AccountDeletionPreview {
  affectedEvents: { id: string; title: string; startDate: string; ticketCount: number }[];
  activeTicketCount: number;
  canDelete: boolean;
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
