import { act, fireEvent, renderWithProviders, screen, waitFor } from '../../../src/test-utils';
import { mockApi, mockConfig, MOCK_OTP_CODE, resetMockState } from '../../../src/api/mock';
import { TIER_WEEKEND, TULUA_ID } from '../../../src/api/mock/fixtures';
import { useAuthStore } from '../../../src/stores/auth';
import { useCheckoutStore } from '../../../src/stores/checkout';
import { track } from '../../../src/lib/analytics';
import { resetPurchaseAnalyticsForTests } from '../../../src/lib/purchase-analytics';
import { loadPendingPayment } from '../../../src/lib/pending-payment';

import PaymentScreen from '../payment';

jest.mock('../../../src/lib/analytics', () => ({
  ...jest.requireActual('../../../src/lib/analytics'),
  track: jest.fn(),
}));
const mockTrack = track as jest.Mock;

const CHECKING_WITH_BANK =
  "We're checking with your bank. If you were charged, your ticket will appear here automatically.";

/** Every call for one event name, so an assertion reads the properties it was sent with. */
function tracked(event: string) {
  return mockTrack.mock.calls.filter(([name]) => name === event);
}

const mockParams: Record<string, string> = {};
const mockRouter = {
  push: jest.fn(),
  back: jest.fn(),
  replace: jest.fn(),
  navigate: jest.fn(),
};
const mockPaymob = jest.requireMock('paymob-reactnative').default as {
  presentPayVC: jest.Mock;
  setSdkListener: jest.Mock;
};
const { PaymentStatus } = jest.requireMock('paymob-reactnative') as {
  PaymentStatus: Record<string, string>;
};

/**
 * Fires the status the SDK sheet reports back through `setSdkListener`.
 *
 * The real native modules emit an object — `{ status, details? }` — not the bare status string
 * the package's typings describe. These tests previously passed a bare string, which is exactly
 * the assumption that made the screen swallow every payment result in the built app, so the
 * object shape is the default here and the string shape is covered separately.
 */
function emitSdkResult(status: string, shape: 'object' | 'string' = 'object') {
  const listener = mockPaymob.setSdkListener.mock.calls.at(-1)?.[0] as (r: unknown) => void;
  act(() => listener(shape === 'object' ? { status } : status));
}

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
}));

jest.mock('../../../src/lib/paymob', () => ({
  getPaymob: () => jest.requireMock('paymob-reactnative'),
}));

async function signInAndComplete() {
  await mockApi.auth.requestOtp('+201012345678');
  const { user } = await mockApi.auth.verifyOtp('+201012345678', MOCK_OTP_CODE);
  await mockApi.profile.update({
    fullName: 'Yasmin El Sayed',
    email: 'yasmin@email.com',
    dateOfBirth: '1994-03-12',
    gender: 'female',
    areaId: 'ar-maadi',
  });
  const complete = await mockApi.profile.uploadSelfie('file:///selfie.jpg');
  useAuthStore.setState({ status: 'signed-in', user: complete, pendingPhone: null });
  return user;
}

beforeEach(() => {
  resetMockState();
  mockConfig.latencyMs = 0;
  mockConfig.settleDelayMs = 5000;
  for (const key of Object.keys(mockParams)) delete mockParams[key];
  mockPaymob.presentPayVC.mockClear();
  mockPaymob.setSdkListener.mockClear();
  mockRouter.replace.mockClear();
  mockTrack.mockClear();
  resetPurchaseAnalyticsForTests();
  useAuthStore.setState({ status: 'signed-out', user: null, pendingPhone: null });
});

/**
 * Places an order through the cart, the way the app does: cart, tickets, preview, place. Tests
 * that only care about what happens *after* an order exists use this rather than restating the
 * whole checkout.
 */
async function placeOrderViaCart(input: {
  eventId: string;
  buyerTierId: string | null;
  items: { tierId: string; quantity: number }[];
  guests: { phoneNumber: string; name: string; tierId: string }[];
}) {
  const cart = await mockApi.carts.create(input.eventId);
  await mockApi.carts.replaceTickets(cart.id, {
    buyerTierId: input.buyerTierId,
    items: input.items,
    guests: input.guests,
  });
  const preview = await mockApi.carts.preview(cart.id);
  return mockApi.carts.placeOrder(cart.id, preview.pricing.pricingConfirmationToken!);
}

async function openPaymentSheet() {
  await signInAndComplete();
  // signInAndComplete seeds this user a Tulua ticket, so the order is entirely for guests.
  // Two tickets cost the same either way, so the totals asserted below are unchanged.
  const order = await placeOrderViaCart({
    eventId: TULUA_ID,
    buyerTierId: null,
    items: [{ tierId: TIER_WEEKEND, quantity: 2 }],
    guests: [
      { phoneNumber: '+201022334455', name: 'Nour Hassan', tierId: TIER_WEEKEND },
      { phoneNumber: '+201033445566', name: 'Omar Fathy', tierId: TIER_WEEKEND },
    ],
  });
  mockParams.orderId = order.id;

  renderWithProviders(<PaymentScreen />);

  await waitFor(() => expect(screen.getAllByText('Pay 3,648.00 EGP').length).toBe(2));
  fireEvent.press(screen.getAllByText('Pay 3,648.00 EGP')[1]!);

  await waitFor(() =>
    expect(mockPaymob.presentPayVC).toHaveBeenCalledWith('sec_mock_0000', 'pk_mock_0000'),
  );
  return order;
}

it('opens Paymob native checkout while waiting for the payment to complete', async () => {
  await signInAndComplete();
  // signInAndComplete seeds this user a Tulua ticket, so the order is entirely for guests.
  // Two tickets cost the same either way, so the totals asserted below are unchanged.
  const order = await placeOrderViaCart({
    eventId: TULUA_ID,
    buyerTierId: null,
    items: [{ tierId: TIER_WEEKEND, quantity: 2 }],
    guests: [
      { phoneNumber: '+201022334455', name: 'Nour Hassan', tierId: TIER_WEEKEND },
      { phoneNumber: '+201033445566', name: 'Omar Fathy', tierId: TIER_WEEKEND },
    ],
  });
  mockParams.orderId = order.id;

  renderWithProviders(<PaymentScreen />);

  await waitFor(() => expect(screen.getAllByText('Pay 3,648.00 EGP').length).toBe(2));
  fireEvent.press(screen.getAllByText('Pay 3,648.00 EGP')[1]!);

  await waitFor(() =>
    expect(mockPaymob.presentPayVC).toHaveBeenCalledWith('sec_mock_0000', 'pk_mock_0000'),
  );
  expect(screen.getByText('Waiting for the payment to complete…')).toBeTruthy();
  expect(mockRouter.replace).not.toHaveBeenCalled();
});

it('goes to the confirmation when the SDK reports SUCCESS', async () => {
  const order = await openPaymentSheet();

  emitSdkResult(PaymentStatus.SUCCESS!);

  await waitFor(() =>
    expect(mockRouter.replace).toHaveBeenCalledWith(`/checkout/confirmation?orderId=${order.id}`),
  );
  // Counted by the confirmation screen, which every paid order reaches, not here.
  expect(tracked('purchase_completed')).toHaveLength(0);
  expect(tracked('payment_failed')).toHaveLength(0);
});

it('surfaces a failure when the SDK reports FAIL and the server agrees', async () => {
  // The bank declines it: the simulated webhook fails the order as soon as it is asked.
  mockConfig.paymentOutcome = 'failed';
  mockConfig.settleDelayMs = 0;
  await openPaymentSheet();

  emitSdkResult(PaymentStatus.FAIL!);

  await waitFor(() =>
    expect(screen.getByText('The payment did not go through. Nothing was charged.')).toBeTruthy(),
  );
  expect(mockRouter.replace).not.toHaveBeenCalled();
  expect(tracked('payment_failed')).toEqual([
    ['payment_failed', { order_id: mockParams.orderId, outcome: 'fail' }],
  ]);
});

/**
 * Production, 30 Sep 2026: buyers stuck on "Redirecting you to your bank for verification"
 * closed the sheet with X, and were told nothing was charged over a payment the bank was still
 * confirming. The server still shows that attempt pending, so the screen says it is checking.
 */
it('never says nothing was charged after a cancel over a pending payment, and lets Pay reopen it', async () => {
  await openPaymentSheet();

  emitSdkResult(PaymentStatus.CANCELLED!);

  await waitFor(() =>
    expect(
      screen.getByText('If you already finished paying, this will update by itself.'),
    ).toBeTruthy(),
  );
  expect(screen.queryByText(/Nothing was charged/)).toBeNull();
  // No retry the backend would refuse, and no cancel it would refuse either.
  expect(screen.queryByText('Try payment again')).toBeNull();
  expect(screen.queryByText('Cancel this order')).toBeNull();
  expect(mockRouter.replace).not.toHaveBeenCalled();

  // Pay reopens the same live intention: closing the sheet does not cost the rest of the hold.
  mockPaymob.presentPayVC.mockClear();
  const pay = screen.getAllByText('Pay 3,648.00 EGP')[1]!;
  fireEvent.press(pay);
  await waitFor(() =>
    expect(mockPaymob.presentPayVC).toHaveBeenCalledWith('sec_mock_0000', 'pk_mock_0000'),
  );
  expect(tracked('payment_failed')).toEqual([
    ['payment_failed', { order_id: mockParams.orderId, outcome: 'cancelled' }],
  ]);
});

it('keeps waiting when the SDK reports PENDING', async () => {
  await openPaymentSheet();

  emitSdkResult(PaymentStatus.PENDING!);

  await waitFor(() => expect(screen.getByText(CHECKING_WITH_BANK)).toBeTruthy());
  expect(mockRouter.replace).not.toHaveBeenCalled();
});

it('goes to the confirmation when the bank confirms a payment the sheet left pending', async () => {
  mockConfig.settleDelayMs = 0;
  const order = await openPaymentSheet();

  emitSdkResult(PaymentStatus.CANCELLED!);

  await waitFor(() =>
    expect(mockRouter.replace).toHaveBeenCalledWith(`/checkout/confirmation?orderId=${order.id}`),
  );
});

it('remembers the order it opened the sheet for, so a killed app can recover it', async () => {
  const order = await openPaymentSheet();

  await waitFor(async () =>
    expect(await loadPendingPayment()).toEqual({
      orderId: order.id,
      attemptId: expect.stringMatching(/^pay-/),
      startedAt: expect.any(Number),
    }),
  );
});

it('tells the buyer how to leave a bank page that does not load', async () => {
  await openPaymentSheet();

  expect(
    screen.getByText(
      "If your bank's verification page doesn't load, close the sheet with X. We'll check with your bank and update this order.",
    ),
  ).toBeTruthy();
});

/** Cancelling clears the stale checkout and returns to the event, never back a screen. */
it('cancels the order, clears the stale checkout and returns to the event', async () => {
  await signInAndComplete();
  const order = await placeOrderViaCart({
    eventId: TULUA_ID,
    buyerTierId: null,
    items: [{ tierId: TIER_WEEKEND, quantity: 2 }],
    guests: [
      { phoneNumber: '+201022334455', name: 'Nour Hassan', tierId: TIER_WEEKEND },
      { phoneNumber: '+201033445566', name: 'Omar Fathy', tierId: TIER_WEEKEND },
    ],
  });
  mockParams.orderId = order.id;
  useCheckoutStore.setState({
    cartId: 'cart-stale',
    orderId: order.id,
    addons: [],
  });

  renderWithProviders(<PaymentScreen />);

  await waitFor(() => expect(screen.getByText('Cancel this order')).toBeTruthy());
  fireEvent.press(screen.getByText('Cancel this order'));

  await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith(`/event/${TULUA_ID}`));
  expect(mockRouter.back).not.toHaveBeenCalled();
  const state = useCheckoutStore.getState();
  expect(state.cartId).toBeNull();
  expect(state.orderId).toBeNull();
});

it('still reads the outcome if a release switches to the documented bare string', async () => {
  const order = await openPaymentSheet();

  emitSdkResult(PaymentStatus.SUCCESS!, 'string');

  await waitFor(() =>
    expect(mockRouter.replace).toHaveBeenCalledWith(`/checkout/confirmation?orderId=${order.id}`),
  );
});
