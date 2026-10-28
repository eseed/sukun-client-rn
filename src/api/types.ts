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

/**
 * `modules/tickets/enums/claim-availability.enum.ts`. A granted ticket takes its seat when it is
 * claimed, so it can be claimed only while the shop could sell its tier.
 */
export type ClaimAvailability = 'available' | 'sold_out' | 'not_on_sale';

/** `modules/invitations/types/guest-ticket-context.interface.ts` PlusOneGuestStatus */
export type PlusOneGuestStatus = 'waiting' | 'claimed' | 'declined';

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

/**
 * `AppConfigResponseDto` from `public/app-config`: what the app is allowed to do, answered
 * before anyone signs in so the Welcome screen can read it.
 *
 * Per platform because the two stores want opposite things, and the app applies the one that
 * matches the device it is running on. See `src/stores/flags.ts`.
 */
export interface AppConfig {
  allowGuestBrowsing: {
    ios: boolean;
    android: boolean;
  };
  /**
   * Per-platform force update, set by admins from the dashboard. Optional because a backend
   * from before it existed does not send it, and that has to read as "nothing forced".
   * See `src/lib/force-update.ts`.
   */
  forceUpdate?: {
    ios: ForceUpdateRule;
    android: ForceUpdateRule;
  };
}

/** `ForceUpdateRuleDto`: `minimumVersion` is null whenever `enabled` is false. */
export interface ForceUpdateRule {
  enabled: boolean;
  minimumVersion: string | null;
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
  /** A children's pass (told by its name): a child holds it, with a name only. Missing: false. */
  isChildren?: boolean;
  /**
   * The pass at every group size that reaches a group discount step, priced by the server: the
   * tickets subtotal, the discount and the tickets total after it (before any VAT added on top).
   * Missing or empty: no group discount. Display only; the cart preview is what an order costs.
   */
  groupPrices?: EventTierGroupPrice[];
}

/** `PublicGroupQuoteResponseDto`: a mix of passes priced as a group, before VAT. Display only. */
export interface GroupQuote {
  ticketCount: number;
  subtotalEgp: string;
  percent: string | null;
  minTickets: number | null;
  discountEgp: string;
  ticketsTotalEgp: string;
  nextTier: GroupDiscountTier | null;
}

/** `PublicEventTierGroupPriceResponseDto` */
export interface EventTierGroupPrice {
  quantity: number;
  percent: string;
  subtotalEgp: string;
  discountEgp: string;
  ticketsTotalEgp: string;
}

/**
 * `GroupDiscountTierResponseDto`: an order with at least `minTickets` tickets takes `percent`
 * (`"15.00"`) off its tickets.
 */
export interface GroupDiscountTier {
  minTickets: number;
  percent: string;
}

/**
 * `GroupDiscountBreakdownResponseDto`: the group discount a cart or an order took for its number of
 * tickets, in place of a promo. Its amount is the pricing's `discountEgp`, repeated here.
 */
export interface GroupDiscountBreakdown {
  percent: string;
  minTickets: number;
  ticketCount: number;
  eligibleSubtotalEgp: string;
  discountEgp: string;
  /** The next step up, null at the top (and always on an order). */
  nextTier: GroupDiscountTier | null;
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
  /**
   * The event's tier and extra prices already contain VAT, so checkout adds nothing on top and
   * the VAT shown is the part of the total that is tax. Only meaningful with `vatEnabled`.
   */
  vatInclusive: boolean;
  /** The event's VAT rate as a PERCENT string, e.g. `"14.00"`. Not the cart's `"0.1400"`. */
  vatRate: string;
  /**
   * Group discount steps, ascending by `minTickets`. Empty or missing: none. Display only: the
   * cart preview prices them, never together with a promo code. The backend offers them to app
   * carts from client revision 4 (`MOBILE_CLIENT_REVISION`).
   */
  groupDiscounts?: GroupDiscountTier[];
  maxTicketsPerOrder: number;
  salesOpenAt: string | null;
  salesCloseAt: string | null;
  days: EventDay[];
  gallery: EventGalleryItem[];
  documents: { id: string; label: string | null; url: string; orderIndex: number }[];
  youtubeLinks: string[];
  /**
   * The admin's published content blocks, in the admin's order. Missing on a backend from
   * before them: read as none (`normalizeEventDetail` in `src/api/live/content-blocks.ts`).
   */
  contentBlocks?: EventContentBlock[];
  tiers: EventTier[];
  priceFromEgp: string | null;
}

/* -------------------------------------------------------- content blocks */

/** `EventContentBlockType` */
export type EventContentBlockType =
  'faq' | 'inclusions' | 'sponsors' | 'logistics' | 'accessibility';

/**
 * `PublicEventContentBlockBaseResponseDto`. `body` on every block is the admin's Markdown,
 * rendered and sanitised to a small HTML subset by the backend; show it with `MarkdownText`.
 */
interface EventContentBlockBase {
  id: string;
  /** The heading the admin typed; null shows the kind's own heading. */
  title: string | null;
}

/** `PublicEventContentFaqItemResponseDto` */
export interface EventContentFaqItem {
  question: string;
  answer: string;
}

/** `PublicEventContentInclusionItemResponseDto` */
export interface EventContentInclusionItem {
  label: string;
  description?: string;
}

/**
 * `PublicEventContentSponsorItemResponseDto`. `tier` is free text the admin types ("Presenting
 * partner"). `link` is mirrored from the DTO but never shown: sponsors are not tappable
 * (owner's call, 2026-10-17).
 */
export interface EventContentSponsorItem {
  name: string;
  logoUrl?: string;
  link?: string;
  tier?: string;
}

/** `PublicEventContentFaqResponseDto` */
export interface EventContentFaqBlock extends EventContentBlockBase {
  type: 'faq';
  body: string | null;
  items: EventContentFaqItem[];
}

/** `PublicEventContentInclusionsResponseDto` */
export interface EventContentInclusionsBlock extends EventContentBlockBase {
  type: 'inclusions';
  body: string | null;
  items: EventContentInclusionItem[];
}

/** `PublicEventContentSponsorsResponseDto` */
export interface EventContentSponsorsBlock extends EventContentBlockBase {
  type: 'sponsors';
  body: string | null;
  items: EventContentSponsorItem[];
}

/**
 * `PublicEventContentLogisticsResponseDto`. `addonId` is the linked add-on while it is switched
 * on, else null: resolve it against the event's add-on catalogue, never price it here.
 */
export interface EventContentLogisticsBlock extends EventContentBlockBase {
  type: 'logistics';
  body: string;
  addonId: string | null;
}

/** `PublicEventContentAccessibilityResponseDto` */
export interface EventContentAccessibilityBlock extends EventContentBlockBase {
  type: 'accessibility';
  body: string;
}

export type EventContentBlock =
  | EventContentFaqBlock
  | EventContentInclusionsBlock
  | EventContentSponsorsBlock
  | EventContentLogisticsBlock
  | EventContentAccessibilityBlock;

/* ------------------------------------------------------------- schedules */

/** Published public schedule projection for an Event. */
export interface PublicEventSchedule {
  eventId: string;
  days: ScheduleDay[];
  stages: ScheduleStage[];
  practiceTypes: SchedulePracticeType[];
  blocks: ScheduleBlock[];
}

export interface ScheduleDay {
  id: string;
  label: string | null;
  dayDate: string;
  startsAt: string;
  endsAt: string;
  sortOrder?: number;
}

export interface ScheduleStage {
  id: string;
  name: string;
  description?: string | null;
  sortOrder?: number;
}

export interface SchedulePracticeType {
  id: string;
  name: string;
  sortOrder?: number;
}

export interface ScheduleFacilitator {
  id: string;
  name: string;
  imageUrl?: string | null;
  bio?: string | null;
}

export interface ScheduleMedia {
  id: string;
  url: string;
  altText: string | null;
  orderIndex: number;
}

export interface ScheduleBlock {
  id: string;
  eventId: string;
  eventDayId: string;
  stageId: string;
  practiceTypeId: string | null;
  title: string;
  descriptionHtml: string | null;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  eventDay: ScheduleDay;
  stage: ScheduleStage;
  practiceType: SchedulePracticeType | null;
  facilitators: ScheduleFacilitator[];
  media: ScheduleMedia[];
}

export interface ScheduleConflict {
  blockId: string;
  title: string;
  startAt: string;
  endAt: string;
}

export interface MyScheduleBlock extends ScheduleBlock {
  conflicts: ScheduleConflict[];
}

export interface MyScheduleQuery {
  limit?: number;
  cursor?: string | null;
  eventDayId?: string;
  stageId?: string;
  practiceTypeId?: string;
}

export interface MyScheduleResponse {
  eventId: string;
  blocks: MyScheduleBlock[];
  meta: CursorPage<never>['meta'];
}

export interface SaveScheduleBlockResponse {
  saved: boolean;
  conflicts: ScheduleConflict[];
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
  /**
   * Snapshotted per order. When true, `totalEgp` equals `netEgp` and `vatEgp` is the VAT already
   * inside it, shown for information, never added. Absent means false, the additive display.
   */
  vatInclusive?: boolean;
  totalEgp: string;
  currency: string;
  holdExpiresAt: string;
  createdAt: string;
  items: OrderItem[];
  guests: OrderGuest[];
  addons: OrderAddon[];
  /** The group discount the order took, snapshotted (its amount is `discountEgp`), or null. */
  groupDiscount?: GroupDiscountBreakdown | null;
  /** Children in the order: no number, each admitted with their guardian. */
  children?: { name: string; tierId: string }[];
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
  /** An admin opened entry QR codes ahead of the usual 12 hours (to try the flow). */
  entryQrOpenEarly: boolean;
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
  /**
   * The live addons themselves, as `GET mobile/tickets/:id/addons` answers, so a card names them.
   * `null` from a backend that predates the list: the card falls back to `addonCount`.
   */
  addons: TicketAddon[] | null;
  /**
   * Whether this ticket already has its room (one per person per event), so nothing offers it
   * another. `null` from a backend that predates the field: nothing is known either way.
   */
  hasAccommodation: boolean | null;
  /**
   * Children admitted on this ticket. They have no number or account, so their tickets reach
   * no list of their own: this is the only place they show. Empty when there are none.
   */
  children: TicketChild[];
  issuedAt: string;
  /** Set only on a granted ticket waiting to be claimed. */
  claimAvailability: ClaimAvailability | null;
  /** Set on a plus one's ticket: the first name of the guest bringing them. */
  invitedBy: { name: string } | null;
  /**
   * Set when this invitation lets its guest bring someone, who they name once their own ticket
   * is claimed. `guest` is who they named, or null while nobody is.
   */
  plusOne: { guest: PlusOneGuest | null } | null;
}

/** `MobileTicketChildResponseDto`: a child admitted on the guardian's ticket, a name only. */
export interface TicketChild {
  ticketId: string;
  name: string;
  tier: { id: string; name: string };
  addons: TicketAddon[];
}

/** The person a guest named as their plus one. */
export interface PlusOneGuest {
  name: string;
  /** E.164, as the guest entered it. */
  phoneE164: string;
  status: PlusOneGuestStatus;
}

/** `InvitePlusOneRequestDto` */
export interface InvitePlusOneInput {
  name: string;
  /** E.164. */
  phoneNumber: string;
}

/**
 * The rotating entry QR payload.
 */
export interface EntryPass {
  ticketId: string;
  payload: string;
  issuedAt: string;
  expiresAt: string;
  refreshAfterSeconds: number;
  /**
   * When the server issues the next code. Sent by newer backends, whose `expiresAt` is then
   * when to stop showing this code: a few seconds later, inside the gate's grace.
   */
  nextCodeAt?: string;
  /** The server's clock when it answered, to place its times on this phone's clock. */
  serverTime?: string;
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
    /** What the live backend reports for `provider_status_unknown`. */
    | 'confirming'
    | 'captured'
    | 'failed'
    | 'expired'
    | 'refunded'
    | 'voided';
  ticketsIssued: number;
  paidAt: string | null;
  /**
   * Why the last attempt failed, as a category, when the backend knows. Optional and nullable:
   * backends before it send nothing, and the screen falls back to its general copy. The name and
   * values are the backend's proposal and not final yet.
   */
  failureReason?: PaymentFailureReason | null;
}

/** See `PaymentStatus.failureReason`. Unknown values are read as `unknown`. */
export type PaymentFailureReason =
  'declined' | 'insufficient_funds' | 'authentication_failed' | 'expired_card' | 'unknown';

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
    entryQrOpenEarly?: boolean;
  };
  tier: { id: string; name: string };
  days: { id: string; date: string; startsAt: string; gatesOpenAt: string | null }[];
  holderName: string;
  orderNumber: string | null;
  purchasedBy: { name: string; isSelf: boolean } | null;
  /** Optional on the wire: a backend with addons switched off omits it entirely. */
  addonCount?: number;
  /** Optional on the wire: a backend from before tickets listed their addons omits these. */
  addons?: TicketAddon[];
  hasAccommodation?: boolean;
  children?: TicketChild[];
  issuedAt: string;
  /** Optional on the wire: a backend from before claims competed for seats omits these. */
  claimAvailability?: ClaimAvailability | null;
  invitedBy?: { name: string } | null;
  plusOne?: { guest: PlusOneGuest | null } | null;
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

/** Whether a transport option's place is where the bus picks guests up or drops them off. */
export type AddonTransportStopType = 'pickup' | 'drop_off';

/**
 * Where a transport option stops, on options, ticket extras and order lines alike. Both are
 * optional: a backend from before them, or an option with no place set, sends neither.
 */
export interface TransportStop {
  pickupPoint?: string | null;
  transportStopType?: AddonTransportStopType | null;
}

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
export interface TransportAddonOption extends AddonOptionBase, TransportStop {
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
  /** Null only for a child, who has no number. */
  phoneNumber: string | null;
  email: string | null;
  /** A child: no number, admitted with their guardian (owner's call, 2026-10-11). */
  isChild?: boolean;
  guardianCartAttendeeId?: string | null;
  guardianTicketId?: string | null;
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
  /**
   * When true, `totalEgp` equals `netEgp` and `vatEgp` is the VAT already inside it, shown for
   * information, never added. Absent means false, the additive display.
   */
  vatInclusive?: boolean;
  totalEgp?: string;
  /** Short-lived, roughly five minutes. Place Order needs the one from the preview shown. */
  pricingConfirmationToken: string | null;
  /**
   * Set when the cart's tickets reach a group discount step. It replaces the promo (`promo` is
   * null, a code cannot be applied) and `discountEgp` is its amount.
   */
  groupDiscount?: GroupDiscountBreakdown | null;
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
  guests: {
    /** Required for an adult; a child has none. */
    phoneNumber?: string;
    name: string;
    tierId: string;
    email?: string;
    /** A child on a children's pass, admitted with their guardian. */
    child?: boolean;
    /** A child's guardian: an adult guest of this request, by index (else the buyer's ticket). */
    guardianGuestIndex?: number;
    /** A child's guardian: a ticket the buyer already holds. */
    guardianTicketId?: string;
  }[];
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
export interface TicketAddon extends TransportStop {
  addonOptionId: string;
  type: AddonType;
  /**
   * The addon's own name ("Bus: Cairo → Sokhna"); `label` is its option's. Absent from a backend
   * that predates it, which leaves `label` to stand alone.
   */
  addonName?: string;
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
export interface OrderAddon extends TransportStop {
  orderAddonItemId: string;
  addonOptionId: string;
  type: AddonType;
  /** The addon the option belongs to. Optional: a backend from before it does not send it. */
  addonName?: string;
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

/* -------------------------------------------------------- rooms after purchase */

/** `MobileRoomOccupantResponseDto`. Named only when the order that bought the room named them. */
export interface RoomOccupant {
  ticketId: string;
  phoneNumber: string | null;
  displayName: string | null;
  isYou: boolean;
}

/** `MobileRoomRequiredAttachmentResponseDto`: a document the room asks its guests to upload. */
export interface RoomRequiredAttachment {
  /** The slug sent back with the upload (`national_id`). */
  key: string;
  label: string;
  /** False marks a document that may be skipped and added later. */
  required: boolean;
  /** Images or PDFs accepted together for this document. Absent from older backends: one. */
  maxFiles?: number;
}

/** `MobileRoomAttachmentResponseDto`: a document uploaded for the whole room. */
export interface RoomAttachment {
  key: string;
  label: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
  /** Signed read link for the private document, valid a day. Re-fetch the room for a fresh one. */
  url: string;
}

/**
 * `MobileRoomResponseDto`: a room this account has a stake in (`GET mobile/rooms`): one it paid
 * for, or one its own ticket is in.
 *
 * A room needs one person in it at checkout; its other places may stay empty, and its buyer fills
 * them later with people who hold a ticket to the event (`POST mobile/rooms/:roomId/occupants`).
 * Any guest in the room, or its buyer, uploads the documents the room asks for, once for the whole
 * room (`POST mobile/rooms/:roomId/attachments`).
 */
export interface BuyerRoom {
  roomId: string;
  eventId: string;
  /** Null on a room the account did not buy (its ticket is in it). */
  orderId: string | null;
  orderNumber: string | null;
  addonName: string;
  label: string;
  roomType: string;
  /** Set by the team once rooms are allocated. */
  roomNumber?: string | null;
  nights: number;
  checkInDate: string;
  checkInTime: string;
  checkOutDate: string;
  checkOutTime: string;
  capacity: number;
  status: TicketAddonRoom['status'];
  occupants: RoomOccupant[];
  openPlaces: number;
  /** True for the account that paid for the room; only it can add roommates. */
  isBuyer?: boolean;
  canAddOccupants: boolean;
  requiredAttachments: RoomRequiredAttachment[];
  attachments: RoomAttachment[];
  /** The team checked the documents. */
  attachmentsValid: boolean;
  attachmentsUploadedAt: string | null;
  /** True while a document the room asks for is still missing and the event is not over. */
  canUploadAttachments: boolean;
}

/**
 * One file picked on the phone for a room document. `uri` is a local file (the photo library,
 * the camera, or the Files app); `mimeType` and `size` are what the picker reported.
 */
export interface PickedDocument {
  uri: string;
  name: string;
  mimeType: string;
  size: number;
}

/** A document upload: each file with the key of the document it is for. */
export interface RoomAttachmentUpload {
  key: string;
  file: PickedDocument;
}

/* ----------------------------------------------------------- notifications */

/**
 * `MobileNotificationItemDto`: one push an admin sent this account, as the in-app inbox keeps it
 * (`GET mobile/notifications`, newest first, kept for 12 months).
 *
 * `deepLink` is the backend's own event link (`sukunclient://events/<slug>`) or null. It is validated
 * before it is followed, exactly as a push tap's is, so a malformed one does nothing.
 */
export interface AppNotification {
  id: string;
  title: string;
  body: string;
  /** The bare event link (`sukunclient://events/<slug>`), or null. */
  deepLink: string | null;
  /**
   * Where the admin chose a tap to land when it says more than the event page
   * (`sukunclient://events/<slug>/schedule`, `/stay`, `/extras`, `/addons/<id>`, `sukunclient://tickets`).
   * Absent from backends before landings; the app then follows `deepLink`.
   */
  landingLink?: string | null;
  /** When it was read, or null while unread. */
  readAt: string | null;
  createdAt: string;
}

export interface ListNotificationsQuery {
  /** Opaque, from the previous page's `meta.nextCursor`. A stale one is refused, INVALID_CURSOR. */
  cursor?: string | null;
  /** 1 to 100; the backend defaults to 20. */
  limit?: number;
}

/** `MobileUnreadCountDto` */
export interface NotificationUnreadCount {
  unreadCount: number;
}
