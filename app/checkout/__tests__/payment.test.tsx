import { act, fireEvent, renderWithProviders, screen, waitFor } from '../../../src/test-utils';
import { mockApi, mockConfig, MOCK_OTP_CODE, resetMockState } from '../../../src/api/mock';
import { TIER_WEEKEND, TULUA_ID } from '../../../src/api/mock/fixtures';
import { useAuthStore } from '../../../src/stores/auth';

import PaymentScreen from '../payment';

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
});

it('surfaces a failure when the SDK reports FAIL', async () => {
  await openPaymentSheet();

  emitSdkResult(PaymentStatus.FAIL!);

  await waitFor(() =>
    expect(screen.getByText('The payment did not go through. Nothing was charged.')).toBeTruthy(),
  );
  expect(mockRouter.replace).not.toHaveBeenCalled();
});

it('surfaces a cancellation when the SDK reports CANCELLED', async () => {
  await openPaymentSheet();

  emitSdkResult(PaymentStatus.CANCELLED!);

  await waitFor(() =>
    expect(screen.getByText('Payment was cancelled. Nothing was charged.')).toBeTruthy(),
  );
  expect(mockRouter.replace).not.toHaveBeenCalled();
});

it('keeps waiting when the SDK reports PENDING', async () => {
  await openPaymentSheet();

  emitSdkResult(PaymentStatus.PENDING!);

  await waitFor(() =>
    expect(
      screen.getByText('Your payment is still being processed. This can take a moment…'),
    ).toBeTruthy(),
  );
  expect(mockRouter.replace).not.toHaveBeenCalled();
});

it('still reads the outcome if a release switches to the documented bare string', async () => {
  const order = await openPaymentSheet();

  emitSdkResult(PaymentStatus.SUCCESS!, 'string');

  await waitFor(() =>
    expect(mockRouter.replace).toHaveBeenCalledWith(`/checkout/confirmation?orderId=${order.id}`),
  );
});
