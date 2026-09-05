import type { ReactTestInstance } from 'react-test-renderer';
import { fireEvent, renderWithProviders, screen, waitFor, within } from '../../../src/test-utils';
import { mockApi, mockConfig, MOCK_OTP_CODE, resetMockState } from '../../../src/api/mock';
import {
  ADDON_ACCOMMODATION,
  ADDON_CAMP,
  ADDON_MEALS,
  ADDON_TRANSPORT,
} from '../../../src/api/mock/addon-fixtures';
import { TULUA_ID } from '../../../src/api/mock/fixtures';
import { useAuthStore } from '../../../src/stores/auth';
import { useCheckoutStore } from '../../../src/stores/checkout';

import AddonDetailScreen from '../addon/[id]';

/**
 * Design screens 11 (add-on detail, room) and 12 (add-on detail, meals & transport).
 *
 * Nothing on this screen has ever run in a simulator, so this walk is the only thing between it
 * and a buyer. What it is really guarding:
 *
 *   - the room grid is room type × nights, and the catalogue is not a full grid: a combination
 *     that does not exist is *disabled and explained*, never hidden and never mispriced;
 *   - `quantity` on accommodation counts ROOMS, not people;
 *   - `availableQuantity: null` is the server withholding the count, so nothing may invent a
 *     ceiling of ten and nothing may render it as "none left";
 *   - every figure shown is the server's own, straight off the option (CLAUDE.md rule 7);
 *   - what lands in the checkout draft is shaped for `PUT /carts/:id/addons`, and re-picking an
 *     option edits that line rather than adding a second one.
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

/** Renders the detail route the way the browse list pushes it: `/checkout/addon/:id?eventId=`. */
async function openAddon(addonId: string, eventId: string | null = TULUA_ID) {
  mockParams.id = addonId;
  if (eventId !== null) mockParams.eventId = eventId;
  renderWithProviders(<AddonDetailScreen />);
  await waitFor(() => expect(screen.queryByLabelText('Loading this extra...')).toBeNull());
}

/**
 * The `SelectableCard` wrapping a given label. Rows carry no accessibility label of their own, so
 * they are found by the text the design puts in them and read back through the radio role.
 */
function cardFor(label: string): ReactTestInstance {
  const card = screen
    .getAllByRole('radio')
    .find((node) => within(node).queryByText(label) !== null);
  if (!card) throw new Error(`No selectable card containing "${label}"`);
  return card;
}

function isDisabled(node: ReactTestInstance): boolean {
  return Boolean(node.props.accessibilityState?.disabled);
}

function isSelected(node: ReactTestInstance): boolean {
  return Boolean(node.props.accessibilityState?.selected);
}

/** The CTA, which is a `Pressable` carrying its own disabled state. */
function cta(label: string): ReactTestInstance {
  return screen.getByRole('button', { name: label });
}

beforeEach(() => {
  resetMockState();
  mockConfig.latencyMs = 0;
  for (const key of Object.keys(mockParams)) delete mockParams[key];
  mockRouter.push.mockClear();
  mockRouter.back.mockClear();
  mockRouter.replace.mockClear();
  useAuthStore.setState({ status: 'signed-out', user: null, pendingPhone: null });
  useCheckoutStore.getState().reset();
});

afterEach(() => {
  // Addon price windows read this clock, so a test that moved it has moved pricing too.
  mockConfig.now = () => Date.now();
});

describe('add-on detail · route parameters', () => {
  /**
   * `useAddon` is disabled without both params and a disabled TanStack Query v5 query reports
   * `isPending` forever, so this used to sit on "Loading this extra..." with nothing fetching.
   */
  it('shows a way out instead of a spinner when the event id is missing', async () => {
    await signInAndComplete();
    await openAddon(ADDON_ACCOMMODATION, null);

    expect(screen.getByText("We couldn't find that extra")).toBeTruthy();
    expect(screen.queryByLabelText('Loading this extra...')).toBeNull();
  });

  it('shows a way out instead of a spinner when the add-on id is malformed', async () => {
    await signInAndComplete();
    mockParams.id = '';
    mockParams.eventId = TULUA_ID;
    renderWithProviders(<AddonDetailScreen />);

    expect(screen.getByText("We couldn't find that extra")).toBeTruthy();
    expect(screen.queryByLabelText('Loading this extra...')).toBeNull();
  });
});

describe('add-on detail · the room grid (design 11)', () => {
  it('names the type and the add-on, and prices every room the server prices', async () => {
    await signInAndComplete();
    await openAddon(ADDON_ACCOMMODATION);

    expect(screen.getByText('Accommodation')).toBeTruthy();
    expect(screen.getByText('Desert Lodge Room')).toBeTruthy();
    expect(screen.getByText('Room type')).toBeTruthy();

    // One night is the opening selection, so these are the one-night prices, as the server sends
    // them. Nothing on this screen multiplies them by anything (CLAUDE.md rule 7).
    expect(within(cardFor('Single')).getByText('1,400.00 EGP')).toBeTruthy();
    expect(within(cardFor('Double')).getByText('1,600.00 EGP')).toBeTruthy();
    expect(within(cardFor('Single')).getByText('1 occupant')).toBeTruthy();
    expect(within(cardFor('Double')).getByText('2 occupants')).toBeTruthy();
  });

  /**
   * The catalogue is one option per combination and is not guaranteed to be a full grid: the
   * fixture has no Triple for one night and no Single for two. The missing cell has to stay on
   * screen, disabled and explained, or the buyer is left wondering where a room type went.
   */
  it('disables a room type that is not offered for the selected nights, rather than hiding it', async () => {
    await signInAndComplete();
    await openAddon(ADDON_ACCOMMODATION);

    expect(cardFor('Triple')).toBeTruthy();
    expect(isDisabled(cardFor('Triple'))).toBe(true);
    expect(within(cardFor('Triple')).getByText('Not offered for these nights')).toBeTruthy();
    expect(within(cardFor('Triple')).queryByText('Sold out')).toBeNull();
  });

  it('will not let the disabled combination be selected', async () => {
    await signInAndComplete();
    await openAddon(ADDON_ACCOMMODATION);

    fireEvent.press(cardFor('Triple'));

    expect(isSelected(cardFor('Triple'))).toBe(false);
    expect(isSelected(cardFor('Single'))).toBe(true);
  });

  it('moves the hole when the nights change, and refuses to add what does not exist', async () => {
    await signInAndComplete();
    await openAddon(ADDON_ACCOMMODATION);

    fireEvent.press(cardFor('2 nights'));

    // Single is the selected row and now has no option behind it, so there is nothing to add.
    expect(isDisabled(cardFor('Single'))).toBe(true);
    expect(within(cardFor('Single')).getByText('Not offered for these nights')).toBeTruthy();
    expect(isDisabled(cardFor('Triple'))).toBe(false);
    expect(cta('Not offered for these nights').props.accessibilityState.disabled).toBe(true);
  });

  it('picks room type and nights independently, and takes the price from the combination', async () => {
    await signInAndComplete();
    await openAddon(ADDON_ACCOMMODATION);

    fireEvent.press(cardFor('Double'));
    expect(within(cardFor('Double')).getByText('1,600.00 EGP')).toBeTruthy();

    fireEvent.press(cardFor('2 nights'));
    expect(within(cardFor('Double')).getByText('2,200.00 EGP')).toBeTruthy();
    expect(isSelected(cardFor('Double'))).toBe(true);
    expect(isSelected(cardFor('2 nights'))).toBe(true);
  });

  it('writes the stay in words, never as a raw ISO date', async () => {
    await signInAndComplete();
    await openAddon(ADDON_ACCOMMODATION);

    expect(screen.getByText('23 Oct 2026 → 24 Oct 2026')).toBeTruthy();
    expect(screen.getByText('23 Oct 2026 → 25 Oct 2026')).toBeTruthy();
    expect(screen.getByText('Check-in 23 Oct 2026, 2PM')).toBeTruthy();
    expect(screen.getByText('Check-out 24 Oct 2026, 11AM')).toBeTruthy();
    expect(screen.queryByText(/2026-10-23/)).toBeNull();

    fireEvent.press(cardFor('Double'));
    fireEvent.press(cardFor('2 nights'));
    expect(screen.getByText('Check-out 25 Oct 2026, 11AM')).toBeTruthy();
  });

  it('shows the sold-out room as sold out and refuses to add it', async () => {
    await signInAndComplete();
    await openAddon(ADDON_CAMP);

    expect(within(cardFor('Shared tent')).getByText('Sold out')).toBeTruthy();
    expect(isDisabled(cardFor('Shared tent'))).toBe(true);
    expect(cta('Sold out').props.accessibilityState.disabled).toBe(true);
  });
});

describe('add-on detail · what the remaining count means', () => {
  /** A published count. Double, two nights, is down to 3 of 20, which is inside Tulua's 20%. */
  it('repeats the published count in the buyers unit, rooms', async () => {
    await signInAndComplete();
    await openAddon(ADDON_ACCOMMODATION);

    fireEvent.press(cardFor('Double'));
    fireEvent.press(cardFor('2 nights'));

    expect(screen.getByText('3 rooms left')).toBeTruthy();
  });

  /**
   * Null is the server declining to publish the number, never "none left". The old screen also
   * turned it into a stepper ceiling of ten, which is a client-invented limit dressed as a
   * server one.
   */
  it('says nothing and caps nothing when the count is withheld', async () => {
    await signInAndComplete();
    await openAddon(ADDON_ACCOMMODATION);

    // Single, one night: 8 of 12 left, above the publish threshold, so no number is public.
    expect(screen.queryByText(/left$/)).toBeNull();

    const plus = () => screen.getByLabelText('Add one ticket');
    for (let i = 0; i < 11; i++) fireEvent.press(plus());

    expect(screen.getByText('12')).toBeTruthy();
    expect(plus().props.accessibilityState.disabled).toBe(false);
  });

  it('stops the stepper at the published count', async () => {
    await signInAndComplete();
    await openAddon(ADDON_ACCOMMODATION);

    fireEvent.press(cardFor('Double'));
    fireEvent.press(cardFor('2 nights'));

    const plus = () => screen.getByLabelText('Add one ticket');
    for (let i = 0; i < 5; i++) fireEvent.press(plus());

    expect(screen.getByText('3')).toBeTruthy();
    expect(plus().props.accessibilityState.disabled).toBe(true);
  });

  it('does not carry a quantity past the count when the option changes under it', async () => {
    await signInAndComplete();
    await openAddon(ADDON_ACCOMMODATION);

    // Five rooms is fine while the count is withheld...
    for (let i = 0; i < 4; i++) fireEvent.press(screen.getByLabelText('Add one ticket'));
    expect(screen.getByText('5')).toBeTruthy();

    // ...but the combination with only 3 left may not inherit it.
    fireEvent.press(cardFor('Double'));
    fireEvent.press(cardFor('2 nights'));
    expect(screen.getByText('3')).toBeTruthy();

    fireEvent.press(cta('Add to cart'));
    expect(useCheckoutStore.getState().addons[0]?.quantity).toBe(3);
  });
});

describe('add-on detail · quantity means rooms, not people', () => {
  it('counts rooms on accommodation and says so', async () => {
    await signInAndComplete();
    await openAddon(ADDON_ACCOMMODATION);

    expect(screen.getByText('Rooms')).toBeTruthy();
    expect(screen.getByText('Rooms, not people.')).toBeTruthy();
    expect(
      screen.getByText('Add-ons are non-refundable. Occupants are assigned in the next step.'),
    ).toBeTruthy();
  });

  /**
   * Two rooms of a two-occupant type is four beds, and the draft has to say two: `quantity` is
   * rooms, and the occupants are named on the assignment step (`rooms.length === quantity`,
   * `occupants.length === occupancy`).
   */
  it('sends the room count, not the head count, to the draft', async () => {
    await signInAndComplete();
    await openAddon(ADDON_ACCOMMODATION);

    fireEvent.press(cardFor('Double'));
    fireEvent.press(screen.getByLabelText('Add one ticket'));
    fireEvent.press(cta('Add to cart'));

    const [line] = useCheckoutStore.getState().addons;
    expect(line?.quantity).toBe(2);
    expect(line?.optionId).toBe('opt-lodge-double-1');
  });

  it('counts units, not rooms, on everything else', async () => {
    await signInAndComplete();
    await openAddon(ADDON_MEALS);

    expect(screen.getByText('How many')).toBeTruthy();
    expect(screen.queryByText('Rooms, not people.')).toBeNull();
  });
});

describe('add-on detail · adding to the cart', () => {
  it('writes an accommodation line shaped for PUT /carts/:id/addons', async () => {
    await signInAndComplete();
    await openAddon(ADDON_ACCOMMODATION);

    fireEvent.press(cardFor('Double'));
    fireEvent.press(cardFor('2 nights'));
    fireEvent.press(cta('Add to cart'));

    expect(useCheckoutStore.getState().addons).toEqual([
      {
        addonId: ADDON_ACCOMMODATION,
        addonName: 'Desert Lodge Room',
        type: 'accommodation',
        optionId: 'opt-lodge-double-2',
        optionLabel: 'Double · 2 nights',
        unitPriceEgp: '2200.00',
        quantity: 1,
        // Occupants are named on the assignment step; the room slots start empty.
        rooms: [],
      },
    ]);
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('writes a transport line with assignments rather than rooms', async () => {
    await signInAndComplete();
    await openAddon(ADDON_TRANSPORT);

    fireEvent.press(cardFor('Round trip'));
    fireEvent.press(cta('Add to cart'));

    const [line] = useCheckoutStore.getState().addons;
    expect(line).toEqual({
      addonId: ADDON_TRANSPORT,
      addonName: 'Cairo shuttle',
      type: 'transport',
      optionId: 'opt-shuttle-round-trip',
      optionLabel: 'Round trip',
      unitPriceEgp: '600.00',
      quantity: 1,
      assignments: [],
    });
    expect(line && 'rooms' in line).toBe(false);
  });

  /** The store keys lines by option, so a changed option has to replace the line it supersedes. */
  it('edits the existing line when the option is re-picked, rather than doubling it', async () => {
    await signInAndComplete();
    await openAddon(ADDON_ACCOMMODATION);

    fireEvent.press(cardFor('Double'));
    fireEvent.press(cardFor('2 nights'));
    fireEvent.press(cta('Add to cart'));
    expect(useCheckoutStore.getState().addons).toHaveLength(1);

    screen.unmount();
    await openAddon(ADDON_ACCOMMODATION);

    // Re-opened, it shows the buyer's own choice rather than resetting to the first room.
    expect(isSelected(cardFor('Double'))).toBe(true);
    expect(isSelected(cardFor('2 nights'))).toBe(true);

    fireEvent.press(cardFor('1 night'));
    fireEvent.press(cta('Update'));

    const lines = useCheckoutStore.getState().addons;
    expect(lines).toHaveLength(1);
    expect(lines[0]?.optionId).toBe('opt-lodge-double-1');
  });

  it('takes the line out again on Remove from cart', async () => {
    await signInAndComplete();
    await openAddon(ADDON_MEALS);

    fireEvent.press(cta('Add to cart'));
    expect(useCheckoutStore.getState().addons).toHaveLength(1);

    screen.unmount();
    await openAddon(ADDON_MEALS);
    fireEvent.press(cta('Remove from cart'));

    expect(useCheckoutStore.getState().addons).toEqual([]);
  });
});

describe('add-on detail · meals and transport (design 12)', () => {
  it('offers one way and round trip at the server prices, one way first', async () => {
    await signInAndComplete();
    await openAddon(ADDON_TRANSPORT);

    expect(screen.getByText('Transport')).toBeTruthy();
    expect(screen.getByText('Cairo shuttle')).toBeTruthy();
    expect(screen.getByText('Trip')).toBeTruthy();

    expect(within(cardFor('One way')).getByText('350.00 EGP')).toBeTruthy();
    expect(within(cardFor('Round trip')).getByText('600.00 EGP')).toBeTruthy();
    expect(isSelected(cardFor('One way'))).toBe(true);
    expect(isSelected(cardFor('Round trip'))).toBe(false);
  });

  it('writes each direction its own travel line', async () => {
    await signInAndComplete();
    await openAddon(ADDON_TRANSPORT);

    expect(within(cardFor('One way')).getByText('Out 23 Oct 2026, 08:00')).toBeTruthy();
    expect(
      within(cardFor('Round trip')).getByText('Out 23 Oct 2026, 08:00 · back 25 Oct 2026, 16:00'),
    ).toBeTruthy();
  });

  it('switches the selection to round trip when it is picked', async () => {
    await signInAndComplete();
    await openAddon(ADDON_TRANSPORT);

    fireEvent.press(cardFor('Round trip'));

    expect(isSelected(cardFor('Round trip'))).toBe(true);
    expect(isSelected(cardFor('One way'))).toBe(false);
  });

  /** Design 12: "assigned to a person after you add them". Nobody is chosen on this screen. */
  it('says the recipient is chosen later, and offers no way to choose one here', async () => {
    await signInAndComplete();
    await openAddon(ADDON_MEALS);

    expect(
      screen.getByText(
        'Add-ons are non-refundable. They are assigned to a person after you add them.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/Yasmin El Sayed/)).toBeNull();
    expect(screen.queryByText(/Assign/)).toBeNull();
  });

  it('lets several vouchers be bought at once', async () => {
    await signInAndComplete();
    await openAddon(ADDON_MEALS);

    fireEvent.press(screen.getByLabelText('Add one ticket'));
    fireEvent.press(screen.getByLabelText('Add one ticket'));
    fireEvent.press(cta('Add to cart'));

    const [line] = useCheckoutStore.getState().addons;
    expect(line?.quantity).toBe(3);
    expect(line?.assignments).toEqual([]);
  });
});

describe('add-on detail · the price window sentence', () => {
  /**
   * The mock clock drives the price windows, so moving it moves pricing with it. Before the
   * changeover the dinner voucher is on early-bird, with the regular price already announced.
   */
  it('names the window it is in and the one that replaces it', async () => {
    mockConfig.now = () => Date.parse('2026-08-15T09:00:00.000Z');
    await signInAndComplete();
    await openAddon(ADDON_MEALS);

    expect(
      screen.getByText('Early bird pricing until 1 Sep 2026, then Regular at 340.00 EGP.'),
    ).toBeTruthy();
    expect(screen.getByText('280.00 EGP')).toBeTruthy();
  });

  it('stops at the current window once there is nothing coming after it', async () => {
    mockConfig.now = () => Date.parse('2026-09-15T09:00:00.000Z');
    await signInAndComplete();
    await openAddon(ADDON_MEALS);

    expect(screen.getByText('Regular pricing.')).toBeTruthy();
    expect(screen.getByText('340.00 EGP')).toBeTruthy();
  });

  it('says so in words, never with a dash, when the server prices nothing', async () => {
    // Past every window the fixture defines: no current price, so nothing may be shown as one.
    mockConfig.now = () => Date.parse('2100-01-01T00:00:00.000Z');
    await signInAndComplete();
    await openAddon(ADDON_MEALS);

    expect(within(cardFor('Dinner voucher')).getByText('Not on sale')).toBeTruthy();
    expect(screen.queryByText('—')).toBeNull();
    // The card badges this option "Sold out", so the CTA says the same thing rather than
    // offering the buyer two different explanations for one blocked button.
    expect(cta('Sold out').props.accessibilityState.disabled).toBe(true);
  });
});
