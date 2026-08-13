import { fireEvent, renderWithProviders, screen, waitFor } from '../../../src/test-utils';
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
};

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
    areaId: 'ar-cairo',
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
  mockRouter.replace.mockClear();
  useAuthStore.setState({ status: 'signed-out', user: null, pendingPhone: null });
});

it('opens Paymob native checkout while waiting for server settlement', async () => {
  await signInAndComplete();
  const order = await mockApi.orders.create({
    eventId: TULUA_ID,
    buyerTierId: TIER_WEEKEND,
    items: [{ tierId: TIER_WEEKEND, quantity: 2 }],
    guests: [{ phoneNumber: '+201022334455', name: 'Nour Hassan', tierId: TIER_WEEKEND }],
  });
  mockParams.orderId = order.id;

  renderWithProviders(<PaymentScreen />);

  await waitFor(() => expect(screen.getAllByText('Pay 3,648.00 EGP').length).toBe(2));
  fireEvent.press(screen.getAllByText('Pay 3,648.00 EGP')[1]!);

  await waitFor(() =>
    expect(mockPaymob.presentPayVC).toHaveBeenCalledWith('sec_mock_0000', 'pk_mock_0000'),
  );
  expect(screen.getByText('Waiting for the server to confirm payment…')).toBeTruthy();
  expect(mockRouter.replace).not.toHaveBeenCalled();
});
