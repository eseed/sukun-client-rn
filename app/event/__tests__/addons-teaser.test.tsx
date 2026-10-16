import { fireEvent, renderWithProviders, screen, waitFor } from '../../../src/test-utils';
import type { TicketAddon } from '../../../src/api/types';
import { mockApi, mockConfig, MOCK_OTP_CODE, resetMockState } from '../../../src/api/mock';
import { useAuthStore } from '../../../src/stores/auth';
import { api } from '../../../src/api';

import EventDetailScreen from '../[slug]';

/**
 * Design screen 07 · the extras teaser on the event page.
 *
 * This is the only place a buyer learns extras exist before committing to a ticket, and the
 * only P0.1 entry point that has to be able to *disappear*: an event with nothing on offer,
 * and an event whose extras are switched off at the backend, are one indistinguishable silent
 * state with no entry point and no error (P0.1 decision 11). Both halves are asserted here,
 * because a teaser that fails open is worse than no teaser at all.
 */

const mockParams: Record<string, string> = {};
const mockRouter = {
  push: jest.fn(),
  back: jest.fn(),
  replace: jest.fn(),
  navigate: jest.fn(),
};

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
  useIsFocused: () => true,
}));

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

/**
 * Tulua with no room left to book. An event that sells a stay shows the "Accommodation
 * available" box instead of this line (`accommodation-box.test.tsx`), so the line is what an
 * event says when its rooms are gone, or when it never sold any.
 */
function withoutStaysOnSale() {
  const list = api.addons.list.bind(api.addons);
  return jest
    .spyOn(api.addons, 'list')
    .mockImplementation(async (identifier) =>
      (await list(identifier)).map((addon) =>
        addon.type === 'accommodation' ? { ...addon, availability: 'unavailable' as const } : addon,
      ),
    );
}

afterEach(() => {
  jest.restoreAllMocks();
});

beforeEach(() => {
  resetMockState();
  mockConfig.latencyMs = 0;
  mockRouter.push.mockClear();
  for (const key of Object.keys(mockParams)) delete mockParams[key];
  useAuthStore.setState({ status: 'signed-out', user: null, pendingPhone: null });
});

describe('07 Event detail · extras teaser', () => {
  it('names the kinds of extra on offer, without naming any single one', async () => {
    withoutStaysOnSale();
    mockParams.slug = 'tulua';
    await signInAndComplete();

    renderWithProviders(<EventDetailScreen />);

    await waitFor(() => expect(screen.getByText('Tulua')).toBeTruthy());
    await waitFor(() => expect(screen.getByText('Add-ons available')).toBeTruthy());
    // Tulua sells accommodation, meals and transport, so all three kinds read back, in the
    // design's order. The design's own line names the shuttle ("...& the Cairo shuttle"), but
    // naming individual extras does not survive a rename or a catalogue of nine, so the kinds
    // stand in for them.
    expect(screen.getByText('Rooms, meal vouchers & transport')).toBeTruthy();
  });

  /**
   * Decision 11: flag-off and empty-catalogue are one silent state. Not a friendlier empty
   * card, not a disabled row, not an explanation. Nothing.
   */
  it('says nothing at all when the event has no extras', async () => {
    mockParams.slug = 'sound-bath-under-the-stars';
    await signInAndComplete();

    renderWithProviders(<EventDetailScreen />);

    // Wait for the screen to actually settle, so this is not just asserting on a spinner.
    await waitFor(() => expect(screen.getByText('Venue')).toBeTruthy());

    expect(screen.queryByText('Add-ons available')).toBeNull();
    expect(screen.queryByText(/Rooms, meal vouchers/)).toBeNull();
    // Nothing anywhere on the screen offers extras.
    expect(screen.queryByText(/add-?ons?/i)).toBeNull();
  });

  /**
   * Deliberately inert. Extras attach to a ticket, so there is nowhere to send anyone from the
   * event page: they cannot be browsed without a cart and cannot be bought without a ticket in
   * it. A control here would only repeat "Get tickets" while looking like something else.
   */
  it('is information, not a control', async () => {
    withoutStaysOnSale();
    mockParams.slug = 'tulua';
    await signInAndComplete();

    renderWithProviders(<EventDetailScreen />);
    await waitFor(() => expect(screen.getByText('Add-ons available')).toBeTruthy());

    expect(screen.queryByRole('button', { name: /Add-ons available/ })).toBeNull();
    // No chevron either: the design draws one, but it promises a destination that does not exist.
    expect(screen.queryByText('\u203a')).toBeNull();
  });

  /**
   * The catalogue is public, so the teaser is a property of the event rather than of the
   * session. If it needed a signed-in user it would vanish for exactly the audience it is
   * meant to persuade.
   */
  it('shows for a signed-out visitor too', async () => {
    withoutStaysOnSale();
    mockParams.slug = 'tulua';

    renderWithProviders(<EventDetailScreen />);

    await waitFor(() => expect(screen.getByText('Add-ons available')).toBeTruthy());
    expect(screen.getByText('Rooms, meal vouchers & transport')).toBeTruthy();
  });
});

describe('07 Event detail · a stay already booked', () => {
  const room: TicketAddon = {
    addonOptionId: 'opt-lodge-double-2',
    type: 'accommodation',
    addonName: 'Desert Lodge Room',
    label: 'Double · 2 nights',
    transportDirection: null,
    departureDate: null,
    departureTime: null,
    returnDate: null,
    returnTime: null,
    quantity: 1,
    status: 'active',
    issuedAddonStatus: 'active',
    originalQuantity: 1,
    activeQuantity: 1,
    pendingTicketReplacementQuantity: 0,
    refundedQuantity: 0,
    cancelledQuantity: 0,
    voidedQuantity: 0,
    redemptionsAllowed: 1,
    redemptionsUsed: 0,
    room: {
      roomType: 'Double',
      nights: 2,
      checkInDate: '2026-10-23',
      checkInTime: '14:00',
      checkOutDate: '2026-10-25',
      checkOutTime: '12:00',
      status: 'active',
      capacity: 2,
    },
  };

  it('shows the holder their room instead of offering another, and leads to the ticket', async () => {
    mockParams.slug = 'tulua';
    await signInAndComplete();
    const list = api.tickets.list.bind(api.tickets);
    jest.spyOn(api.tickets, 'list').mockImplementation(async (params) => {
      const page = await list(params);
      return {
        ...page,
        data: page.data.map((ticket) => ({ ...ticket, addons: [room], hasAccommodation: true })),
      };
    });

    renderWithProviders(<EventDetailScreen />);

    await waitFor(() => expect(screen.getByText('Your stay is booked')).toBeTruthy());
    expect(screen.getByText('Double · 2 nights · 23–25 Oct')).toBeTruthy();
    expect(screen.queryByText('Accommodation available')).toBeNull();
    fireEvent.press(screen.getByText('See it on your ticket →'));
    expect(mockRouter.push).toHaveBeenCalledWith('/ticket/tk-seed-1');
  });

  it('still offers a stay to a holder without a room', async () => {
    mockParams.slug = 'tulua';
    await signInAndComplete();

    renderWithProviders(<EventDetailScreen />);

    await waitFor(() => expect(screen.getByText('Accommodation available')).toBeTruthy());
    expect(screen.queryByText('Your stay is booked')).toBeNull();
  });
});
