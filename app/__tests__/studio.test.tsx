import { mockApi, mockConfig, MOCK_OTP_CODE, resetMockState } from '../../src/api/mock';
import { useAuthStore } from '../../src/stores/auth';
import { useGuestStudioStore } from '../../src/hooks/useHomeStudio';
import { fireEvent, renderWithProviders, screen, waitFor } from '../../src/test-utils';
import StudioScreen from '../(tabs)/studio';
import ClassDetailsScreen from '../classes/sessions/[id]';
import StudioCheckoutScreen from '../studio/checkout';
import StudioTermsScreen from '../studio/terms';

/**
 * The Studio (P4) flows against the mock api: choosing a home studio, the terms step, buying a
 * package, and booking a class with it.
 */

const mockParams: Record<string, string> = {};
const mockRouter = {
  push: jest.fn(),
  back: jest.fn(),
  replace: jest.fn(),
  navigate: jest.fn(),
  setParams: jest.fn(),
  canGoBack: jest.fn(() => false),
};

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
  useIsFocused: () => true,
  useFocusEffect: (effect: () => void | (() => void)) =>
    jest.requireActual<typeof import('react')>('react').useEffect(effect, [effect]),
  usePathname: () => '/studio',
  Redirect: () => null,
  Stack: Object.assign(() => null, { Screen: () => null }),
  Tabs: Object.assign(() => null, { Screen: () => null }),
}));

async function signIn() {
  await mockApi.auth.requestOtp('+201012345678');
  await mockApi.auth.verifyOtp('+201012345678', MOCK_OTP_CODE);
  const user = await mockApi.profile.update({
    fullName: 'Yasmin El Sayed',
    email: 'yasmin@email.com',
    dateOfBirth: '1994-03-12',
    gender: 'female',
    areaId: 'ar-maadi',
  });
  useAuthStore.setState({ status: 'signed-in', user, pendingPhone: null });
  return user;
}

async function firstSessionId(): Promise<string> {
  const home = await mockApi.studio.home();
  const branchId = home.branches[0]!.id;
  const tomorrow = new Date(Date.now() + 86_400_000 + 2 * 3_600_000).toISOString().slice(0, 10);
  const week = await mockApi.studio.schedule({ branchId, weekStart: tomorrow });
  return week.days[0]!.hours[0]!.sessions[0]!.id;
}

beforeEach(() => {
  resetMockState();
  mockConfig.latencyMs = 0;
  useGuestStudioStore.setState({ branchId: null });
  for (const key of Object.keys(mockParams)) delete mockParams[key];
  Object.values(mockRouter).forEach((fn) => (fn as jest.Mock).mockClear?.());
});

describe('Studio tab', () => {
  it('asks for a home studio first, then shows it', async () => {
    await signIn();
    renderWithProviders(<StudioScreen />);

    await waitFor(() => expect(screen.getByText('Which studio do you go to?')).toBeTruthy());
    expect(screen.getByText('Sukun Studios West')).toBeTruthy();
    fireEvent.press(screen.getByText('This is my studio'));

    await waitFor(() => expect(screen.getByText('Your studio')).toBeTruthy());
    expect(screen.getByText('Sukun Studios East')).toBeTruthy();
    expect(screen.getByText('Schedule')).toBeTruthy();
    expect(screen.getByText('Check in')).toBeTruthy();
    expect(screen.getByText('Offerings')).toBeTruthy();
    expect(screen.getByText('Yoga')).toBeTruthy();
  });

  it('switches studio only after a confirm', async () => {
    await signIn();
    await mockApi.studio.setHomeBranch((await mockApi.studio.home()).branches[1]!.id);
    renderWithProviders(<StudioScreen />);

    await waitFor(() => expect(screen.getByText('Change')).toBeTruthy());
    fireEvent.press(screen.getByText('Change'));
    expect(screen.getByText('Switch to Sukun Studios West?')).toBeTruthy();
    expect(screen.getByText('Stay at East')).toBeTruthy();
    fireEvent.press(screen.getByText('Switch to West'));
    await waitFor(() => expect(screen.getByText('Sukun Studios West')).toBeTruthy());
  });
});

describe('Booking a class', () => {
  it('sends a first-time client to the studio terms', async () => {
    await signIn();
    const sessionId = await firstSessionId();
    mockParams.id = sessionId;
    renderWithProviders(<ClassDetailsScreen />);

    await waitFor(() => expect(screen.getByText('Book now')).toBeTruthy());
    fireEvent.press(screen.getByText('Book now'));
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith(
        `/studio/terms?next=${encodeURIComponent(`/classes/sessions/${sessionId}?book=1`)}`,
      ),
    );
  });

  it('records the terms, then goes on', async () => {
    await signIn();
    mockParams.next = '/classes/sessions/x?book=1';
    renderWithProviders(<StudioTermsScreen />);

    await waitFor(() =>
      expect(screen.getByText('I have read and accept the studio terms.')).toBeTruthy(),
    );
    expect(screen.getByText('Studio terms')).toBeTruthy();
    expect(screen.getByText('Before your first class')).toBeTruthy();
    fireEvent.press(screen.getByText('I have read and accept the studio terms.'));
    fireEvent.press(screen.getByText('Agree & continue'));
    await waitFor(() =>
      expect(mockRouter.replace).toHaveBeenCalledWith('/classes/sessions/x?book=1'),
    );
    expect((await mockApi.studio.legal()).eligible).toBe(true);
  });

  it('buys a package with the class (Book and pay)', async () => {
    await signIn();
    await mockApi.studio.acceptLegal('doc-waiver-1');
    const sessionId = await firstSessionId();
    mockParams.packageId = 'p-10';
    mockParams.sessionId = sessionId;
    renderWithProviders(<StudioCheckoutScreen />);

    await waitFor(() => expect(screen.getByText('Review & pay')).toBeTruthy());
    await waitFor(() => expect(screen.getByText('Pay 3,400.00 EGP')).toBeTruthy());
    fireEvent.press(screen.getByText('I accept the package terms. Packages are non-refundable.'));
    fireEvent.press(screen.getByText('Pay 3,400.00 EGP'));
    await waitFor(() =>
      expect(mockRouter.replace).toHaveBeenCalledWith(
        expect.stringMatching(/^\/studio\/booked\?orderId=/),
      ),
    );
    const upcoming = await mockApi.studio.mySchedule('upcoming');
    expect(upcoming.data.map((b) => b.sessionId)).toContain(sessionId);
  });

  it('books with a package the client holds', async () => {
    await signIn();
    await mockApi.studio.acceptLegal('doc-waiver-1');
    await mockApi.studio.createCheckout({
      packageId: 'p-10',
      branchId: (await mockApi.studio.home()).branches[0]!.id,
      expectedQuoteFingerprint: 'mock',
      idempotencyKey: '00000000-0000-4000-8000-000000000001',
    });
    const sessionId = await firstSessionId();
    mockParams.id = sessionId;
    renderWithProviders(<ClassDetailsScreen />);

    await waitFor(() => expect(screen.getByText('Book now')).toBeTruthy());
    fireEvent.press(screen.getByText('Book now'));
    await waitFor(() => expect(screen.getByText('Book with 10 Class')).toBeTruthy());
    expect(screen.getByText('Book and pay now')).toBeTruthy();
    fireEvent.press(screen.getByText('Book with 10 Class'));
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith(
        expect.objectContaining({ pathname: '/studio/booked' }),
      ),
    );
  });
});
