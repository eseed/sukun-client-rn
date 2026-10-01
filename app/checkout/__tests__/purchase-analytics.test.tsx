import { mockApi, mockConfig, MOCK_OTP_CODE, resetMockState } from '../../../src/api/mock';
import { TIER_WEEKEND, TULUA_ID } from '../../../src/api/mock/fixtures';
import { track, trackMeta } from '../../../src/lib/analytics';
import { resetPurchaseAnalyticsForTests } from '../../../src/lib/purchase-analytics';
import { useAuthStore } from '../../../src/stores/auth';
import { useCheckoutStore } from '../../../src/stores/checkout';
import { act, fireEvent, renderWithProviders, screen, waitFor } from '../../../src/test-utils';

import ConfirmationScreen from '../confirmation';
import ReviewScreen from '../review';

/**
 * The purchase funnel's outcome events, as the screens send them.
 *
 * `purchase_completed` once lived on the payment screen alone, and the ordinary path never goes
 * there: review opens the sheet, hears SUCCESS, and replaces itself with the confirmation. On
 * production that meant ten buyers started a payment in a month and none completed one, as far
 * as Mixpanel could tell. These tests pin the event to the confirmation, once per order, and the
 * sheet's failures to the review screen that heard them.
 */

jest.mock('../../../src/lib/analytics', () => ({
  ...jest.requireActual('../../../src/lib/analytics'),
  track: jest.fn(),
  trackMeta: jest.fn(),
}));
const mockTrack = track as jest.Mock;
const mockTrackMeta = trackMeta as jest.Mock;
/** Meta events sent, by name, in order. */
const metaSent = (name: string) => mockTrackMeta.mock.calls.filter(([event]) => event === name);

const mockPaymob = jest.requireMock('paymob-reactnative').default as Record<string, jest.Mock>;

const mockParams: Record<string, string> = {};
const mockRouter = {
  push: jest.fn(),
  back: jest.fn(),
  replace: jest.fn(),
  navigate: jest.fn(),
  canGoBack: jest.fn(() => false),
};

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
  useIsFocused: () => true,
  Redirect: () => null,
}));

/** Every call for one event name, so an assertion reads the properties it was sent with. */
function tracked(event: string) {
  return mockTrack.mock.calls.filter(([name]) => name === event);
}

async function signInAndComplete() {
  await mockApi.auth.requestOtp('+201012345678');
  await mockApi.auth.verifyOtp('+201012345678', MOCK_OTP_CODE);
  await mockApi.profile.update({
    fullName: 'Yasmin El Sayed',
    email: 'yasmin@email.com',
    dateOfBirth: '1994-03-12',
    gender: 'female',
    areaId: 'ar-maadi',
  });
  const complete = await mockApi.profile.uploadSelfie('file:///selfie.jpg');
  useAuthStore.setState({ status: 'signed-in', user: complete, pendingPhone: null });
}

/** Two Weekend passes for guests: signInAndComplete already seeds this user a Tulua ticket. */
const GUEST_ORDER = {
  eventId: TULUA_ID,
  buyerTierId: null,
  items: [{ tierId: TIER_WEEKEND, quantity: 2 }],
  guests: [
    { phoneNumber: '+201022334455', name: 'Nour Hassan', tierId: TIER_WEEKEND },
    { phoneNumber: '+201033445566', name: 'Omar Fathy', tierId: TIER_WEEKEND },
  ],
};

async function startCartCheckout(input: typeof GUEST_ORDER) {
  const cart = await mockApi.carts.create(input.eventId);
  await mockApi.carts.replaceTickets(cart.id, {
    buyerTierId: input.buyerTierId,
    items: input.items,
    guests: input.guests,
  });
  useCheckoutStore.getState().setCartId(cart.id);
  return cart;
}

async function placeOrderViaCart(input: typeof GUEST_ORDER) {
  const cart = await startCartCheckout(input);
  const preview = await mockApi.carts.preview(cart.id);
  return mockApi.carts.placeOrder(cart.id, preview.pricing.pricingConfirmationToken!);
}

/** An order the simulated webhook has already settled, as it is once Paymob has been paid. */
async function paidOrder() {
  const order = await placeOrderViaCart(GUEST_ORDER);
  await mockApi.payments.initiate(order.id);
  await mockApi.payments.status(order.id);
  return order;
}

const realNow = mockConfig.now;

beforeEach(() => {
  resetMockState();
  resetPurchaseAnalyticsForTests();
  mockConfig.latencyMs = 0;
  mockConfig.settleDelayMs = 0;
  mockConfig.now = realNow;
  for (const key of Object.keys(mockParams)) delete mockParams[key];
  mockRouter.replace.mockClear();
  mockTrack.mockClear();
  mockTrackMeta.mockClear();
  mockPaymob.presentPayVC!.mockClear();
  mockPaymob.setSdkListener!.mockClear();
  useAuthStore.setState({ status: 'signed-out', user: null, pendingPhone: null });
  useCheckoutStore.getState().reset();
});

afterAll(() => {
  mockConfig.now = realNow;
});

describe('Confirmation', () => {
  it('sends purchase_completed for a paid order, with the order as the server priced it', async () => {
    await signInAndComplete();
    const order = await paidOrder();
    mockParams.orderId = order.id;

    renderWithProviders(<ConfirmationScreen />);

    await waitFor(() => expect(tracked('purchase_completed')).toHaveLength(1));
    expect(tracked('purchase_completed')[0]![1]).toEqual({
      order_id: order.id,
      event_id: TULUA_ID,
      total: Number(order.totalEgp),
      currency: 'EGP',
      item_count: 2,
      guest_count: 2,
      addon_count: 0,
      has_promo: false,
    });
    // Meta's Purchase goes with it: the server's total, the tickets by event, the order id.
    expect(metaSent('Purchase')).toEqual([
      [
        'Purchase',
        expect.objectContaining({
          contents: [{ id: TULUA_ID, quantity: 2 }],
          value: Number(order.totalEgp),
          currency: 'EGP',
        }),
        { orderId: order.id },
      ],
    ]);
  });

  it('sends it once, however often the confirmation is shown', async () => {
    await signInAndComplete();
    const order = await paidOrder();
    mockParams.orderId = order.id;

    const first = renderWithProviders(<ConfirmationScreen />);
    await waitFor(() => expect(tracked('purchase_completed')).toHaveLength(1));
    first.rerender(<ConfirmationScreen />);
    first.unmount();

    renderWithProviders(<ConfirmationScreen />);
    await waitFor(() => expect(screen.getByText('See my ticket')).toBeTruthy());

    expect(tracked('purchase_completed')).toHaveLength(1);
  });

  /**
   * The sheet's SUCCESS sends the buyer here before the webhook has necessarily landed. The
   * purchase is counted when the server says paid, and not a moment before.
   */
  it('waits for the server to settle an order that arrives unpaid', async () => {
    await signInAndComplete();
    mockConfig.settleDelayMs = 60_000;
    const order = await placeOrderViaCart(GUEST_ORDER);
    await mockApi.payments.initiate(order.id);
    mockParams.orderId = order.id;

    renderWithProviders(<ConfirmationScreen />);
    // Nothing says the ticket is ready until the server says paid.
    await waitFor(() =>
      expect(screen.getByText('Confirming your payment with your bank')).toBeTruthy(),
    );
    expect(screen.queryByText('See my ticket')).toBeNull();
    expect(tracked('purchase_completed')).toHaveLength(0);

    // The webhook lands.
    mockConfig.now = () => realNow() + 61_000;

    await waitFor(() => expect(tracked('purchase_completed')).toHaveLength(1), {
      timeout: 8000,
    });
    expect(tracked('purchase_completed')[0]![1]).toMatchObject({ order_id: order.id });
    await waitFor(() => expect(screen.getByText('See my ticket')).toBeTruthy());
  });
});

describe('Review & pay', () => {
  async function openSheetFromReview() {
    mockParams.eventId = TULUA_ID;
    // The webhook stays out of it, so the sheet's verdict is the only thing that moves.
    mockConfig.settleDelayMs = 60_000;
    await signInAndComplete();
    useCheckoutStore.getState().start(TULUA_ID, TIER_WEEKEND);
    useCheckoutStore.getState().setBuyerTakesTicket(false);
    await startCartCheckout({
      ...GUEST_ORDER,
      items: [{ tierId: TIER_WEEKEND, quantity: 1 }],
      guests: [GUEST_ORDER.guests[0]!],
    });
    useCheckoutStore.getState().setTermsAccepted(true);

    renderWithProviders(<ReviewScreen />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Continue to payment' })).not.toBeDisabled(),
    );
    fireEvent.press(screen.getByText('Continue to payment'));
    await waitFor(() => expect(mockPaymob.presentPayVC).toHaveBeenCalled());
    await waitFor(() => expect(tracked('payment_started')).toHaveLength(1));

    const orderId = (tracked('payment_started')[0]![1] as { order_id: string }).order_id;
    const listener = mockPaymob.setSdkListener!.mock.calls.at(-1)?.[0] as (r: unknown) => void;
    return { orderId, emit: (status: string) => act(() => listener({ status })) };
  }

  it("sends Meta's InitiateCheckout, then AddPaymentInfo as the sheet opens", async () => {
    await openSheetFromReview();

    const [initiate] = metaSent('InitiateCheckout');
    expect(initiate).toEqual([
      'InitiateCheckout',
      expect.objectContaining({
        content_ids: [TULUA_ID],
        contents: [{ id: TULUA_ID, quantity: 1 }],
        num_items: 1,
        currency: 'EGP',
      }),
    ]);
    const [payment] = metaSent('AddPaymentInfo');
    expect(payment![1]).toEqual({ value: expect.any(Number), currency: 'EGP' });
    // The order was priced at the quote: both carry the same total.
    expect(payment![1].value).toBe((initiate![1] as { value: number }).value);
    expect(mockTrackMeta.mock.calls.map(([event]) => event)).toEqual([
      'InitiateCheckout',
      'AddPaymentInfo',
    ]);
  });

  it('leaves purchase_completed to the confirmation it goes to on SUCCESS', async () => {
    const { orderId, emit } = await openSheetFromReview();

    emit('Success');

    await waitFor(() =>
      expect(mockRouter.replace).toHaveBeenCalledWith(`/checkout/confirmation?orderId=${orderId}`),
    );
    expect(tracked('purchase_completed')).toHaveLength(0);
    expect(tracked('payment_failed')).toHaveLength(0);
  });

  it('sends payment_failed when the sheet it opened reports FAIL', async () => {
    const { orderId, emit } = await openSheetFromReview();

    emit('Fail');

    await waitFor(() =>
      expect(tracked('payment_failed')).toEqual([
        ['payment_failed', { order_id: orderId, outcome: 'fail' }],
      ]),
    );
  });

  it('sends payment_failed when the sheet it opened reports CANCELLED', async () => {
    const { orderId, emit } = await openSheetFromReview();

    emit('Cancelled');

    await waitFor(() =>
      expect(tracked('payment_failed')).toEqual([
        ['payment_failed', { order_id: orderId, outcome: 'cancelled' }],
      ]),
    );
  });
});
