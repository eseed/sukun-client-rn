import { normalizePhone, requiresLivingArea } from '../../lib/phone';
import type { SukunApi } from '../contract';
import type {
  AccountDeletionPreview,
  AddonDetail,
  AddonSummary,
  Area,
  Authenticated,
  Cart,
  CartAddonInput,
  CartPreview,
  CartRecipientLookup,
  CurrentUser,
  CursorPage,
  EntryPass,
  EmailVerificationResult,
  EmailVerificationSent,
  EventMeta,
  EventDetail,
  EventListItem,
  GuestValidationIssue,
  GuestValidationInput,
  GuestValidationResult,
  ListEventsQuery,
  OrderGuest,
  OrderDetail,
  OrderSummary,
  OtpRequested,
  OrderAddon,
  PaymentIntent,
  PaymentStatus,
  ReplaceCartTicketsInput,
  SessionTokens,
  SelfieResponse,
  Ticket,
  TicketAddon,
  TicketAddonContext,
  UpdateProfileInput,
} from '../types';
import {
  areas,
  emptyUser,
  eventDetails,
  eventList,
  promoCodes,
  seedTickets,
  VAT_RATE,
} from './fixtures';
import { multiply, toEgp, toPiastres } from './money';
import { mockConfig } from './config';
import {
  buildAddonDetail,
  findOption,
  listAddonDetails,
  listAddonSummaries,
  addonForOption,
} from './addons';
import {
  applyAddons,
  applyTickets,
  nextCartId,
  priceCart,
  promoNoLongerApplies,
  resetCartSequences,
  toCartResponse,
  toPreviewResponse,
  validateCart,
  type MockCart,
} from './carts';

/**
 * In-memory mock backend. Holds all P0 business logic — pricing, promo clamping, guest
 * validation, hold expiry, payment settlement, profile completeness. Screens must never
 * duplicate any of it (CLAUDE.md rule 7).
 *
 * Pricing mirrors the server formula exactly (`MobileOrderDetailResponseDto`):
 *   net   = subtotal − discount
 *   vat   = net × vatRate
 *   total = net + vat
 */

const OTP_CODE = '4242';
const EMAIL_VERIFICATION_TOKEN = 'mock-email-verification-token';
const HOLD_MINUTES = 15;
const DEFAULT_PAGE_LIMIT = 20;

/**
 * Test/dev seams. Tests set `latencyMs` to 0 and drive `now` themselves so they can assert
 * on webhook timing without sleeping.
 */
export { mockConfig } from './config';

function delay<T>(value: T, factor = 1): Promise<T> {
  const ms = mockConfig.latencyMs * factor;
  if (ms <= 0) return Promise.resolve(value);
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function iso(offsetMs = 0): string {
  return new Date(mockConfig.now() + offsetMs).toISOString();
}

function isoDateAfter(date: string): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed.toISOString().slice(0, 10);
}

let orderSeq = 482;
let ticketSeq = 4821;

function nextOrderNumber(): string {
  orderSeq += 1;
  return `SKN-2026-${String(orderSeq).padStart(6, '0')}`;
}

function nextTicketNumber(): string {
  ticketSeq += 1;
  return `TKT-2026-${String(ticketSeq).padStart(6, '0')}`;
}

export class MockApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = 'MockApiError';
  }
}

interface MockState {
  user: CurrentUser | null;
  accounts: Map<string, CurrentUser>;
  pendingPhone: string | null;
  pendingEmailVerificationToken: string | null;
  tickets: Ticket[];
  orders: OrderDetail[];
  ticketOwnerPhones: Map<string, string>;
  ticketBuyerPhones: Map<string, string>;
  orderBuyerPhones: Map<string, string>;
  orderBuyerNames: Map<string, string>;
  /** Order ids that the "webhook" has settled. */
  paidOrderIds: Set<string>;
  paidAt: Map<string, string>;
  /** Wall-clock at which an initiated payment auto-settles, simulating the webhook. */
  settleAt: Map<string, number>;
  deletedAccounts: Map<string, DeletedAccount>;
  carts: MockCart[];
  /** Pricing tokens handed out by preview, with the total they were issued against. */
  pricingTokens: Map<string, { cartId: string; totalEgp: string; expiresAt: number }>;
  /** Addons issued by a paid order, keyed by ticket id. */
  ticketAddons: Map<string, TicketAddon[]>;
  /** Which tickets occupy a room, per event, so one-room-per-person survives fulfilment. */
  accommodationTicketIds: Map<string, Set<string>>;
}

interface DeletedAccount {
  user: CurrentUser;
  tickets: Ticket[];
  orders: OrderDetail[];
  ticketOwnerPhones: Map<string, string>;
  ticketBuyerPhones: Map<string, string>;
  orderBuyerPhones: Map<string, string>;
  orderBuyerNames: Map<string, string>;
}

const state: MockState = {
  user: null,
  accounts: new Map(),
  pendingPhone: null,
  pendingEmailVerificationToken: null,
  tickets: [],
  orders: [],
  ticketOwnerPhones: new Map(),
  ticketBuyerPhones: new Map(),
  orderBuyerPhones: new Map(),
  orderBuyerNames: new Map(),
  paidOrderIds: new Set(),
  paidAt: new Map(),
  settleAt: new Map(),
  deletedAccounts: new Map(),
  carts: [],
  pricingTokens: new Map(),
  ticketAddons: new Map(),
  accommodationTicketIds: new Map(),
};

/** Test/dev seam: reset the mock between runs. */
export function resetMockState(): void {
  state.user = null;
  state.accounts.clear();
  state.pendingPhone = null;
  state.pendingEmailVerificationToken = null;
  state.tickets = [];
  state.orders = [];
  state.ticketOwnerPhones.clear();
  state.ticketBuyerPhones.clear();
  state.orderBuyerPhones.clear();
  state.orderBuyerNames.clear();
  state.paidOrderIds.clear();
  state.paidAt.clear();
  state.settleAt.clear();
  state.deletedAccounts.clear();
  state.carts = [];
  state.pricingTokens.clear();
  state.ticketAddons.clear();
  state.accommodationTicketIds.clear();
  resetCartSequences();
  orderSeq = 482;
  ticketSeq = 4821;
}

function requireUser(): CurrentUser {
  if (!state.user) throw new MockApiError('UNAUTHORIZED', 'Not signed in', 401);
  return state.user;
}

/**
 * Whether the signed-in buyer already holds a ticket for this event. One usable ticket per
 * phone per event, so this decides whether a new order can include one for them.
 *
 * A ticket with no guest phone against it is the buyer's own; one whose guest phone is their
 * number is a ticket somebody bought them, and occupies the same slot.
 */
function buyerHoldsTicketForEvent(eventId: string): boolean {
  const phone = state.user?.phoneNumber ?? null;

  return state.tickets.some((ticket) => {
    if (ticket.event.id !== eventId) return false;
    if (ticket.status !== 'active' && ticket.status !== 'pending_claim') return false;

    const guestPhone = state.ticketOwnerPhones.get(ticket.id) ?? null;

    return guestPhone === null || guestPhone === phone;
  });
}

/**
 * The fields that gate purchase (CLAUDE.md rule 8). Email verification is NOT one, and the
 * living area only applies to Egyptian numbers.
 */
function computeProfileComplete(user: CurrentUser): boolean {
  const areaSatisfied = !requiresLivingArea(user.phoneNumber) || Boolean(user.area);
  return Boolean(
    user.fullName &&
    user.email &&
    user.dateOfBirth &&
    user.gender &&
    areaSatisfied &&
    user.selfieUploaded,
  );
}

function refreshUserStatus(user: CurrentUser): CurrentUser {
  const profileComplete = computeProfileComplete(user);
  return {
    ...user,
    profileComplete,
    status: profileComplete ? 'active' : 'pending_profile',
  };
}

function authenticated(user: CurrentUser, isNewUser: boolean): Authenticated {
  return {
    accessToken: `mock-access-${mockConfig.now()}`,
    refreshToken: `mock-refresh-${mockConfig.now()}`,
    accessTokenExpiresInSeconds: 900,
    refreshTokenExpiresInSeconds: 7776000,
    user: {
      id: user.id,
      phoneNumber: user.phoneNumber,
      status: user.status,
      profileComplete: user.profileComplete,
      emailVerified: user.emailVerified,
    },
    isNewUser,
  };
}

function ticketUsageStatus(ticket: Ticket, user: CurrentUser | null): Ticket['usageStatus'] {
  if (ticket.status === 'pending_claim') return 'pending_claim';
  if (ticket.status === 'voided') return 'voided';
  if (ticket.status === 'refunded') return 'refunded';
  if (!user?.selfieUploaded) return 'selfie_required';
  if (!user.profileComplete) return 'profile_incomplete';
  return 'usable';
}

function refreshTicketUsability(user: CurrentUser): void {
  state.tickets = state.tickets.map((ticket) =>
    state.ticketOwnerPhones.get(ticket.id) === user.phoneNumber && ticket.status === 'active'
      ? { ...ticket, usageStatus: ticketUsageStatus(ticket, user) }
      : ticket,
  );
}

function ticketBelongsToUser(ticketId: string, user: CurrentUser): Ticket {
  const ticket = state.tickets.find((item) => item.id === ticketId);
  if (!ticket) throw new MockApiError('TICKET_NOT_FOUND', 'Ticket not found', 404);
  if (state.ticketOwnerPhones.get(ticket.id) !== user.phoneNumber) {
    throw new MockApiError('TICKET_FORBIDDEN', 'That ticket is not yours.', 403);
  }
  return ticket;
}

function cursorIndex(cursor: string | null | undefined): number {
  if (!cursor) return 0;
  const index = Number(cursor);
  if (!Number.isInteger(index) || index < 0) {
    throw new MockApiError('INVALID_CURSOR', 'Invalid cursor', 400);
  }
  return index;
}

function page<T>(
  data: T[],
  cursor: string | null | undefined,
  limit: number | undefined,
  maxLimit: number,
) {
  const pageLimit = limit ?? DEFAULT_PAGE_LIMIT;
  if (!Number.isInteger(pageLimit) || pageLimit < 1 || pageLimit > maxLimit) {
    throw new MockApiError('INVALID_LIMIT', 'Invalid page limit', 400);
  }
  const start = cursorIndex(cursor);
  const result = data.slice(start, start + pageLimit);
  const next = start + result.length;
  return {
    data: result,
    meta: {
      limit: pageLimit,
      hasNextPage: next < data.length,
      nextCursor: next < data.length ? String(next) : null,
    },
  };
}

function transitionExpiredOrders(): void {
  const now = mockConfig.now();
  for (const order of state.orders) {
    if (order.status !== 'awaiting_payment') continue;
    if (Date.parse(order.holdExpiresAt) > now) continue;
    order.status = 'expired';
    state.settleAt.delete(order.id);
  }
}

function findTier(eventId: string, tierId: string) {
  const event = eventDetails[eventId];
  const tier = event?.tiers.find((t) => t.id === tierId);
  if (!tier) throw new MockApiError('TIER_NOT_FOUND', 'Unknown ticket tier', 404);
  return tier;
}

function findEvent(identifier: string): EventDetail {
  const event =
    eventDetails[identifier] ??
    Object.values(eventDetails).find((item) => item.slug === identifier);
  if (!event) throw new MockApiError('EVENT_NOT_FOUND', 'Event not found', 404);
  return event;
}

/* -------------------------------------------------------------- cart helpers */

function requireCompleteProfile(): CurrentUser {
  const user = requireUser();
  if (!user.profileComplete) {
    throw new MockApiError('PROFILE_INCOMPLETE', 'Complete your profile to buy tickets', 403);
  }
  return user;
}

function requireDraftCart(cartId: string, options: { allowConverted?: boolean } = {}): MockCart {
  const user = requireCompleteProfile();
  const cart = state.carts.find((item) => item.id === cartId);

  if (!cart || cart.buyerUserId !== user.phoneNumber) {
    throw new MockApiError('CART_NOT_FOUND', 'That cart no longer exists.', 404);
  }
  if (cart.status !== 'draft' && !options.allowConverted) {
    throw new MockApiError('CART_NOT_EDITABLE', 'This checkout has already been placed.', 409);
  }

  return cart;
}

/**
 * Validation with the parts of the world only the mock store knows: which tiers are sold out,
 * which tickets already have a room, and which existing tickets may be targeted at all.
 */
function validateCartHere(cart: MockCart) {
  const eligibleTicketIds = new Set(
    state.tickets
      .filter(
        (ticket) =>
          ticket.event.id === cart.eventId &&
          (ticket.status === 'active' || ticket.status === 'pending_claim'),
      )
      .map((ticket) => ticket.id),
  );

  return validateCart(cart, {
    ticketsSoldOut: (tierId) => {
      const tier = eventDetails[cart.eventId]?.tiers.find((item) => item.id === tierId);
      return tier ? !tier.isPurchasable : true;
    },
    existingAccommodationTicketIds: state.accommodationTicketIds.get(cart.eventId) ?? new Set(),
    eligibleTicketIds,
  });
}

function pricingContext(cart: MockCart) {
  const event = eventDetails[cart.eventId];

  return {
    tierPrice: (tierId: string) => findTier(cart.eventId, tierId).priceEgp,
    tierName: (tierId: string) => findTier(cart.eventId, tierId).name,
    vatEnabled: event?.vatEnabled ?? true,
    vatRate: VAT_RATE,
    promo: { lookup: (code: string) => promoCodes[code] },
  };
}

/**
 * Drops a promo that has stopped discounting anything, and records why.
 *
 * Editing tickets or extras can strand a scoped code — remove the only meal it applied to and it
 * is discounting nothing. Leaving it attached would show a code on the review screen with no
 * money behind it, so the cart detaches it and says so.
 */
function detachPromoIfStranded(cart: MockCart): void {
  if (!cart.promoCode) return;

  const pricing = priceCart(cart, pricingContext(cart));

  if (pricing.promo === null || promoNoLongerApplies(pricing)) {
    cart.promoAdjustment = {
      removed: true,
      reason: 'PROMO_SCOPE_NO_LONGER_APPLICABLE',
      previousPromoCode: cart.promoCode,
    };
    cart.promoCode = null;
  }
}

/** Freezes a cart addon line into the immutable order line, recipients included. */
function toOrderAddon(
  cart: MockCart,
  line: MockCart['addons'][number],
  pricing: ReturnType<typeof priceCart>,
): OrderAddon {
  const option = findOption(line.optionId);
  const addon = addonForOption(line.optionId);
  const priced = pricing.addonLines.find((item) => item.addonOptionId === line.optionId);
  const isRoom = addon?.type === 'accommodation';

  return {
    orderAddonItemId: `order-addon-${line.optionId}-${cart.id}`,
    addonOptionId: line.optionId,
    type: addon?.type ?? 'other',
    label: `${addon?.name ?? 'Extra'}${option ? ` · ${option.label}` : ''}`,
    transportDirection: option?.transportDirection ?? null,
    departureDate: option?.departureDate ?? null,
    departureTime: option?.departureTime ?? null,
    returnDate: option?.returnDate ?? null,
    returnTime: option?.returnTime ?? null,
    unitPriceEgp: priced?.unitPriceEgp ?? '0.00',
    lineTotalEgp: priced?.lineTotalEgp ?? '0.00',
    quantity: line.quantity,
    originalQuantity: line.quantity,
    activeQuantity: line.quantity,
    pendingTicketReplacementQuantity: 0,
    cancelledQuantity: 0,
    voidedQuantity: 0,
    status: 'active',
    recipients: line.assignments.map((assignment) => {
      const attendee = cart.attendees.find(
        (item) => item.cartAttendeeId === assignment.cartAttendeeId,
      );
      const ticket = assignment.ticketId
        ? state.tickets.find((item) => item.id === assignment.ticketId)
        : undefined;

      return {
        ticketId: assignment.ticketId ?? '',
        phoneNumber:
          attendee?.phoneNumber ??
          (ticket ? (state.ticketOwnerPhones.get(ticket.id) ?? null) : null),
        // Named only when this order named them. A recipient who brought their own ticket comes
        // back nameless, and the app labels them from device contacts.
        displayName: attendee?.name ?? null,
        roomGroupId: assignment.roomGroupId,
      };
    }),
    room:
      isRoom && option
        ? {
            roomType: option.roomType ?? '',
            nights: option.nights ?? 0,
            checkInDate: option.checkInDate ?? '',
            checkInTime: option.checkInTime ?? '',
            checkOutDate: option.checkOutDate ?? '',
            checkOutTime: option.checkOutTime ?? '',
            status: 'active',
            capacity: option.occupancy ?? 0,
          }
        : null,
  };
}

/**
 * Settles any initiated payment whose simulated webhook is due, issuing tickets. Called on
 * every status poll so the flow reaches `paid` exactly the way the real one does — through
 * the server, never through a client redirect (CLAUDE.md rule 9).
 */
function settleDuePayments(): void {
  transitionExpiredOrders();
  const now = mockConfig.now();
  for (const [orderId, due] of state.settleAt.entries()) {
    if (now < due) continue;
    state.settleAt.delete(orderId);
    state.paidOrderIds.add(orderId);
    state.paidAt.set(orderId, iso());
    const order = state.orders.find((o) => o.id === orderId);
    if (!order || order.status !== 'awaiting_payment') continue;
    order.status = 'paid';
    issueTicketsFor(order);
  }
}

function issueTicketsFor(order: OrderDetail): void {
  const event = eventDetails[order.eventId];
  if (!event) return;
  const buyerPhone = state.orderBuyerPhones.get(order.id);
  const holder = state.orderBuyerNames.get(order.id) ?? 'You';
  const guestsByTier = new Map<string, OrderGuest[]>();
  for (const guest of order.guests) {
    const guests = guestsByTier.get(guest.tierId) ?? [];
    guests.push(guest);
    guestsByTier.set(guest.tierId, guests);
  }
  let buyerIssued = false;

  const ticketEvent = {
    id: event.id,
    slug: event.slug,
    title: event.title,
    coverImageUrl: event.coverImageUrl,
    venueName: event.venue?.name ?? null,
    venueMapUrl: event.venue?.mapUrl ?? null,
  };

  for (const item of order.items) {
    const tier = event.tiers.find((t) => t.id === item.tierId);
    if (!tier) continue;
    const days = tier.days.map((d) => {
      const day = event.days.find((ed) => ed.id === d.id);
      return {
        id: d.id,
        date: d.dayDate,
        startsAt: day?.startsAt ?? `${d.dayDate}T13:00:00.000Z`,
        gatesOpenAt: day?.gatesOpenAt ?? null,
      };
    });

    for (let n = 0; n < item.quantity; n += 1) {
      const tierGuests = guestsByTier.get(item.tierId) ?? [];
      const guest =
        !buyerIssued && item.tierId === order.buyerTierId ? null : (tierGuests.shift() ?? null);
      if (!guest && buyerIssued && tierGuests.length === 0 && item.tierId !== order.buyerTierId)
        continue;
      const ticket: Ticket = {
        id: `tk-${order.id}-${item.tierId}-${n}`,
        ticketNumber: nextTicketNumber(),
        // A guest's ticket exists before its owner does — it binds when that number
        // registers (CLAUDE.md rule 2). No claim codes.
        status: guest ? 'pending_claim' : 'active',
        usageStatus: guest
          ? 'pending_claim'
          : state.user?.selfieUploaded && state.user.profileComplete
            ? 'usable'
            : 'profile_incomplete',
        source: 'order',
        event: ticketEvent,
        tier: { id: tier.id, name: tier.name },
        days,
        holderName: guest ? guest.name : holder,
        orderNumber: order.orderNumber,
        purchasedBy: { name: holder, isSelf: !guest },
        addonCount: 0,
        issuedAt: iso(),
      };
      state.tickets.unshift(ticket);
      state.ticketOwnerPhones.set(ticket.id, guest?.phoneNumber ?? buyerPhone ?? '');
      state.ticketBuyerPhones.set(ticket.id, buyerPhone ?? '');
      if (!guest) buyerIssued = true;
    }
  }

  issueAddonsFor(order);
}

/**
 * Attaches a paid order's addons to the tickets they were bought for, which is what turns a
 * commercial line into something a holder can see on their pass.
 *
 * Recipients were recorded against cart attendees, so they resolve here by phone — the same phone
 * the ticket was issued to. A recipient who already held a ticket resolves straight by ticket id.
 */
function issueAddonsFor(order: OrderDetail): void {
  for (const line of order.addons) {
    const option = findOption(line.addonOptionId);

    for (const recipient of line.recipients) {
      const ticketId =
        state.tickets.find((ticket) => ticket.id === recipient.ticketId)?.id ??
        [...state.ticketOwnerPhones.entries()].find(
          ([id, phone]) =>
            phone === recipient.phoneNumber &&
            state.tickets.find((ticket) => ticket.id === id)?.event.id === order.eventId,
        )?.[0];

      if (!ticketId) continue;

      const issued: TicketAddon = {
        addonOptionId: line.addonOptionId,
        type: line.type,
        label: line.label,
        transportDirection: line.transportDirection,
        departureDate: line.departureDate,
        departureTime: line.departureTime,
        returnDate: line.returnDate,
        returnTime: line.returnTime,
        quantity: line.type === 'accommodation' ? 1 : recipientUnits(line, recipient.ticketId),
        status: 'active',
        issuedAddonStatus: 'active',
        originalQuantity:
          line.type === 'accommodation' ? 1 : recipientUnits(line, recipient.ticketId),
        activeQuantity:
          line.type === 'accommodation' ? 1 : recipientUnits(line, recipient.ticketId),
        pendingTicketReplacementQuantity: 0,
        refundedQuantity: 0,
        cancelledQuantity: 0,
        voidedQuantity: 0,
        redemptionsAllowed: 1,
        redemptionsUsed: 0,
        room: line.room,
      };

      state.ticketAddons.set(ticketId, [...(state.ticketAddons.get(ticketId) ?? []), issued]);

      if (line.type === 'accommodation') {
        const forEvent = state.accommodationTicketIds.get(order.eventId) ?? new Set<string>();
        forEvent.add(ticketId);
        state.accommodationTicketIds.set(order.eventId, forEvent);
      }

      const ticket = state.tickets.find((item) => item.id === ticketId);
      if (ticket) ticket.addonCount = (state.ticketAddons.get(ticketId) ?? []).length;
    }

    void option;
  }
}

/** How many units of a non-accommodation line went to one recipient. */
function recipientUnits(line: OrderAddon, ticketId: string | null): number {
  const share = line.recipients.filter((recipient) => recipient.ticketId === ticketId).length;
  return share > 0 ? Math.max(Math.round(line.originalQuantity / line.recipients.length), 1) : 1;
}

/* ------------------------------------------------------------------- api */

export const mockApi: SukunApi = {
  auth: {
    async requestOtp(phoneNumber: string): Promise<OtpRequested> {
      const e164 = normalizePhone(phoneNumber);
      if (!e164) throw new MockApiError('INVALID_PHONE', 'Enter a valid mobile number');
      state.pendingPhone = e164;
      // Identical response whether or not this number has an account (CLAUDE.md rule 4).
      return delay({ sent: true, expiresInSeconds: 300, resendAfterSeconds: 30 });
    },

    async verifyOtp(phoneNumber: string, code: string): Promise<Authenticated> {
      const e164 = normalizePhone(phoneNumber);
      if (!e164) throw new MockApiError('INVALID_PHONE', 'Enter a valid mobile number');
      if (code !== OTP_CODE) {
        throw new MockApiError('OTP_INVALID', 'That code is not right. Try again.');
      }

      const isNewUser = !state.accounts.has(e164);
      if (state.pendingPhone !== e164) {
        throw new MockApiError('OTP_INVALID', 'That code is not right. Try again.');
      }

      // Deletion is final. The deleted record keeps its own data under a hashed phone, and
      // this number is free again, so signing in here creates an ordinary new account. Nothing
      // asks whether they once deleted one (CLAUDE.md rule 4).

      const user =
        state.user?.phoneNumber === e164
          ? state.user
          : (state.accounts.get(e164) ?? emptyUser(e164));
      state.user = refreshUserStatus(user);
      state.accounts.set(e164, state.user);

      // Any ticket already waiting on this number binds now (CLAUDE.md rule 2).
      state.tickets = state.tickets.map((t) =>
        t.status === 'pending_claim' && state.ticketOwnerPhones.get(t.id) === e164
          ? {
              ...t,
              status: 'active',
              usageStatus: ticketUsageStatus({ ...t, status: 'active' }, state.user),
            }
          : t,
      );

      state.pendingPhone = null;
      return delay(authenticated(state.user, isNewUser));
    },

    async refresh(): Promise<SessionTokens> {
      return delay(
        {
          accessToken: `mock-access-${Date.now()}`,
          refreshToken: `mock-refresh-${Date.now()}`,
          accessTokenExpiresInSeconds: 900,
          refreshTokenExpiresInSeconds: 7776000,
        },
        0.25,
      );
    },

    async me(): Promise<CurrentUser> {
      return delay(requireUser(), 0.4);
    },

    async logout(): Promise<void> {
      state.user = null;
      return delay(undefined, 0.25);
    },

    async logoutAll(): Promise<void> {
      state.user = null;
      return delay(undefined, 0.25);
    },
  },

  profile: {
    async update(input: UpdateProfileInput): Promise<CurrentUser> {
      const user = requireUser();
      const area =
        input.areaId || input.areaCode
          ? (areas.find((a) => a.id === input.areaId || a.code === input.areaCode) ?? user.area)
          : user.area;

      state.user = refreshUserStatus({
        ...user,
        fullName: input.fullName ?? user.fullName,
        email: input.email ?? user.email,
        emailVerified: input.email && input.email !== user.email ? false : user.emailVerified,
        dateOfBirth: input.dateOfBirth ?? user.dateOfBirth,
        gender: input.gender ?? user.gender,
        marketingOptIn: input.marketingOptIn ?? user.marketingOptIn,
        area,
      });

      state.accounts.set(state.user.phoneNumber, state.user);
      if (state.tickets.length === 0 && state.user.fullName) {
        state.tickets = seedTickets(state.user.fullName);
        for (const ticket of state.tickets)
          state.ticketOwnerPhones.set(ticket.id, state.user.phoneNumber);
      }
      return delay(state.user);
    },

    async uploadSelfie(uri: string): Promise<CurrentUser> {
      const user = requireUser();
      state.user = refreshUserStatus({
        ...user,
        selfieUploaded: true,
        selfieUrl: uri,
        selfieExpiresAt: iso(15 * 60 * 1000),
      });
      state.accounts.set(state.user.phoneNumber, state.user);
      return delay(state.user, 1.9);
    },

    async getSelfie(): Promise<SelfieResponse> {
      const user = requireUser();
      if (!user.selfieUploaded || !user.selfieUrl || !user.selfieExpiresAt) {
        throw new MockApiError('SELFIE_NOT_FOUND', 'No selfie uploaded', 404);
      }
      refreshTicketUsability(user);
      return delay({
        selfieUrl: user.selfieUrl,
        expiresAt: user.selfieExpiresAt,
        selfieUploaded: true,
        profileComplete: user.profileComplete,
        status: user.status,
      });
    },

    async sendEmailVerification(): Promise<EmailVerificationSent> {
      const user = requireUser();
      if (!user.email)
        throw new MockApiError('EMAIL_REQUIRED', 'Add an email before verifying it.', 400);
      state.pendingEmailVerificationToken = EMAIL_VERIFICATION_TOKEN;
      return delay({ queued: true, expiresInSeconds: 86400 });
    },

    async verifyEmail(token: string): Promise<EmailVerificationResult> {
      const user = requireUser();
      if (user.emailVerified) return delay({ verified: true });
      if (token !== state.pendingEmailVerificationToken) {
        throw new MockApiError(
          'EMAIL_VERIFICATION_TOKEN_INVALID',
          'That verification link is not valid.',
        );
      }
      state.user = { ...user, emailVerified: true };
      state.accounts.set(user.phoneNumber, state.user);
      state.pendingEmailVerificationToken = null;
      return delay({ verified: true });
    },
  },

  reference: {
    async areas(): Promise<Area[]> {
      return delay(areas, 0.4);
    },
  },

  events: {
    async list(query?: ListEventsQuery): Promise<CursorPage<EventListItem>> {
      let data = [...eventList];
      if (query?.tag?.length) {
        data = data.filter((e) => e.tags.some((t) => query.tag?.includes(t)));
      }
      if (query?.state?.length) {
        data = data.filter((e) => query.state?.includes(e.state));
      }
      if (query?.upcoming) {
        data = data.filter(
          (e) => e.startDate > new Date(mockConfig.now()).toISOString().slice(0, 10),
        );
      }
      const dateFilter = (value: string, from?: string, to?: string) =>
        (!from || value >= from) && (!to || value < isoDateAfter(to));
      if (query?.startsFrom || query?.startsTo)
        data = data.filter((e) => dateFilter(e.startDate, query.startsFrom, query.startsTo));
      if (query?.endsFrom || query?.endsTo)
        data = data.filter((e) => dateFilter(e.endDate, query.endsFrom, query.endsTo));
      if (query?.salesCloseFrom || query?.salesCloseTo) {
        data = data.filter((e) => {
          const closeDate = findEvent(e.id).salesCloseAt?.slice(0, 10) ?? '';
          return dateFilter(closeDate, query.salesCloseFrom, query.salesCloseTo);
        });
      }
      return delay(page(data, query?.cursor, query?.limit, 50));
    },

    async detail(identifier: string): Promise<EventDetail> {
      return delay(findEvent(identifier));
    },

    async meta(identifier: string): Promise<EventMeta> {
      const event = await this.detail(identifier);
      return delay({
        title: event.title,
        tagline: event.tagline,
        coverImageUrl: event.coverImageUrl,
        startDate: event.startDate,
        endDate: event.endDate,
        venueName: event.venue?.name ?? null,
      });
    },
  },

  addons: {
    async list(eventIdentifier: string): Promise<AddonSummary[]> {
      return delay(listAddonSummaries(findEvent(eventIdentifier).id), 0.6);
    },

    async detail(eventIdentifier: string, addonId: string): Promise<AddonDetail> {
      const detail = buildAddonDetail(findEvent(eventIdentifier).id, addonId);
      if (!detail)
        throw new MockApiError('ADDON_NOT_FOUND', 'That extra is no longer offered.', 404);
      return delay(detail, 0.5);
    },
  },

  carts: {
    async create(eventId: string): Promise<Cart> {
      const user = requireCompleteProfile();
      const event = findEvent(eventId);
      // Create *or reuse*: a buyer who backs out and comes again lands in the same draft rather
      // than accumulating carts, which is what the backend does.
      const existing = state.carts.find(
        (cart) =>
          cart.eventId === event.id &&
          cart.buyerUserId === user.phoneNumber &&
          cart.status === 'draft',
      );

      if (existing) return delay(toCartResponse(existing, null), 0.5);

      const cart: MockCart = {
        id: nextCartId(),
        eventId: event.id,
        buyerUserId: user.phoneNumber,
        status: 'draft',
        buyerTierId: null,
        items: [],
        attendees: [],
        addons: [],
        promoCode: null,
        promoAdjustment: undefined,
        convertedOrderId: null,
        createdAt: iso(),
        updatedAt: iso(),
      };

      state.carts.unshift(cart);
      return delay(toCartResponse(cart, null), 0.6);
    },

    async get(cartId: string): Promise<Cart> {
      const cart = requireDraftCart(cartId, { allowConverted: true });
      return delay(toCartResponse(cart, validateCartHere(cart)), 0.4);
    },

    async replaceTickets(cartId: string, input: ReplaceCartTicketsInput): Promise<Cart> {
      const user = requireCompleteProfile();
      const cart = requireDraftCart(cartId);
      const event = findEvent(cart.eventId);
      const totalQuantity = input.items.reduce((total, item) => total + item.quantity, 0);
      const buyerSeats = input.buyerTierId ? 1 : 0;

      if (totalQuantity !== input.guests.length + buyerSeats) {
        throw new MockApiError(
          'GUEST_ALLOCATION_INVALID',
          buyerSeats
            ? 'Attach one guest for each additional ticket.'
            : 'Attach a guest for every ticket in this order.',
          400,
        );
      }
      if (totalQuantity > event.maxTicketsPerOrder) {
        throw new MockApiError(
          'MAX_TICKETS_PER_ORDER_EXCEEDED',
          'That is more tickets than this event allows in one order.',
          400,
        );
      }
      if (buyerSeats && buyerHoldsTicketForEvent(cart.eventId)) {
        throw new MockApiError(
          'BUYER_ALREADY_HAS_TICKET',
          'You already have a ticket for this event. Buy these for your guests instead.',
          409,
        );
      }

      const guestCheck = await mockApi.orders.validateGuests(cart.eventId, input.guests);
      if (!guestCheck.valid) {
        throw new MockApiError(
          'GUEST_VALIDATION_FAILED',
          'Check the guest details and try again.',
          400,
        );
      }

      applyTickets(cart, input, {
        name: user.fullName ?? 'You',
        phoneNumber: user.phoneNumber,
        email: user.email,
      });
      detachPromoIfStranded(cart);
      return delay(toCartResponse(cart, validateCartHere(cart)), 0.8);
    },

    async replaceAddons(cartId: string, addonInputs: CartAddonInput[]): Promise<Cart> {
      const cart = requireDraftCart(cartId);

      for (const input of addonInputs) {
        const option = findOption(input.optionId);
        if (!option) {
          throw new MockApiError(
            'ADDON_OPTION_NOT_AVAILABLE',
            'That extra is no longer available.',
            400,
          );
        }
        for (const target of [
          ...(input.assignments ?? []),
          ...(input.rooms ?? []).flatMap((room) => room.occupants),
        ]) {
          // Exactly one target, never both. The backend rejects the ambiguous shape outright
          // rather than guessing which one the app meant.
          if ((target.cartAttendeeId ? 1 : 0) + (target.ticketId ? 1 : 0) !== 1) {
            throw new MockApiError(
              'ADDON_ASSIGNMENT_TARGET_INVALID',
              'Every extra needs exactly one recipient.',
              400,
            );
          }
        }

        /*
          This endpoint is a commit, not a scratch pad: a line whose units are not all spoken
          for, or a room that is not full, is refused at the write rather than reported back as
          an advisory issue. Modelling it only in `validateCartHere` is what let the app push
          half-assigned drafts all the way to staging before anything said no.
        */
        if (option.occupancy != null) {
          const rooms = input.rooms ?? [];
          if (rooms.length !== input.quantity) {
            throw new MockApiError(
              'ROOM_OCCUPANCY_UNFILLED',
              'Every room has to be full before you can check out.',
              400,
            );
          }
          for (const room of rooms) {
            if (room.occupants.length !== option.occupancy) {
              throw new MockApiError(
                'ROOM_OCCUPANCY_UNFILLED',
                'Every room has to be full before you can check out.',
                400,
              );
            }
          }
        } else {
          const assigned = (input.assignments ?? []).reduce(
            (total, assignment) => total + (assignment.quantity ?? 1),
            0,
          );
          // One unit with nothing said about it is the buyer's own, which is the default the
          // backend applies before it counts.
          const counted = input.assignments === undefined && input.quantity === 1 ? 1 : assigned;
          if (counted !== input.quantity) {
            throw new MockApiError(
              'ADDON_ASSIGNMENT_COUNT_MISMATCH',
              'Every extra needs somebody to go to.',
              400,
            );
          }
        }
      }

      applyAddons(cart, addonInputs);
      detachPromoIfStranded(cart);
      return delay(toCartResponse(cart, validateCartHere(cart)), 0.8);
    },

    async lookupRecipients(cartId: string, phoneNumbers: string[]): Promise<CartRecipientLookup[]> {
      const cart = requireDraftCart(cartId);
      const accommodation = state.accommodationTicketIds.get(cart.eventId) ?? new Set<string>();

      return delay(
        phoneNumbers.map((raw) => {
          const e164 = normalizePhone(raw);
          const ticketId = e164
            ? ([...state.ticketOwnerPhones.entries()].find(([id, phone]) => {
                const ticket = state.tickets.find((item) => item.id === id);
                return (
                  phone === e164 &&
                  ticket?.event.id === cart.eventId &&
                  (ticket.status === 'active' || ticket.status === 'pending_claim')
                );
              })?.[0] ?? null)
            : null;

          // No name, and no way to tell an unregistered number from a registered one without a
          // ticket: both answer `eligible: false` (CLAUDE.md rule 4).
          return {
            phoneNumber: e164 ?? raw,
            eligible: ticketId !== null,
            ticketId,
            hasAccommodation: ticketId !== null && accommodation.has(ticketId),
          };
        }),
        0.6,
      );
    },

    async applyPromo(cartId: string, code: string): Promise<Cart> {
      const cart = requireDraftCart(cartId);
      const normalized = code.trim().toUpperCase();

      if (!promoCodes[normalized]) {
        throw new MockApiError('PROMO_CODE_NOT_FOUND', 'That promo code is not valid.', 404);
      }

      cart.promoCode = normalized;
      cart.promoAdjustment = undefined;
      const pricing = priceCart(cart, pricingContext(cart));

      if (pricing.promo === null || promoNoLongerApplies(pricing)) {
        cart.promoCode = null;
        throw new MockApiError(
          'PROMO_NOT_APPLICABLE_TO_CART',
          'That code does not apply to anything in this order.',
          400,
        );
      }

      cart.updatedAt = iso();
      return delay(toCartResponse(cart, validateCartHere(cart)), 0.7);
    },

    async removePromo(cartId: string): Promise<Cart> {
      const cart = requireDraftCart(cartId);
      cart.promoCode = null;
      cart.promoAdjustment = undefined;
      cart.updatedAt = iso();
      return delay(toCartResponse(cart, validateCartHere(cart)), 0.5);
    },

    async preview(cartId: string): Promise<CartPreview> {
      const cart = requireDraftCart(cartId);
      const issues = validateCartHere(cart);
      const pricing = priceCart(cart, pricingContext(cart));
      const token = `pct-${cart.id}-${mockConfig.now()}`;

      if (issues.length === 0 && pricing.status === 'complete') {
        state.pricingTokens.set(token, {
          cartId: cart.id,
          totalEgp: pricing.totalEgp ?? '0.00',
          // Roughly five minutes, same as the backend, so an abandoned review screen has to
          // re-confirm rather than paying yesterday's price.
          expiresAt: mockConfig.now() + 5 * 60 * 1000,
        });
      }

      return delay(toPreviewResponse(cart, issues, pricing, token), 0.9);
    },

    async placeOrder(cartId: string, pricingConfirmationToken: string): Promise<OrderDetail> {
      const user = requireCompleteProfile();
      const cart = requireDraftCart(cartId, { allowConverted: true });

      // A converted cart replays its order rather than making a second one, so a retried tap or a
      // dropped response cannot double-charge.
      if (cart.status === 'converted' && cart.convertedOrderId) {
        const existing = state.orders.find((order) => order.id === cart.convertedOrderId);
        if (existing) return delay(existing, 0.8);
      }

      const issued = state.pricingTokens.get(pricingConfirmationToken);
      const issues = validateCartHere(cart);
      const pricing = priceCart(cart, pricingContext(cart));

      if (issues.length > 0 || pricing.status !== 'complete') {
        throw new MockApiError('CART_PRICING_UNAVAILABLE', 'This order cannot be placed yet.', 409);
      }
      if (toPiastres(pricing.totalEgp ?? '0.00') === 0) {
        throw new MockApiError('ZERO_TOTAL_ORDER_NOT_ALLOWED', 'There is nothing to pay for.', 400);
      }
      // The price is only honoured against the preview the buyer actually saw. Anything else,
      // including an expired token, sends them back to re-confirm rather than charging silently.
      if (
        !issued ||
        issued.cartId !== cart.id ||
        issued.expiresAt < mockConfig.now() ||
        issued.totalEgp !== pricing.totalEgp
      ) {
        throw new MockApiError(
          'CART_PRICING_CHANGED',
          'The price changed. Check the new total before paying.',
          409,
        );
      }

      const order: OrderDetail = {
        id: `ord-${mockConfig.now()}-${orderSeq + 1}`,
        orderNumber: nextOrderNumber(),
        eventId: cart.eventId,
        status: 'awaiting_payment',
        buyerTierId: cart.buyerTierId,
        subtotalEgp: pricing.subtotalEgp ?? '0.00',
        discountEgp: pricing.discountEgp ?? '0.00',
        netEgp: pricing.netEgp ?? '0.00',
        vatRate: pricing.vatRate ?? '0.0000',
        vatEgp: pricing.vatEgp ?? '0.00',
        totalEgp: pricing.totalEgp ?? '0.00',
        currency: 'EGP',
        holdExpiresAt: iso(HOLD_MINUTES * 60 * 1000),
        createdAt: iso(),
        items: cart.items.map((item) => {
          const tier = findTier(cart.eventId, item.tierId);
          return {
            tierId: item.tierId,
            quantity: item.quantity,
            unitPriceEgp: tier.priceEgp,
            lineTotalEgp: multiply(tier.priceEgp, item.quantity),
          };
        }),
        guests: cart.attendees
          .filter((attendee) => attendee.attendeeType === 'guest')
          .map((attendee) => ({
            phoneNumber: attendee.phoneNumber,
            name: attendee.name,
            tierId: cart.items[0]?.tierId ?? '',
          })),
        addons: cart.addons.map((line) => toOrderAddon(cart, line, pricing)),
      };

      state.orders.unshift(order);
      state.orderBuyerPhones.set(order.id, user.phoneNumber);
      state.orderBuyerNames.set(order.id, user.fullName ?? 'You');
      cart.status = 'converted';
      cart.convertedOrderId = order.id;
      state.pricingTokens.delete(pricingConfirmationToken);

      return delay(order, 1.2);
    },

    async abandon(cartId: string): Promise<Cart> {
      const cart = requireDraftCart(cartId);
      cart.status = 'abandoned';
      cart.updatedAt = iso();
      return delay(toCartResponse(cart, null), 0.4);
    },
  },

  orders: {
    async validateGuests(
      eventId: string,
      guests: GuestValidationInput[],
    ): Promise<GuestValidationResult> {
      const buyer = requireUser();
      const event = findEvent(eventId);
      const issues: GuestValidationIssue[] = [];
      const seen = new Set<string>();
      const buyerSeats = buyerHoldsTicketForEvent(eventId) ? 0 : 1;
      if (guests.length + buyerSeats > event.maxTicketsPerOrder) {
        throw new MockApiError(
          'MAX_TICKETS_PER_ORDER_EXCEEDED',
          'That is more tickets than this event allows in one order.',
          400,
        );
      }

      guests.forEach((guest, guestIndex) => {
        const e164 = normalizePhone(guest.phoneNumber);
        if (!e164) {
          issues.push({ guestIndex, error: 'INVALID_PHONE_NUMBER' });
          return;
        }
        if (e164 === buyer.phoneNumber) {
          issues.push({ guestIndex, error: 'SAME_AS_BUYER' });
          return;
        }
        if (seen.has(e164)) {
          issues.push({ guestIndex, error: 'DUPLICATE_IN_ORDER' });
          return;
        }
        if (
          [...state.ticketOwnerPhones.entries()].some(
            ([ticketId, phone]) =>
              phone === e164 &&
              state.tickets.find((ticket) => ticket.id === ticketId)?.status === 'active',
          )
        ) {
          issues.push({ guestIndex, error: 'GUEST_ALREADY_HAS_TICKET' });
          return;
        }
        seen.add(e164);
      });
      // Registration is never exposed. An existing ticket is allocation state, not account state.
      return delay({ valid: issues.length === 0, issues }, 0.7);
    },

    async detail(orderId: string): Promise<OrderDetail> {
      settleDuePayments();
      const order = state.orders.find((o) => o.id === orderId);
      if (!order) throw new MockApiError('ORDER_NOT_FOUND', 'Order not found', 404);
      if (state.orderBuyerPhones.get(orderId) !== requireUser().phoneNumber) {
        throw new MockApiError('ORDER_FORBIDDEN', 'That order is not yours.', 403);
      }
      return delay(order, 0.5);
    },

    async list(cursor?: string | null, limit = 20): Promise<CursorPage<OrderSummary>> {
      settleDuePayments();
      const user = requireUser();
      const data = state.orders
        .filter((order) => state.orderBuyerPhones.get(order.id) === user.phoneNumber)
        .map((o) => ({
          id: o.id,
          orderNumber: o.orderNumber,
          eventId: o.eventId,
          status: o.status,
          totalEgp: o.totalEgp,
          currency: o.currency,
          holdExpiresAt: o.holdExpiresAt,
          createdAt: o.createdAt,
        }));
      return delay(page(data, cursor, limit, 100));
    },

    async cancel(orderId: string): Promise<OrderDetail> {
      const user = requireUser();
      transitionExpiredOrders();
      const order = state.orders.find((o) => o.id === orderId);
      if (!order) throw new MockApiError('ORDER_NOT_FOUND', 'Order not found', 404);
      if (state.orderBuyerPhones.get(orderId) !== user.phoneNumber) {
        throw new MockApiError('ORDER_FORBIDDEN', 'That order is not yours.', 403);
      }
      if (order.status === 'awaiting_payment') order.status = 'cancelled';
      state.settleAt.delete(orderId);
      return delay(order, 0.6);
    },
  },

  payments: {
    async initiate(orderId: string): Promise<PaymentIntent> {
      const user = requireUser();
      const order = state.orders.find((o) => o.id === orderId);
      if (!order) throw new MockApiError('ORDER_NOT_FOUND', 'Order not found', 404);
      if (state.orderBuyerPhones.get(orderId) !== user.phoneNumber) {
        throw new MockApiError('ORDER_FORBIDDEN', 'That order is not yours.', 403);
      }
      transitionExpiredOrders();
      if (order.status !== 'awaiting_payment') {
        throw new MockApiError('ORDER_NOT_PAYABLE', 'This order is no longer payable.', 409);
      }
      // Simulated provider webhook lands a few seconds after the sheet opens.
      state.settleAt.set(orderId, mockConfig.now() + mockConfig.settleDelayMs);
      return delay({
        paymentId: `pay-${Date.now()}`,
        provider: 'paymob',
        presentationMode: 'mobile_sdk',
        clientSecret: 'sec_mock_0000',
        publicKey: 'pk_mock_0000',
        providerIntentionId: `pi_mock_${Date.now()}`,
        providerOrderId: null,
        amountEgp: order.totalEgp,
        currency: 'EGP',
        expiresAt: iso(10 * 60 * 1000),
      });
    },

    async status(orderId: string): Promise<PaymentStatus> {
      settleDuePayments();
      const order = state.orders.find((o) => o.id === orderId);
      if (!order) throw new MockApiError('ORDER_NOT_FOUND', 'Order not found', 404);
      if (state.orderBuyerPhones.get(orderId) !== requireUser().phoneNumber) {
        throw new MockApiError('ORDER_FORBIDDEN', 'That order is not yours.', 403);
      }
      const paid = state.paidOrderIds.has(orderId);
      return delay(
        {
          orderStatus: order.status,
          paymentStatus: paid
            ? 'captured'
            : order.status === 'expired'
              ? 'expired'
              : order.status === 'cancelled'
                ? 'voided'
                : // No attempt has been opened yet, which the backend reports as an empty
                  // status. Only a live intention counts as pending, and only that blocks a
                  // cancel - see `isOrderCancellable`.
                  state.settleAt.has(orderId)
                  ? 'pending'
                  : '',
          ticketsIssued: paid ? order.items.reduce((acc, i) => acc + i.quantity, 0) : 0,
          paidAt: paid ? (state.paidAt.get(orderId) ?? null) : null,
        },
        0.5,
      );
    },

    async retry(orderId: string): Promise<PaymentIntent> {
      const order = state.orders.find((item) => item.id === orderId);
      if (!order) throw new MockApiError('ORDER_NOT_FOUND', 'Order not found', 404);
      if (order.status === 'expired') {
        order.status = 'awaiting_payment';
        order.holdExpiresAt = iso(HOLD_MINUTES * 60 * 1000);
      }
      return mockApi.payments.initiate(orderId);
    },
  },

  tickets: {
    async list(params): Promise<CursorPage<Ticket>> {
      const user = requireUser();
      settleDuePayments();
      const statuses = params?.statuses ?? ['active', 'pending_claim'];
      const data = state.tickets
        .filter(
          (ticket) =>
            state.ticketOwnerPhones.get(ticket.id) === user.phoneNumber ||
            state.ticketBuyerPhones.get(ticket.id) === user.phoneNumber,
        )
        .filter((ticket) => statuses.includes(ticket.status));
      return delay(page(data, params?.cursor, params?.limit, 100));
    },

    async detail(ticketId: string): Promise<Ticket> {
      const ticket = ticketBelongsToUser(ticketId, requireUser());
      return delay(ticket, 0.5);
    },

    async claim(ticketId: string): Promise<Ticket> {
      const user = requireUser();
      const ticket = state.tickets.find((t) => t.id === ticketId);
      if (!ticket) throw new MockApiError('TICKET_NOT_FOUND', 'Ticket not found', 404);
      if (state.ticketOwnerPhones.get(ticket.id) !== user.phoneNumber) {
        throw new MockApiError('TICKET_FORBIDDEN', 'That ticket is not yours.', 403);
      }
      if (ticket.status === 'voided' || ticket.status === 'refunded') {
        throw new MockApiError('TICKET_NOT_CLAIMABLE', 'That ticket cannot be claimed.', 409);
      }
      if (ticket.status === 'active') {
        ticket.usageStatus = ticketUsageStatus(ticket, user);
        return delay(ticket, 0.6);
      }
      ticket.status = 'active';
      ticket.usageStatus = ticketUsageStatus(ticket, user);
      return delay(ticket, 0.6);
    },

    async entryPass(ticketId: string): Promise<EntryPass> {
      const user = requireUser();
      const ticket = ticketBelongsToUser(ticketId, user);
      ticket.usageStatus = ticketUsageStatus(ticket, user);
      if (ticket.usageStatus === 'pending_claim') {
        throw new MockApiError('TICKET_NOT_CLAIMED', 'Claim this ticket before entry.', 403);
      }
      if (ticket.usageStatus === 'selfie_required') {
        throw new MockApiError('SELFIE_REQUIRED', 'A selfie is required for entry', 403);
      }
      if (ticket.usageStatus !== 'usable') {
        throw new MockApiError('TICKET_NOT_USABLE', 'This ticket cannot be used for entry.', 403);
      }
      const rotation = 30;
      const window = Math.floor(mockConfig.now() / (rotation * 1000));
      return delay(
        {
          ticketId,
          payload: `SKN1.${ticket.ticketNumber}.${window}.${Math.abs(
            hash(`${ticket.id}:${window}`),
          ).toString(36)}`,
          issuedAt: iso(),
          expiresAt: iso(rotation * 1000),
          refreshAfterSeconds: rotation,
        },
        0.5,
      );
    },

    async addons(ticketId: string, includeRefunded = false): Promise<TicketAddon[]> {
      const ticket = ticketBelongsToUser(ticketId, requireUser());
      const issued = state.ticketAddons.get(ticket.id) ?? [];

      return delay(
        includeRefunded ? issued : issued.filter((addon) => addon.status !== 'refunded'),
        0.5,
      );
    },

    async addonContext(ticketId: string): Promise<TicketAddonContext> {
      const user = requireUser();
      const ticket = ticketBelongsToUser(ticketId, user);

      // Self-only, and only while the ticket is usable: extras attach to a ticket, so a voided or
      // refunded one has nothing to attach them to.
      if (ticket.status !== 'active') {
        throw new MockApiError(
          'EXISTING_TICKET_NOT_ELIGIBLE',
          'This ticket cannot take extras.',
          400,
        );
      }

      const existing = state.ticketAddons.get(ticket.id) ?? [];

      return delay(
        {
          ticketId: ticket.id,
          eventId: ticket.event.id,
          existing: {
            addons: existing,
            hasAccommodation:
              state.accommodationTicketIds.get(ticket.event.id)?.has(ticket.id) ?? false,
          },
          catalog: listAddonDetails(ticket.event.id),
        },
        0.7,
      );
    },
  },

  account: {
    async deletionPreview(): Promise<AccountDeletionPreview> {
      requireUser();
      const active = state.tickets.filter((t) => t.status === 'active');
      const byEvent = new Map<
        string,
        { id: string; title: string; startsAt: string; ticketCount: number }
      >();
      for (const t of active) {
        const existing = byEvent.get(t.event.id);
        if (existing) existing.ticketCount += 1;
        else
          byEvent.set(t.event.id, {
            id: t.event.id,
            title: t.event.title,
            startsAt: t.days[0]?.startsAt ?? '',
            ticketCount: 1,
          });
      }
      return delay({
        activeTicketCount: active.length,
        affectedEvents: [...byEvent.values()],
        requiresForfeitConfirmation: false,
        pendingPaymentOrderCount: 0,
        deletionBlockedByPendingPayment: false,
        dataRetainedDays: 30,
      });
    },

    async requestDeletionOtp(): Promise<void> {
      requireUser();
      return delay(undefined);
    },

    async delete(code: string): Promise<void> {
      const user = requireUser();
      if (code !== OTP_CODE) {
        throw new MockApiError('OTP_INVALID', 'That code is not right. Try again.');
      }
      transitionExpiredOrders();
      // The number is released here, exactly as the backend does it: the dead record is filed
      // under a hash so nothing can look it up by phone and bring it back.
      state.deletedAccounts.set(deletedAccountKey(user.phoneNumber), {
        user: { ...user, status: 'deleted', phoneNumber: '' },
        tickets: state.tickets.map((ticket) => ({ ...ticket })),
        orders: state.orders.map((order) => ({ ...order })),
        ticketOwnerPhones: new Map(state.ticketOwnerPhones),
        ticketBuyerPhones: new Map(state.ticketBuyerPhones),
        orderBuyerPhones: new Map(state.orderBuyerPhones),
        orderBuyerNames: new Map(state.orderBuyerNames),
      });
      // The account itself stops existing under this number, which is what frees it for a
      // brand new signup.
      state.accounts.delete(user.phoneNumber);
      state.user = null;
      state.pendingPhone = null;
      state.pendingEmailVerificationToken = null;
      state.tickets = [];
      state.orders = [];
      state.ticketOwnerPhones.clear();
      state.ticketBuyerPhones.clear();
      state.orderBuyerPhones.clear();
      state.orderBuyerNames.clear();
      state.paidOrderIds.clear();
      state.paidAt.clear();
      state.settleAt.clear();
      return delay(undefined, 1.25);
    },
  },
};

/** Stands in for the backend's peppered phone hash: enough to file the row, not to find it. */
function deletedAccountKey(phoneE164: string): string {
  return `deleted:${hash(phoneE164)}`;
}

function hash(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h << 5) - h + input.charCodeAt(i);
    h |= 0;
  }
  return h;
}

/** Exposed for tests and the dev menu. */
export const MOCK_OTP_CODE = OTP_CODE;
export const MOCK_EMAIL_VERIFICATION_TOKEN = EMAIL_VERIFICATION_TOKEN;
export { toEgp };
