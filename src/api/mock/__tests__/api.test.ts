import {
  mockApi,
  mockConfig,
  MOCK_EMAIL_VERIFICATION_TOKEN,
  MOCK_OTP_CODE,
  resetMockState,
} from '..';
import { TIER_DAY1, TIER_SOUND_GA, TIER_WEEKEND, TULUA_ID } from '../fixtures';

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
    areaId: 'ar-cairo',
  });
  return mockApi.profile.uploadSelfie('file:///selfie.jpg');
}

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
    const order = await mockApi.orders.create({
      eventId: TULUA_ID,
      buyerTierId: TIER_WEEKEND,
      items: [{ tierId: TIER_WEEKEND, quantity: 2 }],
      guests: [{ phoneNumber: '+201022334455', name: 'Same name', tierId: TIER_WEEKEND }],
    });
    await mockApi.payments.initiate(order.id);
    advance(5000);
    await mockApi.payments.status(order.id);
    await mockApi.auth.logout();

    await signIn('+201022334455');
    const { data } = await mockApi.tickets.list();
    expect(data.some((ticket) => ticket.status === 'active' && ticket.holderName === 'Same name')).toBe(true);
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
      areaId: 'ar-cairo',
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
      mockApi.orders.create({
        eventId: TULUA_ID,
        buyerTierId: TIER_WEEKEND,
        items: [{ tierId: TIER_WEEKEND, quantity: 1 }],
        guests: [],
      }),
    ).rejects.toMatchObject({ code: 'PROFILE_INCOMPLETE' });
  });
});

describe('pricing', () => {
  it('applies VAT to the discounted net, matching the server formula', async () => {
    const price = await mockApi.orders.previewPrice({
      eventId: TULUA_ID,
      items: [{ tierId: TIER_WEEKEND, quantity: 2 }],
      promoCode: 'SUKUN10',
    });

    expect(price.subtotalEgp).toBe('3200.00');
    expect(price.discountEgp).toBe('320.00');
    expect(price.netEgp).toBe('2880.00');
    expect(price.vatEgp).toBe('403.20');
    expect(price.totalEgp).toBe('3283.20');
    expect(price.currency).toBe('EGP');
  });

  it('prices without a promo', async () => {
    const price = await mockApi.orders.previewPrice({
      eventId: TULUA_ID,
      items: [{ tierId: TIER_DAY1, quantity: 1 }],
    });
    expect(price.subtotalEgp).toBe('950.00');
    expect(price.discountEgp).toBe('0.00');
    expect(price.totalEgp).toBe('1083.00');
  });

  it('ignores an unknown promo code rather than discounting', async () => {
    const price = await mockApi.orders.previewPrice({
      eventId: TULUA_ID,
      items: [{ tierId: TIER_WEEKEND, quantity: 1 }],
      promoCode: 'NOPE',
    });
    expect(price.discountEgp).toBe('0.00');
    expect(price.promoCode).toBeNull();
  });

  it('clamps a promo bigger than the subtotal and reports it', async () => {
    const result = await mockApi.orders.validatePromoCode(
      [{ tierId: TIER_DAY1, quantity: 1 }],
      'TULUA500',
    );
    expect(result.discountAmountEgp).toBe('500.00');
    expect(result.discountAppliedEgp).toBe('500.00');
    expect(result.fullyApplied).toBe(true);
  });

  it('returns server promo error codes', async () => {
    await expect(
      mockApi.orders.validatePromoCode([{ tierId: TIER_SOUND_GA, quantity: 1 }], 'NOPE'),
    ).rejects.toMatchObject({ code: 'PROMO_CODE_NOT_FOUND', status: 404 });
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
    const order = await mockApi.orders.create({
      eventId: TULUA_ID,
      buyerTierId: TIER_WEEKEND,
      items: [{ tierId: TIER_WEEKEND, quantity: 2 }],
      guests: [{ phoneNumber: '+201022334455', name: 'Nour Hassan', tierId: TIER_WEEKEND }],
      promoCode: 'SUKUN10',
    });

    expect(order.status).toBe('awaiting_payment');
    expect(order.totalEgp).toBe('3283.20');
    expect(order.orderNumber).toMatch(/^SKN-2026-\d{6}$/);
    expect(order.guests).toHaveLength(1);
  });

  it('issues tickets only after the webhook settles, not on redirect', async () => {
    const order = await mockApi.orders.create({
      eventId: TULUA_ID,
      buyerTierId: TIER_WEEKEND,
      items: [{ tierId: TIER_WEEKEND, quantity: 2 }],
      guests: [{ phoneNumber: '+201022334455', name: 'Nour Hassan', tierId: TIER_WEEKEND }],
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
    const order = await mockApi.orders.create({
      eventId: TULUA_ID,
      buyerTierId: TIER_WEEKEND,
      items: [{ tierId: TIER_WEEKEND, quantity: 2 }],
      guests: [{ phoneNumber: '+201022334455', name: 'Nour Hassan', tierId: TIER_WEEKEND }],
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
    const order = await mockApi.orders.create({
      eventId: TULUA_ID,
      buyerTierId: TIER_DAY1,
      items: [{ tierId: TIER_DAY1, quantity: 1 }],
      guests: [],
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
      areaId: 'ar-cairo',
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
    expect(await mockApi.profile.verifyEmail(MOCK_EMAIL_VERIFICATION_TOKEN)).toEqual({ verified: true });
    expect((await mockApi.auth.me()).emailVerified).toBe(true);
  });

  it('paginates event, order, and ticket lists', async () => {
    const firstEvents = await mockApi.events.list({ limit: 1 });
    expect(firstEvents.data).toHaveLength(1);
    expect(firstEvents.meta.hasNextPage).toBe(true);
    const secondEvents = await mockApi.events.list({ limit: 1, cursor: firstEvents.meta.nextCursor });
    expect(secondEvents.data[0]?.id).not.toBe(firstEvents.data[0]?.id);

    await signIn();
    await completeProfile();
    const order = await mockApi.orders.create({
      eventId: TULUA_ID,
      buyerTierId: TIER_DAY1,
      items: [{ tierId: TIER_DAY1, quantity: 1 }],
      guests: [],
    });
    const orders = await mockApi.orders.list(null, 1);
    expect(orders.data[0]?.id).toBe(order.id);
    const tickets = await mockApi.tickets.list({ limit: 1 });
    expect(tickets.meta.limit).toBe(1);
  });

  it('expires an unpaid hold and does not settle it later', async () => {
    await signIn();
    await completeProfile();
    const order = await mockApi.orders.create({
      eventId: TULUA_ID,
      buyerTierId: TIER_DAY1,
      items: [{ tierId: TIER_DAY1, quantity: 1 }],
      guests: [],
    });
    await mockApi.payments.initiate(order.id);
    advance(16 * 60 * 1000);
    const status = await mockApi.payments.status(order.id);
    expect(status.orderStatus).toBe('expired');
    expect(status.paymentStatus).toBe('expired');
    expect(status.ticketsIssued).toBe(0);
  });

  it('restores a deleted account and its tickets', async () => {
    await signIn();
    await completeProfile();
    const before = await mockApi.tickets.list();
    await mockApi.account.requestDeletionOtp();
    await mockApi.account.delete(MOCK_OTP_CODE);
    await mockApi.auth.requestAccountRestorationOtp('+201012345678');
    await mockApi.auth.confirmAccountRestoration({ phoneNumber: '+201012345678', otpCode: MOCK_OTP_CODE });
    expect((await mockApi.auth.me()).status).toBe('active');
    expect((await mockApi.tickets.list({ statuses: ['active'] })).data).toHaveLength(before.data.length);
  });
});
