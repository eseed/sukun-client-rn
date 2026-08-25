import { normalizePhone, requiresLivingArea } from '../../lib/phone';
import type { SukunApi } from '../contract';
import type {
  AccountDeletionPreview,
  Area,
  Authenticated,
  CreateOrderInput,
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
  PaymentIntent,
  PaymentStatus,
  PricePreview,
  PromoValidationResult,
  SessionTokens,
  SelfieResponse,
  Ticket,
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
import { applyRate, clampDiscount, multiply, subtract, sum, toEgp, toPiastres } from './money';

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
export const mockConfig = {
  /** Simulated round-trip time, so loading states are exercised in the real app. */
  latencyMs: 320,
  /** How long after `payments.initiate` the simulated provider webhook lands. */
  settleDelayMs: 4000,
  now: (): number => Date.now(),
};

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
  pendingRestorationPhone: string | null;
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
  pendingRestorationPhone: null,
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
};

/** Test/dev seam: reset the mock between runs. */
export function resetMockState(): void {
  state.user = null;
  state.accounts.clear();
  state.pendingPhone = null;
  state.pendingRestorationPhone = null;
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

function priceItems(eventId: string, items: { tierId: string; quantity: number }[]): string {
  return sum(items.map((i) => multiply(findTier(eventId, i.tierId).priceEgp, i.quantity)));
}

function resolvePromo(code: string | undefined, subtotalEgp: string) {
  if (!code) return { code: null, discountEgp: '0.00', fullyApplied: true, valid: true };
  const found = promoCodes[code.trim().toUpperCase()];
  if (!found)
    return {
      code: code.trim().toUpperCase(),
      discountEgp: '0.00',
      fullyApplied: false,
      valid: false,
    };
  const applied = clampDiscount(found.discountEgp, subtotalEgp);
  return {
    code: code.trim().toUpperCase(),
    discountEgp: applied,
    fullyApplied: toPiastres(applied) === toPiastres(found.discountEgp),
    valid: true,
    configured: found.discountEgp,
  };
}

function findEvent(identifier: string): EventDetail {
  const event =
    eventDetails[identifier] ??
    Object.values(eventDetails).find((item) => item.slug === identifier);
  if (!event) throw new MockApiError('EVENT_NOT_FOUND', 'Event not found', 404);
  return event;
}

function promoApplies(code: string, tierIds: string[]): boolean {
  const configured = promoCodes[code];
  return !configured?.tierIds || tierIds.some((tierId) => configured.tierIds!.includes(tierId));
}

function promoDiscounts(
  eventId: string,
  items: { tierId: string; quantity: number }[],
  discountEgp: string,
): { tierId: string; discountAmountEgp: string }[] {
  const discount = toPiastres(discountEgp);
  const lineAmounts = items.map((item) =>
    toPiastres(multiply(findTier(eventId, item.tierId).priceEgp, item.quantity)),
  );
  const subtotal = lineAmounts.reduce((total, amount) => total + amount, 0);
  let allocated = 0;
  return items.map((item, index) => {
    const amount =
      index === items.length - 1
        ? discount - allocated
        : Math.floor((discount * (lineAmounts[index] ?? 0)) / subtotal);
    allocated += amount;
    return { tierId: item.tierId, discountAmountEgp: toEgp(amount) };
  });
}

function priceOrder(
  eventId: string,
  items: { tierId: string; quantity: number }[],
  promoCode?: string,
): PricePreview {
  const subtotalEgp = priceItems(eventId, items);
  const promo = resolvePromo(promoCode, subtotalEgp);
  const discountEgp =
    promo.valid &&
    promoApplies(
      promo.code ?? '',
      items.map((item) => item.tierId),
    )
      ? promo.discountEgp
      : '0.00';
  const netEgp = subtract(subtotalEgp, discountEgp);
  const vatEnabled = eventDetails[eventId]?.vatEnabled ?? true;
  const vatEgp = vatEnabled ? applyRate(netEgp, VAT_RATE) : '0.00';
  return {
    subtotalEgp,
    discountEgp,
    netEgp,
    vatRate: vatEnabled ? VAT_RATE : '0.00',
    vatEgp,
    totalEgp: sum([netEgp, vatEgp]),
    currency: 'EGP',
    promoCode: promo.valid && toPiastres(discountEgp) > 0 ? promo.code : null,
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
    venueLat: event.venue?.latitude ? Number(event.venue.latitude) : null,
    venueLng: event.venue?.longitude ? Number(event.venue.longitude) : null,
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
        issuedAt: iso(),
      };
      state.tickets.unshift(ticket);
      state.ticketOwnerPhones.set(ticket.id, guest?.phoneNumber ?? buyerPhone ?? '');
      state.ticketBuyerPhones.set(ticket.id, buyerPhone ?? '');
      if (!guest) buyerIssued = true;
    }
  }
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

      if (state.deletedAccounts.has(e164)) {
        throw new MockApiError(
          'ACCOUNT_DELETED',
          'This account is deleted. Restore it to sign in.',
          403,
        );
      }
      const isNewUser = !state.accounts.has(e164);
      if (state.pendingPhone !== e164) {
        throw new MockApiError('OTP_INVALID', 'That code is not right. Try again.');
      }
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

    async requestAccountRestorationOtp(phoneNumber: string): Promise<void> {
      const e164 = normalizePhone(phoneNumber);
      if (!e164) throw new MockApiError('INVALID_PHONE', 'Enter a valid mobile number');
      state.pendingRestorationPhone = e164;
      return delay(undefined);
    },

    async confirmAccountRestoration(input): Promise<Authenticated> {
      const e164 = normalizePhone(input.phoneNumber);
      if (!e164 || e164 !== state.pendingRestorationPhone || input.otpCode !== OTP_CODE) {
        throw new MockApiError('OTP_INVALID', 'That code is not right. Try again.');
      }
      if (state.user?.phoneNumber === e164) {
        throw new MockApiError('ACCOUNT_ALREADY_RESTORED', 'This account is already active.', 409);
      }
      const deleted = state.deletedAccounts.get(e164);
      if (!deleted) {
        throw new MockApiError(
          'ACCOUNT_RESTORATION_NOT_ALLOWED',
          'This account cannot be restored.',
          403,
        );
      }
      state.user = refreshUserStatus({
        ...deleted.user,
        status: deleted.user.profileComplete ? 'active' : 'pending_profile',
      });
      state.tickets = deleted.tickets;
      state.orders = deleted.orders;
      state.ticketOwnerPhones = new Map(deleted.ticketOwnerPhones);
      state.ticketBuyerPhones = new Map(deleted.ticketBuyerPhones);
      state.orderBuyerPhones = new Map(deleted.orderBuyerPhones);
      state.orderBuyerNames = new Map(deleted.orderBuyerNames);
      state.accounts.set(e164, state.user);
      state.pendingRestorationPhone = null;
      return delay(authenticated(state.user, false));
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

  orders: {
    async previewPrice({ eventId, items, promoCode }): Promise<PricePreview> {
      return delay(priceOrder(eventId, items, promoCode), 0.6);
    },

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

    async validatePromoCode(items, promoCode): Promise<PromoValidationResult> {
      const eventId =
        Object.values(eventDetails).find((e) => e.tiers.some((t) => t.id === items[0]?.tierId))
          ?.id ?? '';
      const subtotal = eventId ? priceItems(eventId, items) : '0.00';
      const promo = resolvePromo(promoCode, subtotal);

      if (!promo.valid) {
        throw new MockApiError('PROMO_CODE_NOT_FOUND', 'That promo code is not valid.', 404);
      }
      if (
        !promoApplies(
          promo.code ?? '',
          items.map((item) => item.tierId),
        )
      ) {
        throw new MockApiError(
          'PROMO_CODE_NOT_APPLICABLE_TO_TIER',
          'That promo code does not apply to these tickets.',
          400,
        );
      }

      return delay({
        valid: true,
        code: promo.code ?? '',
        discountAmountEgp: promo.configured ?? promo.discountEgp,
        discountAppliedEgp: promo.discountEgp,
        fullyApplied: promo.fullyApplied,
        items: promoDiscounts(eventId, items, promo.discountEgp),
      });
    },

    async create(input: CreateOrderInput): Promise<OrderDetail> {
      const user = requireUser();
      transitionExpiredOrders();
      if (!user.profileComplete) {
        throw new MockApiError('PROFILE_INCOMPLETE', 'Complete your profile to buy tickets', 403);
      }

      const event = findEvent(input.eventId);
      const totalQuantity = input.items.reduce((total, item) => total + item.quantity, 0);
      if (!input.items.length || input.items.some((item) => item.quantity < 1)) {
        throw new MockApiError('VALIDATION_ERROR', 'Add at least one ticket.', 400);
      }
      const buyerTakesTicket = input.buyerTierId !== null && input.buyerTierId !== undefined;
      if (totalQuantity !== input.guests.length + (buyerTakesTicket ? 1 : 0)) {
        throw new MockApiError(
          'GUEST_ALLOCATION_INVALID',
          buyerTakesTicket
            ? 'Attach one guest for each additional ticket.'
            : 'Attach a guest for every ticket in this order.',
          400,
        );
      }
      // One usable ticket per phone per event. Asking for a second of your own is refused here
      // rather than after payment, which is where the backend's unique index would catch it.
      if (buyerTakesTicket && buyerHoldsTicketForEvent(input.eventId)) {
        throw new MockApiError(
          'BUYER_ALREADY_HAS_TICKET',
          'You already have a ticket for this event. Buy these for your guests instead.',
          409,
        );
      }
      if (totalQuantity > event.maxTicketsPerOrder) {
        throw new MockApiError(
          'MAX_TICKETS_PER_ORDER_EXCEEDED',
          'That is more tickets than this event allows in one order.',
          400,
        );
      }
      const guestValidation = await mockApi.orders.validateGuests(input.eventId, input.guests);
      if (!guestValidation.valid) {
        throw new MockApiError(
          'GUEST_VALIDATION_FAILED',
          'Check the guest details and try again.',
          400,
        );
      }

      const pricing = priceOrder(input.eventId, input.items, input.promoCode);
      const order: OrderDetail = {
        id: `ord-${mockConfig.now()}-${orderSeq + 1}`,
        orderNumber: nextOrderNumber(),
        eventId: input.eventId,
        status: 'awaiting_payment',
        buyerTierId: input.buyerTierId ?? null,
        subtotalEgp: pricing.subtotalEgp,
        discountEgp: pricing.discountEgp,
        netEgp: pricing.netEgp,
        vatRate: pricing.vatRate,
        vatEgp: pricing.vatEgp,
        totalEgp: pricing.totalEgp,
        currency: 'EGP',
        holdExpiresAt: iso(HOLD_MINUTES * 60 * 1000),
        createdAt: iso(),
        items: input.items.map((i) => {
          const tier = findTier(input.eventId, i.tierId);
          return {
            tierId: i.tierId,
            quantity: i.quantity,
            unitPriceEgp: tier.priceEgp,
            lineTotalEgp: multiply(tier.priceEgp, i.quantity),
          };
        }),
        guests: input.guests.map((g) => ({
          phoneNumber: normalizePhone(g.phoneNumber) ?? g.phoneNumber,
          name: g.name,
          tierId: g.tierId,
        })),
      };

      state.orders.unshift(order);
      state.orderBuyerPhones.set(order.id, user.phoneNumber);
      state.orderBuyerNames.set(order.id, user.fullName ?? 'You');
      return delay(order, 1.6);
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
                : 'pending',
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
        ticketsRestoredAfterAccountRestore: true,
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
      state.deletedAccounts.set(user.phoneNumber, {
        user: { ...user, status: 'deleted' },
        tickets: state.tickets.map((ticket) => ({ ...ticket })),
        orders: state.orders.map((order) => ({ ...order })),
        ticketOwnerPhones: new Map(state.ticketOwnerPhones),
        ticketBuyerPhones: new Map(state.ticketBuyerPhones),
        orderBuyerPhones: new Map(state.orderBuyerPhones),
        orderBuyerNames: new Map(state.orderBuyerNames),
      });
      state.user = null;
      state.pendingPhone = null;
      state.pendingRestorationPhone = null;
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
