import { AppState } from 'react-native';
import { mockApi, mockConfig, MOCK_OTP_CODE, resetMockState } from '../../api/mock';
import { TIER_DAY1, TULUA_ID } from '../../api/mock/fixtures';
import type { PaymentStatus } from '../../api/types';
import {
  clearPendingPayment,
  loadPendingPayment,
  savePendingPayment,
} from '../../lib/pending-payment';
import { useAuthStore } from '../../stores/auth';
import { act, renderWithProviders, waitFor } from '../../test-utils';
import { recoveryTarget, usePendingPaymentRecovery } from '../usePendingPaymentRecovery';

const mockRouter = { push: jest.fn(), replace: jest.fn() };
let mockPathname = '/discover';
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  usePathname: () => mockPathname,
}));

let mockSheetOpen = false;
jest.mock('../usePaymobSheet', () => ({
  isPaymobSheetOpen: () => mockSheetOpen,
}));

function Recovery() {
  usePendingPaymentRecovery();
  return null;
}

async function returnToForeground() {
  const calls = (AppState.addEventListener as jest.Mock).mock.calls;
  const listener = calls[calls.length - 1]?.[1] as ((state: string) => void) | undefined;
  await act(async () => {
    listener?.('active');
  });
}

async function orderWithPayment(outcome: 'paid' | 'failed' | 'stuck') {
  await mockApi.auth.requestOtp('+201012345678');
  await mockApi.auth.verifyOtp('+201012345678', MOCK_OTP_CODE);
  await mockApi.profile.update({
    fullName: 'Yasmin El Sayed',
    email: 'yasmin@email.com',
    dateOfBirth: '1994-03-12',
    gender: 'female',
    areaId: 'ar-maadi',
  });
  const user = await mockApi.profile.uploadSelfie('file:///selfie.jpg');
  useAuthStore.setState({ status: 'signed-in', user, pendingPhone: null });

  const cart = await mockApi.carts.create(TULUA_ID);
  await mockApi.carts.replaceTickets(cart.id, {
    buyerTierId: null,
    items: [{ tierId: TIER_DAY1, quantity: 1 }],
    guests: [{ phoneNumber: '+201022334455', name: 'Nour Hassan', tierId: TIER_DAY1 }],
  });
  const preview = await mockApi.carts.preview(cart.id);
  const order = await mockApi.carts.placeOrder(cart.id, preview.pricing.pricingConfirmationToken!);
  mockConfig.paymentOutcome = outcome;
  const intent = await mockApi.payments.initiate(order.id);
  await savePendingPayment({
    orderId: order.id,
    attemptId: intent.paymentId,
    startedAt: Date.now(),
  });
  return order;
}

beforeEach(async () => {
  resetMockState();
  mockConfig.latencyMs = 0;
  mockConfig.settleDelayMs = 0;
  mockRouter.push.mockClear();
  mockPathname = '/discover';
  mockSheetOpen = false;
  await clearPendingPayment();
  useAuthStore.setState({ status: 'signed-out', user: null, pendingPhone: null });
});

afterAll(() => {
  mockConfig.settleDelayMs = 4000;
});

describe('usePendingPaymentRecovery', () => {
  it('opens the confirmation on launch for a payment the bank confirmed', async () => {
    const order = await orderWithPayment('paid');

    renderWithProviders(<Recovery />);

    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith(`/checkout/confirmation?orderId=${order.id}`),
    );
    await waitFor(async () => expect(await loadPendingPayment()).toBeNull());
  });

  it('opens the payment screen for a declined payment, where the retry is', async () => {
    const order = await orderWithPayment('failed');

    renderWithProviders(<Recovery />);

    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith(`/checkout/payment?orderId=${order.id}`),
    );
    await waitFor(async () => expect(await loadPendingPayment()).toBeNull());
  });

  it('opens the payment screen for a bank check still pending, and keeps watching it', async () => {
    const order = await orderWithPayment('stuck');

    renderWithProviders(<Recovery />);

    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith(`/checkout/payment?orderId=${order.id}`),
    );
    expect((await loadPendingPayment())?.orderId).toBe(order.id);
  });

  it('checks again when the app returns to the foreground', async () => {
    const order = await orderWithPayment('stuck');
    mockSheetOpen = true;

    renderWithProviders(<Recovery />);
    await act(async () => {});
    expect(mockRouter.push).not.toHaveBeenCalled();

    mockSheetOpen = false;
    await returnToForeground();

    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith(`/checkout/payment?orderId=${order.id}`),
    );
  });

  /** Navigating away would unmount the screen whose listener is waiting for the sheet. */
  it('stays put while a sheet is open', async () => {
    await orderWithPayment('paid');
    mockSheetOpen = true;

    renderWithProviders(<Recovery />);
    await returnToForeground();

    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(await loadPendingPayment()).not.toBeNull();
  });

  it('leaves the payment screen to watch the order itself', async () => {
    await orderWithPayment('stuck');
    mockPathname = '/checkout/payment';

    renderWithProviders(<Recovery />);
    await returnToForeground();

    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('does nothing without a remembered payment', async () => {
    useAuthStore.setState({ status: 'signed-in' } as never);

    renderWithProviders(<Recovery />);
    await returnToForeground();

    expect(mockRouter.push).not.toHaveBeenCalled();
  });
});

describe('recoveryTarget', () => {
  const status = (partial: Partial<PaymentStatus>): PaymentStatus => ({
    orderStatus: 'awaiting_payment',
    paymentStatus: 'pending',
    ticketsIssued: 0,
    paidAt: null,
    ...partial,
  });

  it('routes every server answer to the screen that owns it', () => {
    expect(recoveryTarget('o', status({ orderStatus: 'paid', paymentStatus: 'captured' }))).toEqual(
      { href: '/checkout/confirmation?orderId=o', clear: true },
    );
    expect(recoveryTarget('o', status({ orderStatus: 'failed', paymentStatus: 'failed' }))).toEqual(
      { href: '/checkout/payment?orderId=o', clear: true },
    );
    expect(recoveryTarget('o', status({ orderStatus: 'expired' }))).toEqual({
      href: '/checkout/payment?orderId=o',
      clear: true,
    });
    expect(recoveryTarget('o', status({}))).toEqual({
      href: '/checkout/payment?orderId=o',
      clear: false,
    });
    expect(recoveryTarget('o', status({ paymentStatus: 'failed' }))).toEqual({
      href: '/checkout/payment?orderId=o',
      clear: true,
    });
    expect(recoveryTarget('o', status({ orderStatus: 'cancelled' }))).toEqual({
      href: null,
      clear: true,
    });
  });
});
