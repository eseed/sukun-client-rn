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
  /** The venue's Google Maps link, pasted by an admin. Open it; never parse it. */
  mapUrl: string | null;
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
  addons: OrderAddon[];
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
  venueMapUrl: string | null;
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
  /** Live addons attached to this ticket, so a card can say "3 add-ons attached". */
  addonCount: number;
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
    /** No payment attempt exists yet: the backend sends `payment?.status ?? ''`. */
    | ''
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
    venueMapUrl: string | null;
  };
  tier: { id: string; name: string };
  days: { id: string; date: string; startsAt: string; gatesOpenAt: string | null }[];
  holderName: string;
  orderNumber: string | null;
  purchasedBy: { name: string; isSelf: boolean } | null;
  /** Optional on the wire: a backend with addons switched off omits it entirely. */
  addonCount?: number;
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

/* ------------------------------------------------------------------ addons */

/** `modules/addons/enums/addon-type.enum.ts` */
export type AddonType = 'accommodation' | 'meal' | 'transport' | 'other';

/** `modules/addons/enums/addon-transport-direction.enum.ts` */
export type AddonTransportDirection = 'one_way' | 'round_trip';

/** `AddonPublicAvailability` / `AddonPublicPriceWindowStatus` */
export type AddonAvailability = 'available' | 'unavailable';

/** `modules/addons/enums/ticket-owned-addon-status.enum.ts` */
export type TicketAddonStatus =
  | 'active'
  | 'partially_refunded'
  | 'pending_ticket_replacement'
  | 'partially_pending_ticket_replacement'
  | 'refunded'
  | 'cancelled'
  | 'voided';

/** `PublicAddonNextPriceWindowResponseDto` */
export interface AddonNextPriceWindow {
  name: string;
  priceEgp: string;
  startsAt: string;
}

/**
 * `PublicAddonOptionBaseResponseDto`.
 *
 * `availableQuantity` is null while the server is still withholding the count: the event's
 * `showStockWhenPercentageReaches` decides when scarcity goes public. Null means "do not show a
 * number", never "none left" — a sold-out option always reports 0.
 */
export interface AddonOptionBase {
  id: string;
  label: string;
  priceEgpNow: string | null;
  priceWindowStatus: AddonAvailability;
  priceWindowName: string | null;
  priceWindowEndsAt: string | null;
  nextPriceWindow: AddonNextPriceWindow | null;
  availability: AddonAvailability;
  availableQuantity: number | null;
}

/** `PublicAccommodationAddonOptionResponseDto` */
export interface AccommodationAddonOption extends AddonOptionBase {
  roomType: string;
  nights: number;
  occupancy: number;
  checkInDate: string;
  checkInTime: string;
  checkOutDate: string;
  checkOutTime: string;
}

/** `PublicTransportAddonOptionResponseDto` */
export interface TransportAddonOption extends AddonOptionBase {
  transportDirection: AddonTransportDirection;
  departureDate: string;
  departureTime: string;
  returnDate?: string | null;
  returnTime?: string | null;
}

export type AddonOption = AddonOptionBase | AccommodationAddonOption | TransportAddonOption;

/** `PublicAddonSummaryResponseDto` — enough to render a browse card without fetching options. */
export interface AddonSummary {
  id: string;
  type: AddonType;
  name: string;
  description: string | null;
  featuredImageUrl: string | null;
  fromPriceEgpNow: string | null;
  optionCount: number;
  priceWindowName: string | null;
  availability: AddonAvailability;
  availableQuantity: number | null;
}

/** `PublicAddonResponseDto` */
export interface AddonDetail {
  id: string;
  type: AddonType;
  name: string;
  description: string | null;
  featuredImageUrl: string | null;
  options: AddonOption[];
}

/* --------------------------------------------------------------- cart */

/** `CheckoutCartStatus` */
export type CartStatus = 'draft' | 'converted' | 'abandoned' | 'expired';

/** `CheckoutCartAttendeeResponseDto`. `cartAttendeeId` is the addon assignment target. */
export interface CartAttendee {
  cartAttendeeId: string;
  cartTicketItemId: string;
  attendeeType: 'buyer' | 'guest';
  name: string;
  phoneNumber: string;
  email: string | null;
}

/**
 * Exactly one target, never both — `cartAttendeeId` for someone in this cart, `ticketId` for
 * someone who already holds a ticket to the event.
 */
export interface CartAddonRecipient {
  cartAttendeeId?: string;
  ticketId?: string;
}

export interface CartAddonAssignmentInput extends CartAddonRecipient {
  quantity?: number;
}

/** One line of `ReplaceCartAddonsRequest`. Accommodation sends `rooms`, everything else sends
 *  `assignments`; `quantity` is rooms for accommodation and units for everything else. */
export interface CartAddonInput {
  optionId: string;
  quantity: number;
  assignments?: CartAddonAssignmentInput[];
  rooms?: { occupants: CartAddonRecipient[] }[];
}

/** `CheckoutCartAddonAssignmentResponseDto` */
export interface CartAddonAssignment {
  id: string;
  cartAttendeeId: string | null;
  ticketId: string | null;
  roomGroupId: string | null;
  quantity: number;
}

/** `CheckoutCartAddonResponseDto` */
export interface CartAddon {
  cartAddonItemId: string;
  optionId: string;
  quantity: number;
  type: AddonType | null;
  assignments: CartAddonAssignment[];
  currentPrice: string | null;
  available: number | null;
}

/** `CheckoutCartTicketResponseDto` */
export interface CartTicket {
  cartTicketItemId: string;
  tierId: string;
  quantity: number;
}

/** `CheckoutCartPricingLineResponseDto` */
export interface CartPricingLine {
  tierId?: string;
  addonOptionId?: string;
  tierName?: string | null;
  addonName?: string | null;
  optionLabel?: string | null;
  quantity: number;
  unitPriceEgp?: string | null;
  lineTotalEgp?: string | null;
}

/** `CheckoutCartPromoBreakdownResponseDto` */
export interface CartPromoBreakdown {
  code: string;
  scope: 'ticket_only' | 'cart' | 'addon_option';
  tierId?: string | null;
  addonOptionId?: string | null;
  configuredDiscountEgp: string;
  eligibleSubtotalEgp: string;
  discountEgp: string;
}

/**
 * `CheckoutCartPricingResponseDto`. Every figure here is the server's; the app renders them and
 * never recomputes one (CLAUDE.md rule 7).
 */
export interface CartPricing {
  status: 'complete' | 'unavailable';
  ticketsSubtotalEgp?: string;
  addonsSubtotalEgp?: string;
  subtotalEgp?: string;
  ticketLines: CartPricingLine[];
  addonLines: CartPricingLine[];
  promo: CartPromoBreakdown | null;
  discountEgp?: string;
  netEgp?: string;
  vatRate?: string;
  vatEgp?: string;
  totalEgp?: string;
  /** Short-lived, roughly five minutes. Place Order needs the one from the preview shown. */
  pricingConfirmationToken: string | null;
}

/** `CheckoutCartPricingIssueResponseDto` — advisory, arrives inside a 200. */
export interface CartPricingIssue {
  code: string;
  path?: string;
  details?: Record<string, unknown>;
}

/** `CheckoutCartValidationResponseDto` */
export interface CartValidation {
  canPlaceOrder: boolean;
  validatedAt: string;
  issues: CartPricingIssue[];
}

/** `CheckoutCartPromoAdjustmentResponseDto` — the server dropped a promo that stopped applying. */
export interface CartPromoAdjustment {
  removed: true;
  reason: string;
  previousPromoCode: string;
}

/** `CheckoutCartResponseDto` */
export interface Cart {
  id: string;
  eventId: string;
  status: CartStatus;
  tickets: CartTicket[];
  attendees: CartAttendee[];
  addons: CartAddon[];
  validation: CartValidation | null;
  promoAdjustment?: CartPromoAdjustment;
  createdAt: string;
  updatedAt: string;
}

/** `CheckoutCartPreviewResponseDto` */
export interface CartPreview {
  cartId: string;
  canPlaceOrder: boolean;
  attendees: CartAttendee[];
  addonAssignments: CartAddonAssignment[];
  issues: CartPricingIssue[];
  pricing: CartPricing;
}

/** `ReplaceCartTicketsRequest` */
export interface ReplaceCartTicketsInput {
  buyerTierId?: string | null;
  items: { tierId: string; quantity: number }[];
  guests: { phoneNumber: string; name: string; tierId: string; email?: string }[];
}

/**
 * `CartRecipientLookupResultResponseDto`.
 *
 * `eligible: false` covers both "no account" and "account but no ticket" — the server gives them
 * the same answer on purpose, so nothing here reveals whether a number is registered (CLAUDE.md
 * rule 4). No name is ever returned; the app labels people from the device's own contacts.
 */
export interface CartRecipientLookup {
  phoneNumber: string;
  eligible: boolean;
  ticketId: string | null;
  hasAccommodation: boolean;
}

/* -------------------------------------------------- addons after purchase */

/** `MobileTicketAddonRoomResponseDto` */
export interface TicketAddonRoom {
  roomType: string;
  nights: number;
  checkInDate: string;
  checkInTime: string;
  checkOutDate: string;
  checkOutTime: string;
  status: 'active' | 'reassignment_required' | 'cancelled' | 'refunded';
  capacity: number;
}

/** `MobileTicketAddonResponseDto` */
export interface TicketAddon {
  addonOptionId: string;
  type: AddonType;
  label: string;
  transportDirection: AddonTransportDirection | null;
  departureDate: string | null;
  departureTime: string | null;
  returnDate: string | null;
  returnTime: string | null;
  quantity: number;
  status: TicketAddonStatus;
  issuedAddonStatus: 'active' | 'cancelled' | 'refunded' | 'voided';
  originalQuantity: number;
  activeQuantity: number;
  pendingTicketReplacementQuantity: number;
  refundedQuantity: number;
  cancelledQuantity: number;
  voidedQuantity: number;
  /** Read-only until the P1 scanner exists. Never mutated from the app. */
  redemptionsAllowed: number;
  redemptionsUsed: number;
  room: TicketAddonRoom | null;
}

/** `MobileTicketAddonContextResponseDto` — the entry point for buying extras against a ticket. */
export interface TicketAddonContext {
  ticketId: string;
  eventId: string;
  existing: {
    addons: TicketAddon[];
    hasAccommodation: boolean;
  };
  catalog: AddonDetail[];
}

/**
 * `MobileOrderAddonRecipientResponseDto`.
 *
 * `displayName` is set only when this order named the person. A recipient who already held their
 * own ticket comes back nameless with the phone the buyer picked them by, and the app labels them
 * from the device's contacts — the server never sources a stranger's name.
 */
export interface OrderAddonRecipient {
  ticketId: string;
  phoneNumber: string | null;
  displayName: string | null;
  roomGroupId: string | null;
}

/** `MobileOrderAddonResponseDto` */
export interface OrderAddon {
  orderAddonItemId: string;
  addonOptionId: string;
  type: AddonType;
  label: string;
  transportDirection: AddonTransportDirection | null;
  departureDate: string | null;
  departureTime: string | null;
  returnDate: string | null;
  returnTime: string | null;
  unitPriceEgp: string;
  lineTotalEgp: string;
  quantity: number;
  originalQuantity: number;
  activeQuantity: number;
  pendingTicketReplacementQuantity: number;
  cancelledQuantity: number;
  voidedQuantity: number;
  status: TicketAddonStatus;
  recipients: OrderAddonRecipient[];
  room: TicketAddonRoom | null;
}
