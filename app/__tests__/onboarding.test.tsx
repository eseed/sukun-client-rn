import { Keyboard } from 'react-native';
import { ApiError } from '../../src/api/live/http';
import { MOCK_OTP_CODE, mockApi, mockConfig, resetMockState } from '../../src/api/mock';
import { useAuthStore } from '../../src/stores/auth';
import { act, fireEvent, renderWithProviders, screen, waitFor } from '../../src/test-utils';
import OtpScreen from '../(onboarding)/otp';
import PhoneScreen from '../(onboarding)/phone';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();

let mockParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, replace: mockReplace }),
  useLocalSearchParams: () => mockParams,
}));

beforeEach(() => {
  resetMockState();
  mockConfig.latencyMs = 0;
  mockPush.mockClear();
  mockBack.mockClear();
  mockReplace.mockClear();
  mockParams = {};
  useAuthStore.setState({ status: 'signed-out', user: null, pendingPhone: null });
});

describe('Phone number screen', () => {
  it('renders the design copy and the home-country prefix', () => {
    renderWithProviders(<PhoneScreen />);

    expect(screen.getByText('Step 1 of 2')).toBeTruthy();
    expect(screen.getByText("Hello! What's your number?")).toBeTruthy();
    expect(screen.getByText(/🇪🇬 \+20/)).toBeTruthy();
    expect(screen.getByText('Send me a code')).toBeTruthy();
  });

  it('drops the decorative swirl while the keyboard covers its space', () => {
    // The swirl fills the gap between the field and the CTA. `Screen` avoids the keyboard by
    // shrinking that gap, and a fixed-size swirl in a collapsed gap rides up over the number.
    const listeners: Record<string, () => void> = {};
    const addListener = jest
      .spyOn(Keyboard, 'addListener')
      .mockImplementation((event, listener) => {
        listeners[event] = listener as () => void;
        return { remove: jest.fn() } as never;
      });

    try {
      renderWithProviders(<PhoneScreen />);
      expect(screen.getByTestId('phone-deco-swirl')).toBeTruthy();

      act(() => listeners.keyboardWillShow?.());
      expect(screen.queryByTestId('phone-deco-swirl')).toBeNull();

      act(() => listeners.keyboardWillHide?.());
      expect(screen.getByTestId('phone-deco-swirl')).toBeTruthy();
    } finally {
      addListener.mockRestore();
    }
  });

  it('keeps the CTA inert until the number is a valid mobile', async () => {
    renderWithProviders(<PhoneScreen />);
    const input = screen.getByPlaceholderText('10 01234567');

    fireEvent.changeText(input, '1012');
    fireEvent.press(screen.getByText('Send me a code'));
    await waitFor(() => expect(mockPush).not.toHaveBeenCalled());
  });

  it('requests a code and advances, storing the number as identity', async () => {
    renderWithProviders(<PhoneScreen />);

    fireEvent.changeText(screen.getByPlaceholderText('10 01234567'), '1012345678');
    fireEvent.press(screen.getByText('Send me a code'));

    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/(onboarding)/otp',
        params: { resendAfter: '30' },
      }),
    );
    expect(useAuthStore.getState().pendingPhone).toBe('+201012345678');
  });

  it('formats the national number as it is typed', () => {
    renderWithProviders(<PhoneScreen />);
    const input = screen.getByPlaceholderText('10 01234567');

    fireEvent.changeText(input, '01012345678');
    expect(input.props.value).toBe('10 12345678');
  });

  it('explains why an incomplete number cannot be submitted', async () => {
    renderWithProviders(<PhoneScreen />);

    fireEvent.changeText(screen.getByPlaceholderText('10 01234567'), '10123');
    fireEvent.press(screen.getByText('Send me a code'));

    await waitFor(() => expect(screen.getByText('That number is too short.')).toBeTruthy());
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('names the country when the number is the right length but not a mobile one', async () => {
    renderWithProviders(<PhoneScreen />);

    fireEvent.changeText(screen.getByPlaceholderText('10 01234567'), '2223456789');
    fireEvent.press(screen.getByText('Send me a code'));

    await waitFor(() =>
      expect(screen.getByText("That doesn't look like a mobile number in Egypt.")).toBeTruthy(),
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

    // Entering the last digit submits on its own; there is no button press to make.
    fireEvent.changeText(screen.getByLabelText('Verification code'), MOCK_OTP_CODE);

    await waitFor(() => expect(useAuthStore.getState().status).toBe('signed-in'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
  });

  /**
   * `signIn` clears `pendingPhone`. The out-of-order guard watches that field, so without a
   * signed-in check it fires on success and throws the user back to the number entry.
   */
  it('does not bounce back to the phone screen once sign-in clears the pending number', async () => {
    await renderWithPendingPhone();

    // Entering the last digit submits on its own; there is no button press to make.
    fireEvent.changeText(screen.getByLabelText('Verification code'), MOCK_OTP_CODE);

    await waitFor(() => expect(useAuthStore.getState().status).toBe('signed-in'));
    expect(mockReplace).not.toHaveBeenCalledWith('/(onboarding)/phone');
  });

  it('starts the resend countdown from the wait the server gave', async () => {
    mockParams = { resendAfter: '120' };
    await renderWithPendingPhone();

    expect(screen.getByText('Resend in 2:00')).toBeTruthy();
  });

  it('falls back to 30 seconds when the server gave no wait', async () => {
    await renderWithPendingPhone();

    expect(screen.getByText('Resend in 0:30')).toBeTruthy();
  });

  it('counts down from retryAfterSeconds when a resend is refused', async () => {
    jest.useFakeTimers();
    try {
      mockParams = { resendAfter: '1' };
      await renderWithPendingPhone();
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      const refusal = new ApiError(
        'OTP_RATE_LIMITED',
        'rate limited',
        429,
        [],
        undefined,
        undefined,
        90,
      );
      jest.spyOn(mockApi.auth, 'requestOtp').mockRejectedValueOnce(refusal);

      fireEvent.press(screen.getByText('Resend code'));

      expect(
        await screen.findByText('Too many code attempts for this number. Try again in 90 seconds.'),
      ).toBeTruthy();
      expect(screen.getByText('Resend in 1:30')).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('still redirects when the screen is opened without a pending number', async () => {
    useAuthStore.setState({ status: 'signed-out', user: null, pendingPhone: null });
    renderWithProviders(<OtpScreen />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(onboarding)/phone'));
  });
});
