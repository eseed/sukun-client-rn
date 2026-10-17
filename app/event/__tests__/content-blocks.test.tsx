import type { ReactTestRendererJSON } from 'react-test-renderer';
import { fireEvent, renderWithProviders, screen, waitFor, within } from '../../../src/test-utils';
import { mockApi, mockConfig, MOCK_OTP_CODE, resetMockState } from '../../../src/api/mock';
import { ADDON_ACCOMMODATION, ADDON_TRANSPORT } from '../../../src/api/mock/addon-fixtures';
import { TIER_WEEKEND, TULUA_ID } from '../../../src/api/mock/fixtures';
import { api } from '../../../src/api';
import type { EventContentBlock } from '../../../src/api/types';
import { useAuthStore } from '../../../src/stores/auth';
import { useCheckoutStore } from '../../../src/stores/checkout';

import EventDetailScreen from '../[slug]';

/**
 * The admin's content blocks on the event page (approved design, placement A, owner's calls
 * 2026-10-17): each kind where it fits, the admin's order within a kind, nothing for a kind with
 * nothing published, FAQ closed until tapped, sponsors not tappable, and a logistics block's
 * linked add-on offered with "Add".
 *
 * Tulua's mock blocks (`content-block-fixtures.ts`) list the FAQ between the two logistics blocks,
 * so the placement asserted here is the page's, not the admin's overall order.
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

/** Tulua as the server sends it, with its content blocks swapped for these. */
function withContentBlocks(contentBlocks: EventContentBlock[] | undefined) {
  const detail = api.events.detail.bind(api.events);
  return jest
    .spyOn(api.events, 'detail')
    .mockImplementation(async (identifier) => ({ ...(await detail(identifier)), contentBlocks }));
}

/** Every string on screen, in tree order, to compare where sections sit. */
function textsInOrder(): string[] {
  const out: string[] = [];
  const walk = (node: ReactTestRendererJSON | ReactTestRendererJSON[] | string | null) => {
    if (node === null) return;
    if (typeof node === 'string') {
      out.push(node);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    node.children?.forEach(walk);
  };
  walk(screen.toJSON() as ReactTestRendererJSON | ReactTestRendererJSON[] | null);
  return out;
}

async function renderTulua() {
  mockParams.slug = 'tulua';
  renderWithProviders(<EventDetailScreen />);
  await waitFor(() => expect(screen.getByText('Venue')).toBeTruthy());
}

const HEADINGS = ["What's included", 'Getting there', 'Accessibility', 'Questions', 'Partners'];

afterEach(() => {
  jest.restoreAllMocks();
});

beforeEach(() => {
  resetMockState();
  mockConfig.latencyMs = 0;
  mockRouter.push.mockClear();
  for (const key of Object.keys(mockParams)) delete mockParams[key];
  useCheckoutStore.getState().reset();
  useAuthStore.setState({ status: 'signed-out', user: null, pendingPhone: null });
});

describe('Event page · content blocks placement', () => {
  it('puts each kind where it fits, whatever the admin order across kinds', async () => {
    await renderTulua();
    await waitFor(() => expect(screen.getByText('View full schedule')).toBeTruthy());

    const texts = textsInOrder();
    const at = (value: string) => {
      const index = texts.indexOf(value);
      if (index < 0) throw new Error(`"${value}" is not on screen`);
      return index;
    };

    // What's included right under the intro, ahead of everything after it.
    expect(at("What's included")).toBeLessThan(at('View full schedule'));
    // Getting there and Accessibility right under Venue.
    expect(at('Venue')).toBeLessThan(at('Getting there'));
    expect(at('Getting there')).toBeLessThan(at('Accessibility'));
    expect(at('Accessibility')).toBeLessThan(at('Tickets are available now.'));
    // Questions just above "Before you book", after "What to bring".
    expect(at('What to bring')).toBeLessThan(at('Questions'));
    expect(at('Questions')).toBeLessThan(at('Before you book'));
    // Partners last.
    expect(at('Before you book')).toBeLessThan(at('Partners'));
  });

  it("keeps the admin's order within a kind, under the kind's heading when there are several", async () => {
    await renderTulua();

    const texts = textsInOrder();
    // Two logistics blocks share "Getting there", each with its own title, in the admin's order.
    expect(texts.filter((value) => value === 'Getting there')).toHaveLength(1);
    expect(texts.indexOf('Buses from Cairo')).toBeGreaterThan(texts.indexOf('Getting there'));
    expect(texts.indexOf('Buses from Cairo')).toBeLessThan(texts.indexOf('Staying the night'));
  });

  it("heads a single block with the admin's title when there is one", async () => {
    withContentBlocks([
      { id: 'a1', type: 'accessibility', title: 'Coming with a wheelchair', body: '<p>Ramps.</p>' },
    ]);
    await renderTulua();

    await waitFor(() => expect(screen.getByText('Coming with a wheelchair')).toBeTruthy());
    expect(screen.queryByText('Accessibility')).toBeNull();
    expect(screen.getByText('Ramps.')).toBeTruthy();
  });

  it('shows no section at all for an older response without contentBlocks', async () => {
    withContentBlocks(undefined);
    await renderTulua();

    for (const heading of HEADINGS) expect(screen.queryByText(heading)).toBeNull();
    expect(screen.queryByTestId(/^content-section-/)).toBeNull();
  });

  it('shows nothing for a kind with nothing published', async () => {
    withContentBlocks([
      { id: 'f1', type: 'faq', title: null, body: null, items: [] },
      { id: 's1', type: 'sponsors', title: 'Friends', body: '  ', items: [] },
      { id: 'i1', type: 'inclusions', title: null, body: null, items: [{ label: 'Mats' }] },
    ]);
    await renderTulua();

    await waitFor(() => expect(screen.getByText("What's included")).toBeTruthy());
    expect(screen.getByText('Mats')).toBeTruthy();
    expect(screen.queryByText('Questions')).toBeNull();
    expect(screen.queryByText('Friends')).toBeNull();
    expect(screen.queryByText('Partners')).toBeNull();
    expect(screen.queryByText('Getting there')).toBeNull();
  });
});

describe('Event page · FAQ', () => {
  const QUESTION = 'Can I come for one day only?';
  const ANSWER = 'Yes. Pick a day pass when you get your ticket. It covers every session that day.';

  it('starts with every question closed, and opens and closes one on tap', async () => {
    await renderTulua();

    const question = screen.getByRole('button', { name: QUESTION });
    expect(question.props.accessibilityState).toMatchObject({ expanded: false });
    expect(screen.queryByText(ANSWER)).toBeNull();
    expect(screen.queryByText(/Sessions move into the covered tents/)).toBeNull();

    fireEvent.press(question);
    expect(screen.getByText(ANSWER)).toBeTruthy();
    expect(screen.getByRole('button', { name: QUESTION }).props.accessibilityState).toMatchObject({
      expanded: true,
    });
    // Only that one opened.
    expect(screen.queryByText(/Sessions move into the covered tents/)).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: QUESTION }));
    expect(screen.queryByText(ANSWER)).toBeNull();
    expect(screen.getByRole('button', { name: QUESTION }).props.accessibilityState).toMatchObject({
      expanded: false,
    });
  });
});

describe('Event page · partners', () => {
  it('shows logo, name and tier only, and nothing is pressable', async () => {
    await renderTulua();

    const tiles = screen.getAllByTestId('sponsor-tile');
    expect(tiles).toHaveLength(4);
    for (const tile of tiles) {
      expect(tile.props.onPress).toBeUndefined();
      expect(tile.props.accessibilityRole).toBeUndefined();
    }
    expect(screen.queryByRole('button', { name: /Siwa Springs/ })).toBeNull();
    const section = screen.getByTestId('content-section-sponsors');
    expect(within(section).queryByRole('link')).toBeNull();
    expect(within(section).queryByRole('button')).toBeNull();
    // The lead tier is named, larger, ahead of the others.
    expect(screen.getByLabelText('Siwa Springs, Presenting partner')).toBeTruthy();
    expect(screen.getByText('Presenting partner')).toBeTruthy();
    expect(screen.getByLabelText('Nile Roasters, Partners')).toBeTruthy();
  });
});

describe('Event page · logistics add-on', () => {
  it('opens the ticket checkout with the add-on preselected for someone without a ticket', async () => {
    await renderTulua();

    fireEvent.press(await screen.findByRole('button', { name: 'Add Cairo shuttle' }));

    expect(mockRouter.push).toHaveBeenCalledWith(`/checkout/pass?eventId=${TULUA_ID}&for=addon`);
    expect(useCheckoutStore.getState()).toMatchObject({
      eventId: TULUA_ID,
      tierId: TIER_WEEKEND,
      preselectedAddonId: ADDON_TRANSPORT,
    });
  });

  it("opens the holder's ticket extras with the add-on chosen", async () => {
    await signInAndComplete();
    await renderTulua();

    await waitFor(() => {
      fireEvent.press(screen.getByRole('button', { name: 'Add Desert Lodge Room' }));
      expect(mockRouter.push).toHaveBeenLastCalledWith(
        `/ticket/tk-seed-1/extras?addon=${ADDON_ACCOMMODATION}`,
      );
    });
    expect(useCheckoutStore.getState().preselectedAddonId).toBeNull();
  });

  it('names the add-on with a line about it, and never a price', async () => {
    await renderTulua();

    await screen.findByTestId(`content-addon-${ADDON_TRANSPORT}`);
    const block = screen.getByTestId('content-block-cb-tulua-bus');
    expect(within(block).getByText('Cairo shuttle')).toBeTruthy();
    expect(within(block).getByText('Coach from Cairo to the venue and back.')).toBeTruthy();
    expect(within(block).queryByText(/EGP|\d+\.\d{2}/)).toBeNull();
  });

  it('shows the block without the add-on row when the add-on is not in the catalogue', async () => {
    const list = api.addons.list.bind(api.addons);
    jest
      .spyOn(api.addons, 'list')
      .mockImplementation(async (identifier) =>
        (await list(identifier)).filter((addon) => addon.id !== ADDON_TRANSPORT),
      );
    await renderTulua();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Add Desert Lodge Room' })).toBeTruthy(),
    );
    expect(screen.getByText('Buses from Cairo')).toBeTruthy();
    expect(screen.queryByTestId(`content-addon-${ADDON_TRANSPORT}`)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add Cairo shuttle' })).toBeNull();
  });
});
