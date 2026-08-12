import { mockConfig, resetMockState } from '../../src/api/mock';
import { useAuthStore } from '../../src/stores/auth';
import { fireEvent, renderWithProviders, screen, waitFor } from '../../src/test-utils';
import PhoneScreen from '../(onboarding)/phone';

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

beforeEach(() => {
  resetMockState();
  mockConfig.latencyMs = 0;
  mockPush.mockClear();
  mockBack.mockClear();
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
});
