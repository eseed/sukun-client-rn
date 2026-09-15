import { renderWithProviders, screen, waitFor } from '../../../src/test-utils';
import { mockApi, mockConfig, MOCK_OTP_CODE, resetMockState } from '../../../src/api/mock';
import { useAuthStore } from '../../../src/stores/auth';

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

beforeEach(() => {
  resetMockState();
  mockConfig.latencyMs = 0;
  mockRouter.push.mockClear();
  for (const key of Object.keys(mockParams)) delete mockParams[key];
  useAuthStore.setState({ status: 'signed-out', user: null, pendingPhone: null });
});

describe('07 Event detail · extras teaser', () => {
  it('names the kinds of extra on offer, without naming any single one', async () => {
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
    mockParams.slug = 'tulua';

    renderWithProviders(<EventDetailScreen />);

    await waitFor(() => expect(screen.getByText('Add-ons available')).toBeTruthy());
    expect(screen.getByText('Rooms, meal vouchers & transport')).toBeTruthy();
  });
});
