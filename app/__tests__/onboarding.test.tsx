import { MOCK_OTP_CODE, mockApi, mockConfig, resetMockState } from '../../src/api/mock';
import { useAuthStore } from '../../src/stores/auth';
import { fireEvent, renderWithProviders, screen, waitFor } from '../../src/test-utils';
import OtpScreen from '../(onboarding)/otp';
import PhoneScreen from '../(onboarding)/phone';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, replace: mockReplace }),
  useLocalSearchParams: () => ({}),
}));

beforeEach(() => {
  resetMockState();
  mockConfig.latencyMs = 0;
  mockPush.mockClear();
  mockBack.mockClear();
  mockReplace.mockClear();
  useAuthStore.setState({ status: 'signed-out', user: null, pendingPhone: null });
});

describe('Phone number screen', () => {
  it('renders the design copy and the +20 prefix', () => {
    renderWithProviders(<PhoneScreen />);

    expect(screen.getByText('Step 1 of 3')).toBeTruthy();
    expect(screen.getByText("Hello! What's your number?")).toBeTruthy();
    expect(screen.getByText('🇪🇬 +20')).toBeTruthy();
    expect(screen.getByText('Send me a code')).toBeTruthy();
  });

  it('keeps the CTA inert until the number is a valid Egyptian mobile', async () => {
    renderWithProviders(<PhoneScreen />);
    const input = screen.getByPlaceholderText('10 1234 5678');

    fireEvent.changeText(input, '1012');
    fireEvent.press(screen.getByText('Send me a code'));
    await waitFor(() => expect(mockPush).not.toHaveBeenCalled());
  });

  it('requests a code and advances, storing the number as identity', async () => {
    renderWithProviders(<PhoneScreen />);

    fireEvent.changeText(screen.getByPlaceholderText('10 1234 5678'), '1012345678');
    fireEvent.press(screen.getByText('Send me a code'));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/(onboarding)/otp'));
    expect(useAuthStore.getState().pendingPhone).toBe('+201012345678');
  });

  it('formats the national number as it is typed', () => {
    renderWithProviders(<PhoneScreen />);
    const input = screen.getByPlaceholderText('10 1234 5678');

    fireEvent.changeText(input, '01012345678');
    expect(input.props.value).toBe('10 1234 5678');
  });

  it('explains why an incomplete number cannot be submitted', async () => {
    renderWithProviders(<PhoneScreen />);

    fireEvent.changeText(screen.getByPlaceholderText('10 1234 5678'), '100000001');
    fireEvent.press(screen.getByText('Send me a code'));

    await waitFor(() =>
      expect(
        screen.getByText('That number is too short — Egyptian numbers have 10 digits.'),
      ).toBeTruthy(),
    );
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe('OTP screen', () => {
  async function renderWithPendingPhone(phone = '+201012345678') {
    await mockApi.auth.requestOtp(phone);
    useAuthStore.setState({ status: 'signed-out', user: null, pendingPhone: phone });
    renderWithProviders(<OtpScreen />);
  }

  it('sends the user into the app on a correct code', async () => {
    await renderWithPendingPhone();

    fireEvent.changeText(screen.getByLabelText('Verification code'), MOCK_OTP_CODE);
    fireEvent.press(screen.getByText('Verify'));

    await waitFor(() => expect(useAuthStore.getState().status).toBe('signed-in'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
  });

  /**
   * `signIn` clears `pendingPhone`. The out-of-order guard watches that field, so without a
   * signed-in check it fires on success and throws the user back to the number entry.
   */
  it('does not bounce back to the phone screen once sign-in clears the pending number', async () => {
    await renderWithPendingPhone();

    fireEvent.changeText(screen.getByLabelText('Verification code'), MOCK_OTP_CODE);
    fireEvent.press(screen.getByText('Verify'));

    await waitFor(() => expect(useAuthStore.getState().status).toBe('signed-in'));
    expect(mockReplace).not.toHaveBeenCalledWith('/(onboarding)/phone');
  });

  it('still redirects when the screen is opened without a pending number', async () => {
    useAuthStore.setState({ status: 'signed-out', user: null, pendingPhone: null });
    renderWithProviders(<OtpScreen />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(onboarding)/phone'));
  });
});
