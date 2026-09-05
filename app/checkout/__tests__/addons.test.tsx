import { fireEvent, renderWithProviders, screen, waitFor } from '../../../src/test-utils';
import { mockApi, mockConfig, MOCK_OTP_CODE, resetMockState } from '../../../src/api/mock';
import { addonOptions, ADDON_MEALS, ADDON_TRANSPORT } from '../../../src/api/mock/addon-fixtures';
import { SOUND_BATH_ID, TULUA_ID } from '../../../src/api/mock/fixtures';
import type { AddonSummary } from '../../../src/api/types';
import { useAuthStore } from '../../../src/stores/auth';
import { useCheckoutStore, type DraftAddon } from '../../../src/stores/checkout';
import { AddonCard } from '../../../src/components/checkout/AddonCard';

import AddonsBrowseScreen from '../addons';

/**
 * Design screens 10 · Add-ons browse and 15 · Add-on states.
 *
 * The distinction this file exists to pin down is withheld stock versus sold out. They arrive as
 * two different answers from the server, `availableQuantity: null` and an explicit `0` alongside
 * `availability: 'unavailable'`, and conflating them either invents a shortage the event never
 * declared or hides one it did. Every price and count asserted here is a figure the mock api
 * produced; nothing in these tests, and nothing on the screen, does arithmetic on money.
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

const REAL_NOW = mockConfig.now;

/** Before the fixtures' early-bird changeover, so the dinner voucher is priced in that window. */
const DURING_EARLY_BIRD = Date.parse('2026-08-15T10:00:00.000Z');

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
  return complete;
}

/** The catalogue as the screen receives it, so a card test starts from a real server shape. */
async function summaryFor(name: string): Promise<AddonSummary> {
  const list = await mockApi.addons.list(TULUA_ID);
  const summary = list.find((addon) => addon.name === name);
  if (!summary) throw new Error(`No addon named ${name} in the Tulua catalogue`);
  return summary;
}

/**
 * Picks an extra the way the add-on detail screen does: through the catalogue, so the draft
 * carries a real option id rather than an invented one.
 */
async function pickFirstOption(addonId: string): Promise<DraftAddon> {
  const detail = await mockApi.addons.detail(TULUA_ID, addonId);
  const option = detail.options[0]!;
  const line: DraftAddon = {
    addonId: detail.id,
    addonName: detail.name,
    type: detail.type,
    optionId: option.id,
    optionLabel: option.label,
    unitPriceEgp: option.priceEgpNow,
    quantity: 1,
  };
  useCheckoutStore.getState().upsertAddon(line);
  return line;
}

/** Every card on screen, in tree order, by the accessible name the card builds. */
function cardNames(): string[] {
  return screen
    .getAllByRole('button')
    .map((node) => String(node.props.accessibilityLabel ?? ''))
    .filter((label) => label.includes(','));
}

/** Stock is seeded per option in the fixtures, so a test that moves it puts it back. */
const seededStock = addonOptions.map((option) => ({
  id: option.id,
  quantitySold: option.quantitySold,
}));

function restoreStock() {
  for (const seed of seededStock) {
    const option = addonOptions.find((item) => item.id === seed.id);
    if (option) option.quantitySold = seed.quantitySold;
  }
}

beforeEach(() => {
  resetMockState();
  restoreStock();
  mockConfig.latencyMs = 0;
  mockConfig.now = REAL_NOW;
  for (const key of Object.keys(mockParams)) delete mockParams[key];
  mockRouter.push.mockClear();
  mockRouter.back.mockClear();
  mockRouter.replace.mockClear();
  useAuthStore.setState({ status: 'signed-out', user: null, pendingPhone: null });
  useCheckoutStore.getState().reset();
});

afterAll(() => {
  mockConfig.now = REAL_NOW;
  restoreStock();
});

describe('10 Add-ons browse', () => {
  it('leads with the design copy and the four-step label', async () => {
    mockParams.eventId = TULUA_ID;
    await signInAndComplete();
    renderWithProviders(<AddonsBrowseScreen />);

    await waitFor(() => expect(screen.getByText('Make it wholesome')).toBeTruthy());
    // Tulua sells extras, so its checkout is the four-step flow and this is step three.
    expect(screen.getByText('Checkout · step 3 of 4')).toBeTruthy();
    expect(
      screen.getByText('Extras are optional. You can skip this and just take the ticket.'),
    ).toBeTruthy();
    expect(screen.getByText('Skip')).toBeTruthy();
    expect(screen.getByText('Continue')).toBeTruthy();
  });

  it('groups the catalogue by type, in the order the design lists them', async () => {
    mockParams.eventId = TULUA_ID;
    await signInAndComplete();
    renderWithProviders(<AddonsBrowseScreen />);

    await waitFor(() => expect(screen.getByText('Desert Lodge Room')).toBeTruthy());

    // Accommodation, then Meals, then Transport: the cards come back in group order, and both
    // accommodation cards sit together ahead of the meal.
    expect(cardNames()).toEqual([
      expect.stringContaining('Desert Lodge Room'),
      expect.stringContaining('Camp Tent, shared'),
      expect.stringContaining('Dinner voucher'),
      expect.stringContaining('Cairo shuttle'),
    ]);

    // The design writes the type twice: once as the section header, once on each card's badge.
    expect(screen.getAllByText('Accommodation')).toHaveLength(3);
    expect(screen.getAllByText('Meals')).toHaveLength(2);
    expect(screen.getAllByText('Transport')).toHaveLength(2);
    // Nothing in this catalogue is untyped, so the catch-all group is not drawn.
    expect(screen.queryAllByText('More')).toHaveLength(0);
  });

  it('says "From" only when there is more than one option to choose between', async () => {
    mockParams.eventId = TULUA_ID;
    await signInAndComplete();
    renderWithProviders(<AddonsBrowseScreen />);

    await waitFor(() => expect(screen.getByText('Desert Lodge Room')).toBeTruthy());

    // Four room options and two shuttle options, so both headline prices are a floor.
    expect(screen.getByText('From 1,400.00 EGP')).toBeTruthy();
    expect(screen.getByText('From 350.00 EGP')).toBeTruthy();
    // One dinner option, so its price is the price, not a floor.
    expect(screen.getByText('340.00 EGP')).toBeTruthy();
    expect(screen.queryByText('From 340.00 EGP')).toBeNull();
  });

  it('shows the price window the server is charging in', async () => {
    mockConfig.now = () => DURING_EARLY_BIRD;
    mockParams.eventId = TULUA_ID;
    await signInAndComplete();
    renderWithProviders(<AddonsBrowseScreen />);

    await waitFor(() => expect(screen.getByText('Dinner voucher')).toBeTruthy());

    // The dinner voucher is the one fixture with a tiered price, so before the changeover it is
    // the early-bird figure, badged with the window's own name.
    expect(screen.getByText('Early bird')).toBeTruthy();
    expect(screen.getByText('280.00 EGP')).toBeTruthy();
    expect(screen.queryByText('340.00 EGP')).toBeNull();
  });

  it('publishes a remaining count once the event decides to show one', async () => {
    // Tulua publishes counts at a fifth or less. Selling the dinner voucher down to exactly
    // that threshold is what makes the server volunteer the number, so the count on screen is
    // the mock's own figure and not one this test typed in.
    const dinner = addonOptions.find((option) => option.addonId === ADDON_MEALS)!;
    dinner.quantitySold = dinner.stockTotal - 80;

    mockParams.eventId = TULUA_ID;
    await signInAndComplete();
    renderWithProviders(<AddonsBrowseScreen />);

    await waitFor(() => expect(screen.getByText('Dinner voucher')).toBeTruthy());
    expect(screen.getByText('Regular · 80 left')).toBeTruthy();
  });

  it('says nothing at all about stock the event is withholding', async () => {
    mockParams.eventId = TULUA_ID;
    await signInAndComplete();
    renderWithProviders(<AddonsBrowseScreen />);

    await waitFor(() => expect(screen.getByText('Desert Lodge Room')).toBeTruthy());

    // Every purchasable Tulua extra is well above the publish threshold, so the server withholds
    // the count. Withheld is silence: not a zero, not a shortage, not a reassurance.
    expect(screen.queryByText(/\d+ left$/)).toBeNull();
    expect(screen.queryByText('0 left')).toBeNull();
    expect(screen.queryByText(/none left/i)).toBeNull();
    expect(screen.queryByText(/sold out/i)).toBeTruthy(); // the camp tent, and only the camp tent
    expect(screen.getAllByText('Sold out')).toHaveLength(1);
  });

  it('marks a sold-out extra sold out, and will not let it be opened', async () => {
    mockParams.eventId = TULUA_ID;
    await signInAndComplete();
    renderWithProviders(<AddonsBrowseScreen />);

    await waitFor(() => expect(screen.getByText('Camp Tent, shared')).toBeTruthy());

    const card = screen.getByRole('button', { name: /Camp Tent, shared/ });
    expect(card.props.accessibilityState.disabled).toBe(true);
    expect(String(card.props.accessibilityLabel)).toContain('Sold out');
    // A sold-out option has nothing to configure, so the detail screen is closed to it.
    fireEvent.press(card);
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('opens an available extra on its detail screen', async () => {
    mockParams.eventId = TULUA_ID;
    await signInAndComplete();
    renderWithProviders(<AddonsBrowseScreen />);

    await waitFor(() => expect(screen.getByText('Dinner voucher')).toBeTruthy());
    fireEvent.press(screen.getByRole('button', { name: /Dinner voucher/ }));

    expect(mockRouter.push).toHaveBeenCalledWith(
      `/checkout/addon/${ADDON_MEALS}?eventId=${TULUA_ID}`,
    );
  });

  it('marks what is already in the cart as Added', async () => {
    mockParams.eventId = TULUA_ID;
    await signInAndComplete();
    await pickFirstOption(ADDON_MEALS);

    renderWithProviders(<AddonsBrowseScreen />);

    await waitFor(() => expect(screen.getByText('Dinner voucher')).toBeTruthy());
    expect(screen.getByText('Added')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /Dinner voucher/ }).props.accessibilityState.selected,
    ).toBe(true);
    // The extras the buyer has not picked stay unmarked.
    expect(
      screen.getByRole('button', { name: /Cairo shuttle/ }).props.accessibilityState.selected,
    ).toBe(false);
  });

  it('skips straight to review, leaving the cart alone', async () => {
    mockParams.eventId = TULUA_ID;
    await signInAndComplete();
    renderWithProviders(<AddonsBrowseScreen />);

    await waitFor(() => expect(screen.getByText('Make it wholesome')).toBeTruthy());
    fireEvent.press(screen.getByText('Skip'));

    expect(mockRouter.push).toHaveBeenCalledWith(`/checkout/review?eventId=${TULUA_ID}`);
    expect(useCheckoutStore.getState().addons).toEqual([]);
  });

  it('sends an empty-handed buyer to review and a laden one to the assignment step', async () => {
    mockParams.eventId = TULUA_ID;
    await signInAndComplete();
    const empty = renderWithProviders(<AddonsBrowseScreen />);

    await waitFor(() => expect(screen.getByText('Make it wholesome')).toBeTruthy());
    // Nothing chosen: there is nobody to assign an extra to, so the step is skipped.
    expect(screen.queryByText('Assigned next')).toBeNull();
    fireEvent.press(screen.getByText('Continue'));
    expect(mockRouter.push).toHaveBeenCalledWith(`/checkout/review?eventId=${TULUA_ID}`);
    empty.unmount();

    mockRouter.push.mockClear();
    await pickFirstOption(ADDON_MEALS);
    renderWithProviders(<AddonsBrowseScreen />);

    await waitFor(() => expect(screen.getByText('Make it wholesome')).toBeTruthy());
    expect(screen.getByText('1 extra chosen')).toBeTruthy();
    expect(screen.getByText('Assigned next')).toBeTruthy();
    fireEvent.press(screen.getByText('Continue'));
    expect(mockRouter.push).toHaveBeenCalledWith(`/checkout/assign?eventId=${TULUA_ID}`);
  });

  it('counts more than one chosen extra in the plural', async () => {
    mockParams.eventId = TULUA_ID;
    await signInAndComplete();
    await pickFirstOption(ADDON_MEALS);
    await pickFirstOption(ADDON_TRANSPORT);

    renderWithProviders(<AddonsBrowseScreen />);

    await waitFor(() => expect(screen.getByText('Make it wholesome')).toBeTruthy());
    expect(screen.getByText('2 extras chosen')).toBeTruthy();
  });
});

describe('15 Add-on states, nothing on offer', () => {
  it('tells a buyer their ticket is all they need', async () => {
    mockParams.eventId = SOUND_BATH_ID;
    await signInAndComplete();
    renderWithProviders(<AddonsBrowseScreen />);

    await waitFor(() => expect(screen.getByText('No extras yet')).toBeTruthy());
    expect(
      screen.getByText('This event has no add-ons. Your ticket is all you need.'),
    ).toBeTruthy();
    // Nothing to skip past when there is nothing on offer.
    expect(screen.queryByText('Skip')).toBeNull();

    fireEvent.press(screen.getByText('Continue'));
    expect(mockRouter.push).toHaveBeenCalledWith(`/checkout/review?eventId=${SOUND_BATH_ID}`);
  });
});

describe('Add-ons browse, arriving without an event', () => {
  /**
   * `useAddons` is disabled without an event id, and a disabled TanStack Query v5 query reports
   * `isPending` forever. Checking that flag before checking the id is what leaves the screen on
   * a spinner with nothing fetching behind it, so both shapes of a bad param are covered.
   */
  it.each([
    ['no eventId at all', undefined],
    ['an eventId that is not an id', '../../etc/passwd'],
  ])('shows a way out rather than a spinner with %s', async (_label, eventId) => {
    if (eventId) mockParams.eventId = eventId;
    await signInAndComplete();
    renderWithProviders(<AddonsBrowseScreen />);

    expect(screen.queryByText('Loading extras...')).toBeNull();
    expect(screen.getByText('This checkout has expired')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Find an event' }));
    expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/discover');
  });
});

describe('15 Add-on states, withheld stock versus sold out', () => {
  /**
   * The two states this pair separates are the whole point of the card. They come back as
   * different answers and they have to read as different answers: a withheld count is the event
   * declining to say, and turning that silence into "0 left" or "none left" invents a shortage
   * the event never declared.
   */
  it('renders a withheld count as silence, never as a zero', async () => {
    const summary = await summaryFor('Desert Lodge Room');
    // The shape the server sends when the count is not the buyer's business yet.
    expect(summary.availableQuantity).toBeNull();
    expect(summary.availability).toBe('available');

    renderWithProviders(<AddonCard addon={summary} picked={false} onPress={jest.fn()} />);

    expect(screen.queryByText(/left/i)).toBeNull();
    expect(screen.queryByText(/sold out/i)).toBeNull();
    expect(screen.queryByText(/none/i)).toBeNull();
    // Still buyable, and still shown at its price.
    expect(screen.getByText('From 1,400.00 EGP')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /Desert Lodge Room/ }).props.accessibilityState.disabled,
    ).toBe(false);
  });

  it('renders an explicit zero as sold out, never as "0 left"', async () => {
    const summary = await summaryFor('Camp Tent, shared');
    // Sold out is always an explicit zero beside an explicit unavailable, so a buyer can see it.
    expect(summary.availableQuantity).toBe(0);
    expect(summary.availability).toBe('unavailable');

    renderWithProviders(<AddonCard addon={summary} picked={false} onPress={jest.fn()} />);

    expect(screen.getByText('Sold out')).toBeTruthy();
    expect(screen.queryByText('0 left')).toBeNull();
    expect(screen.queryByText(/none left/i)).toBeNull();
  });

  it('reads differently for a withheld count and a sold-out one', async () => {
    const base = await summaryFor('Desert Lodge Room');

    const withheld = renderWithProviders(
      <AddonCard
        addon={{ ...base, availability: 'available', availableQuantity: null }}
        picked={false}
        onPress={jest.fn()}
      />,
    );
    const withheldLabel = String(
      screen.getByRole('button', { name: /Desert Lodge Room/ }).props.accessibilityLabel,
    );
    withheld.unmount();

    renderWithProviders(
      <AddonCard
        addon={{ ...base, availability: 'unavailable', availableQuantity: 0 }}
        picked={false}
        onPress={jest.fn()}
      />,
    );
    const soldOutLabel = String(
      screen.getByRole('button', { name: /Desert Lodge Room/ }).props.accessibilityLabel,
    );

    expect(withheldLabel).not.toEqual(soldOutLabel);
    expect(soldOutLabel).toContain('Sold out');
    expect(withheldLabel).not.toContain('Sold out');
    // The price still has zeroes in it; what must not appear is a count of any kind.
    expect(withheldLabel).not.toMatch(/\bleft\b/);
    expect(withheldLabel).not.toContain('0 left');
  });

  it('shows a published count beside the price window', async () => {
    const base = await summaryFor('Cairo shuttle');

    renderWithProviders(
      <AddonCard addon={{ ...base, availableQuantity: 12 }} picked={false} onPress={jest.fn()} />,
    );

    // "Regular · 12 left", the one muted meta line the design gives the card.
    expect(screen.getByText('Regular · 12 left')).toBeTruthy();
  });

  /**
   * FAILING ON PURPOSE, and not because of anything on this screen.
   *
   * Artboards 10 and 15 both draw the sold-out camp tent with its price still on it
   * ("Camp Tent, shared / 1,050.00 EGP / Sold out"). The mock's summary projection builds
   * `fromPriceEgpNow` only from options that are still purchasable
   * (src/api/mock/addons.ts, `listAddonSummaries`), so a single-option addon that has sold out
   * comes back with no price at all and the card falls through to "Not on sale right now".
   * The fix belongs in the projection, which is another lane's file, so this is left red rather
   * than papered over on the card.
   */
  it.failing('shows a sold-out extra at the price it sold at (design 10 and 15)', async () => {
    const summary = await summaryFor('Camp Tent, shared');

    renderWithProviders(<AddonCard addon={summary} picked={false} onPress={jest.fn()} />);

    expect(screen.getByText('1,050.00 EGP')).toBeTruthy();
    expect(screen.getByText('Sold out')).toBeTruthy();
    expect(screen.queryByText('Not on sale right now')).toBeNull();
  });
});
