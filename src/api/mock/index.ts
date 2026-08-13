import { normalizeEgyptianPhone } from '../../lib/phone';
import type { SukunApi } from '../contract';
import type {
  AccountDeletionPreview,
  Area,
  Authenticated,
  CreateOrderInput,
  CurrentUser,
  CursorPage,
  EntryPass,
  EventDetail,
  EventListItem,
  GuestValidationIssue,
  GuestValidationResult,
  ListEventsQuery,
  OrderDetail,
  OrderGuestInput,
  OrderSummary,
  OtpRequested,
  PaymentIntent,
  PaymentStatus,
  PricePreview,
  PromoValidationResult,
  SessionTokens,
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
const HOLD_MINUTES = 15;

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
  pendingPhone: string | null;
  tickets: Ticket[];
  orders: OrderDetail[];
  /** Order ids that the "webhook" has settled. */
  paidOrderIds: Set<string>;
  /** Wall-clock at which an initiated payment auto-settles, simulating the webhook. */
  settleAt: Map<string, number>;
}

const state: MockState = {
  user: null,
  pendingPhone: null,
  tickets: [],
  orders: [],
  paidOrderIds: new Set(),
  settleAt: new Map(),
};

/** Test/dev seam: reset the mock between runs. */
export function resetMockState(): void {
  state.user = null;
  state.pendingPhone = null;
  state.tickets = [];
  state.orders = [];
  state.paidOrderIds.clear();
  state.settleAt.clear();
  orderSeq = 482;
  ticketSeq = 4821;
}

function requireUser(): CurrentUser {
  if (!state.user) throw new MockApiError('UNAUTHORIZED', 'Not signed in', 401);
  return state.user;
}

/** The six fields that gate purchase (CLAUDE.md rule 8). Email verification is NOT one. */
function computeProfileComplete(user: CurrentUser): boolean {
  return Boolean(
    user.fullName && user.email && user.dateOfBirth && user.gender && user.area && user.selfieUploaded,
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
  if (!found) return { code: code.trim().toUpperCase(), discountEgp: '0.00', fullyApplied: false, valid: false };
  const applied = clampDiscount(found.discountEgp, subtotalEgp);
  return {
    code: code.trim().toUpperCase(),
    discountEgp: applied,
    fullyApplied: toPiastres(applied) === toPiastres(found.discountEgp),
    valid: true,
    configured: found.discountEgp,
  };
}

function priceOrder(
  eventId: string,
  items: { tierId: string; quantity: number }[],
  promoCode?: string,
): PricePreview {
  const subtotalEgp = priceItems(eventId, items);
  const promo = resolvePromo(promoCode, subtotalEgp);
  const discountEgp = promo.valid ? promo.discountEgp : '0.00';
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
  const now = mockConfig.now();
  for (const [orderId, due] of state.settleAt.entries()) {
    if (now < due) continue;
    state.settleAt.delete(orderId);
    state.paidOrderIds.add(orderId);
    const order = state.orders.find((o) => o.id === orderId);
    if (!order) continue;
    order.status = 'paid';
    issueTicketsFor(order);
  }
}

function issueTicketsFor(order: OrderDetail): void {
  const event = eventDetails[order.eventId];
  if (!event) return;
  const holder = state.user?.fullName ?? 'You';
  const guestPhones = new Set(order.guests.map((g) => g.phoneNumber));

  const ticketEvent = {
    id: event.id,
    slug: event.slug,
    title: event.title,
    coverImageUrl: event.coverImageUrl,
    venueName: event.venue.name,
    venueLat: event.venue.latitude ? Number(event.venue.latitude) : null,
    venueLng: event.venue.longitude ? Number(event.venue.longitude) : null,
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
      // The buyer's own ticket is the first of the tier; the rest go to attached guests.
      const guest = n === 0 ? null : order.guests[n - 1];
      state.tickets.unshift({
        id: `tk-${order.id}-${item.tierId}-${n}`,
        ticketNumber: nextTicketNumber(),
        // A guest's ticket exists before its owner does — it binds when that number
        // registers (CLAUDE.md rule 2). No claim codes.
        status: guest ? 'pending_claim' : 'active',
        usageStatus: guest ? 'pending_claim' : 'usable',
        source: 'order',
        event: ticketEvent,
        tier: { id: tier.id, name: tier.name },
        days,
        holderName: guest ? guest.name : holder,
        orderNumber: order.orderNumber,
        purchasedBy: { name: holder, isSelf: !guest },
        issuedAt: iso(),
      });
    }
  }
  void guestPhones;
}

/* ------------------------------------------------------------------- api */

export const mockApi: SukunApi = {
  auth: {
    async requestOtp(phoneNumber: string): Promise<OtpRequested> {
      const e164 = normalizeEgyptianPhone(phoneNumber);
      if (!e164) throw new MockApiError('INVALID_PHONE', 'Enter a valid Egyptian mobile number');
      state.pendingPhone = e164;
      // Identical response whether or not this number has an account (CLAUDE.md rule 4).
      return delay({ sent: true, expiresInSeconds: 300, resendAfterSeconds: 30 });
    },

    async verifyOtp(phoneNumber: string, code: string): Promise<Authenticated> {
      const e164 = normalizeEgyptianPhone(phoneNumber);
      if (!e164) throw new MockApiError('INVALID_PHONE', 'Enter a valid Egyptian mobile number');
      if (code !== OTP_CODE) {
        throw new MockApiError('OTP_INVALID', 'That code is not right. Try again.');
      }

      const user = state.user?.phoneNumber === e164 ? state.user : emptyUser(e164);
      state.user = refreshUserStatus(user);

      // Any ticket already waiting on this number binds now (CLAUDE.md rule 2).
      state.tickets = state.tickets.map((t) =>
        t.status === 'pending_claim' && t.holderName === state.user?.fullName
          ? { ...t, status: 'active', usageStatus: 'usable' }
          : t,
      );

      return delay({
        tokens: {
          accessToken: `mock-access-${Date.now()}`,
          refreshToken: `mock-refresh-${Date.now()}`,
          expiresIn: 900,
        },
        user: state.user,
      });
    },

    async refresh(): Promise<SessionTokens> {
      return delay(
        {
          accessToken: `mock-access-${Date.now()}`,
          refreshToken: `mock-refresh-${Date.now()}`,
          expiresIn: 900,
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
        dateOfBirth: input.dateOfBirth ?? user.dateOfBirth,
        gender: input.gender ?? user.gender,
        area,
      });

      if (state.tickets.length === 0 && state.user.fullName) {
        state.tickets = seedTickets(state.user.fullName);
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
      return delay(state.user, 1.9);
    },

    async sendEmailVerification(): Promise<void> {
      requireUser();
      return delay(undefined);
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
      return delay({
        data,
        meta: { limit: query?.limit ?? 20, hasNextPage: false, nextCursor: null },
      });
    },

    async detail(identifier: string): Promise<EventDetail> {
      const found =
        eventDetails[identifier] ??
        Object.values(eventDetails).find((e) => e.slug === identifier);
      if (!found) throw new MockApiError('EVENT_NOT_FOUND', 'Event not found', 404);
      return delay(found);
    },
  },

  orders: {
    async previewPrice({ eventId, items, promoCode }): Promise<PricePreview> {
      return delay(priceOrder(eventId, items, promoCode), 0.6);
    },

    async validateGuests(
      eventId: string,
      guests: OrderGuestInput[],
    ): Promise<GuestValidationResult> {
      const buyer = requireUser();
      const issues: GuestValidationIssue[] = [];
      const seen = new Set<string>();
      const maxTickets = eventDetails[eventId]?.maxTicketsPerOrder ?? 6;

      guests.forEach((guest, guestIndex) => {
        const e164 = normalizeEgyptianPhone(guest.phoneNumber);
        if (!e164) {
          issues.push({ guestIndex, error: 'GUEST_PHONE_INVALID' });
          return;
        }
        if (e164 === buyer.phoneNumber) {
          issues.push({ guestIndex, error: 'GUEST_IS_BUYER' });
          return;
        }
        if (seen.has(e164)) {
          issues.push({ guestIndex, error: 'GUEST_DUPLICATE' });
          return;
        }
        seen.add(e164);
      });

      if (guests.length + 1 > maxTickets) {
        issues.push({ guestIndex: guests.length - 1, error: 'MAX_TICKETS_EXCEEDED' });
      }

      // Deliberately no "already has a ticket" / "is registered" signal: the response shape
      // is identical for registered and unregistered numbers (CLAUDE.md rule 4).
      return delay({ valid: issues.length === 0, issues }, 0.7);
    },

    async validatePromoCode(items, promoCode): Promise<PromoValidationResult> {
      const eventId =
        Object.values(eventDetails).find((e) =>
          e.tiers.some((t) => t.id === items[0]?.tierId),
        )?.id ?? '';
      const subtotal = eventId ? priceItems(eventId, items) : '0.00';
      const promo = resolvePromo(promoCode, subtotal);

      if (!promo.valid) {
        throw new MockApiError('PROMO_CODE_INVALID', 'That promo code is not valid.');
      }

      return delay({
        valid: true,
        code: promo.code ?? '',
        discountAmountEgp: promo.configured ?? promo.discountEgp,
        discountAppliedEgp: promo.discountEgp,
        fullyApplied: promo.fullyApplied,
        items: items.map((i) => ({ tierId: i.tierId, discountAmountEgp: promo.discountEgp })),
      });
    },

    async create(input: CreateOrderInput): Promise<OrderDetail> {
      const user = requireUser();
      if (!user.profileComplete) {
        throw new MockApiError('PROFILE_INCOMPLETE', 'Complete your profile to buy tickets', 403);
      }

      const pricing = priceOrder(input.eventId, input.items, input.promoCode);
      const order: OrderDetail = {
        id: `ord-${mockConfig.now()}-${orderSeq}`,
        orderNumber: nextOrderNumber(),
        eventId: input.eventId,
        status: 'awaiting_payment',
        buyerTierId: input.buyerTierId,
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
          phoneNumber: normalizeEgyptianPhone(g.phoneNumber) ?? g.phoneNumber,
          name: g.name,
          tierId: g.tierId,
        })),
      };

      state.orders.unshift(order);
      return delay(order, 1.6);
    },

    async detail(orderId: string): Promise<OrderDetail> {
      settleDuePayments();
      const order = state.orders.find((o) => o.id === orderId);
      if (!order) throw new MockApiError('ORDER_NOT_FOUND', 'Order not found', 404);
      return delay(order, 0.5);
    },

    async list(cursor?: string | null, limit = 20): Promise<CursorPage<OrderSummary>> {
      settleDuePayments();
      return delay({
        data: state.orders.map((o) => ({
          id: o.id,
          orderNumber: o.orderNumber,
          eventId: o.eventId,
          status: o.status,
          totalEgp: o.totalEgp,
          currency: o.currency,
          holdExpiresAt: o.holdExpiresAt,
          createdAt: o.createdAt,
        })),
        meta: { limit, hasNextPage: false, nextCursor: null },
      });
    },

    async cancel(orderId: string): Promise<OrderDetail> {
      const order = state.orders.find((o) => o.id === orderId);
      if (!order) throw new MockApiError('ORDER_NOT_FOUND', 'Order not found', 404);
      if (order.status === 'awaiting_payment') order.status = 'cancelled';
      state.settleAt.delete(orderId);
      return delay(order, 0.6);
    },
  },

  payments: {
    async initiate(orderId: string): Promise<PaymentIntent> {
      const order = state.orders.find((o) => o.id === orderId);
      if (!order) throw new MockApiError('ORDER_NOT_FOUND', 'Order not found', 404);
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
      const paid = state.paidOrderIds.has(orderId);
      return delay(
        {
          orderStatus: order.status,
          paymentStatus: paid ? 'captured' : 'pending',
          ticketsIssued: paid
            ? order.items.reduce((acc, i) => acc + i.quantity, 0)
            : 0,
          paidAt: paid ? iso() : null,
        },
        0.5,
      );
    },

    async retry(orderId: string): Promise<PaymentIntent> {
      return mockApi.payments.initiate(orderId);
    },
  },

  tickets: {
    async list(params): Promise<CursorPage<Ticket>> {
      requireUser();
      settleDuePayments();
      const statuses = params?.statuses ?? ['active', 'pending_claim'];
      return delay({
        data: state.tickets.filter((t) => statuses.includes(t.status)),
        meta: { limit: params?.limit ?? 20, hasNextPage: false, nextCursor: null },
      });
    },

    async detail(ticketId: string): Promise<Ticket> {
      requireUser();
      const ticket = state.tickets.find((t) => t.id === ticketId);
      if (!ticket) throw new MockApiError('TICKET_NOT_FOUND', 'Ticket not found', 404);
      return delay(ticket, 0.5);
    },

    async claim(ticketId: string): Promise<Ticket> {
      requireUser();
      const ticket = state.tickets.find((t) => t.id === ticketId);
      if (!ticket) throw new MockApiError('TICKET_NOT_FOUND', 'Ticket not found', 404);
      ticket.status = 'active';
      ticket.usageStatus = 'usable';
      return delay(ticket, 0.6);
    },

    async entryPass(ticketId: string): Promise<EntryPass> {
      const user = requireUser();
      const ticket = state.tickets.find((t) => t.id === ticketId);
      if (!ticket) throw new MockApiError('TICKET_NOT_FOUND', 'Ticket not found', 404);
      if (!user.selfieUploaded) {
        throw new MockApiError('SELFIE_REQUIRED', 'A selfie is required for entry', 403);
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
      const byEvent = new Map<string, { id: string; title: string; startsAt: string; ticketCount: number }>();
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
        requiresForfeitConfirmation: active.length > 0,
        pendingPaymentOrderCount: 0,
        deletionBlockedByPendingPayment: false,
        dataRetainedDays: 30,
        ticketsRestoredAfterAccountRestore: true,
      });
    },

    async requestDeletionOtp(): Promise<OtpRequested> {
      requireUser();
      return delay({ sent: true, expiresInSeconds: 300, resendAfterSeconds: 30 });
    },

    async delete(code: string): Promise<void> {
      requireUser();
      if (code !== OTP_CODE) {
        throw new MockApiError('OTP_INVALID', 'That code is not right. Try again.');
      }
      resetMockState();
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
export { toEgp };
