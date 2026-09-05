import { AppState } from 'react-native';
import { mockApi, mockConfig, MOCK_OTP_CODE, resetMockState } from '../../src/api/mock';
import { SOUND_BATH_ID, TIER_SOUND_GA, TIER_WEEKEND, TULUA_ID } from '../../src/api/mock/fixtures';
import { useAuthStore } from '../../src/stores/auth';
import { useCheckoutStore } from '../../src/stores/checkout';
import { act, fireEvent, renderWithProviders, screen, waitFor } from '../../src/test-utils';

import WelcomeScreen from '../(onboarding)/welcome';
import OtpScreen from '../(onboarding)/otp';
import ProfileFormScreen from '../(onboarding)/profile';
import SelfieScreen from '../(onboarding)/selfie';
import DiscoverScreen from '../(tabs)/discover';
import TicketsScreen from '../(tabs)/tickets';
import ProfileTabScreen from '../(tabs)/profile';
import EventDetailScreen from '../event/[slug]';
import ChoosePassScreen from '../checkout/pass';
import GuestsScreen from '../checkout/guests';
import ReviewScreen from '../checkout/review';
import PaymentScreen from '../checkout/payment';
import ConfirmationScreen from '../checkout/confirmation';
import EntryPassScreen from '../ticket/[id]';
import DeleteAccountScreen from '../account/delete';
import TermsScreen from '../legal/terms';
import GalleryScreen from '../gallery';

/**
 * A render pass over every screen in the design, against the mock api, asserting the copy
 * the design specifies actually reaches the tree. This is the automated stand-in for the
 * simulator click-through: no iOS runtime is installed on this machine (Xcode ships without
 * one until a multi-GB runtime is downloaded), so the walk is done here instead.
 */

const mockPaymob = jest.requireMock('paymob-reactnative').default as Record<string, jest.Mock>;

const mockContacts = jest.requireMock('expo-contacts') as {
  requestPermissionsAsync: jest.Mock;
  getPermissionsAsync: jest.Mock;
  Contact: { getAllDetails: jest.Mock };
};

/** The OS contact picker. Its own module path, so its own mock. */
const mockPicker = (
  jest.requireMock('expo-contacts/legacy') as { presentContactPickerAsync: jest.Mock }
).presentContactPickerAsync;

/** Both entry points answer the same way, since the app asks once and re-checks silently. */
function contactsPermission(response: {
  status: string;
  canAskAgain?: boolean;
  accessPrivileges?: string;
}) {
  mockContacts.requestPermissionsAsync.mockResolvedValue(response);
  mockContacts.getPermissionsAsync.mockResolvedValue(response);
}

/** Stands in for the app being brought back from Settings. */
async function returnToForeground() {
  const calls = (AppState.addEventListener as jest.Mock).mock.calls;
  const listener = calls[calls.length - 1]?.[1] as ((state: string) => void) | undefined;
  await act(async () => {
    listener?.('active');
  });
}

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

/** A signed-in user with nothing filled in yet, so the form renders its empty state. */
function emptyForeignUser() {
  return {
    id: 'user-foreign',
    phoneNumber: '+971501234567',
    fullName: null,
    email: null,
    emailVerified: false,
    dateOfBirth: null,
    gender: null,
    area: null,
    selfieUploaded: false,
    selfieUrl: null,
    selfieExpiresAt: null,
    marketingOptIn: false,
    profileComplete: false,
    status: 'pending_profile' as const,
  };
}

async function signInAndComplete() {
  await mockApi.auth.requestOtp('+201012345678');
  const { user } = await mockApi.auth.verifyOtp('+201012345678', MOCK_OTP_CODE);
  await mockApi.profile.update({
    fullName: 'Yasmin El Sayed',
    email: 'yasmin@email.com',
    dateOfBirth: '1994-03-12',
    gender: 'female',
    areaId: 'ar-maadi',
  });
  const complete = await mockApi.profile.uploadSelfie('file:///selfie.jpg');
  useAuthStore.setState({ status: 'signed-in', user: complete, pendingPhone: null });
  return { user, complete };
}

beforeEach(() => {
  contactsPermission({ status: 'granted' });
  mockPicker.mockResolvedValue(null);
  resetMockState();
  mockConfig.latencyMs = 0;
  for (const key of Object.keys(mockParams)) delete mockParams[key];
  mockRouter.push.mockClear();
  mockRouter.replace.mockClear();
  useAuthStore.setState({ status: 'signed-out', user: null, pendingPhone: null });
  useCheckoutStore.getState().reset();
});

interface CartCheckoutInput {
  eventId: string;
  buyerTierId: string | null;
  items: { tierId: string; quantity: number }[];
  guests: { phoneNumber: string; name: string; tierId: string }[];
}

/**
 * Gets a checkout as far as the guests screen leaves it: a draft cart holding every recipient,
 * with the checkout store pointing at it.
 *
 * The review screen reads its figures off that cart and shows "this checkout has expired"
 * without one, so a test that renders review has to arrive carrying a cart id exactly as the
 * real flow does.
 */
async function startCartCheckout(input: CartCheckoutInput) {
  const cart = await mockApi.carts.create(input.eventId);
  await mockApi.carts.replaceTickets(cart.id, {
    buyerTierId: input.buyerTierId,
    items: input.items,
    guests: input.guests,
  });
  useCheckoutStore.getState().setCartId(cart.id);
  return cart;
}

/**
 * Places an order through the cart, the way the app does: cart, tickets, preview, place. Tests
 * that only care about what happens *after* an order exists use this rather than restating the
 * whole checkout.
 */
async function placeOrderViaCart(input: CartCheckoutInput) {
  const cart = await startCartCheckout(input);
  const preview = await mockApi.carts.preview(cart.id);
  return mockApi.carts.placeOrder(cart.id, preview.pricing.pricingConfirmationToken!);
}

describe('01 Welcome', () => {
  it('shows the wordmark lockup, tagline and CTA', () => {
    renderWithProviders(<WelcomeScreen />);
    expect(screen.getByText('Everything wellness.')).toBeTruthy();
    expect(screen.getByText("Let's move!")).toBeTruthy();
    expect(screen.getByText('By continuing you agree to our terms & privacy policy')).toBeTruthy();
    // One way in. Signing in restores a deleted account, so there is nothing to offer here
    // that would make someone declare they had deleted theirs.
    expect(screen.queryByText('Restore account')).toBeNull();
  });
});

describe('03 Verify code', () => {
  it('shows the number the code went to, and the resend affordance', () => {
    useAuthStore.setState({ pendingPhone: '+201012345678' });
    renderWithProviders(<OtpScreen />);

    expect(screen.getByText('Step 1 of 3')).toBeTruthy();
    expect(screen.getByText('Check WhatsApp')).toBeTruthy();
    expect(screen.getByText('+20 10 12345678')).toBeTruthy();
    expect(screen.getByText('Verify')).toBeTruthy();
    expect(screen.getByText(/Resend in/)).toBeTruthy();
  });
});

describe('04 About you', () => {
  it('renders all five profile fields', async () => {
    useAuthStore.setState({ status: 'signed-in', user: null });
    renderWithProviders(<ProfileFormScreen />);

    await waitFor(() => expect(screen.getByText('Step 2 of 3')).toBeTruthy());
    expect(screen.getByText('A little about you')).toBeTruthy();
    for (const label of ['Full name', 'Email', 'Date of birth', 'Gender', 'Living area']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    // Date of birth, gender and living area are all pickers now — nothing is typed into them,
    // so each shows its placeholder as text rather than as a TextInput placeholder.
    expect(screen.getAllByText('Select').length).toBe(3);
    // Meta requires marketing consent to be an explicit opt-in, so the box starts unticked.
    const consent = screen.getByRole('checkbox', {
      name: /WhatsApp me your latest updates/,
    });
    expect(consent.props.accessibilityState.checked).toBe(false);
  });

  it('drops the living area for a number outside Egypt', async () => {
    // `areas` are Egyptian governorates, so there is no answer to give from abroad — the
    // field is not shown, and nothing waits on the area list to load.
    useAuthStore.setState({
      status: 'signed-in',
      user: { ...emptyForeignUser(), phoneNumber: '+971501234567' },
    });
    renderWithProviders(<ProfileFormScreen />);

    await waitFor(() => expect(screen.getByText('Step 2 of 3')).toBeTruthy());
    for (const label of ['Full name', 'Email', 'Date of birth', 'Gender']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.queryByText('Living area')).toBeNull();
    expect(screen.getAllByText('Select').length).toBe(2);
  });
});

describe('05 Selfie', () => {
  it('explains why the selfie exists', () => {
    renderWithProviders(<SelfieScreen />);
    expect(screen.getByText('Step 3 of 3')).toBeTruthy();
    expect(screen.getByText('One last thing, a selfie')).toBeTruthy();
    expect(screen.getByText('Tap to take a selfie')).toBeTruthy();
    expect(screen.getByText(/Gate staff compare this to your face at entry/)).toBeTruthy();
  });
});

describe('06 Discover', () => {
  it('lists the featured event and the filters', async () => {
    await signInAndComplete();
    renderWithProviders(<DiscoverScreen />);

    expect(screen.getByText('Discover')).toBeTruthy();
    expect(screen.getByText('Find your next Sukun gathering')).toBeTruthy();
    expect(screen.getByPlaceholderText('Search events')).toBeTruthy();

    await waitFor(() => expect(screen.getByText('Tulua')).toBeTruthy());

    // The chips are built from the tags the loaded events carry, so they arrive with the
    // events rather than being present on the first frame. Labels are title-cased for display;
    // the value sent when filtering is the stored lowercase tag.
    expect(screen.getByText('All')).toBeTruthy();
    expect(screen.getByText('Festivals')).toBeTruthy();
    expect(screen.getByText('On sale now')).toBeTruthy();
    expect(screen.getByText('23–24 Oct 2026 · Tunis Village, Fayoum')).toBeTruthy();
    expect(screen.getByText('More gatherings')).toBeTruthy();
    expect(screen.getByText('Sound Bath Under the Stars')).toBeTruthy();
  });
});

describe('07 Event detail', () => {
  it('shows the hero, description, venue and the from-price bar', async () => {
    mockParams.slug = 'tulua';
    await signInAndComplete();
    renderWithProviders(<EventDetailScreen />);

    await waitFor(() => expect(screen.getByText('Tulua')).toBeTruthy());
    expect(screen.getByText('23–24 October 2026 · Fayoum')).toBeTruthy();
    expect(screen.getByText(/flagship festival returns to the desert/)).toBeTruthy();
    expect(screen.getByText('Venue')).toBeTruthy();
    expect(screen.getByText('Tunis Village')).toBeTruthy();
    expect(screen.getByText('From')).toBeTruthy();
    expect(screen.getByText('950.00 EGP')).toBeTruthy();
    expect(screen.getByText('Get tickets')).toBeTruthy();
  });
});

describe('08 Choose your pass', () => {
  /**
   * The design's artboard shows a running subtotal here; the screen cannot show one and must
   * not. A cart is priced by the server and cannot be priced at all until it has recipients,
   * which are picked on the next screen, so the only honest figure on this screen is what one
   * ticket costs. Multiplying it by the quantity is the client-side arithmetic rule 7 forbids,
   * so this test asserts the per-ticket price is there and the invented total is not.
   */
  it('lists tiers with their per-ticket price, and no locally multiplied subtotal', async () => {
    mockParams.eventId = TULUA_ID;
    await signInAndComplete();
    useCheckoutStore.getState().start(TULUA_ID, TIER_WEEKEND);
    useCheckoutStore.getState().setQuantity(2);

    renderWithProviders(<ChoosePassScreen />);

    await waitFor(() => expect(screen.getByText('Choose your pass')).toBeTruthy());
    // Tulua sells extras, so its checkout is four steps (P0.1 decision #10). The label starts at
    // the shorter flow and grows once the catalogue lands, so it is waited for.
    await waitFor(() => expect(screen.getByText('Checkout · step 1 of 4')).toBeTruthy());
    expect(screen.getByText('Full Weekend Pass')).toBeTruthy();
    expect(screen.getByText('Day 1 Pass')).toBeTruthy();
    expect(screen.getByText('Day 1 & 2')).toBeTruthy();
    expect(screen.getByText('Quantity')).toBeTruthy();
    // Once on the tier row, once against the stepper as what each ticket costs.
    expect(screen.getAllByText('1,600.00 EGP').length).toBe(2);
    expect(screen.getByText('Each')).toBeTruthy();
    // 1,600 × 2 is the server's sum to make, and it has nothing to price yet.
    expect(screen.queryByText('3,200.00 EGP')).toBeNull();
    expect(screen.queryByText('Subtotal')).toBeNull();
  });
});

describe('09 Guests', () => {
  it('offers contacts and a manual number, sized to the guest slots', async () => {
    mockParams.eventId = TULUA_ID;
    await signInAndComplete();
    useCheckoutStore.getState().start(TULUA_ID, TIER_WEEKEND);
    useCheckoutStore.getState().setQuantity(2);

    renderWithProviders(<GuestsScreen />);

    expect(screen.getByText('Bringing anyone?')).toBeTruthy();
    expect(
      screen.getByText('1 of your 2 tickets is for a guest.'),
    ).toBeTruthy();
    expect(screen.getByText('0 of 1 picked')).toBeTruthy();
    expect(screen.getByPlaceholderText('Add by phone number')).toBeTruthy();

    // Opening checkout must not touch the address book; the button is the only way in.
    expect(screen.queryByText('Nour Hassan')).toBeNull();

    fireEvent.press(screen.getByText('Add from Contacts'));

    await waitFor(() => expect(screen.getByText('Nour Hassan')).toBeTruthy());
    expect(screen.getByText('010 22334455')).toBeTruthy();
  });

  /**
   * A search that finds nobody and a list with nobody left in it are different situations,
   * and only one of them is the buyer's fault. Saying the wrong one reads as a broken screen.
   */
  it('says the search found nobody, not that everyone is already attached', async () => {
    mockParams.eventId = TULUA_ID;
    await signInAndComplete();
    useCheckoutStore.getState().start(TULUA_ID, TIER_WEEKEND);
    useCheckoutStore.getState().setQuantity(2);

    renderWithProviders(<GuestsScreen />);
    fireEvent.press(screen.getByText('Add from Contacts'));
    await waitFor(() => expect(screen.getByText('Nour Hassan')).toBeTruthy());

    fireEvent.changeText(screen.getByLabelText('Search contacts'), 'nobody by that name');

    await waitFor(() => expect(screen.getByText('No match.')).toBeTruthy());
    expect(screen.queryByText('Nour Hassan')).toBeNull();
    expect(screen.queryByText('Everyone here is already attached.')).toBeNull();
  });

  /**
   * Limited access is the one state the in-app list cannot mend from inside itself: it holds
   * only the handful of people already shared. The OS picker is the way to everybody else,
   * and whoever it hands back has to land in the draft, because they never join that list.
   */
  it('attaches whoever the OS picker hands over, under limited access', async () => {
    mockParams.eventId = TULUA_ID;
    contactsPermission({ status: 'granted', accessPrivileges: 'limited' });
    // The OS picker hands back the name in parts and never formats it, so the screen has to
    // put it together itself. Passing a ready-made `name` here would test nothing.
    mockPicker.mockResolvedValue({
      firstName: 'Omar',
      lastName: 'Fathy',
      phoneNumbers: [{ number: '01555000111' }],
    });
    await signInAndComplete();
    useCheckoutStore.getState().start(TULUA_ID, TIER_WEEKEND);
    useCheckoutStore.getState().setQuantity(2);

    renderWithProviders(<GuestsScreen />);
    fireEvent.press(screen.getByText('Add from Contacts'));
    await waitFor(() => expect(screen.getByText('Choose from all contacts')).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByText('Choose from all contacts'));
    });

    expect(screen.getByText('Omar Fathy')).toBeTruthy();
    expect(useCheckoutStore.getState().guests).toEqual([
      expect.objectContaining({ phoneNumber: '+201555000111', name: 'Omar Fathy' }),
    ]);
  });

  /** A ticket binds to one number, so a contact saved with several is asked about, not guessed. */
  it('asks which number when the picked contact has more than one', async () => {
    mockParams.eventId = TULUA_ID;
    contactsPermission({ status: 'granted', accessPrivileges: 'limited' });
    mockPicker.mockResolvedValue({
      firstName: 'Omar',
      lastName: 'Fathy',
      phoneNumbers: [{ number: '01555000111' }, { number: '01555000222' }],
    });
    await signInAndComplete();
    useCheckoutStore.getState().start(TULUA_ID, TIER_WEEKEND);
    useCheckoutStore.getState().setQuantity(2);

    renderWithProviders(<GuestsScreen />);
    fireEvent.press(screen.getByText('Add from Contacts'));
    await waitFor(() => expect(screen.getByText('Choose from all contacts')).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByText('Choose from all contacts'));
    });

    // Nobody is attached on the strength of a guess.
    expect(useCheckoutStore.getState().guests).toEqual([]);

    fireEvent.press(screen.getByText('015 55000222'));

    expect(useCheckoutStore.getState().guests).toEqual([
      expect.objectContaining({ phoneNumber: '+201555000222', name: 'Omar Fathy' }),
    ]);
  });

  /**
   * Guests come from anywhere. A number entered under its own country is accepted, and the
   * row keeps its calling code so a foreign number cannot read as a local one.
   */
  it('takes a guest number from another country', async () => {
    mockParams.eventId = TULUA_ID;
    await signInAndComplete();
    useCheckoutStore.getState().start(TULUA_ID, TIER_WEEKEND);

    renderWithProviders(<GuestsScreen />);
    await waitFor(() => expect(screen.getByText('0 of 1 picked')).toBeTruthy());

    fireEvent.press(screen.getByLabelText('Country: +20. Change'));
    fireEvent.changeText(screen.getByLabelText('Search country'), 'united states');
    fireEvent.press(screen.getByLabelText('United States +1'));

    fireEvent.changeText(screen.getByLabelText('Guest phone number'), '2133734253');
    fireEvent.press(screen.getByText('Add'));

    expect(screen.getAllByText('+1 213 373 4253').length).toBeGreaterThan(0);
    expect(screen.getByText('1 of 1 picked')).toBeTruthy();
    expect(screen.queryByText('That does not look like a mobile number.')).toBeNull();
  });

  /**
   * The buyer holds no ticket for this event, so their single ticket is their own and there
   * is no guest slot: the screen offers tickets for friends rather than a dead end.
   */
  it('lets a single-ticket buyer bring friends, or continue alone', async () => {
    mockParams.eventId = SOUND_BATH_ID;
    await signInAndComplete();
    useCheckoutStore.getState().start(SOUND_BATH_ID, TIER_SOUND_GA);

    renderWithProviders(<GuestsScreen />);

    expect(screen.getByText('Go with friends')).toBeTruthy();
    expect(screen.getByText('1 ticket')).toBeTruthy();
    expect(screen.queryByPlaceholderText('Add by phone number')).toBeNull();
    expect(screen.getByText('Continue')).toBeTruthy();

    // The ceiling comes from the event, so the stepper stays put until that lands.
    const plus = () => screen.getByLabelText('Add one ticket');
    await waitFor(() => expect(plus().props.accessibilityState?.disabled).toBe(false));
    fireEvent.press(plus());

    expect(screen.getByText('2 tickets')).toBeTruthy();
    expect(screen.getByText('0 of 1 picked')).toBeTruthy();
    expect(screen.getByPlaceholderText('Add by phone number')).toBeTruthy();

    // And back down: taking the ticket off returns the screen to the single-ticket state.
    fireEvent.press(screen.getByLabelText('Remove one ticket'));

    expect(screen.getByText('1 ticket')).toBeTruthy();
    expect(screen.queryByText('0 of 1 picked')).toBeNull();
  });

  /**
   * One usable ticket per phone per event, so a buyer who already holds one cannot buy a
   * second for themselves. Every ticket in the order is a guest's, including a lone one, and
   * the order api refuses an allocation that does not add up. The screen has to say so here,
   * while there is still somebody to pick.
   */
  it('makes a buyer who already holds a ticket name the guest, even for one ticket', async () => {
    mockParams.eventId = TULUA_ID;
    await signInAndComplete();
    useCheckoutStore.getState().start(TULUA_ID, TIER_WEEKEND);

    renderWithProviders(<GuestsScreen />);

    // The seeded user already holds a Tulua ticket, so their single ticket is a guest slot.
    await waitFor(() => expect(screen.getByText('0 of 1 picked')).toBeTruthy());
    // Tulua sells extras, so this is step 2 of 4 and the extras step comes next.
    await waitFor(() => expect(screen.getByText('Checkout · step 2 of 4')).toBeTruthy());
    expect(
      screen.getByText(
        'You already have a ticket, so this one is for a guest.',
      ),
    ).toBeTruthy();
    // Nothing here is theirs to keep, so there are no tickets to add for friends either.
    expect(screen.queryByText('Go with friends')).toBeNull();

    fireEvent.press(screen.getByText('Continue'));

    await waitFor(() =>
      expect(
        screen.getByText(
          'You already have a ticket for this event, so this one is for a guest. Pick who it is for.',
        ),
      ).toBeTruthy(),
    );
    expect(mockRouter.push).not.toHaveBeenCalled();

    fireEvent.press(screen.getByText('Add from Contacts'));
    await waitFor(() => expect(screen.getByText('Nour Hassan')).toBeTruthy());
    fireEvent.press(screen.getByText('Nour Hassan'));

    await waitFor(() => expect(screen.getByText('1 of 1 picked')).toBeTruthy());
    fireEvent.press(screen.getByText('Continue'));

    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith(`/checkout/addons?eventId=${TULUA_ID}`),
    );
  });

  /**
   * An event with nothing to sell alongside a ticket has no extras step, so guests lead
   * straight to review rather than to an empty screen the buyer has to click past
   * (P0.1 decision #10, collapse to 3 steps).
   */
  it('skips the extras step for an event that sells none', async () => {
    mockParams.eventId = SOUND_BATH_ID;
    await signInAndComplete();
    // The premise, stated rather than assumed: this event's catalogue is empty.
    expect(await mockApi.addons.list(SOUND_BATH_ID)).toEqual([]);
    useCheckoutStore.getState().start(SOUND_BATH_ID, TIER_SOUND_GA);
    useCheckoutStore.getState().setQuantity(2);

    renderWithProviders(<GuestsScreen />);

    await waitFor(() => expect(screen.getByText('Checkout · step 2 of 3')).toBeTruthy());
    fireEvent.press(screen.getByText('Add from Contacts'));
    await waitFor(() => expect(screen.getByText('Nour Hassan')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Add Nour Hassan as a guest'));

    fireEvent.press(screen.getByText('Continue'));

    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith(`/checkout/review?eventId=${SOUND_BATH_ID}`),
    );
  });

  /**
   * The address book is a convenience, never the thing holding the order together. A number
   * typed by hand has to be attachable, visible and removable with contacts switched off.
   */
  it('attaches and removes a guest with contacts refused outright', async () => {
    contactsPermission({ status: 'denied', canAskAgain: false });
    mockParams.eventId = SOUND_BATH_ID;
    await signInAndComplete();
    useCheckoutStore.getState().start(SOUND_BATH_ID, TIER_SOUND_GA);
    useCheckoutStore.getState().setQuantity(2);

    renderWithProviders(<GuestsScreen />);
    await waitFor(() => expect(screen.getByText('0 of 1 picked')).toBeTruthy());

    fireEvent.press(screen.getByText('Add from Contacts'));
    await waitFor(() => expect(screen.getByText('Open Settings')).toBeTruthy());
    // Asking again is pointless once the OS has stopped offering, so it is not offered.
    expect(screen.queryByText('Add from Contacts')).toBeNull();

    fireEvent.changeText(screen.getByLabelText('Guest phone number'), '1022334455');
    fireEvent.press(screen.getByText('Add'));

    expect(screen.getByText('1 of 1 picked')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Remove 010 22334455'));
    expect(screen.getByText('0 of 1 picked')).toBeTruthy();
  });

  /**
   * Nothing tells the app that the switch was flipped in Settings, so coming back to the
   * foreground is what has to notice. Without this the Settings button is a dead end.
   */
  it('recovers the contact list after access is granted in Settings', async () => {
    contactsPermission({ status: 'denied', canAskAgain: false });
    mockParams.eventId = SOUND_BATH_ID;
    await signInAndComplete();
    useCheckoutStore.getState().start(SOUND_BATH_ID, TIER_SOUND_GA);
    useCheckoutStore.getState().setQuantity(2);

    renderWithProviders(<GuestsScreen />);
    fireEvent.press(screen.getByText('Add from Contacts'));
    await waitFor(() => expect(screen.getByText('Open Settings')).toBeTruthy());

    contactsPermission({ status: 'granted' });
    await returnToForeground();

    await waitFor(() => expect(screen.getByText('Nour Hassan')).toBeTruthy());
    expect(screen.queryByText('Open Settings')).toBeNull();
  });

  /**
   * "One of these guests already has a ticket" is useless if it does not say which. The
   * refusal is pinned to that guest's row so they can be taken off and replaced.
   */
  it('names the guest the server refuses, and lets them be swapped out', async () => {
    mockParams.eventId = TULUA_ID;
    await signInAndComplete();
    useCheckoutStore.getState().start(TULUA_ID, TIER_WEEKEND);
    // The seeded buyer already holds a Tulua ticket, so their one ticket is a guest's. This
    // draft carries a number the server will refuse: the buyer's own.
    useCheckoutStore.getState().setBuyerTakesTicket(false);
    useCheckoutStore.getState().addGuest({
      phoneNumber: '+201012345678',
      name: 'My Other Line',
      fromContacts: false,
    });

    renderWithProviders(<GuestsScreen />);
    await waitFor(() => expect(screen.getByText('1 of 1 picked')).toBeTruthy());

    fireEvent.press(screen.getByText('Continue'));
    await waitFor(() =>
      expect(
        screen.getAllByText("That's your own number. Your ticket is already included.").length,
      ).toBeGreaterThan(1),
    );
    expect(mockRouter.push).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText('Remove My Other Line'));
    expect(screen.getByText('0 of 1 picked')).toBeTruthy();
    expect(
      screen.queryByText("That's your own number. Your ticket is already included."),
    ).toBeNull();

    fireEvent.press(screen.getByText('Add from Contacts'));
    await waitFor(() => expect(screen.getByText('Nour Hassan')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Add Nour Hassan as a guest'));
    // Tulua sells extras, so the swapped-in guest leads on to the extras step, not to review.
    await waitFor(() => expect(screen.getByText('Checkout · step 2 of 4')).toBeTruthy());
    fireEvent.press(screen.getByText('Continue'));

    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith(`/checkout/addons?eventId=${TULUA_ID}`),
    );
  });

  /** Filling the last slot must not trap the order: swapping someone out has to work. */
  it('explains a full order instead of going quiet, and swaps a guest out', async () => {
    mockParams.eventId = SOUND_BATH_ID;
    await signInAndComplete();
    useCheckoutStore.getState().start(SOUND_BATH_ID, TIER_SOUND_GA);
    useCheckoutStore.getState().setQuantity(2);

    renderWithProviders(<GuestsScreen />);
    fireEvent.press(screen.getByText('Add from Contacts'));
    await waitFor(() => expect(screen.getByText('Nour Hassan')).toBeTruthy());

    fireEvent.press(screen.getByLabelText('Add Nour Hassan as a guest'));
    expect(screen.getByText('1 of 1 picked')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Add Dana Ward as a guest'));
    expect(
      screen.getByText(
        'You have 1 guest slot on this order. Remove someone first, or add a ticket.',
      ),
    ).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Remove Nour Hassan'));
    fireEvent.press(screen.getByLabelText('Add Dana Ward as a guest'));
    expect(screen.getByText('1 of 1 picked')).toBeTruthy();
  });

  /** An address book of any real size is only usable through search. */
  it('narrows a long contact list by name', async () => {
    mockParams.eventId = SOUND_BATH_ID;
    await signInAndComplete();
    useCheckoutStore.getState().start(SOUND_BATH_ID, TIER_SOUND_GA);
    useCheckoutStore.getState().setQuantity(2);

    renderWithProviders(<GuestsScreen />);
    fireEvent.press(screen.getByText('Add from Contacts'));
    await waitFor(() => expect(screen.getByText('Nour Hassan')).toBeTruthy());

    fireEvent.changeText(screen.getByLabelText('Search contacts'), 'dana');

    expect(screen.getByText('Dana Ward')).toBeTruthy();
    expect(screen.queryByText('Nour Hassan')).toBeNull();

    fireEvent.press(screen.getByLabelText('Clear contact search'));
    expect(screen.getByText('Nour Hassan')).toBeTruthy();
  });

  /**
   * Extras live in the app until the assignment steps finish them, and stepping back through
   * here used to throw them away outright: `PUT /carts/:id/tickets` wipes the cart's extras, so
   * the draft was cleared to match. Coming back to swap one guest is not a decision to abandon
   * a room and three dinners, and nothing said it had happened.
   *
   * The draft is re-pointed at the rebuilt cart instead, matching people by phone number, since
   * that call makes no promise a person keeps the same `cartAttendeeId`.
   */
  it('keeps the extras when the buyer steps back through this screen', async () => {
    mockParams.eventId = TULUA_ID;
    await signInAndComplete();

    // This buyer already holds a Tulua ticket in the fixtures, so every ticket here is a guest's.
    const cart = await mockApi.carts.create(TULUA_ID);
    await mockApi.carts.replaceTickets(cart.id, {
      buyerTierId: null,
      items: [{ tierId: TIER_WEEKEND, quantity: 1 }],
      guests: [{ phoneNumber: '+201022334455', name: 'Nour Hassan', tierId: TIER_WEEKEND }],
    });
    const before = (await mockApi.carts.get(cart.id)).attendees;
    const guest = before.find((attendee) => attendee.phoneNumber === '+201022334455')!;

    const store = useCheckoutStore.getState();
    store.start(TULUA_ID, TIER_WEEKEND);
    store.setBuyerTakesTicket(false);
    store.setQuantity(1);
    store.addGuest({ phoneNumber: '+201022334455', name: 'Nour Hassan', fromContacts: true });
    store.setCartId(cart.id);
    store.upsertAddon({
      addonId: 'addon-meals',
      addonName: 'Dinner voucher',
      type: 'meal',
      optionId: 'opt-dinner',
      optionLabel: 'Dinner voucher',
      unitPriceEgp: '280.00',
      quantity: 1,
      assignments: [{ cartAttendeeId: guest.cartAttendeeId, quantity: 1 }],
    });

    renderWithProviders(<GuestsScreen />);
    await waitFor(() => expect(screen.getByText('1 of 1 picked')).toBeTruthy());

    fireEvent.press(screen.getByText('Continue'));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalled());

    const kept = useCheckoutStore.getState().addons;
    expect(kept).toHaveLength(1);
    expect(kept[0]!.assignments).toHaveLength(1);

    // Re-pointed at whatever id the rebuilt cart gave that person, not the one it was holding.
    const after = (await mockApi.carts.get(cart.id)).attendees;
    const sameGuest = after.find((attendee) => attendee.phoneNumber === '+201022334455')!;
    expect(kept[0]!.assignments![0]!.cartAttendeeId).toBe(sameGuest.cartAttendeeId);

    // Whole, so it went back to the cart in the same breath rather than waiting for a later step.
    const saved = await mockApi.carts.get(cart.id);
    expect(saved.addons.map((line) => line.optionId)).toEqual(['opt-dinner']);
  });

  /**
   * The one case where an extra really does have to go: the person holding it is no longer in
   * the order. Swapping one guest for another is the way that happens on this screen, since a
   * ticket left with nobody on it blocks Continue outright.
   *
   * The departing guest's units are dropped rather than sent with an id the server has
   * discarded, which leaves that line short and sends the buyer back to the assignment step to
   * give it to the new person. Everything belonging to somebody who stayed is untouched.
   */
  it('drops only the units belonging to a guest who was swapped out', async () => {
    mockParams.eventId = TULUA_ID;
    await signInAndComplete();

    const cart = await mockApi.carts.create(TULUA_ID);
    await mockApi.carts.replaceTickets(cart.id, {
      buyerTierId: null,
      items: [{ tierId: TIER_WEEKEND, quantity: 2 }],
      guests: [
        { phoneNumber: '+201022334455', name: 'Nour Hassan', tierId: TIER_WEEKEND },
        { phoneNumber: '+201188776655', name: 'Omar Farouk', tierId: TIER_WEEKEND },
      ],
    });
    const before = (await mockApi.carts.get(cart.id)).attendees;
    const nour = before.find((a) => a.phoneNumber === '+201022334455')!;
    const omar = before.find((a) => a.phoneNumber === '+201188776655')!;

    const store = useCheckoutStore.getState();
    store.start(TULUA_ID, TIER_WEEKEND);
    store.setBuyerTakesTicket(false);
    store.setQuantity(2);
    store.addGuest({ phoneNumber: '+201022334455', name: 'Nour Hassan', fromContacts: true });
    store.addGuest({ phoneNumber: '+201188776655', name: 'Omar Farouk', fromContacts: true });
    store.setCartId(cart.id);
    store.upsertAddon({
      addonId: 'addon-meals',
      addonName: 'Dinner voucher',
      type: 'meal',
      optionId: 'opt-dinner',
      optionLabel: 'Dinner voucher',
      unitPriceEgp: '280.00',
      quantity: 2,
      assignments: [
        { cartAttendeeId: nour.cartAttendeeId, quantity: 1 },
        { cartAttendeeId: omar.cartAttendeeId, quantity: 1 },
      ],
    });

    renderWithProviders(<GuestsScreen />);
    await waitFor(() => expect(screen.getByText('2 of 2 picked')).toBeTruthy());

    // Omar comes off the order and somebody else takes his ticket. The quantity is untouched:
    // reducing it belongs to the pass screen, and `setQuantity` drops the draft by design.
    fireEvent.press(screen.getByLabelText('Remove Omar Farouk'));
    await waitFor(() => expect(screen.getByText('1 of 2 picked')).toBeTruthy());
    fireEvent.changeText(screen.getByLabelText('Guest phone number'), '1155667788');
    fireEvent.press(screen.getByText('Add'));
    await waitFor(() => expect(screen.getByText('2 of 2 picked')).toBeTruthy());

    fireEvent.press(screen.getByText('Continue'));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalled());

    const kept = useCheckoutStore.getState().addons;
    expect(kept).toHaveLength(1);
    // Nour's unit survived; Omar's did not, so the line is now short of its own quantity and the
    // assignment step will say so rather than the server refusing it at the till.
    expect(kept[0]!.quantity).toBe(2);
    expect(kept[0]!.assignments).toHaveLength(1);

    const after = (await mockApi.carts.get(cart.id)).attendees;
    const stillNour = after.find((a) => a.phoneNumber === '+201022334455')!;
    expect(kept[0]!.assignments![0]!.cartAttendeeId).toBe(stillNour.cartAttendeeId);
    // Nobody is carrying an id the cart no longer knows.
    const liveIds = new Set(after.map((a) => a.cartAttendeeId));
    expect(liveIds.has(kept[0]!.assignments![0]!.cartAttendeeId!)).toBe(true);

    // Short, so it is not something the server will take yet, and it was not sent.
    expect((await mockApi.carts.get(cart.id)).addons).toHaveLength(0);
  });
});

describe('10 Review & pay', () => {
  it('shows server totals, VAT and the terms gate', async () => {
    mockParams.eventId = TULUA_ID;
    await signInAndComplete();
    useCheckoutStore.getState().start(TULUA_ID, TIER_WEEKEND);
    useCheckoutStore.getState().setQuantity(2);
    // signInAndComplete seeds this user a Tulua ticket, so both tickets are guests'.
    useCheckoutStore.getState().setBuyerTakesTicket(false);
    await startCartCheckout({
      eventId: TULUA_ID,
      buyerTierId: null,
      items: [{ tierId: TIER_WEEKEND, quantity: 2 }],
      guests: [
        { phoneNumber: '+201022334455', name: 'Nour Hassan', tierId: TIER_WEEKEND },
        { phoneNumber: '+201033445566', name: 'Omar Fathy', tierId: TIER_WEEKEND },
      ],
    });

    renderWithProviders(<ReviewScreen />);

    // Tulua sells extras, so review is the fourth of four steps.
    await waitFor(() => expect(screen.getByText('Checkout · step 4 of 4')).toBeTruthy());
    expect(screen.getByText('Review & pay')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Full Weekend Pass × 2')).toBeTruthy());
    // Once as the ticket line, once as the subtotal. Both are the server's figure.
    expect(screen.getAllByText('3,200.00 EGP').length).toBe(2);
    expect(screen.getByText('Subtotal')).toBeTruthy();
    expect(screen.getByText('VAT (14%)')).toBeTruthy();
    expect(screen.getByText('448.00 EGP')).toBeTruthy();
    expect(screen.getByText('Total')).toBeTruthy();
    expect(screen.getByText('3,648.00 EGP')).toBeTruthy();
    expect(
      screen.getByText('I understand tickets and add-ons are non-refundable and non-transferable.'),
    ).toBeTruthy();
    // The box is unticked on arrival, so the CTA is blocked and says which of the two blockers
    // it is: a grey button with no reason is the same dead end as a black one.
    const blocked = screen.getByRole('button', { name: 'Accept the terms to pay' });
    expect(blocked).toBeDisabled();
    expect(screen.queryByText('Continue to payment')).toBeNull();

    fireEvent.press(
      screen.getByText('I understand tickets and add-ons are non-refundable and non-transferable.'),
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Continue to payment' })).not.toBeDisabled(),
    );
  });

  /**
   * An accepted promo code used to leave nothing behind but the "Remove promo code" link: no
   * discount row, and a total still carrying the full price and its VAT. The discount is the
   * server's own figure, and it comes off the subtotal before VAT, exactly as an order is priced.
   */
  it('shows the discount an accepted promo code buys, and takes it off before VAT', async () => {
    mockParams.eventId = TULUA_ID;
    await signInAndComplete();
    useCheckoutStore.getState().start(TULUA_ID, TIER_WEEKEND);
    // signInAndComplete seeds this user a Tulua ticket, so the one ticket is a guest's.
    useCheckoutStore.getState().setBuyerTakesTicket(false);
    await startCartCheckout({
      eventId: TULUA_ID,
      buyerTierId: null,
      items: [{ tierId: TIER_WEEKEND, quantity: 1 }],
      guests: [{ phoneNumber: '+201022334455', name: 'Nour Hassan', tierId: TIER_WEEKEND }],
    });

    renderWithProviders(<ReviewScreen />);

    await waitFor(() => expect(screen.getByText('1,824.00 EGP')).toBeTruthy());

    fireEvent.changeText(screen.getByLabelText('Promo code'), 'tulua500');
    fireEvent.press(screen.getByText('Apply'));

    // The row names the promo's scope: TULUA500 is configured against ticket tiers, so an
    // extras-only basket is told why nothing came off rather than left guessing.
    await waitFor(() => expect(screen.getByText('Promo · TULUA500, tickets only')).toBeTruthy());
    expect(screen.getByText('Promo TULUA500 applied')).toBeTruthy();
    // 1,600.00 subtotal − 500.00 = 1,100.00 net, VAT 154.00, total 1,254.00.
    expect(screen.getByText('−500.00 EGP')).toBeTruthy();
    expect(screen.getByText('154.00 EGP')).toBeTruthy();
    expect(screen.getByText('1,254.00 EGP')).toBeTruthy();

    fireEvent.press(screen.getByText('Remove'));

    await waitFor(() => expect(screen.queryByText('Promo · TULUA500, tickets only')).toBeNull());
    await waitFor(() => expect(screen.getByText('1,824.00 EGP')).toBeTruthy());
  });

  /**
   * Card entry belongs to Paymob's sheet, so "Continue to payment" holds the order and calls
   * `presentPayVC` itself: there is no intermediate card screen between review and the sheet.
   * A screen that opens the sheet owns its verdict too, so SUCCESS has to land on the
   * confirmation rather than leaving a paid buyer looking at the review screen.
   */
  it('opens the Paymob sheet directly and confirms on SUCCESS', async () => {
    mockParams.eventId = TULUA_ID;
    await signInAndComplete();
    useCheckoutStore.getState().start(TULUA_ID, TIER_WEEKEND);
    useCheckoutStore.getState().setQuantity(1);
    // signInAndComplete seeds this user a Tulua ticket, so this one is for a guest - every
    // ticket in the order needs a guest against it rather than quantity minus the buyer's own.
    // The guests screen sets this from the ticket check; this test goes straight to review.
    useCheckoutStore.getState().setBuyerTakesTicket(false);
    useCheckoutStore.getState().addGuest({
      phoneNumber: '+201022334455',
      name: 'Nour Hassan',
      fromContacts: false,
    });
    await startCartCheckout({
      eventId: TULUA_ID,
      buyerTierId: null,
      items: [{ tierId: TIER_WEEKEND, quantity: 1 }],
      guests: [{ phoneNumber: '+201022334455', name: 'Nour Hassan', tierId: TIER_WEEKEND }],
    });
    useCheckoutStore.getState().setTermsAccepted(true);

    renderWithProviders(<ReviewScreen />);
    // The button stays disabled until the mock price preview and the ticket check settle.
    await waitFor(() => expect(screen.getByText('Full Weekend Pass × 1')).toBeTruthy());
    await waitFor(() => expect(screen.getByText('1,824.00 EGP')).toBeTruthy());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Continue to payment' })).not.toBeDisabled(),
    );

    fireEvent.press(screen.getByText('Continue to payment'));

    await waitFor(() => expect(mockPaymob.presentPayVC!).toHaveBeenCalled());
    // Customisation must be registered before the sheet is presented, per the SDK docs.
    expect(mockPaymob.setAppName!).toHaveBeenCalledWith('Sukun');

    const listener = mockPaymob.setSdkListener!.mock.calls.at(-1)?.[0] as (r: unknown) => void;
    act(() => listener({ status: 'Success' }));

    await waitFor(() =>
      expect(mockRouter.replace).toHaveBeenCalledWith(
        expect.stringContaining('/checkout/confirmation?orderId='),
      ),
    );
  });
});

describe('11 Payment', () => {
  // The screen used to draw dead look-alike card fields. Card entry belongs to Paymob's sheet,
  // so the screen now shows the amount and hands straight off — no inputs of its own.
  it('shows the Paymob amount and no card fields of its own', async () => {
    await signInAndComplete();
    // signInAndComplete seeds this user a Tulua ticket, so the order is entirely for guests.
    const order = await placeOrderViaCart({
      eventId: TULUA_ID,
      buyerTierId: null,
      items: [{ tierId: TIER_WEEKEND, quantity: 2 }],
      guests: [
        { phoneNumber: '+201022334455', name: 'Nour Hassan', tierId: TIER_WEEKEND },
        { phoneNumber: '+201033445566', name: 'Omar Fathy', tierId: TIER_WEEKEND },
      ],
    });
    mockParams.orderId = order.id;

    renderWithProviders(<PaymentScreen />);

    await waitFor(() => expect(screen.getByText('Payment')).toBeTruthy());
    expect(screen.getByText('Secured by Paymob · charged in EGP')).toBeTruthy();
    await waitFor(() => expect(screen.getAllByText('Pay 3,648.00 EGP').length).toBe(2));
    expect(screen.queryByText('Card number')).toBeNull();
    expect(screen.queryByText('CVV')).toBeNull();
    expect(
      screen.getByText("Tapping pay opens Paymob's secure sheet, where you enter your card."),
    ).toBeTruthy();
  });
});

describe('12 Confirmation', () => {
  it('names the order and explains the guest WhatsApp message', async () => {
    await signInAndComplete();
    // signInAndComplete seeds this user a Tulua ticket, so the order is entirely for guests.
    const order = await placeOrderViaCart({
      eventId: TULUA_ID,
      buyerTierId: null,
      items: [{ tierId: TIER_WEEKEND, quantity: 2 }],
      guests: [
        { phoneNumber: '+201022334455', name: 'Nour Hassan', tierId: TIER_WEEKEND },
        { phoneNumber: '+201033445566', name: 'Omar Fathy', tierId: TIER_WEEKEND },
      ],
    });
    mockParams.orderId = order.id;

    renderWithProviders(<ConfirmationScreen />);

    await waitFor(() => expect(screen.getByText(new RegExp(`2 tickets to Tulua`))).toBeTruthy());
    expect(screen.getByText(/WhatsApp message/)).toBeTruthy();
    expect(screen.getByText('See my ticket')).toBeTruthy();
  });
});

describe('13 My tickets', () => {
  it('lists the held ticket as one card', async () => {
    await signInAndComplete();
    renderWithProviders(<TicketsScreen />);

    expect(screen.getByText('My tickets')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Full Weekend Pass')).toBeTruthy());
    expect(screen.getByText('Tulua · 23–24 Oct')).toBeTruthy();
    expect(screen.getByText('Paid')).toBeTruthy();
    expect(screen.getByText('View entry pass →')).toBeTruthy();
  });

  // Regression: the tickets query is disabled while signed out, and a disabled TanStack query
  // reports `isPending: true` with `fetchStatus: 'idle'` forever. Gating the spinner on
  // `isPending` left a signed-out user staring at "Loading your tickets..." with no request
  // ever in flight. The screen must settle on the empty state instead.
  it('settles on the empty state when signed out instead of spinning forever', async () => {
    useAuthStore.setState({ status: 'signed-out', user: null, pendingPhone: null });
    renderWithProviders(<TicketsScreen />);

    await waitFor(() => expect(screen.getByText('No tickets yet')).toBeTruthy());
    expect(screen.queryByText('Loading your tickets...')).toBeNull();
  });
});

describe('14 Entry pass', () => {
  it('renders the live pass, the rotation notice and the holder details', async () => {
    await signInAndComplete();
    const { data } = await mockApi.tickets.list();
    mockParams.id = data[0]!.id;

    renderWithProviders(<EntryPassScreen />);

    await waitFor(() => expect(screen.getByText('Tulua · live entry pass')).toBeTruthy());
    expect(screen.getByText('Full Weekend Pass')).toBeTruthy();
    expect(screen.getByText('Holder')).toBeTruthy();
    expect(screen.getByText('Yasmin El Sayed')).toBeTruthy();
    expect(screen.getByText('Venue')).toBeTruthy();
    // The pass shows the ticket's full venue string, as the design draws it.
    expect(screen.getByText('Tunis Village, Fayoum')).toBeTruthy();
    expect(screen.getByText(/This code regenerates every ~/)).toBeTruthy();
  });

  /*
   * The entry-pass endpoint is not deployed, so the live api's request 404s. That is not
   * something the holder can retry, and the panel must not claim a code is rotating when there
   * is none. The same build renders the QR above as soon as the endpoint answers.
   */
  it('says the code will appear later while the endpoint is not serving a pass', async () => {
    await signInAndComplete();
    const { data } = await mockApi.tickets.list();
    mockParams.id = data[0]!.id;
    const notDeployed = Object.assign(new Error('Cannot GET'), { code: 'UNKNOWN', status: 404 });
    const entryPass = jest.spyOn(mockApi.tickets, 'entryPass').mockRejectedValue(notDeployed);

    renderWithProviders(<EntryPassScreen />);

    await waitFor(() => expect(screen.getByText('QR Code will show here.')).toBeTruthy());
    expect(screen.getByText('Check back 2 days before the event.')).toBeTruthy();
    expect(screen.queryByText('Try again')).toBeNull();
    expect(screen.queryByText(/Refreshes in/)).toBeNull();
    expect(screen.queryByText(/This code regenerates every ~/)).toBeNull();
    // The ticket's own details still belong on the screen.
    expect(screen.getByText('Yasmin El Sayed')).toBeTruthy();

    entryPass.mockRestore();
  });

  // A pass that genuinely failed to load is still an error the holder can retry.
  it('keeps the retry state for a real entry pass failure', async () => {
    await signInAndComplete();
    const { data } = await mockApi.tickets.list();
    mockParams.id = data[0]!.id;
    const serverError = Object.assign(new Error('boom'), {
      code: 'INTERNAL_SERVER_ERROR',
      status: 500,
    });
    const entryPass = jest.spyOn(mockApi.tickets, 'entryPass').mockRejectedValue(serverError);

    renderWithProviders(<EntryPassScreen />);

    await waitFor(() =>
      expect(
        screen.getByText('Something went wrong on our side. Try again in a moment.'),
      ).toBeTruthy(),
    );
    expect(screen.getByText('Try again')).toBeTruthy();
    expect(screen.queryByText('QR Code will show here.')).toBeNull();

    entryPass.mockRestore();
  });
});

describe('15 Profile', () => {
  it('shows identity, stats and the account rows', async () => {
    await signInAndComplete();
    renderWithProviders(<ProfileTabScreen />);

    expect(screen.getByText('Profile')).toBeTruthy();
    expect(screen.getByText('Yasmin El Sayed')).toBeTruthy();
    expect(screen.getByText('+20 10 12345678')).toBeTruthy();
    expect(screen.getByText('yasmin@email.com')).toBeTruthy();
    expect(screen.getByText('Account')).toBeTruthy();
    expect(screen.getByText('Privacy policy & terms')).toBeTruthy();
    expect(screen.getByText('Delete account')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Tickets')).toBeTruthy());
  });

  /**
   * Staging and production submit to the same App Store Connect record, so a TestFlight tester
   * sees two builds told apart only by their build number and, until this line existed, had no
   * way at all to tell which one they had opened. A bug filed against the wrong build costs a day.
   */
  it('names the build it is, and badges the staging one', async () => {
    await signInAndComplete();
    renderWithProviders(<ProfileTabScreen />);

    // The native bundle's own numbers, not the JS config: EAS owns them remotely, so the config
    // on disk does not know the build number at all.
    expect(screen.getByText('Version 2.0.0 (15)')).toBeTruthy();
    // No `EXPO_PUBLIC_ANALYTICS_ENV` under Jest, so this is not a staging build and carries no
    // badge. Which environments do is pinned in src/lib/__tests__/build-info.test.ts.
    expect(screen.queryByText('Staging')).toBeNull();
  });
});

describe('Account deletion', () => {
  it('warns about the tickets it would void', async () => {
    await signInAndComplete();
    renderWithProviders(<DeleteAccountScreen />);

    expect(screen.getByText('Delete your account?')).toBeTruthy();
    expect(screen.getByText(/removes your profile, your selfie and your sign-in/)).toBeTruthy();
    await waitFor(() => expect(screen.getByText('You still hold 1 ticket')).toBeTruthy());
    expect(screen.getByText('Keep my account')).toBeTruthy();
  });
});

describe('Privacy & terms', () => {
  it('states the rules the app enforces', () => {
    renderWithProviders(<TermsScreen />);
    expect(screen.getByText('Privacy & terms')).toBeTruthy();
    expect(screen.getByText('Your phone number')).toBeTruthy();
    expect(screen.getByText('Your selfie')).toBeTruthy();
    expect(screen.getByText('Payments')).toBeTruthy();
  });
});

describe('Component gallery', () => {
  it('renders every section', () => {
    renderWithProviders(<GalleryScreen />);
    for (const section of ['Colour', 'Type', 'Spacing', 'Buttons', 'Tags & badges', 'Fields']) {
      expect(screen.getByText(section)).toBeTruthy();
    }
  });
});
