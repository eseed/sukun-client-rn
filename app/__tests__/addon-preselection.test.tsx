import { mockApi, mockConfig, MOCK_OTP_CODE, resetMockState } from '../../src/api/mock';
import { ADDON_TRANSPORT } from '../../src/api/mock/addon-fixtures';
import { TIER_WEEKEND, TULUA_ID } from '../../src/api/mock/fixtures';
import { useAuthStore } from '../../src/stores/auth';
import { useCheckoutStore } from '../../src/stores/checkout';
import { renderWithProviders, screen, waitFor } from '../../src/test-utils';
import AddonsBrowseScreen from '../checkout/addons';
import ChoosePassScreen from '../checkout/pass';
import TicketExtrasScreen from '../ticket/[id]/extras';

/**
 * "Add" on an event page logistics block, end to end past the event page (owner's call,
 * 2026-10-17). Without a ticket, the ticket checkout carries the add-on in the draft and its
 * extras step opens it; with one, the ticket's extras screen opens with it chosen. Either way the
 * price is the server's: nothing here is added up.
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
  Redirect: () => null,
  Stack: Object.assign(() => null, { Screen: () => null }),
  Tabs: Object.assign(() => null, { Screen: () => null }),
}));

/** Signs in with a complete profile, which seeds an active Tulua ticket (`tk-seed-1`). */
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
  useCheckoutStore.getState().reset();
  useAuthStore.setState({ status: 'signed-out', user: null, pendingPhone: null });
});

describe('the ticket checkout, started from a logistics "Add"', () => {
  it('says on the pass step why a ticket comes first', async () => {
    useCheckoutStore.getState().start(TULUA_ID, TIER_WEEKEND, { addonId: ADDON_TRANSPORT });
    mockParams.eventId = TULUA_ID;
    mockParams.for = 'addon';

    renderWithProviders(<ChoosePassScreen />);

    expect(await screen.findByText('Get your ticket first, then add Cairo shuttle')).toBeTruthy();
  });

  it('opens the add-on once when checkout reaches its extras step', async () => {
    await signInAndComplete();
    useCheckoutStore.getState().start(TULUA_ID, TIER_WEEKEND, { addonId: ADDON_TRANSPORT });
    mockParams.eventId = TULUA_ID;

    renderWithProviders(<AddonsBrowseScreen />);

    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith(
        `/checkout/addon/${ADDON_TRANSPORT}?eventId=${TULUA_ID}`,
      ),
    );
    expect(useCheckoutStore.getState().preselectedAddonId).toBeNull();
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
  });

  it('lets an add-on that is no longer on sale go, and stays on the list', async () => {
    await signInAndComplete();
    useCheckoutStore.getState().start(TULUA_ID, TIER_WEEKEND, { addonId: 'addon-switched-off' });
    mockParams.eventId = TULUA_ID;

    renderWithProviders(<AddonsBrowseScreen />);

    await waitFor(() => expect(screen.getByText('Cairo shuttle')).toBeTruthy());
    await waitFor(() => expect(useCheckoutStore.getState().preselectedAddonId).toBeNull());
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('starts a plain checkout with nothing preselected', () => {
    useCheckoutStore.getState().start(TULUA_ID, TIER_WEEKEND, { addonId: ADDON_TRANSPORT });
    useCheckoutStore.getState().start(TULUA_ID, TIER_WEEKEND);
    expect(useCheckoutStore.getState().preselectedAddonId).toBeNull();
  });
});

describe('a holder\'s ticket extras, opened from a logistics "Add"', () => {
  it("chooses the add-on's first option on sale, and the server prices it", async () => {
    await signInAndComplete();
    mockParams.id = 'tk-seed-1';
    mockParams.addon = ADDON_TRANSPORT;

    renderWithProviders(<TicketExtrasScreen />);

    await waitFor(() => expect(screen.getByText('1 add-on')).toBeTruthy());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Continue' })).not.toBeDisabled(),
    );
    const cart = await mockApi.carts.create(TULUA_ID);
    expect(cart.addons.map((line) => [line.optionId, line.quantity])).toEqual([
      ['opt-shuttle-one-way', 1],
    ]);
  });

  it('chooses nothing for an add-on the catalogue does not have', async () => {
    await signInAndComplete();
    mockParams.id = 'tk-seed-1';
    mockParams.addon = 'addon-switched-off';

    renderWithProviders(<TicketExtrasScreen />);

    await waitFor(() => expect(screen.getAllByText('Dinner voucher').length).toBeGreaterThan(0));
    expect(screen.getByRole('button', { name: 'Buy add-on' })).toBeTruthy();
    expect(screen.queryByText('Continue')).toBeNull();
    expect(screen.queryByText('1 add-on')).toBeNull();
  });
});
