import {
  mockApi,
  mockConfig,
  MOCK_EMAIL_VERIFICATION_TOKEN,
  MOCK_OTP_CODE,
  resetMockState,
} from '..';
import { SOUND_BATH_ID, TIER_DAY1, TIER_SOUND_GA, TIER_WEEKEND, TULUA_ID } from '../fixtures';

/** Drives the mock's clock so webhook timing can be asserted without sleeping. */
let clock = Date.parse('2026-08-12T12:00:00.000Z');
const advance = (ms: number) => {
  clock += ms;
};

/**
 * The mock is where P0 business logic lives, so these tests are the ones that protect the
 * product rules in CLAUDE.md. They should keep passing when the live backend replaces it.
 */

async function signIn(phone = '+201012345678') {
  await mockApi.auth.requestOtp(phone);
  return mockApi.auth.verifyOtp(phone, MOCK_OTP_CODE);
}

async function completeProfile() {
  await mockApi.profile.update({
    fullName: 'Yasmin El Sayed',
    email: 'yasmin@email.com',
    dateOfBirth: '1994-03-12',
    gender: 'female',
    areaId: 'ar-maadi',
  });
  return mockApi.profile.uploadSelfie('file:///selfie.jpg');
}

/**
 * Places an order the way the app does: cart, tickets, preview, confirm, place. Wrapped up here
 * so a test that only cares about what happens *after* an order exists does not have to spell the
 * whole checkout out again.
 */
async function placeOrder(input: {
  eventId: string;
  buyerTierId: string | null;
  items: { tierId: string; quantity: number }[];
  guests: { phoneNumber: string; name: string; tierId: string }[];
  promoCode?: string;
}) {
  const cart = await mockApi.carts.create(input.eventId);
  await mockApi.carts.replaceTickets(cart.id, {
    buyerTierId: input.buyerTierId,
    items: input.items,
    guests: input.guests,
  });
  if (input.promoCode) {
    await mockApi.carts.applyPromo(cart.id, input.promoCode);
  }
  const preview = await mockApi.carts.preview(cart.id);
  return mockApi.carts.placeOrder(cart.id, preview.pricing.pricingConfirmationToken!);
}

function toCents(egp: string): number {
  const [whole = '0', frac = ''] = egp.split('.');
  return parseInt(whole, 10) * 100 + parseInt((frac + '00').slice(0, 2), 10);
}
function fromCents(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}
const addStrings = (a: string, b: string) => fromCents(toCents(a) + toCents(b));
const subtractStrings = (a: string, b: string) => fromCents(toCents(a) - toCents(b));

beforeEach(() => {
  resetMockState();
  clock = Date.parse('2026-08-12T12:00:00.000Z');
  mockConfig.latencyMs = 0;
  mockConfig.settleDelayMs = 4000;
  mockConfig.now = () => clock;
});

describe('auth', () => {
  it('rejects a number that is not an Egyptian mobile', async () => {
    await expect(mockApi.auth.requestOtp('0223456789')).rejects.toMatchObject({
      code: 'INVALID_PHONE',
    });
  });

  it('responds identically for a registered and an unregistered number', async () => {
    // Rule 4: nothing may disclose whether an account exists.
    const first = await mockApi.auth.requestOtp('+201012345678');
    await signIn('+201012345678');
    const second = await mockApi.auth.requestOtp('+201012345678');
    expect(second).toEqual(first);
  });

  it('rejects a wrong code', async () => {
    await mockApi.auth.requestOtp('+201012345678');
    await expect(mockApi.auth.verifyOtp('+201012345678', '0000')).rejects.toMatchObject({
      code: 'OTP_INVALID',
    });
  });

  it('starts a new user pending_profile', async () => {
    const { user } = await signIn();
    expect(user.status).toBe('pending_profile');
    expect(user.profileComplete).toBe(false);
  });

  it('binds pending tickets by phone, not guest name', async () => {
    await signIn();
    await completeProfile();
    // completeProfile seeds this user a Tulua ticket, so a further Tulua order is entirely
    // for other people - one usable ticket per phone per event.
    const order = await placeOrder({
      eventId: TULUA_ID,
      buyerTierId: null,
      items: [{ tierId: TIER_WEEKEND, quantity: 1 }],
      guests: [{ phoneNumber: '+201022334455', name: 'Same name', tierId: TIER_WEEKEND }],
    });
    await mockApi.payments.initiate(order.id);
    advance(5000);
    await mockApi.payments.status(order.id);
    await mockApi.auth.logout();

    await signIn('+201022334455');
    const { data } = await mockApi.tickets.list();
    expect(
      data.some((ticket) => ticket.status === 'active' && ticket.holderName === 'Same name'),
    ).toBe(true);
  });
});

describe('profile completeness gates purchase', () => {
  it('needs all six fields, and the selfie is one of them', async () => {
    await signIn();
    const withoutSelfie = await mockApi.profile.update({
      fullName: 'Yasmin El Sayed',
      email: 'yasmin@email.com',
      dateOfBirth: '1994-03-12',
      gender: 'female',
      areaId: 'ar-maadi',
    });
    expect(withoutSelfie.profileComplete).toBe(false);

    const withSelfie = await mockApi.profile.uploadSelfie('file:///selfie.jpg');
    expect(withSelfie.profileComplete).toBe(true);
    expect(withSelfie.status).toBe('active');
  });

  it('does not require email verification', async () => {
    await signIn();
    const user = await completeProfile();
    expect(user.emailVerified).toBe(false);
    expect(user.profileComplete).toBe(true);
  });

  it('refuses to create an order for an incomplete profile', async () => {
    await signIn();
    await expect(
      placeOrder({
        eventId: TULUA_ID,
        buyerTierId: TIER_WEEKEND,
        items: [{ tierId: TIER_WEEKEND, quantity: 1 }],
        guests: [],
      }),
    ).rejects.toMatchObject({ code: 'PROFILE_INCOMPLETE' });
  });
});

describe('cart pricing', () => {
  /** Every pricing assertion goes through a real cart, because that is the only way to price. */
  async function previewFor(input: {
    eventId: string;
    items: { tierId: string; quantity: number }[];
    promoCode?: string;
  }) {
    const cart = await mockApi.carts.create(input.eventId);
    await mockApi.carts.replaceTickets(cart.id, {
      buyerTierId: input.items[0]!.tierId,
      items: input.items,
      guests: [],
    });
    if (input.promoCode) {
      await mockApi.carts.applyPromo(cart.id, input.promoCode).catch(() => undefined);
    }
    return mockApi.carts.preview(cart.id);
  }

  beforeEach(async () => {
    await signIn();
    await completeProfile();
  });

  it('applies VAT to the discounted net, matching the server formula', async () => {
    const { pricing } = await previewFor({
      eventId: SOUND_BATH_ID,
      items: [{ tierId: TIER_SOUND_GA, quantity: 1 }],
    });

    expect(pricing.status).toBe('complete');
    expect(pricing.netEgp).toBe(subtractStrings(pricing.subtotalEgp!, pricing.discountEgp!));
    expect(pricing.totalEgp).toBe(addStrings(pricing.netEgp!, pricing.vatEgp!));
    expect(pricing.ticketsSubtotalEgp).toBe(pricing.subtotalEgp);
  });

  it('separates ticket and addon subtotals', async () => {
    const cart = await mockApi.carts.create(TULUA_ID);
    const ticketed = await mockApi.carts.replaceTickets(cart.id, {
      buyerTierId: null,
      items: [{ tierId: TIER_WEEKEND, quantity: 1 }],
      guests: [{ phoneNumber: '+201099887766', name: 'Nour Hassan', tierId: TIER_WEEKEND }],
    });
    await mockApi.carts.replaceAddons(cart.id, [
      {
        optionId: 'opt-dinner',
        quantity: 2,
        assignments: [{ cartAttendeeId: ticketed.attendees[0]!.cartAttendeeId, quantity: 2 }],
      },
    ]);

    const { pricing } = await mockApi.carts.preview(cart.id);

    expect(pricing.ticketsSubtotalEgp).toBe('1600.00');
    expect(pricing.addonsSubtotalEgp).toBe('560.00');
    expect(pricing.subtotalEgp).toBe('2160.00');
  });

  it('refuses a promo that discounts nothing in this cart', async () => {
    const cart = await mockApi.carts.create(TULUA_ID);
    await mockApi.carts.replaceTickets(cart.id, {
      buyerTierId: null,
      items: [{ tierId: TIER_WEEKEND, quantity: 1 }],
      guests: [{ phoneNumber: '+201099887766', name: 'Nour Hassan', tierId: TIER_WEEKEND }],
    });

    // Scoped to a meal option this cart does not contain.
    await expect(mockApi.carts.applyPromo(cart.id, 'DINNER50')).rejects.toMatchObject({
      code: 'PROMO_NOT_APPLICABLE_TO_CART',
    });
  });

  it('rejects an unknown promo code', async () => {
    const cart = await mockApi.carts.create(TULUA_ID);
    await expect(mockApi.carts.applyPromo(cart.id, 'NOPE')).rejects.toMatchObject({
      code: 'PROMO_CODE_NOT_FOUND',
      status: 404,
    });
  });

  it('detaches a promo that stops applying when the cart changes', async () => {
    const cart = await mockApi.carts.create(TULUA_ID);
    const ticketed = await mockApi.carts.replaceTickets(cart.id, {
      buyerTierId: null,
      items: [{ tierId: TIER_WEEKEND, quantity: 1 }],
      guests: [{ phoneNumber: '+201099887766', name: 'Nour Hassan', tierId: TIER_WEEKEND }],
    });
    await mockApi.carts.replaceAddons(cart.id, [
      {
        optionId: 'opt-dinner',
        quantity: 1,
        assignments: [{ cartAttendeeId: ticketed.attendees[0]!.cartAttendeeId, quantity: 1 }],
      },
    ]);
    await mockApi.carts.applyPromo(cart.id, 'DINNER50');

    // Dropping the only meal strands the code, so the cart says it removed it rather than
    // showing a code with no money behind it.
    const after = await mockApi.carts.replaceAddons(cart.id, []);

    expect(after.promoAdjustment).toEqual({
      removed: true,
      reason: 'PROMO_SCOPE_NO_LONGER_APPLICABLE',
      previousPromoCode: 'DINNER50',
    });
  });
});

describe('guest validation', () => {
  beforeEach(async () => {
    await signIn();
    await completeProfile();
  });

  it('accepts valid distinct guests', async () => {
    const result = await mockApi.orders.validateGuests(TULUA_ID, [
      { phoneNumber: '+201022334455' },
    ]);
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('flags an invalid number, a duplicate, and the buyer', async () => {
    const result = await mockApi.orders.validateGuests(TULUA_ID, [
      { phoneNumber: '0223456789' },
      { phoneNumber: '+201022334455' },
      { phoneNumber: '+201022334455' },
      { phoneNumber: '+201012345678' },
    ]);
    expect(result.valid).toBe(false);
    expect(result.issues.map((i) => i.error)).toEqual([
      'INVALID_PHONE_NUMBER',
      'DUPLICATE_IN_ORDER',
      'SAME_AS_BUYER',
    ]);
  });

  it('never signals whether a guest number is registered', async () => {
    // Rule 4: an unregistered number and a registered one must validate identically.
    const unregistered = await mockApi.orders.validateGuests(TULUA_ID, [
      { phoneNumber: '+201199887766' },
    ]);
    const registered = await mockApi.orders.validateGuests(TULUA_ID, [
      { phoneNumber: '+201022334455' },
    ]);
    expect(unregistered).toEqual(registered);
  });
});

describe('order and ticket lifecycle', () => {
  beforeEach(async () => {
    await signIn();
    await completeProfile();
  });

  it('creates an order awaiting payment with server-priced totals', async () => {
    const order = await placeOrder({
      eventId: TULUA_ID,
      buyerTierId: null,
      items: [{ tierId: TIER_WEEKEND, quantity: 2 }],
      guests: [
        { phoneNumber: '+201022334455', name: 'Nour Hassan', tierId: TIER_WEEKEND },
        { phoneNumber: '+201033445566', name: 'Omar Fathy', tierId: TIER_WEEKEND },
      ],
      promoCode: 'SUKUN10',
    });

    expect(order.status).toBe('awaiting_payment');
    // Two tickets cost the same whoever holds them.
    expect(order.totalEgp).toBe('3283.20');
    expect(order.orderNumber).toMatch(/^SKN-2026-\d{6}$/);
    expect(order.guests).toHaveLength(2);
  });

  it('issues tickets only after the webhook settles, not on redirect', async () => {
    const order = await placeOrder({
      eventId: TULUA_ID,
      buyerTierId: null,
      items: [{ tierId: TIER_WEEKEND, quantity: 2 }],
      guests: [
        { phoneNumber: '+201022334455', name: 'Nour Hassan', tierId: TIER_WEEKEND },
        { phoneNumber: '+201033445566', name: 'Omar Fathy', tierId: TIER_WEEKEND },
      ],
    });

    await mockApi.payments.initiate(order.id);

    // Immediately after opening the sheet the order is still unpaid (rule 9).
    const before = await mockApi.payments.status(order.id);
    expect(before.orderStatus).toBe('awaiting_payment');
    expect(before.ticketsIssued).toBe(0);

    advance(5000);

    const after = await mockApi.payments.status(order.id);
    expect(after.orderStatus).toBe('paid');
    expect(after.ticketsIssued).toBe(2);
  });

  it("issues the guest's ticket as pending_claim, so it exists before its owner", async () => {
    const order = await placeOrder({
      // The seeded ticket is for Tulua, so this buys somewhere the buyer holds nothing and
      // can still take one of the tickets themselves.
      eventId: SOUND_BATH_ID,
      buyerTierId: TIER_SOUND_GA,
      items: [{ tierId: TIER_SOUND_GA, quantity: 2 }],
      guests: [{ phoneNumber: '+201022334455', name: 'Nour Hassan', tierId: TIER_SOUND_GA }],
    });

    await mockApi.payments.initiate(order.id);
    advance(5000);
    await mockApi.payments.status(order.id);

    const { data } = await mockApi.tickets.list();
    const fromOrder = data.filter((t) => t.orderNumber === order.orderNumber);
    expect(fromOrder).toHaveLength(2);

    const mine = fromOrder.find((t) => t.purchasedBy?.isSelf);
    const guest = fromOrder.find((t) => !t.purchasedBy?.isSelf);
    expect(mine?.status).toBe('active');
    expect(mine?.usageStatus).toBe('usable');
    // Rule 2: no claim code — the ticket simply waits for that number to register.
    expect(guest?.status).toBe('pending_claim');
    expect(guest?.holderName).toBe('Nour Hassan');
  });

  it('cancels an unpaid order', async () => {
    const order = await placeOrder({
      eventId: TULUA_ID,
      buyerTierId: null,
      items: [{ tierId: TIER_DAY1, quantity: 1 }],
      guests: [{ phoneNumber: '+201022334455', name: 'Nour Hassan', tierId: TIER_DAY1 }],
    });
    const cancelled = await mockApi.orders.cancel(order.id);
    expect(cancelled.status).toBe('cancelled');
  });
});

describe('entry pass', () => {
  it('requires a selfie', async () => {
    await signIn();
    await mockApi.profile.update({
      fullName: 'Yasmin El Sayed',
      email: 'yasmin@email.com',
      dateOfBirth: '1994-03-12',
      gender: 'female',
      areaId: 'ar-maadi',
    });
    const { data } = await mockApi.tickets.list();
    const ticket = data[0];
    expect(ticket).toBeDefined();
    // Rule 3: the selfie is what makes a ticket usable.
    await expect(mockApi.tickets.entryPass(ticket!.id)).rejects.toMatchObject({
      code: 'SELFIE_REQUIRED',
    });
  });

  it('rotates the payload on its own cadence', async () => {
    await signIn();
    await completeProfile();
    const { data } = await mockApi.tickets.list();
    const ticket = data[0]!;

    const first = await mockApi.tickets.entryPass(ticket.id);
    expect(first.refreshAfterSeconds).toBe(30);

    advance(31_000);
    const second = await mockApi.tickets.entryPass(ticket.id);
    expect(second.payload).not.toBe(first.payload);
  });
});

describe('mock parity', () => {
  it('updates email verification state and requires a sent token', async () => {
    await signIn();
    await mockApi.profile.update({ email: 'yasmin@email.com' });
    await expect(mockApi.profile.verifyEmail(MOCK_EMAIL_VERIFICATION_TOKEN)).rejects.toMatchObject({
      code: 'EMAIL_VERIFICATION_TOKEN_INVALID',
    });
    await mockApi.profile.sendEmailVerification();
    expect(await mockApi.profile.verifyEmail(MOCK_EMAIL_VERIFICATION_TOKEN)).toEqual({
      verified: true,
    });
    expect((await mockApi.auth.me()).emailVerified).toBe(true);
  });

  it('paginates event, order, and ticket lists', async () => {
    const firstEvents = await mockApi.events.list({ limit: 1 });
    expect(firstEvents.data).toHaveLength(1);
    expect(firstEvents.meta.hasNextPage).toBe(true);
    const secondEvents = await mockApi.events.list({
      limit: 1,
      cursor: firstEvents.meta.nextCursor,
    });
    expect(secondEvents.data[0]?.id).not.toBe(firstEvents.data[0]?.id);

    await signIn();
    await completeProfile();
    const order = await placeOrder({
      eventId: TULUA_ID,
      buyerTierId: null,
      items: [{ tierId: TIER_DAY1, quantity: 1 }],
      guests: [{ phoneNumber: '+201022334455', name: 'Nour Hassan', tierId: TIER_DAY1 }],
    });
    const orders = await mockApi.orders.list(null, 1);
    expect(orders.data[0]?.id).toBe(order.id);
    const tickets = await mockApi.tickets.list({ limit: 1 });
    expect(tickets.meta.limit).toBe(1);
  });

  it('expires an unpaid hold and does not settle it later', async () => {
    await signIn();
    await completeProfile();
    const order = await placeOrder({
      eventId: TULUA_ID,
      buyerTierId: null,
      items: [{ tierId: TIER_DAY1, quantity: 1 }],
      guests: [{ phoneNumber: '+201022334455', name: 'Nour Hassan', tierId: TIER_DAY1 }],
    });
    await mockApi.payments.initiate(order.id);
    advance(16 * 60 * 1000);
    const status = await mockApi.payments.status(order.id);
    expect(status.orderStatus).toBe('expired');
    expect(status.paymentStatus).toBe('expired');
    expect(status.ticketsIssued).toBe(0);
  });

  it('signs up as a brand new account after deletion, keeping nothing', async () => {
    await signIn();
    await completeProfile();
    await mockApi.account.requestDeletionOtp();
    await mockApi.account.delete(MOCK_OTP_CODE);

    // Deletion released the number. The same phone and code register again from scratch;
    // nothing asks whether this number ever had an account (CLAUDE.md rule 4).
    const fresh = await signIn();
    expect(fresh.isNewUser).toBe(true);

    const me = await mockApi.auth.me();
    expect(me.fullName).toBeNull();
    expect(me.email).toBeNull();
    expect(me.selfieUploaded).toBe(false);
    expect(me.status).toBe('pending_profile');
    // The old tickets went with the old account and cannot rebind to this number.
    expect((await mockApi.tickets.list({ statuses: ['active'] })).data).toHaveLength(0);
  });
});

describe('addon catalogue', () => {
  beforeEach(async () => {
    await signIn();
    await completeProfile();
  });

  it('shows a browse card its cheapest buyable price without listing options', async () => {
    const summaries = await mockApi.addons.list(TULUA_ID);
    const lodge = summaries.find((addon) => addon.name === 'Desert Lodge Room');

    expect(lodge?.fromPriceEgpNow).toBe('1400.00');
    expect(lodge).not.toHaveProperty('options');
  });

  it('marks a fully sold addon unavailable and publishes the zero', async () => {
    const summaries = await mockApi.addons.list(TULUA_ID);
    const camp = summaries.find((addon) => addon.name === 'Camp Tent, shared');

    expect(camp?.availability).toBe('unavailable');
    // Sold out is never withheld: a buyer has to be able to see it.
    expect(camp?.availableQuantity).toBe(0);
  });

  it('withholds a remaining count until the event says it is low enough', async () => {
    const detail = await mockApi.addons.detail(TULUA_ID, 'addon-tulua-meals');
    const dinner = detail.options[0]!;

    // Hundreds left of 400, well above Tulua's 20% threshold.
    expect(dinner.availableQuantity).toBeNull();
  });

  it('publishes a remaining count once it falls under the threshold', async () => {
    const detail = await mockApi.addons.detail(TULUA_ID, 'addon-tulua-accommodation');
    const double2 = detail.options.find((option) => option.label === 'Double · 2 nights');

    // 3 left of 20 is 15%, under the 20% Tulua publishes at.
    expect(double2?.availableQuantity).toBe(3);
  });

  it('names the window pricing an option now and the one that takes over', async () => {
    const detail = await mockApi.addons.detail(TULUA_ID, 'addon-tulua-meals');
    const dinner = detail.options[0]!;

    expect(dinner.priceWindowName).toBe('Early bird');
    expect(dinner.priceEgpNow).toBe('280.00');
    expect(dinner.nextPriceWindow).toEqual({
      name: 'Regular',
      priceEgp: '340.00',
      startsAt: '2026-09-01T00:00:00.000Z',
    });
  });
});

describe('cart addons', () => {
  const GUEST = { phoneNumber: '+201099887766', name: 'Nour Hassan', tierId: TIER_WEEKEND };

  async function cartWithGuest(quantity = 1) {
    const cart = await mockApi.carts.create(TULUA_ID);
    const withTickets = await mockApi.carts.replaceTickets(cart.id, {
      buyerTierId: null,
      items: [{ tierId: TIER_WEEKEND, quantity }],
      guests: Array.from({ length: quantity }, (_unused, index) => ({
        ...GUEST,
        phoneNumber: `+20109988776${index}`,
        name: `Guest ${index + 1}`,
      })),
    });
    return { cartId: cart.id, attendees: withTickets.attendees };
  }

  beforeEach(async () => {
    await signIn();
    await completeProfile();
  });

  /**
   * The refusal is at the write, not at the till. `PUT /carts/:id/addons` is a commit: it takes
   * the whole line or none of it, so a cart can never reach preview holding two of three units
   * spoken for. Asserting this here rather than on the preview is the difference between a mock
   * that matches the backend and one that quietly accepts drafts staging answers 400 to.
   */
  it('will not take an extra whose units are not all spoken for', async () => {
    const { cartId, attendees } = await cartWithGuest();

    await expect(
      mockApi.carts.replaceAddons(cartId, [
        {
          optionId: 'opt-dinner',
          quantity: 3,
          assignments: [{ cartAttendeeId: attendees[0]!.cartAttendeeId, quantity: 2 }],
        },
      ]),
    ).rejects.toMatchObject({ code: 'ADDON_ASSIGNMENT_COUNT_MISMATCH' });

    // Nothing was half-written either: the cart is as it was.
    const cart = await mockApi.carts.get(cartId);
    expect(cart.addons).toHaveLength(0);
  });

  it('rejects an assignment that names both a cart attendee and a ticket', async () => {
    const { cartId, attendees } = await cartWithGuest();

    await expect(
      mockApi.carts.replaceAddons(cartId, [
        {
          optionId: 'opt-dinner',
          quantity: 1,
          assignments: [
            { cartAttendeeId: attendees[0]!.cartAttendeeId, ticketId: 'tk-seed-1', quantity: 1 },
          ],
        },
      ]),
    ).rejects.toMatchObject({ code: 'ADDON_ASSIGNMENT_TARGET_INVALID' });
  });

  /** Same rule for rooms: a double with one person in it is refused when it is sent, not later. */
  it('will not take a half-filled room', async () => {
    const { cartId, attendees } = await cartWithGuest();

    await expect(
      mockApi.carts.replaceAddons(cartId, [
        {
          optionId: 'opt-lodge-double-2',
          quantity: 1,
          rooms: [{ occupants: [{ cartAttendeeId: attendees[0]!.cartAttendeeId }] }],
        },
      ]),
    ).rejects.toMatchObject({ code: 'ROOM_OCCUPANCY_UNFILLED' });

    const cart = await mockApi.carts.get(cartId);
    expect(cart.addons).toHaveLength(0);
  });

  it('counts accommodation quantity in rooms, not people', async () => {
    const { cartId, attendees } = await cartWithGuest(2);
    await mockApi.carts.replaceAddons(cartId, [
      {
        optionId: 'opt-lodge-double-2',
        quantity: 1,
        rooms: [
          {
            occupants: [
              { cartAttendeeId: attendees[0]!.cartAttendeeId },
              { cartAttendeeId: attendees[1]!.cartAttendeeId },
            ],
          },
        ],
      },
    ]);

    const preview = await mockApi.carts.preview(cartId);

    expect(preview.issues).toEqual([]);
    // One room for two people, priced once.
    expect(preview.pricing.addonsSubtotalEgp).toBe('2200.00');
  });

  it('keeps one room per person across separate rooms in the same cart', async () => {
    const { cartId, attendees } = await cartWithGuest(2);
    await mockApi.carts.replaceAddons(cartId, [
      {
        optionId: 'opt-lodge-double-2',
        quantity: 2,
        rooms: [
          {
            occupants: [
              { cartAttendeeId: attendees[0]!.cartAttendeeId },
              { cartAttendeeId: attendees[1]!.cartAttendeeId },
            ],
          },
          {
            occupants: [
              { cartAttendeeId: attendees[0]!.cartAttendeeId },
              { cartAttendeeId: attendees[1]!.cartAttendeeId },
            ],
          },
        ],
      },
    ]);

    const preview = await mockApi.carts.preview(cartId);

    expect(preview.issues.map((issue) => issue.code)).toContain('PERSON_ALREADY_HAS_ACCOMMODATION');
  });

  it('drops draft addons when tickets are replaced', async () => {
    const { cartId, attendees } = await cartWithGuest();
    await mockApi.carts.replaceAddons(cartId, [
      {
        optionId: 'opt-dinner',
        quantity: 1,
        assignments: [{ cartAttendeeId: attendees[0]!.cartAttendeeId, quantity: 1 }],
      },
    ]);

    // Changing tickets invalidates every assignment, so the addons go with them and the app has
    // to send them again.
    const after = await mockApi.carts.replaceTickets(cartId, {
      buyerTierId: null,
      items: [{ tierId: TIER_WEEKEND, quantity: 1 }],
      guests: [GUEST],
    });

    expect(after.addons).toEqual([]);
  });
});

describe('cart place order', () => {
  beforeEach(async () => {
    await signIn();
    await completeProfile();
  });

  async function readyCart() {
    const cart = await mockApi.carts.create(TULUA_ID);
    await mockApi.carts.replaceTickets(cart.id, {
      buyerTierId: null,
      items: [{ tierId: TIER_WEEKEND, quantity: 1 }],
      guests: [{ phoneNumber: '+201099887766', name: 'Nour Hassan', tierId: TIER_WEEKEND }],
    });
    return cart.id;
  }

  it('refuses a token from a preview whose price no longer holds', async () => {
    const cartId = await readyCart();
    const stale = await mockApi.carts.preview(cartId);

    // The buyer keeps shopping after seeing that total, so the token they are holding no longer
    // describes what they would be charged.
    const attendees = (await mockApi.carts.get(cartId)).attendees;
    await mockApi.carts.replaceAddons(cartId, [
      {
        optionId: 'opt-dinner',
        quantity: 1,
        assignments: [{ cartAttendeeId: attendees[0]!.cartAttendeeId, quantity: 1 }],
      },
    ]);

    await expect(
      mockApi.carts.placeOrder(cartId, stale.pricing.pricingConfirmationToken!),
    ).rejects.toMatchObject({ code: 'CART_PRICING_CHANGED', status: 409 });
  });

  it('replays the same order rather than placing a second one', async () => {
    const cartId = await readyCart();
    const preview = await mockApi.carts.preview(cartId);
    const token = preview.pricing.pricingConfirmationToken!;

    const first = await mockApi.carts.placeOrder(cartId, token);
    const second = await mockApi.carts.placeOrder(cartId, token);

    expect(second.id).toBe(first.id);
    expect((await mockApi.orders.list()).data).toHaveLength(1);
  });

  it('attaches paid addons to the ticket they were bought for', async () => {
    const cartId = await readyCart();
    const attendees = (await mockApi.carts.get(cartId)).attendees;
    await mockApi.carts.replaceAddons(cartId, [
      {
        optionId: 'opt-dinner',
        quantity: 1,
        assignments: [{ cartAttendeeId: attendees[0]!.cartAttendeeId, quantity: 1 }],
      },
    ]);
    const preview = await mockApi.carts.preview(cartId);
    const order = await mockApi.carts.placeOrder(cartId, preview.pricing.pricingConfirmationToken!);

    await mockApi.payments.initiate(order.id);
    advance(5000);
    await mockApi.payments.status(order.id);

    // The guest's ticket binds when they register, and the dinner is waiting on it.
    await mockApi.auth.logout();
    await signIn('+201099887766');
    const { data } = await mockApi.tickets.list();
    const addons = await mockApi.tickets.addons(data[0]!.id);

    expect(addons).toHaveLength(1);
    expect(addons[0]?.type).toBe('meal');
    expect(data[0]?.addonCount).toBe(1);
  });
});

/**
 * A ticket can exist before its owner (CLAUDE.md rule 2), and an extra can be bought for that
 * owner by someone who has never met them.
 *
 * The scenario, which is the one that breaks quietly if any layer starts requiring an account:
 * A buys a ticket for B and attaches B by phone. B never signs up, so B's ticket sits in
 * `pending_claim` with no user behind it. C, a third person with no relationship to either,
 * must still be able to find B by phone from their own cart and buy B an extra.
 *
 * The failure mode is invisible rather than loud: a lookup that quietly required a registered
 * user would answer `eligible: false`, which is byte-identical to the answer for a number that
 * genuinely has no ticket. Nothing would error. These tests exist so that regression is loud.
 */
describe('extras for a ticket holder who never signed up', () => {
  const B_PHONE = '+201055667788';
  const C_PHONE = '+201077889900';

  /** A buys a Tulua ticket for B, pays, and leaves B holding an unclaimed ticket. */
  async function ticketForUnregisteredB() {
    await signIn();
    await completeProfile();
    // The seeded buyer already holds a Tulua ticket, so every ticket in this order is a guest's.
    const order = await placeOrder({
      eventId: TULUA_ID,
      buyerTierId: null,
      items: [{ tierId: TIER_WEEKEND, quantity: 1 }],
      guests: [{ phoneNumber: B_PHONE, name: 'Basma Adel', tierId: TIER_WEEKEND }],
    });
    await mockApi.payments.initiate(order.id);
    advance(5000);
    const settled = await mockApi.payments.status(order.id);
    expect(settled.orderStatus).toBe('paid');
    expect(settled.ticketsIssued).toBe(1);
  }

  /** C is a stranger to both: a different number, their own profile, their own cart. */
  async function signInAsC() {
    await signIn(C_PHONE);
    await mockApi.profile.update({
      fullName: 'Karim Fouad',
      email: 'karim@email.com',
      dateOfBirth: '1990-07-02',
      gender: 'male',
      areaId: 'ar-maadi',
    });
    return mockApi.profile.uploadSelfie('file:///karim.jpg');
  }

  it('lets C find B by phone even though B has no account', async () => {
    await ticketForUnregisteredB();
    await signInAsC();

    const cart = await mockApi.carts.create(TULUA_ID);
    const [result] = await mockApi.carts.lookupRecipients(cart.id, [B_PHONE]);

    // B is reachable because B holds a ticket, not because B is a user. There is no user.
    expect(result?.eligible).toBe(true);
    expect(result?.ticketId).toBeTruthy();
    // The server never sources a stranger's name; the app labels people from its own contacts.
    expect(result).not.toHaveProperty('name');
    expect(result).not.toHaveProperty('displayName');
  });

  it('lets C actually buy B an extra, and issues it against B’s unclaimed ticket', async () => {
    await ticketForUnregisteredB();
    await signInAsC();

    const cart = await mockApi.carts.create(TULUA_ID);
    const [found] = await mockApi.carts.lookupRecipients(cart.id, [B_PHONE]);
    const bTicketId = found!.ticketId!;

    // C buys their own ticket and, in the same order, a dinner voucher for B.
    await mockApi.carts.replaceTickets(cart.id, {
      buyerTierId: TIER_WEEKEND,
      items: [{ tierId: TIER_WEEKEND, quantity: 1 }],
      guests: [],
    });
    await mockApi.carts.replaceAddons(cart.id, [
      { optionId: 'opt-dinner', quantity: 1, assignments: [{ ticketId: bTicketId, quantity: 1 }] },
    ]);

    const preview = await mockApi.carts.preview(cart.id);
    expect(preview.pricing.status).toBe('complete');

    const order = await mockApi.carts.placeOrder(
      cart.id,
      preview.pricing.pricingConfirmationToken!,
    );
    await mockApi.payments.initiate(order.id);
    advance(5000);
    expect((await mockApi.payments.status(order.id)).orderStatus).toBe('paid');

    // C cannot read B's ticket back, and should not be able to: buying someone an extra does
    // not make their ticket yours.
    await expect(mockApi.tickets.addons(bTicketId)).rejects.toMatchObject({
      code: 'TICKET_FORBIDDEN',
    });

    // The proof that matters is B's. B finally signs up, which binds the waiting ticket
    // (rule 2, no claim code), and the extra a stranger bought them is on it.
    await signIn(B_PHONE);
    const onB = await mockApi.tickets.addons(bTicketId);
    expect(onB).toHaveLength(1);
    expect(onB[0]?.type).toBe('meal');
  });

  /**
   * Rule 4. The whole reason the lookup is safe to expose is that "no Sukun account" and
   * "account, but no ticket to this event" are one answer. If they ever diverge, this fails.
   */
  it('answers identically for a number with no account and one with an account but no ticket', async () => {
    await ticketForUnregisteredB();
    await signInAsC();
    const cart = await mockApi.carts.create(TULUA_ID);

    const strangerPhone = '+201090000001';
    const [noAccount] = await mockApi.carts.lookupRecipients(cart.id, [strangerPhone]);

    // C themselves: a real, registered account that holds no Tulua ticket yet.
    const [accountNoTicket] = await mockApi.carts.lookupRecipients(cart.id, [C_PHONE]);

    expect(noAccount).toEqual({ ...noAccount, ...accountNoTicket, phoneNumber: noAccount!.phoneNumber });
    expect(noAccount?.eligible).toBe(false);
    expect(accountNoTicket?.eligible).toBe(false);
    // Same keys, same values, nothing that could tell the two apart.
    expect(Object.keys(noAccount!).sort()).toEqual(Object.keys(accountNoTicket!).sort());
    expect({ ...noAccount, phoneNumber: '' }).toEqual({ ...accountNoTicket, phoneNumber: '' });
  });
});
