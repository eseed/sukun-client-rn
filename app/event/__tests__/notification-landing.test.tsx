import { api } from '../../../src/api';
import {
  grantMockTicket,
  MOCK_OTP_CODE,
  mockApi,
  mockConfig,
  resetMockState,
} from '../../../src/api/mock';
import { ADDON_ACCOMMODATION, ADDON_TRANSPORT } from '../../../src/api/mock/addon-fixtures';
import { TULUA_ID } from '../../../src/api/mock/fixtures';
import { track } from '../../../src/lib/analytics';
import { useAuthStore } from '../../../src/stores/auth';
import { useCheckoutStore } from '../../../src/stores/checkout';
import { act, renderWithProviders, screen, waitFor } from '../../../src/test-utils';

import EventDetailScreen from '../[slug]';

/**
 * A notification's landing on the event page (`?landing=stay|extras|addon`): the page does what
 * its own button would, once, and only when it knows who is asking. Acting while the ticket list
 * is still loading would send a holder to buy a ticket they already have.
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
  usePathname: () => '/event/tulua',
  Redirect: () => null,
}));

jest.mock('../../../src/lib/analytics', () => ({
  ...jest.requireActual('../../../src/lib/analytics'),
  track: jest.fn(),
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

async function signInAsHolder(): Promise<string> {
  const granted = grantMockTicket({ phoneNumber: PHONE, holderName: 'Yasmin El Sayed' });
  await signIn();
  await mockApi.tickets.claim(granted.id);
  return granted.id;
}

/** Holds the ticket list back until `release` is called. */
function holdTicketList() {
  const list = api.tickets.list.bind(api.tickets);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  jest.spyOn(api.tickets, 'list').mockImplementation(async (query) => {
    await gate;
    return list(query);
  });
  return () => act(() => release());
}

const pageShown = () => screen.findByText('Book your stay');
const cleared = { landing: undefined, addon: undefined };

beforeEach(() => {
  resetMockState();
  mockConfig.latencyMs = 0;
  jest.clearAllMocks();
  for (const key of Object.keys(mockParams)) delete mockParams[key];
  useCheckoutStore.getState().reset();
  useAuthStore.setState({ status: 'signed-out', user: null, pendingPhone: null });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('stay landing', () => {
  it('starts the ticket checkout for a visitor, once, and drops the params', async () => {
    Object.assign(mockParams, { slug: 'tulua', landing: 'stay' });
    const view = renderWithProviders(<EventDetailScreen />);

    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith(`/checkout/pass?eventId=${TULUA_ID}&for=stay`),
    );
    expect(mockRouter.setParams).toHaveBeenCalledWith(cleared);
    expect(useCheckoutStore.getState().eventId).toBe(TULUA_ID);
    expect(track).toHaveBeenCalledWith(
      'stay_box_opened',
      expect.objectContaining({ event_id: TULUA_ID, has_ticket: false, source: 'notification' }),
    );

    // Coming back (a re-render, a refetch) does not take it again.
    view.rerender(<EventDetailScreen />);
    await pageShown();
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
    expect(mockRouter.setParams).toHaveBeenCalledTimes(1);
  });

  it("waits for the holder's tickets, then adds the stay to theirs, never via checkout", async () => {
    const ticketId = await signInAsHolder();
    const release = holdTicketList();
    Object.assign(mockParams, { slug: 'tulua', landing: 'stay' });
    renderWithProviders(<EventDetailScreen />);

    // The page is up, but who is asking is not known yet: nothing happens.
    await pageShown();
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(mockRouter.setParams).not.toHaveBeenCalled();

    await release();
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith(`/ticket/${ticketId}/extras`));
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
    expect(mockRouter.setParams).toHaveBeenCalledWith(cleared);
    expect(useCheckoutStore.getState().eventId).toBeNull();
  });

  it('waits while the session is still being restored', async () => {
    useAuthStore.setState({ status: 'loading', user: null, pendingPhone: null });
    Object.assign(mockParams, { slug: 'tulua', landing: 'stay' });
    renderWithProviders(<EventDetailScreen />);

    await pageShown();
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(mockRouter.setParams).not.toHaveBeenCalled();
  });

  it('stays on the page when no stay is on sale', async () => {
    const list = api.addons.list.bind(api.addons);
    jest
      .spyOn(api.addons, 'list')
      .mockImplementation(async (identifier) =>
        (await list(identifier)).map((addon) =>
          addon.type === 'accommodation'
            ? { ...addon, availability: 'unavailable' as const }
            : addon,
        ),
      );
    Object.assign(mockParams, { slug: 'tulua', landing: 'stay' });
    renderWithProviders(<EventDetailScreen />);

    await waitFor(() => expect(mockRouter.setParams).toHaveBeenCalledWith(cleared));
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('stays on the page when the ticket list cannot be loaded', async () => {
    await signIn();
    jest.spyOn(api.tickets, 'list').mockRejectedValue(new Error('offline'));
    Object.assign(mockParams, { slug: 'tulua', landing: 'stay' });
    renderWithProviders(<EventDetailScreen />);

    await waitFor(() => expect(mockRouter.setParams).toHaveBeenCalledWith(cleared));
    expect(mockRouter.push).not.toHaveBeenCalled();
  });
});

describe('add-on landing', () => {
  it('starts the checkout with the add-on chosen for a visitor', async () => {
    Object.assign(mockParams, { slug: 'tulua', landing: 'addon', addon: ADDON_TRANSPORT });
    renderWithProviders(<EventDetailScreen />);

    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith(`/checkout/pass?eventId=${TULUA_ID}&for=addon`),
    );
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
    expect(useCheckoutStore.getState().preselectedAddonId).toBe(ADDON_TRANSPORT);
    expect(mockRouter.setParams).toHaveBeenCalledWith(cleared);
    expect(track).toHaveBeenCalledWith(
      'content_addon_opened',
      expect.objectContaining({ addon_id: ADDON_TRANSPORT, source: 'notification' }),
    );
  });

  it("waits for the holder's tickets, then opens the add-on on theirs", async () => {
    const ticketId = await signInAsHolder();
    const release = holdTicketList();
    Object.assign(mockParams, { slug: 'tulua', landing: 'addon', addon: ADDON_ACCOMMODATION });
    renderWithProviders(<EventDetailScreen />);

    await pageShown();
    expect(mockRouter.push).not.toHaveBeenCalled();

    await release();
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith(
        `/ticket/${ticketId}/extras?addon=${ADDON_ACCOMMODATION}`,
      ),
    );
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
  });

  it('stays on the page for an add-on the event does not sell', async () => {
    Object.assign(mockParams, {
      slug: 'tulua',
      landing: 'addon',
      addon: '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b',
    });
    renderWithProviders(<EventDetailScreen />);

    await waitFor(() => expect(mockRouter.setParams).toHaveBeenCalledWith(cleared));
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(useCheckoutStore.getState().eventId).toBeNull();
  });
});

describe('extras landing', () => {
  it("opens the holder's extras", async () => {
    const ticketId = await signInAsHolder();
    Object.assign(mockParams, { slug: 'tulua', landing: 'extras' });
    renderWithProviders(<EventDetailScreen />);

    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith(`/ticket/${ticketId}/extras`));
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith(
      'ticket_extras_opened',
      expect.objectContaining({ has_ticket: true, source: 'notification' }),
    );
  });

  it('sends an invitee to claim first', async () => {
    const granted = grantMockTicket({ phoneNumber: PHONE, holderName: 'Yasmin El Sayed' });
    await signIn();
    Object.assign(mockParams, { slug: 'tulua', landing: 'extras' });
    renderWithProviders(<EventDetailScreen />);

    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith(`/ticket/${granted.id}`));
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
  });

  it('starts the ticket checkout for anyone else', async () => {
    Object.assign(mockParams, { slug: 'tulua', landing: 'extras' });
    renderWithProviders(<EventDetailScreen />);

    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith(`/checkout/pass?eventId=${TULUA_ID}`),
    );
    expect(useCheckoutStore.getState().eventId).toBe(TULUA_ID);
  });
});

it('does nothing for a landing the page does not carry out', async () => {
  Object.assign(mockParams, { slug: 'tulua', landing: 'rooms' });
  renderWithProviders(<EventDetailScreen />);

  await pageShown();
  expect(mockRouter.push).not.toHaveBeenCalled();
  expect(mockRouter.setParams).not.toHaveBeenCalled();
});
