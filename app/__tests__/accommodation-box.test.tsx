import {
  grantMockTicket,
  MOCK_OTP_CODE,
  mockApi,
  mockConfig,
  resetMockState,
} from '../../src/api/mock';
import { TULUA_ID } from '../../src/api/mock/fixtures';
import { availableStays, stayPhotos } from '../../src/lib/addons';
import { useAuthStore } from '../../src/stores/auth';
import { useCheckoutStore } from '../../src/stores/checkout';
import { fireEvent, renderWithProviders, screen, waitFor } from '../../src/test-utils';
import ChoosePassScreen from '../checkout/pass';
import EventDetailScreen from '../event/[slug]';

/**
 * "Accommodation available" on the event page: it takes the place of the plain add-ons line
 * when the event sells somewhere to stay, and books it. A room attaches to a ticket, so a holder
 * adds it to theirs, a waiting invitee claims first, and anyone else is walked through buying
 * the ticket, told why.
 */

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
  usePathname: () => '/event/tulua',
  Redirect: () => null,
  Stack: Object.assign(() => null, { Screen: () => null }),
  Tabs: Object.assign(() => null, { Screen: () => null }),
}));

const PHONE = '+201012345678';

async function signIn() {
  await mockApi.auth.requestOtp(PHONE);
  await mockApi.auth.verifyOtp(PHONE, MOCK_OTP_CODE);
  const user = await mockApi.profile.update({
    fullName: 'Yasmin El Sayed',
    email: 'yasmin@email.com',
    dateOfBirth: '1994-03-12',
    gender: 'female',
    areaId: 'ar-maadi',
  });
  useAuthStore.setState({ status: 'signed-in', user, pendingPhone: null });
}

const box = () => screen.findByRole('button', { name: /^Accommodation available/ });

beforeEach(() => {
  resetMockState();
  mockConfig.latencyMs = 0;
  for (const key of Object.keys(mockParams)) delete mockParams[key];
  mockRouter.push.mockClear();
  useCheckoutStore.getState().reset();
  useAuthStore.setState({ status: 'signed-out', user: null, pendingPhone: null });
});

describe('the stays an event sells', () => {
  const stay = (id: string, overrides = {}) => ({
    id,
    type: 'accommodation' as const,
    availability: 'available' as const,
    featuredImageUrl: `https://cdn.test/${id}.jpg`,
    ...overrides,
  });

  it('keeps only accommodation that is on sale', () => {
    const addons = [
      stay('lodge'),
      stay('tent', { availability: 'unavailable' as const }),
      stay('meal', { type: 'meal' as const }),
    ];
    expect(availableStays(addons).map((addon) => addon.id)).toEqual(['lodge']);
  });

  it('shows up to two photos, skipping stays without one', () => {
    const photos = stayPhotos([
      stay('a', { featuredImageUrl: null }),
      stay('b'),
      stay('c'),
      stay('d'),
    ]);
    expect(photos).toEqual([
      { id: 'b', url: 'https://cdn.test/b.jpg' },
      { id: 'c', url: 'https://cdn.test/c.jpg' },
    ]);
  });
});

describe('Accommodation available, on the event page', () => {
  it('replaces the add-ons line and names the stays on sale (the mock tent is sold out)', async () => {
    mockParams.slug = 'tulua';
    renderWithProviders(<EventDetailScreen />);

    expect(await box()).toBeTruthy();
    expect(screen.getByText('Desert Lodge Room')).toBeTruthy();
    expect(screen.queryByText(/Camp Tent/)).toBeNull();
    expect(screen.getByText('Book your stay')).toBeTruthy();
    expect(screen.queryByText('Add-ons available')).toBeNull();
  });

  it('walks a visitor without a ticket through buying one, saying why', async () => {
    mockParams.slug = 'tulua';
    renderWithProviders(<EventDetailScreen />);

    fireEvent.press(await box());
    expect(mockRouter.push).toHaveBeenCalledWith(`/checkout/pass?eventId=${TULUA_ID}&for=stay`);
    expect(useCheckoutStore.getState().eventId).toBe(TULUA_ID);
  });

  it('adds the stay to a ticket the holder already has', async () => {
    const granted = grantMockTicket({ phoneNumber: PHONE, holderName: 'Yasmin El Sayed' });
    await signIn();
    await mockApi.tickets.claim(granted.id);
    mockParams.slug = 'tulua';
    renderWithProviders(<EventDetailScreen />);

    await waitFor(() => expect(screen.getByText('Book your stay')).toBeTruthy());
    await waitFor(() => {
      fireEvent.press(screen.getByRole('button', { name: /^Accommodation available/ }));
      expect(mockRouter.push).toHaveBeenCalledWith(`/ticket/${granted.id}/extras`);
    });
  });

  it('sends an invitee to claim their ticket first, as "Claim ticket" does', async () => {
    const granted = grantMockTicket({ phoneNumber: PHONE, holderName: 'Yasmin El Sayed' });
    await signIn();
    mockParams.slug = 'tulua';
    renderWithProviders(<EventDetailScreen />);

    await waitFor(() => expect(screen.getByText('Claim ticket')).toBeTruthy());
    fireEvent.press(await box());
    expect(mockRouter.push).toHaveBeenCalledWith(`/ticket/${granted.id}`);
  });
});

describe('Choose your pass, sent by "Book your stay"', () => {
  it('says the ticket comes first', async () => {
    mockParams.eventId = TULUA_ID;
    mockParams.for = 'stay';
    renderWithProviders(<ChoosePassScreen />);

    expect(await screen.findByText('Get your ticket first to book your stay')).toBeTruthy();
  });

  it('says nothing of the kind when reached from "Get tickets"', async () => {
    mockParams.eventId = TULUA_ID;
    renderWithProviders(<ChoosePassScreen />);

    await waitFor(() => expect(screen.getByText('Choose your pass')).toBeTruthy());
    expect(screen.queryByText('Get your ticket first to book your stay')).toBeNull();
  });
});
