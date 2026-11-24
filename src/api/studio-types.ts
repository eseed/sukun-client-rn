// Sukun Studio (classes) API types, from sukun-backend origin/staging 278c218c (2026-11-24).
// Money is a 2-decimal EGP string ("500.00"); vatRate is "0.0000". Instants are ISO-8601 UTC
// strings; *On / bookingClassDate / date fields are YYYY-MM-DD in Africa/Cairo.

// ---------------------------------------------------------------------------------------------
// Scalars and enums
// ---------------------------------------------------------------------------------------------

export type Uuid = string;
export type IsoDateTime = string;
/** YYYY-MM-DD, Africa/Cairo calendar date. */
export type CairoDate = string;
/** Decimal string, 2 places, EGP. */
export type MoneyEgp = string;

export type ClassBookingStatus =
  'confirmed' | 'pending_payment' | 'cancelled' | 'late_cancelled' | 'removed' | 'released';
export type ClassBookingAttendance = 'unmarked' | 'present' | 'absent';
export type ClassBookingAttendanceMethod = 'staff_manual' | 'system_auto_absent' | 'room_qr';
export type ClassBookingChannel = 'admin' | 'mobile' | 'public';
export type ClassSessionStatus = 'scheduled' | 'cancelled' | 'completed';
export type StudioBookingAction =
  'book_now' | 'contact_studio' | 'full' | 'cancelled' | 'ended' | 'unavailable';
export type StudioBookingUnavailableReason =
  | 'session_cancelled'
  | 'session_ended'
  | 'session_started'
  | 'schedule_unavailable'
  | 'staff_only_booking'
  | 'branch_online_booking_disabled'
  | 'session_full'
  | 'booking_window_not_open'
  | 'booking_window_closed';
export type StudioExploreIntentKey = 'classes' | 'workshops';
export type StudioOnlinePaymentRule = 'optional' | 'mandatory' | 'never';
export type PackageType = 'class_package' | 'day_pass' | 'private_package';
export type PackageBaseType = 'passes' | 'unlimited';
export type PackageSessionType = 'regular' | 'private' | 'both';
export type PackageValidityUnit = 'day' | 'week' | 'month' | 'term';
export type PackageStartRule = 'next_session' | 'purchase_date' | 'beginning_of_cycle';
export type CustomerPackageStatus =
  'incomplete' | 'active' | 'exhausted' | 'expired' | 'frozen' | 'cancelled';
export type CustomerPackageSource = 'online' | 'front_desk' | 'in2_import' | 'complimentary';
export type OrderStatus =
  | 'awaiting_payment'
  | 'draft'
  | 'paid'
  | 'on_account'
  | 'failed'
  | 'expired'
  | 'cancelled'
  | 'refunded';
/** Clients effectively only see 'none' or 'promo' (corporate is folded into 'none'). */
export type StudioDiscountKind = 'corporate' | 'promo' | 'manual' | 'none' | 'price_override';
export type StudioLegalDocumentKind = 'liability_waiver' | 'cancellation_policy';
export type StudioLegalAcceptanceChannel = 'mobile' | 'web' | 'import';
export type StudioLegalAcceptanceSource = 'sukun' | 'in2';
export type ClassBookingInviteMode = 'host_pays' | 'friend_pays';
export type ClassBookingInviteStatus =
  'booked' | 'held' | 'accepted' | 'declined' | 'expired' | 'removed';
export type ClassInviteDisplayStatus =
  'booked' | 'waiting_for_payment' | 'declined' | 'expired' | 'removed' | 'cancelled';
export type MemberScheduleTab = 'upcoming' | 'in_progress' | 'past';
export type MemberScheduleDisplayStatus =
  | 'booked'
  | 'attended'
  | 'absent'
  | 'incomplete'
  | 'cancelled'
  | 'late_cancelled'
  | 'removed'
  | 'released';
export type MemberPackagesTab = 'current' | 'history';
export type MyClassBookingActionState = 'booked' | 'continue_booking';

// ---------------------------------------------------------------------------------------------
// Common envelopes and errors
// ---------------------------------------------------------------------------------------------

export interface CursorPageQuery {
  /** 1-100 (default 20) on me/*; 1-50 on studio/packages and ratings/pending. */
  limit?: number;
  cursor?: string;
}

export interface CursorList<T> {
  data: T[];
  nextCursor: string | null;
}

export interface CursorPageMeta {
  limit: number;
  hasNextPage: boolean;
  nextCursor: string | null;
}

export interface ApiErrorDetail {
  field: string;
  issue: string;
}

/** Global error body. Switch on `error` (the domain code). `message` is already translated. */
export interface ApiErrorResponse {
  statusCode: number;
  error: string;
  message: string;
  details: ApiErrorDetail[];
  requestId: string;
  timestamp: IsoDateTime;
  retryAfterSeconds?: number;
  /** Extra keys some exceptions carry (e.g. orderId on ORDER_NOT_PAYABLE_ON_WEB). */
  [extra: string]: unknown;
}

export type StudioErrorCode =
  // auth / generic
  | 'TOKEN_INVALID'
  | 'TOKEN_EXPIRED'
  | 'SESSION_REVOKED'
  | 'PROFILE_INCOMPLETE'
  | 'VALIDATION_ERROR'
  | 'TOO_MANY_REQUESTS'
  // setup / scheduling
  | 'BRANCH_NOT_FOUND'
  | 'CATEGORY_NOT_FOUND'
  | 'CLASS_SESSION_NOT_FOUND'
  | 'CLASS_SESSION_BRANCH_UNAVAILABLE'
  | 'CLASS_PAYLOAD_INVALID'
  // class bookings / room QR / invites
  | 'CLASS_BOOKING_NOT_FOUND'
  | 'CLASS_BOOKING_PAYLOAD_INVALID'
  | 'CLASS_BOOKING_FULL'
  | 'CLASS_BOOKING_ALREADY_EXISTS'
  | 'CLASS_BOOKING_SESSION_CLOSED'
  | 'CLASS_BOOKING_SESSION_STARTED'
  | 'CLASS_BOOKING_CLIENT_INELIGIBLE'
  | 'CLASS_BOOKING_PACKAGE_INELIGIBLE'
  | 'CLASS_BOOKING_PASSES_INSUFFICIENT'
  | 'CLASS_BOOKING_AGE_RESTRICTED'
  | 'CLASS_BOOKING_OWED_RESTRICTED'
  | 'CLASS_BOOKING_PAYMENT_REQUIRED'
  | 'CLASS_BOOKING_ONLINE_DISABLED'
  | 'CLASS_BOOKING_PREVIEW_STALE'
  | 'CLASS_BOOKING_IDEMPOTENCY_CONFLICT'
  | 'CLASS_BOOKING_STATE_CONFLICT'
  | 'ROOM_QR_INVALID'
  | 'ROOM_QR_NO_CLASS'
  | 'ROOM_QR_TOO_EARLY'
  | 'ROOM_QR_WINDOW_CLOSED'
  | 'ROOM_QR_WRONG_ROOM'
  | 'ROOM_QR_SELECTION_INVALID'
  | 'ROOM_QR_WALK_IN_DISABLED'
  | 'ROOM_QR_PACKAGE_REQUIRED'
  | 'ROOM_QR_TERMS_REQUIRED'
  | 'CLASS_INVITE_NOT_FOUND'
  | 'CLASS_INVITE_PAYLOAD_INVALID'
  | 'CLASS_INVITE_HOST_BOOKING_INELIGIBLE'
  | 'CLASS_INVITE_SELF'
  | 'CLASS_INVITE_FRIEND_ALREADY_BOOKED'
  | 'CLASS_INVITE_ALREADY_INVITED'
  | 'CLASS_INVITE_LIMIT_REACHED'
  | 'CLASS_INVITE_FRIEND_INELIGIBLE'
  | 'CLASS_INVITE_NOT_FOR_YOU'
  | 'CLASS_INVITE_STATE_CONFLICT'
  | 'CLASS_INVITE_IDEMPOTENCY_CONFLICT'
  // ratings
  | 'CLASS_RATING_BOOKING_NOT_FOUND'
  | 'CLASS_RATING_PAYLOAD_INVALID'
  | 'CLASS_RATING_NOT_ELIGIBLE'
  | 'CLASS_RATING_ALREADY_SUBMITTED'
  | 'CLASS_RATINGS_DISABLED'
  // legal
  | 'STUDIO_LEGAL_DOCUMENT_NOT_FOUND'
  | 'STUDIO_LEGAL_DOCUMENT_NOT_PUBLISHED'
  | 'STUDIO_LEGAL_ACCEPTANCE_REQUIRED'
  | 'STUDIO_LEGAL_VERSION_CHANGED'
  | 'STUDIO_LEGAL_IDENTITY_NOT_ELIGIBLE'
  // packages / checkout / promos
  | 'CUSTOMER_PACKAGE_NOT_FOUND'
  | 'CUSTOMER_PACKAGE_ADJUSTMENT_INVALID'
  | 'PACKAGE_NOT_FOUND'
  | 'PACKAGE_SESSION_NOT_PUBLIC'
  | 'PACKAGE_PRICE_QUOTE_INVALID'
  | 'STUDIO_ORDER_NOT_FOUND'
  | 'STUDIO_ORDER_INPUT_INVALID'
  | 'STUDIO_ORDER_TOTAL_CHANGED'
  | 'STUDIO_ORDER_IDEMPOTENCY_CONFLICT'
  | 'PROMO_CODE_INVALID'
  | 'PROMO_CODE_DISABLED'
  | 'PROMO_CODE_ALREADY_USED'
  | 'STUDIO_PROMO_NOT_YET_VALID'
  | 'STUDIO_PROMO_EXPIRED'
  | 'STUDIO_PROMO_ONLINE_ONLY'
  | 'STUDIO_PROMO_FIRST_TIME_BUYERS_ONLY'
  | 'STUDIO_PROMO_PER_USER_LIMIT_REACHED'
  | 'STUDIO_PROMO_NOT_ELIGIBLE_FOR_PACKAGE'
  // payments (shared with events)
  | 'ORDER_NOT_FOUND'
  | 'ORDER_NOT_PAYABLE'
  | 'ORDER_HOLD_EXPIRED'
  | 'ORDER_NOT_RETRYABLE'
  | 'PAYMENT_ALREADY_COMPLETED'
  | 'PAYMENT_CONFIRMATION_PENDING'
  | 'PAYMENT_METHOD_UNAVAILABLE'
  | 'PAYMENT_PROVIDER_ERROR'
  | 'PAYMENT_PROVIDER_UNAVAILABLE'
  | 'CORPORATE_RATE_CLIENT_REQUESTS_CLOSED';

// ---------------------------------------------------------------------------------------------
// Discovery: home, branches, categories, schedule, session detail
// ---------------------------------------------------------------------------------------------

export interface StudioNamedRef {
  id: Uuid;
  name: string;
}

export interface StudioBranchRef extends StudioNamedRef {
  /** '#RRGGBB' Sukun palette swatch, or null for the default accent. */
  colorHex: string | null;
}

/** GET public/studio/branches[/:id]; also MobileStudioHome.branches. */
export interface StudioBranch {
  id: Uuid;
  name: string;
  locationName: string | null;
  description: string | null;
  address: string | null;
  city: string | null;
  mapUrl: string | null;
  phoneE164: string | null;
  /** Cover image. */
  imageUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  isOnlineBookable: boolean;
  colorHex: string | null;
  sortOrder: number;
}

export interface StudioCategory {
  id: Uuid;
  name: string;
  imageUrl: string | null;
  sortOrder: number;
}

export interface StudioExploreIntent {
  key: StudioExploreIntentKey;
  label: string;
  available: boolean;
  categoryId: Uuid | null;
}

/** GET public/studio/home */
export interface PublicStudioHome {
  branches: StudioBranch[];
  categories: StudioCategory[];
  explore: StudioExploreIntent[];
  /** Currently always null. */
  studioDescription: string | null;
  discoverStudiosVisible: boolean;
  /** >= 1. 1 = first; N = before the Nth event card (after the last if fewer). */
  discoverStudiosPosition: number;
}

export interface MobileUpcomingClassBooking {
  bookingId: Uuid;
  sessionId: Uuid;
  bookingStatus: ClassBookingStatus;
  bookedFor: 'self';
  guestsCount: number;
  seatCount: number;
  packageName: string | null;
  isSessionsOwed: boolean;
  holdExpiresAt: IsoDateTime | null;
  bookedAt: IsoDateTime;
  /** 'Incomplete booking' | 'Booked with <pkg>' | 'Booked (Sessions owed)' | 'Booked' */
  displayStatusLabel: string;
  actionState: MyClassBookingActionState;
  title: string;
  startsAt: IsoDateTime;
  endsAt: IsoDateTime;
  durationMinutes: number;
  sessionStatus: ClassSessionStatus;
  levelLabel: string | null;
  branch: StudioBranchRef | null;
  room: StudioNamedRef | null;
  instructor: StudioNamedRef | null;
}

/** GET mobile/studio/home */
export interface MobileStudioHome extends PublicStudioHome {
  upcomingBookings: {
    /** At most 5. */
    items: MobileUpcomingClassBooking[];
    hasMore: boolean;
  };
}

/** GET public/studio/schedule query. */
export interface StudioScheduleQuery {
  weekStart?: CairoDate;
  branchId?: Uuid;
  categoryId?: Uuid;
  level?: string;
  /** HH:mm Cairo, inclusive. */
  fromTime?: string;
  /** HH:mm Cairo, inclusive. */
  toTime?: string;
}

export interface StudioScheduleSession {
  id: Uuid;
  classSeriesId: Uuid;
  startsAt: IsoDateTime;
  endsAt: IsoDateTime;
  title: string;
  durationMinutes: number;
  status: ClassSessionStatus;
  /** Configuration only: book only when bookingAction === 'book_now'. */
  clientBookingEnabled: boolean;
  bookingAction: StudioBookingAction;
  bookingUnavailableReason: StudioBookingUnavailableReason | null;
  contactMessage: string | null;
  instructor: StudioNamedRef | null;
  room: StudioNamedRef | null;
  branch: StudioBranchRef & { isOnlineBookable: boolean };
  categoryId: Uuid | null;
  category: StudioNamedRef | null;
  levelLabel: string | null;
  imageUrl: string | null;
}

/** GET public/studio/schedule (no auth). */
export interface StudioSchedule {
  weekStart: CairoDate;
  weekEnd: CairoDate;
  timezone: 'Africa/Cairo' | string;
  days: {
    date: CairoDate;
    hours: {
      /** 'HH:00' Cairo. */
      hour: string;
      sessions: StudioScheduleSession[];
    }[];
  }[];
}

export interface FacilitatorLink {
  label: string;
  url: string;
}

export interface ClassSessionInstructor {
  id: Uuid;
  slug: string;
  name: string;
  headline: string | null;
  bioHtml: string | null;
  photoUrl: string | null;
  links: FacilitatorLink[] | null;
  /** Country names in English (ISO 3166-1), e.g. 'Egypt'. */
  countries: string[];
}

export interface PublicClassSessionDetail {
  id: Uuid;
  classSeriesId: Uuid;
  title: string;
  description: string | null;
  occurrenceOn: CairoDate;
  startsAt: IsoDateTime;
  endsAt: IsoDateTime;
  durationMinutes: number;
  status: ClassSessionStatus;
  branch: {
    id: Uuid;
    name: string;
    city: string | null;
    address: string | null;
    mapUrl: string | null;
    colorHex: string | null;
  };
  room: StudioNamedRef | null;
  category: StudioNamedRef | null;
  instructor: ClassSessionInstructor | null;
  imageUrl: string | null;
  ageFrom: number | null;
  ageTo: number | null;
  levelLabel: string | null;
  clientBookingEnabled: boolean;
  bookingAction: StudioBookingAction;
  bookingUnavailableReason: StudioBookingUnavailableReason | null;
  contactMessage: string | null;
}

export interface MobileMyClassBooking {
  bookingId: Uuid;
  sessionId: Uuid;
  status: ClassBookingStatus;
  bookedFor: 'self';
  guestsCount: number;
  seatCount: number;
  packageName: string | null;
  isSessionsOwed: boolean;
  holdExpiresAt: IsoDateTime | null;
  bookedAt: IsoDateTime;
  displayStatusLabel: string;
  actionState: MyClassBookingActionState;
}

/** GET mobile/studio/sessions/:sessionId */
export interface MobileClassSessionDetail extends PublicClassSessionDetail {
  myBooking: MobileMyClassBooking | null;
}

// ---------------------------------------------------------------------------------------------
// Member area (mobile/studio/me/*)
// ---------------------------------------------------------------------------------------------

export interface MemberScheduleQuery extends CursorPageQuery {
  tab?: MemberScheduleTab;
}

export interface MemberScheduleItem {
  bookingId: Uuid;
  sessionId: Uuid;
  kind: 'class';
  title: string;
  startsAt: IsoDateTime;
  endsAt: IsoDateTime;
  durationMinutes: number;
  branch: { id: Uuid; name: string | null; colorHex: string | null };
  room: { id: Uuid; name: string | null };
  instructor: { id: Uuid; name: string | null };
  bookingStatus: ClassBookingStatus;
  sessionStatus: ClassSessionStatus;
  attendance: ClassBookingAttendance;
  displayStatus: MemberScheduleDisplayStatus;
  /** Only for payable 'incomplete' holds: pay orderId via mobile/orders/:orderId/payment/*. */
  resume: { orderId: Uuid; holdExpiresAt: IsoDateTime } | null;
}

/** GET mobile/studio/me/schedule */
export interface MemberScheduleResponse extends CursorList<MemberScheduleItem> {
  privateSessionsAvailability: 'not_integrated';
  legacyClassHistoryAvailability: 'not_integrated';
}

export interface MemberPackagesQuery extends CursorPageQuery {
  tab?: MemberPackagesTab;
}

export interface MemberPackageSummary {
  /** Customer-package id (the owned instance). */
  id: Uuid;
  /** Catalogue package id. */
  packageId: Uuid;
  /** Null = valid at every branch. */
  branchId: Uuid | null;
  name: string;
  packageType: PackageType;
  baseType: PackageBaseType;
  sessionType: PackageSessionType;
  netPriceEgp: MoneyEgp;
  currency: 'EGP';
  source: CustomerPackageSource;
  importedMembershipReference: string | null;
  purchasedAt: IsoDateTime;
  startsOn: CairoDate | null;
  expiresOn: CairoDate | null;
  status: CustomerPackageStatus;
  /** Null for unlimited. */
  passesTotal: number | null;
  passesUsed: number;
  passesRemaining: number | null;
}

/** GET mobile/studio/me/packages */
export type MemberPackageListResponse = CursorList<MemberPackageSummary>;

/** GET mobile/studio/me/packages/:id */
export interface MemberPackageDetail extends MemberPackageSummary {
  renew: {
    packageId: Uuid;
    branchId: Uuid | null;
    requiresBranchSelection: boolean;
  };
}

export interface MemberPackageUsageItem {
  bookingId: Uuid;
  sessionId: Uuid;
  title: string;
  startsAt: IsoDateTime;
}

/** GET mobile/studio/me/packages/:id/usage */
export type MemberPackageUsageListResponse = CursorList<MemberPackageUsageItem>;

export interface MemberPackageFreezeItem {
  id: Uuid;
  status: 'scheduled' | 'active' | 'ended';
  name: string;
  plannedDays: number;
  effectiveDays: number;
  startsOn: CairoDate;
  plannedEndsOn: CairoDate;
  actualEndsOn: CairoDate | null;
  endedEarlyAt: IsoDateTime | null;
  createdAt: IsoDateTime;
}

/** GET mobile/studio/me/packages/:id/freezes */
export type MemberPackageFreezeListResponse = CursorList<MemberPackageFreezeItem>;

/** GET mobile/studio/me/profile-summary */
export interface MemberProfileSummary {
  sessionsOwed: number;
  classesAttended: number;
  /** Total Studio debt across branches (late-cancel fees land here). */
  outstandingBalanceEgp: MoneyEgp;
  legacyClassHistoryAvailability: 'not_integrated';
  homeBranchId: Uuid | null;
  suggestedHomeBranchId: Uuid | null;
}

/** PUT mobile/studio/me/home-branch body. */
export interface SetHomeBranchRequest {
  branchId: Uuid;
}

/** PUT mobile/studio/me/home-branch response. */
export interface MemberHomeBranchResponse {
  homeBranchId: Uuid | null;
  suggestedHomeBranchId: Uuid | null;
}

// ---------------------------------------------------------------------------------------------
// Package catalogue
// ---------------------------------------------------------------------------------------------

/** GET mobile/studio/packages query. */
export interface StudioPackagesQuery {
  branchId?: Uuid;
  packageType?: PackageType;
  baseType?: PackageBaseType;
  search?: string;
  /** 1-50, default 20. */
  limit?: number;
  cursor?: string;
}

export interface StudioCatalogPackage {
  id: Uuid;
  name: string;
  secondaryName: string | null;
  description: string | null;
  packageType: PackageType;
  baseType: PackageBaseType;
  sessionType: PackageSessionType;
  passes: number | null;
  /** This client's own price (corporate rate already applied). */
  priceEgp: MoneyEgp;
  validityValue: number;
  validityUnit: PackageValidityUnit;
  termEndsOn: CairoDate | null;
  startRule: PackageStartRule;
  cycleAnchorOn: CairoDate | null;
  /** Null = all branches (checkout then needs branchId). */
  branchId: Uuid | null;
  isShareable: boolean;
  maxShareCount: number | null;
  imageUrl: string | null;
}

/** GET mobile/studio/packages */
export interface StudioPackageCatalogResponse {
  currency: 'EGP' | string;
  vatRate: string;
  data: StudioCatalogPackage[];
  nextCursor: string | null;
}

export interface EligiblePackage {
  id: Uuid;
  name: string;
  description: string | null;
  priceEgp: MoneyEgp;
  baseType: PackageBaseType;
  passes: number | null;
  passesRequired: number;
  priority: number;
  validityValue: number;
  validityUnit: PackageValidityUnit;
  termEndsOn: CairoDate | null;
  startRule: PackageStartRule;
  imageUrl: string | null;
}

/** GET mobile/studio/sessions/:sessionId/eligible-packages */
export interface EligiblePackagesResponse {
  sessionId: Uuid;
  classSeriesId: Uuid;
  branchId: Uuid;
  currency: 'EGP' | string;
  vatRate: string;
  groups: { packageType: PackageType; packages: EligiblePackage[] }[];
}

// ---------------------------------------------------------------------------------------------
// Booking with an owned package
// ---------------------------------------------------------------------------------------------

export interface ClassBookingPackageCandidate {
  customerPackageId: Uuid;
  packageId: Uuid;
  name: string;
  baseType: PackageBaseType;
  isSharedWithClient: boolean;
  passesRequiredPerSeat: number;
  totalPassesRequired: number | null;
  passesRemaining: number | null;
  startsOn: CairoDate | null;
  expiresOn: CairoDate | null;
  /** CustomerPackageStatus as a plain string. */
  status: CustomerPackageStatus | string;
  priority: number;
  eligible: boolean;
  ineligibleReason: string | null;
}

export interface StudioLegalRequirement {
  eligible: boolean;
  missingKinds: StudioLegalDocumentKind[];
  unpublishedKinds: StudioLegalDocumentKind[];
}

/** GET mobile/studio/sessions/:sessionId/booking-options */
export interface ClassBookingOptions {
  sessionId: Uuid;
  classSeriesId: Uuid;
  branchId: Uuid;
  branchColorHex: string | null;
  bookingClassDate: CairoDate;
  bookingAction: StudioBookingAction;
  bookingUnavailableReason: StudioBookingUnavailableReason | null;
  paymentRule: StudioOnlinePaymentRule;
  packages: ClassBookingPackageCandidate[];
  packagesTruncated: boolean;
  selectedCustomerPackageId: Uuid | null;
  /** Always { allowed: false, reason: 'online-payment-only' } for clients. */
  owed: { allowed: boolean; reason: string | null };
  requiresPayment: boolean;
  bookAndPayAvailable: boolean;
  legal: StudioLegalRequirement;
  ageEligible: boolean;
  ageRestrictedReason: 'age_restricted' | null;
  alreadyBooked: boolean;
  existingBookingId: Uuid | null;
  bookingOpensAt: IsoDateTime;
  bookingClosesAt: IsoDateTime;
  cancellationWindowMinutes: number;
  lateCancelFeeEgp: MoneyEgp;
  /** 64 hex; pass as expectedPreviewFingerprint. */
  previewFingerprint: string;
}

/** POST mobile/studio/sessions/:sessionId/bookings body. */
export interface CreateClassBookingRequest {
  /** 1-120 chars, any string. */
  idempotencyKey: string;
  customerPackageId?: Uuid;
  /** 64 lowercase hex. */
  expectedPreviewFingerprint?: string;
}

/** POST .../bookings (201) and POST bookings/:id/cancel (200) response. */
export interface ClassBooking {
  id: Uuid;
  classSessionId: Uuid;
  classSeriesId: Uuid;
  branchId: Uuid;
  status: ClassBookingStatus;
  bookedVia: ClassBookingChannel;
  bookingClassDate: CairoDate;
  customerPackageId: Uuid | null;
  packageId: Uuid | null;
  passesRequiredPerSeat: number | null;
  passesUsed: number;
  isSessionsOwed: boolean;
  cancellationWindowMinutesSnapshot: number;
  lateCancelFeeEgpSnapshot: MoneyEgp;
  effectiveCancellationWindowMinutes: number;
  effectiveLateCancelFeeEgp: MoneyEgp;
  lateCancelFeeEgp: MoneyEgp | null;
  cancelledAt: IsoDateTime | null;
  bookedAt: IsoDateTime;
}

/** POST mobile/studio/bookings/:bookingId/cancel-preview (no body). */
export interface ClassBookingCancelPreview {
  bookingId: Uuid;
  sessionId: Uuid;
  status: ClassBookingStatus;
  startsAt: IsoDateTime;
  isLate: boolean;
  cancellationWindowMinutes: number;
  feeEgp: MoneyEgp;
  passesReturned: number;
  passesRetained: number;
  owedCleared: boolean;
  owedRetained: boolean;
  seatsReleased: number;
  /** 64 hex; required on cancel. */
  fingerprint: string;
}

/** POST mobile/studio/bookings/:bookingId/cancel body. */
export interface CancelClassBookingRequest {
  idempotencyKey: string;
  expectedPreviewFingerprint: string;
  /** <= 500 chars. */
  reason?: string;
}

// ---------------------------------------------------------------------------------------------
// Checkout (buy a package, optionally book a class) and payment
// ---------------------------------------------------------------------------------------------

/** POST mobile/studio/checkouts/quote body. */
export interface StudioCheckoutQuoteRequest {
  packageId: Uuid;
  /** Required when the package is all-branch and no sessionId is sent. */
  branchId?: Uuid;
  sessionId?: Uuid;
  /** <= 40 chars. */
  promoCode?: string;
  /** Room poster scan (<= 512); allows buying until check-in closes. */
  roomQrPayload?: string;
}

/** POST mobile/studio/checkouts body. */
export interface CreateStudioCheckoutRequest extends StudioCheckoutQuoteRequest {
  /** quoteFingerprint from the quote (64 hex). */
  expectedQuoteFingerprint: string;
  /** Must be a UUID. */
  idempotencyKey: Uuid;
}

export interface StudioCheckoutQuote {
  branchId: Uuid;
  packageId: Uuid;
  packageName: string;
  sessionId: Uuid | null;
  classSeriesId: Uuid | null;
  currency: 'EGP' | string;
  vatRate: string;
  vatEgp: MoneyEgp;
  subtotalEgp: MoneyEgp;
  /** Always '0.00' for clients. */
  corporateDiscountEgp: MoneyEgp;
  promoDiscountEgp: MoneyEgp;
  discountEgp: MoneyEgp;
  totalEgp: MoneyEgp;
  selectedDiscountKind: StudioDiscountKind;
  /** Upper-cased, only when the promo was applied. */
  promoCode: string | null;
  isFree: boolean;
  quoteFingerprint: string;
  legal: { eligible: boolean; missingKinds: string[]; unpublishedKinds: string[] };
}

export type StudioCheckoutPaymentState =
  | 'not_required'
  | 'awaiting_payment'
  | 'confirmation_pending'
  | 'captured_unfulfilled'
  | 'paid'
  | 'refunded'
  | 'voided'
  | 'failed'
  | 'expired'
  | 'cancelled';

export type StudioCheckoutNextAction =
  | 'view_booking'
  | 'completed'
  | 'initiate'
  | 'continue_existing_payment'
  | 'wait_for_confirmation'
  | 'retry_payment'
  | 'new_checkout'
  | 'contact_support';

/** POST mobile/studio/checkouts (201) and GET mobile/studio/checkouts/:orderId. */
export interface StudioCheckoutOrder {
  orderId: Uuid;
  orderNumber: string;
  status: OrderStatus;
  branchId: Uuid;
  classSeriesId: Uuid | null;
  currency: 'EGP' | string;
  subtotalEgp: MoneyEgp;
  discountEgp: MoneyEgp;
  vatEgp: MoneyEgp;
  vatRate: string;
  totalEgp: MoneyEgp;
  selectedDiscountKind: StudioDiscountKind;
  isFree: boolean;
  paymentState: StudioCheckoutPaymentState;
  nextAction: StudioCheckoutNextAction;
  capturedButUnfulfilled: boolean;
  holdExpiresAt: IsoDateTime | null;
  holdRemainingSeconds: number | null;
  paidAt: IsoDateTime | null;
  package: { packageId: Uuid; name: string; packageType: PackageType | string };
  booking: {
    id: Uuid;
    classSessionId: Uuid;
    classSeriesId: Uuid | null;
    status: ClassBookingStatus;
    holdExpiresAt: IsoDateTime | null;
  } | null;
  /** Set once the order is paid. */
  issuedPackage: {
    id: Uuid;
    packageId: Uuid;
    name: string;
    status: CustomerPackageStatus | string;
    startsOn: CairoDate | null;
    expiresOn: CairoDate | null;
    passesTotal: number | null;
    passesUsed: number;
  } | null;
}

/**
 * Shared event/studio payment endpoints:
 * POST mobile/orders/:orderId/payment/initiate (200) and POST mobile/orders/:orderId/retry-payment (201).
 * The app sends no body (mobile_sdk). Studio: card only, no saved cards.
 */
export interface InitiatePaymentRequest {
  presentation?: 'mobile_sdk' | 'web_redirect';
  /** Studio accepts only 'card' (or omitted). */
  paymentMethod?: string;
  /** Not allowed for Studio orders (PAYMENT_METHOD_UNAVAILABLE). */
  savedPaymentMethodId?: Uuid;
  returnOrigin?: string;
}

export interface PaymentInitiateResponse {
  paymentId: Uuid;
  provider: 'paymob';
  presentationMode: 'mobile_sdk' | 'web_redirect';
  clientSecret: string;
  publicKey: string;
  providerIntentionId: string;
  providerOrderId: string | null;
  amountEgp: MoneyEgp;
  currency: string;
  expiresAt: IsoDateTime;
  checkoutUrl?: string;
}

export type ClientPaymentStatus =
  | 'creating'
  | 'pending'
  | 'provider_status_unknown'
  | 'confirming'
  | 'captured'
  | 'not_required'
  | 'failed'
  | 'expired'
  | 'refunded'
  | 'voided';

/** GET mobile/orders/:orderId/payment/status */
export interface PaymentStatusResponse {
  orderStatus: Exclude<OrderStatus, 'draft' | 'on_account'>;
  paymentStatus: ClientPaymentStatus;
  /** Always 0 for Studio. */
  ticketsIssued: number;
  paidAt: IsoDateTime | null;
  failureReason?:
    'declined' | 'insufficient_funds' | 'authentication_failed' | 'expired_card' | 'unknown' | null;
  /** Studio-only flags (absent on event orders). */
  capturedButUnfulfilled?: boolean;
  isZeroValue?: boolean;
  packageIssued?: boolean;
}

// ---------------------------------------------------------------------------------------------
// Friend invites
// ---------------------------------------------------------------------------------------------

/** POST mobile/studio/bookings/:bookingId/invites body. */
export interface CreateClassInviteRequest {
  /** 4-32 chars as typed; server normalizes to E.164. */
  friendPhoneNumber: string;
  /** 1-160; used only when the number has no Sukun account. */
  friendName?: string;
  mode: ClassBookingInviteMode;
  /** host_pays only: one of the host's pass packages. */
  customerPackageId?: Uuid;
  idempotencyKey: string;
}

/** POST mobile/studio/class-invites/by-token/:token/accept body. */
export interface AcceptClassInviteRequest {
  idempotencyKey: string;
  customerPackageId?: Uuid;
}

export interface PublicClassInvite {
  token: string;
  mode: ClassBookingInviteMode;
  displayStatus: ClassInviteDisplayStatus;
  waitingUntil: IsoDateTime | null;
  /** friend_pays only. */
  holdExpiresAt: IsoDateTime | null;
  sessionId: Uuid;
  branchId: Uuid;
  sessionTitle: string;
  sessionStartsAt: IsoDateTime;
  sessionEndsAt: IsoDateTime;
  hostFirstName: string | null;
}

/** Response of create / accept / decline / remove, and list items. */
export interface ClassInvite extends PublicClassInvite {
  id: Uuid;
  status: ClassBookingInviteStatus;
  hostBookingId: Uuid;
  friendName: string | null;
  /** Null once the friend deleted their account. */
  friendPhoneE164: string | null;
  friendBookingId: Uuid | null;
  friendBookingStatus: ClassBookingStatus | null;
  /** Put in the share sheet. */
  shareUrl: string | null;
  createdAt: IsoDateTime;
  acceptedAt: IsoDateTime | null;
  endedAt: IsoDateTime | null;
}

/** GET mobile/studio/class-invites/by-token/:token */
export interface ClassInviteByToken extends PublicClassInvite {
  isForMe: boolean;
}

/** GET mobile/studio/bookings/:bookingId/invites and GET mobile/studio/class-invites. */
export interface ClassInviteListResponse {
  data: ClassInvite[];
}

// ---------------------------------------------------------------------------------------------
// Legal
// ---------------------------------------------------------------------------------------------

export interface StudioLegalCurrentDocument {
  id: Uuid;
  kind: StudioLegalDocumentKind;
  version: number;
  title: string;
  body: string;
  bodyHash: string;
  requiresReacceptance: boolean;
  publishedAt: IsoDateTime;
}

export interface StudioLegalDocumentStatus {
  kind: StudioLegalDocumentKind;
  published: boolean;
  currentDocument: StudioLegalCurrentDocument | null;
  minimumAcceptedVersion: number | null;
  satisfied: boolean;
  requiresAcceptance: boolean;
  acceptedAt: IsoDateTime | null;
  acceptedVersion: number | null;
  acceptedDocumentId: Uuid | null;
  acceptanceChannel: StudioLegalAcceptanceChannel | null;
  acceptanceSource: StudioLegalAcceptanceSource | null;
}

/** GET mobile/studio/legal */
export interface StudioLegalStatus {
  eligible: boolean;
  missingKinds: StudioLegalDocumentKind[];
  unpublishedKinds: StudioLegalDocumentKind[];
  documents: StudioLegalDocumentStatus[];
}

/** POST mobile/studio/legal/:documentId/accept body (optional). */
export interface AcceptStudioLegalRequest {
  /** true records WhatsApp marketing consent; false/absent changes nothing. */
  marketingOptIn?: boolean;
}

/** POST mobile/studio/legal/:documentId/accept response (200). */
export interface StudioLegalAcceptResponse {
  acceptance: {
    id: Uuid;
    documentId: Uuid;
    kind: StudioLegalDocumentKind;
    documentVersion: number;
    bodyHash: string;
    acceptedAt: IsoDateTime;
    channel: StudioLegalAcceptanceChannel;
    source: StudioLegalAcceptanceSource;
  };
  created: boolean;
  status: StudioLegalStatus;
}

// ---------------------------------------------------------------------------------------------
// Ratings
// ---------------------------------------------------------------------------------------------

export interface PendingClassRatingItem {
  bookingId: Uuid;
  classSessionId: Uuid;
  classSeriesId: Uuid;
  classTitle: string;
  branchId: Uuid;
  branchName: string;
  instructorId: Uuid;
  instructorName: string;
  sessionStartsAt: IsoDateTime;
  sessionEndsAt: IsoDateTime;
  /** 'YYYY-MM-DD HH:mm' Cairo. */
  sessionStartsAtCairo: string;
  sessionEndsAtCairo: string;
  bookingClassDate: CairoDate;
  /** '/studio/bookings/<id>/rate' */
  deepLink: string;
}

/** GET mobile/studio/ratings/pending?limit(1-50)&cursor */
export interface PendingClassRatingsResponse {
  ratingsEnabled: boolean;
  data: PendingClassRatingItem[];
  meta: CursorPageMeta;
}

/** POST mobile/studio/bookings/:bookingId/rating body. */
export interface SubmitClassRatingRequest {
  /** 1-5: the "class & instructor" score. */
  sessionRating: number;
  sessionReview?: string | null;
  /** 1-5; defaults to sessionRating. */
  instructorRating?: number;
  instructorReview?: string | null;
  studioRating?: number | null;
  studioReview?: string | null;
}

/** POST mobile/studio/bookings/:bookingId/rating response (201). */
export interface ClassRating {
  id: Uuid;
  classBookingId: Uuid;
  classSessionId: Uuid;
  classSeriesId: Uuid;
  branchId: Uuid;
  instructorId: Uuid;
  sessionStartsAt: IsoDateTime;
  sessionEndsAt: IsoDateTime;
  sessionRating: number;
  sessionReview: string | null;
  instructorRating: number;
  instructorReview: string | null;
  studioRating: number | null;
  studioReview: string | null;
  submittedAt: IsoDateTime;
}

// ---------------------------------------------------------------------------------------------
// Room QR check-in
// ---------------------------------------------------------------------------------------------

/** POST mobile/studio/room-check-ins body. */
export interface RoomCheckInRequest {
  /** Poster link as scanned, or 'sukun-room:v1:<roomId>:<token>'. */
  qrPayload: string;
  /** After a choose_session response. */
  sessionId?: Uuid;
}

export interface RoomCheckInCheckedIn {
  outcome: 'checked_in';
  sessionId: Uuid;
  bookingId: Uuid;
  attendance: 'present';
  attendanceMethod: ClassBookingAttendanceMethod;
  checkedInAt: IsoDateTime | null;
  /** True when a walk-in booking was made with an owned package on this scan. */
  bookedOnScan: boolean;
}

export interface RoomCheckInChooseSession {
  outcome: 'choose_session';
  choices: { sessionId: Uuid; title: string; startsAt: IsoDateTime; endsAt: IsoDateTime }[];
}

/** No usable package: run checkout with sessionId + roomQrPayload. */
export interface RoomCheckInBookAndPay {
  outcome: 'book_and_pay';
  sessionId: Uuid;
}

/** A payable hold exists: pay orderId. */
export interface RoomCheckInContinueCheckout {
  outcome: 'continue_checkout';
  sessionId: Uuid;
  bookingId: Uuid;
  orderId: Uuid;
}

export type RoomCheckInResponse =
  | RoomCheckInCheckedIn
  | RoomCheckInChooseSession
  | RoomCheckInBookAndPay
  | RoomCheckInContinueCheckout;
