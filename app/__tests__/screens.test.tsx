import { mockApi, mockConfig, MOCK_OTP_CODE, resetMockState } from '../../src/api/mock';
import {
  eventDetails,
  promoCodes,
  SOUND_BATH_ID,
  TIER_DAY1,
  TIER_KIDS,
  TIER_SOUND_GA,
  TIER_WEEKEND,
  TULUA_ID,
} from '../../src/api/mock/fixtures';
import { messageForCode } from '../../src/lib/errors';
import { missingProfileFields, resumeAfterOnboarding, useAuthStore } from '../../src/stores/auth';
import { useFlagsStore } from '../../src/stores/flags';
import { useCheckoutStore } from '../../src/stores/checkout';
import { act, fireEvent, renderWithProviders, screen, waitFor, within } from '../../src/test-utils';

import WelcomeScreen from '../(onboarding)/welcome';
import OtpScreen from '../(onboarding)/otp';
import ProfileFormScreen from '../(onboarding)/profile';
import SelfieScreen from '../account/selfie';
import EditProfileScreen from '../account/profile';
import DiscoverScreen from '../(tabs)/discover';
import TicketsScreen from '../(tabs)/tickets';
import ProfileTabScreen from '../(tabs)/profile';
import EventDetailScreen from '../event/[slug]';
import ChoosePassScreen from '../checkout/pass';
import GuestsScreen from '../checkout/guests';
import ReviewScreen from '../checkout/review';
import PaymentScreen from '../checkout/payment';
import ConfirmationScreen from '../checkout/confirmation';
import OrderDetailScreen from '../orders/[id]';
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

const mockParams: Record<string, string> = {};
const mockRouter = {
  push: jest.fn(),
  back: jest.fn(),
  replace: jest.fn(),
  navigate: jest.fn(),
  // Defaults to "nothing to pop", which is the case for every screen reached by a `Redirect`
  // or a `replace`. Tests that stand a screen on top of another opt in.
  canGoBack: jest.fn(() => false),
};

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
  useIsFocused: () => true,
  usePathname: () => '/discover',
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

/**
 * Registered, and able to buy: the profile form is the last thing registration asks for. No
 * selfie yet, which is the state every new account is in until it opens an entry pass.
 */
async function signInWithoutSelfie() {
  await mockApi.auth.requestOtp('+201012345678');
  const { user } = await mockApi.auth.verifyOtp('+201012345678', MOCK_OTP_CODE);
  const profiled = await mockApi.profile.update({
    fullName: 'Yasmin El Sayed',
    email: 'yasmin@email.com',
    dateOfBirth: '1994-03-12',
    gender: 'female',
    areaId: 'ar-maadi',
  });
  useAuthStore.setState({ status: 'signed-in', user: profiled, pendingPhone: null });
  return { user, profiled };
}

async function signInAndComplete() {
  const { user } = await signInWithoutSelfie();
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
  mockRouter.back.mockClear();
  mockRouter.canGoBack.mockReset();
  mockRouter.canGoBack.mockReturnValue(false);
  useAuthStore.setState({
    status: 'signed-out',
    user: null,
    pendingPhone: null,
    setupDeferred: false,
    pendingCheckoutEventId: null,
  });
  useFlagsStore.setState({ status: 'ready', allowGuestBrowsing: true });
  useCheckoutStore.getState().reset();
});

// A test that switches an event to VAT-inclusive prices leaves the fixtures as it found them.
afterEach(() => {
  for (const event of Object.values(eventDetails)) event.vatInclusive = false;
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
/**
 * Pays an order through the mock's simulated webhook, so the server says `paid`. The
 * confirmation screen only says a ticket is ready once it does.
 */
async function payOrder(orderId: string) {
  const settleDelay = mockConfig.settleDelayMs;
  mockConfig.settleDelayMs = 0;
  await mockApi.payments.initiate(orderId);
  await mockApi.payments.status(orderId);
  mockConfig.settleDelayMs = settleDelay;
}

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

  /**
   * The way past this screen without an account. App Store guideline 5.1.1(v) requires that
   * the catalogue, which is not account based, be reachable without registering; the app was
   * rejected for gating it. The link is deliberately quiet, so what is asserted here is that
   * it exists, that it is a control rather than legal copy, and that it leads to Discover.
   */
  it('offers a way in without an account, and takes it to Discover', () => {
    renderWithProviders(<WelcomeScreen />);

    const skip = screen.getByText('Skip login');
    expect(skip).toBeTruthy();

    fireEvent.press(skip);
    expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/discover');
  });

  /**
   * The purchase gate pushes this screen on top of an event, so there is somewhere to go
   * back to. Skipping there must return the visitor to what they were reading rather than
   * dropping them on Discover having lost their place.
   */
  it('returns to the event underneath when it was reached from the purchase gate', () => {
    mockRouter.canGoBack.mockReturnValue(true);
    renderWithProviders(<WelcomeScreen />);

    fireEvent.press(screen.getByText('Skip login'));
    expect(mockRouter.back).toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});

describe('03 Verify code', () => {
  it('shows the number the code went to, and the resend affordance', () => {
    useAuthStore.setState({ pendingPhone: '+201012345678' });
    renderWithProviders(<OtpScreen />);

    expect(screen.getByText('Step 1 of 2')).toBeTruthy();
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

    await waitFor(() => expect(screen.getByText('Step 2 of 2')).toBeTruthy());
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

    await waitFor(() => expect(screen.getByText('Step 2 of 2')).toBeTruthy());
    for (const label of ['Full name', 'Email', 'Date of birth', 'Gender']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.queryByText('Living area')).toBeNull();
    expect(screen.getAllByText('Select').length).toBe(2);
  });

  /**
   * A refused Continue says what each field needs under it, and names them all in one sentence
   * beside the button, where the person is looking (owner's call 2026-10-10, as on the website).
   */
  it('names what is missing beside the button, and says what each field needs', async () => {
    useAuthStore.setState({
      status: 'signed-in',
      user: { ...emptyForeignUser(), phoneNumber: '+201012345678' },
    });
    renderWithProviders(<ProfileFormScreen />);

    await waitFor(() => expect(screen.getByText('Step 2 of 2')).toBeTruthy());
    expect(screen.queryByText(/missing or incomplete/)).toBeNull();
    fireEvent.press(screen.getByText('Continue'));

    await waitFor(() => expect(screen.getByText('Enter your full name')).toBeTruthy());
    expect(screen.getByText('Enter your email')).toBeTruthy();
    expect(screen.getByText('Pick your date of birth')).toBeTruthy();
    expect(screen.getByText('Pick your gender')).toBeTruthy();
    expect(screen.getByText('Pick your living area')).toBeTruthy();
    expect(screen.getByText(/missing or incomplete/)).toHaveTextContent(
      'Your full name, email, date of birth, gender and living area are missing or incomplete.',
    );

    // Each field it names is a tap away, and a fixed one drops out of the sentence.
    fireEvent.press(screen.getByText('gender'));
    fireEvent.changeText(screen.getByPlaceholderText('Your name'), 'Yasmin El Sayed');
    await waitFor(() =>
      expect(screen.getByText(/missing or incomplete/)).toHaveTextContent(
        'Your email, date of birth, gender and living area are missing or incomplete.',
      ),
    );
    expect(screen.queryByText('Enter your full name')).toBeNull();
  });

  it('says an email that is not one should be checked', async () => {
    useAuthStore.setState({ status: 'signed-in', user: emptyForeignUser() });
    renderWithProviders(<ProfileFormScreen />);

    await waitFor(() => expect(screen.getByText('Step 2 of 2')).toBeTruthy());
    fireEvent.changeText(screen.getByPlaceholderText('you@email.com'), 'yasmin@');
    fireEvent.press(screen.getByText('Continue'));

    await waitFor(() =>
      expect(
        screen.getByText('Check your email, it should look like name@example.com'),
      ).toBeTruthy(),
    );
  });

  /**
   * The number is verified by the time this form renders, so without an exit the only way
   * back to the catalogue is the "wrong number" alert, which drops the account and lands on
   * the phone field. That leaves a registered user four steps and a destructive confirmation
   * away from public content, which is the same wall guideline 5.1.1(v) rejected, one screen
   * earlier than the selfie step.
   */
  it('lets an unfinished profile out to browse, keeping the verified session', async () => {
    useAuthStore.setState({ status: 'signed-in', user: emptyForeignUser() });
    renderWithProviders(<ProfileFormScreen />);

    await waitFor(() => expect(screen.getByText('Step 2 of 2')).toBeTruthy());
    fireEvent.press(screen.getByText('Not now, browse events'));

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/discover'));
    expect(useAuthStore.getState().status).toBe('signed-in');
    expect(useAuthStore.getState().setupDeferred).toBe(true);
  });
});

describe('Edit profile', () => {
  /**
   * `prefer_not_to_say` is still stored for some accounts and no longer offered, so their gender
   * starts empty, and saving says that is the one thing left.
   */
  it('names a gender the form no longer offers as the one thing missing', async () => {
    const { profiled } = await signInWithoutSelfie();
    useAuthStore.setState({ user: { ...profiled, gender: 'prefer_not_to_say' } });
    const update = jest.spyOn(mockApi.profile, 'update');
    renderWithProviders(<EditProfileScreen />);

    fireEvent.press(screen.getByText('Save changes'));

    await waitFor(() =>
      expect(screen.getByText(/missing or incomplete/)).toHaveTextContent(
        'Your gender is missing or incomplete.',
      ),
    );
    expect(screen.getByText('Pick your gender')).toBeTruthy();
    expect(update).not.toHaveBeenCalled();
    update.mockRestore();
  });
});

describe('05 Selfie', () => {
  it('explains why the selfie exists, and says it belongs to the pass', () => {
    useAuthStore.setState({ status: 'signed-in', user: emptyForeignUser() });
    renderWithProviders(<SelfieScreen />);

    expect(screen.getByText('Entry pass')).toBeTruthy();
    expect(screen.getByText('One thing before your QR')).toBeTruthy();
    expect(screen.getByText('Tap to take a selfie')).toBeTruthy();
    expect(screen.getByText(/Gate staff compare this to your face at entry/)).toBeTruthy();
  });

  /**
   * The screen is reached from a ticket, so it leaves the way it came. Nothing here defers,
   * skips or completes registration: registration finished two screens ago.
   */
  it('goes back to whatever asked for it, without touching registration', () => {
    useAuthStore.setState({ status: 'signed-in', user: emptyForeignUser() });
    mockRouter.canGoBack.mockReturnValue(true);

    renderWithProviders(<SelfieScreen />);
    fireEvent.press(screen.getByLabelText('Go back'));

    expect(mockRouter.back).toHaveBeenCalled();
    expect(screen.queryByText('Not now, browse events')).toBeNull();
    expect(useAuthStore.getState().setupDeferred).toBe(false);
  });

  /**
   * The point of the change: a selfie that has not been taken yet holds up the QR and
   * nothing else (CLAUDE.md rules 3 and 8). Someone who has filled in the form may buy.
   */
  it('is not one of the fields that gate purchase', async () => {
    const { profiled } = await signInWithoutSelfie();

    expect(profiled.selfieUploaded).toBe(false);
    expect(profiled.profileComplete).toBe(true);
    expect(missingProfileFields(profiled)).toEqual([]);
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
    expect(screen.getByText('23–24 Oct 2026 · El Gouna, Egypt')).toBeTruthy();
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
    expect(screen.getByText('23–24 October 2026 · El Gouna')).toBeTruthy();
    expect(screen.getByText(/flagship festival returns to the desert/)).toBeTruthy();
    expect(screen.getByText('Venue')).toBeTruthy();
    // The mock venue's name and address are the same string, so the card shows it twice.
    expect(screen.getAllByText('El Gouna, Egypt').length).toBeGreaterThan(0);
    expect(screen.getByText('From')).toBeTruthy();
    expect(screen.getByText('950.00 EGP')).toBeTruthy();
    expect(screen.getByText('Get tickets')).toBeTruthy();
    // VAT is added at checkout for this event, so nothing claims the price includes it.
    expect(screen.queryByText('Prices include VAT')).toBeNull();
  });

  it('says the from-price includes VAT when the event prices that way', async () => {
    eventDetails[TULUA_ID]!.vatInclusive = true;
    mockParams.slug = 'tulua';
    await signInAndComplete();
    renderWithProviders(<EventDetailScreen />);

    await waitFor(() => expect(screen.getByText('950.00 EGP')).toBeTruthy());
    expect(screen.getByText('Prices include VAT')).toBeTruthy();
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
    mockParams.eventId = SOUND_BATH_ID;
    await signInAndComplete();
    useCheckoutStore.getState().start(SOUND_BATH_ID, TIER_SOUND_GA);
    useCheckoutStore.getState().setQuantity(2);

    renderWithProviders(<ChoosePassScreen />);

    await waitFor(() => expect(screen.getByText('Choose your pass')).toBeTruthy());
    // One pass on sale: the original screen, a pass and a quantity.
    expect(screen.getByText('General Admission')).toBeTruthy();
    expect(screen.getByText('Quantity')).toBeTruthy();
    // Once on the tier row, once against the stepper as what each ticket costs.
    expect(screen.getAllByText('450.00 EGP').length).toBe(2);
    expect(screen.getByText('Each')).toBeTruthy();
    // 450 × 2 is the server's sum to make, and it has nothing to price yet.
    expect(screen.queryByText('900.00 EGP')).toBeNull();
    expect(screen.queryByText('Subtotal')).toBeNull();
    expect(screen.queryByText('Prices include VAT')).toBeNull();
  });

  it('gives each pass its own count when several are on sale, for a group mixing passes', async () => {
    mockParams.eventId = TULUA_ID;
    await signInAndComplete();
    useCheckoutStore.getState().start(TULUA_ID, TIER_WEEKEND);

    renderWithProviders(<ChoosePassScreen />);

    // Tulua sells extras, so its checkout is four steps (P0.1 decision #10).
    await waitFor(() => expect(screen.getByText('Checkout · step 1 of 4')).toBeTruthy());
    expect(screen.getByText('Day 1 & 2')).toBeTruthy();
    expect(screen.queryByText('Quantity')).toBeNull();

    fireEvent.press(screen.getByLabelText('One more Full Weekend Pass'));
    fireEvent.press(screen.getByLabelText('One more Day 1 Pass'));
    expect(useCheckoutStore.getState()).toMatchObject({
      tierId: TIER_WEEKEND,
      quantity: 3,
      otherTiers: { [TIER_DAY1]: 1 },
    });
    // The group is priced by the server as a whole: 3,200 + 950 at 15%.
    await waitFor(() => expect(screen.getByText('You save 622.50 EGP')).toBeTruthy());
  });

  /** A buyer with no Tulua ticket of their own (the seeded one holds one). */
  function holdsNoTickets() {
    return jest.spyOn(mockApi.tickets, 'list').mockResolvedValue({
      data: [],
      meta: { limit: 50, hasNextPage: false, nextCursor: null },
    });
  }

  it("asks for an adult's pass beside children's passes, and offers no friend to add", async () => {
    mockParams.eventId = TULUA_ID;
    await signInAndComplete();
    // Buying their own ticket, so a child's pass alone cannot go on.
    const tickets = holdsNoTickets();
    useCheckoutStore.getState().start(TULUA_ID, TIER_WEEKEND);

    renderWithProviders(<ChoosePassScreen />);
    await waitFor(() => expect(screen.getByLabelText('One more Kids Weekend Pass')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('One more Kids Weekend Pass'));
    fireEvent.press(screen.getByLabelText('One fewer Full Weekend Pass'));

    expect(
      screen.getByText("Children's passes come with an adult. Add a pass for yourself too."),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    expect(screen.queryByTestId('group-offer')).toBeNull();
    tickets.mockRestore();
  });

  it('lets someone who already holds a ticket buy a child pass alone, for their child', async () => {
    mockParams.eventId = TULUA_ID;
    await signInAndComplete();
    useCheckoutStore.getState().start(TULUA_ID, TIER_WEEKEND);

    renderWithProviders(<ChoosePassScreen />);
    await waitFor(() => expect(screen.getByLabelText('One more Kids Weekend Pass')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('One more Kids Weekend Pass'));
    fireEvent.press(screen.getByLabelText('One fewer Full Weekend Pass'));

    // Their own ticket is the adult the child comes with.
    expect(screen.queryByText(/Children's passes come with an adult/)).toBeNull();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Continue' })).not.toBeDisabled(),
    );
  });

  it('invites a bigger group with the next discount step, and adds the friends it needs', async () => {
    mockParams.eventId = TULUA_ID;
    await signInAndComplete();
    const tickets = holdsNoTickets();
    useCheckoutStore.getState().start(TULUA_ID, TIER_WEEKEND);

    renderWithProviders(<ChoosePassScreen />);

    await waitFor(() => expect(screen.getByTestId('group-offer')).toBeTruthy());
    expect(screen.getByText('For a limited time, bring 2 friends and get 15% off')).toBeTruthy();
    fireEvent.press(screen.getByText('Add 2 friends'));
    expect(useCheckoutStore.getState().quantity).toBe(3);
    expect(screen.getByText('15% off unlocked')).toBeTruthy();
    tickets.mockRestore();
  });

  it('captions the tiers once when the event prices include VAT', async () => {
    eventDetails[TULUA_ID]!.vatInclusive = true;
    mockParams.eventId = TULUA_ID;
    await signInAndComplete();
    useCheckoutStore.getState().start(TULUA_ID, TIER_WEEKEND);

    renderWithProviders(<ChoosePassScreen />);

    await waitFor(() => expect(screen.getByText('Full Weekend Pass')).toBeTruthy());
    expect(screen.getAllByText('Prices include VAT')).toHaveLength(1);
  });

  it('shows no caption when the event does not charge VAT at all', async () => {
    eventDetails[TULUA_ID]!.vatInclusive = true;
    eventDetails[TULUA_ID]!.vatEnabled = false;
    try {
      mockParams.eventId = TULUA_ID;
      await signInAndComplete();
      useCheckoutStore.getState().start(TULUA_ID, TIER_WEEKEND);

      renderWithProviders(<ChoosePassScreen />);

      await waitFor(() => expect(screen.getByText('Full Weekend Pass')).toBeTruthy());
      expect(screen.queryByText('Prices include VAT')).toBeNull();
    } finally {
      eventDetails[TULUA_ID]!.vatEnabled = true;
    }
  });
});

describe('09 Guests', () => {
  /** A row on "Who's coming?", by its label ("Friend 1", "Child 1"). */
  const person = (label: string) => screen.getByTestId(`person-${label}`);
  /** Types a friend's full name and national number into their row. */
  function fillFriend(label: string, name: string, digits: string) {
    fireEvent.changeText(within(person(label)).getByLabelText(`${label} full name`), name);
    fireEvent.changeText(within(person(label)).getByPlaceholderText(/\d/), digits);
  }

  it('lists you first, read only, then a name and number for each friend', async () => {
    mockParams.eventId = SOUND_BATH_ID;
    await signInAndComplete();
    useCheckoutStore.getState().start(SOUND_BATH_ID, TIER_SOUND_GA);
    useCheckoutStore.getState().setQuantity(2);

    renderWithProviders(<GuestsScreen />);

    expect(await screen.findByText("Who's coming?")).toBeTruthy();
    expect(screen.getByText('You')).toBeTruthy();
    expect(screen.getByText('Yasmin El Sayed')).toBeTruthy();
    expect(screen.getByTestId('person-Friend 1')).toBeTruthy();
    expect(screen.queryByTestId('person-Friend 2')).toBeNull();
    expect(
      screen.getByText(
        'A full name and WhatsApp number for each of the 2 tickets. Tickets arrive on WhatsApp.',
      ),
    ).toBeTruthy();
  });

  it('asks for every name and number, and refuses your own number or a repeat', async () => {
    mockParams.eventId = SOUND_BATH_ID;
    await signInAndComplete();
    useCheckoutStore.getState().start(SOUND_BATH_ID, TIER_SOUND_GA);
    useCheckoutStore.getState().setQuantity(3);

    renderWithProviders(<GuestsScreen />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Continue' })).not.toBeDisabled(),
    );
    fireEvent.press(screen.getByText('Continue'));

    expect(screen.getByText('Fill in a full name and WhatsApp number for everyone.')).toBeTruthy();
    expect(screen.getAllByText('Enter their full name')).toHaveLength(2);
    expect(mockRouter.push).not.toHaveBeenCalled();

    const own = useAuthStore.getState().user!.phoneNumber.replace('+20', '');
    fillFriend('Friend 1', 'Ali Hassan', own);
    fillFriend('Friend 2', 'Mona Adel', '1022334455');
    fireEvent.press(screen.getByText('Continue'));
    expect(screen.getByText(messageForCode('GUEST_IS_BUYER'))).toBeTruthy();

    fillFriend('Friend 1', 'Ali Hassan', '1022334455');
    fireEvent.press(screen.getByText('Continue'));
    expect(screen.getByText(messageForCode('GUEST_DUPLICATE'))).toBeTruthy();
  });

  /**
   * An event with nothing to sell alongside a ticket has no extras step, so guests lead
   * straight to review (P0.1 decision #10, collapse to 3 steps).
   */
  it('builds the cart with every friend by name and skips extras for an event that sells none', async () => {
    mockParams.eventId = SOUND_BATH_ID;
    await signInAndComplete();
    expect(await mockApi.addons.list(SOUND_BATH_ID)).toEqual([]);
    useCheckoutStore.getState().start(SOUND_BATH_ID, TIER_SOUND_GA);
    useCheckoutStore.getState().setQuantity(2);
    const replace = jest.spyOn(mockApi.carts, 'replaceTickets');

    renderWithProviders(<GuestsScreen />);
    await waitFor(() => expect(screen.getByText('Checkout · step 2 of 3')).toBeTruthy());
    fillFriend('Friend 1', 'Nour Hassan', '1022334455');
    fireEvent.press(screen.getByText('Continue'));

    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith(`/checkout/review?eventId=${SOUND_BATH_ID}`),
    );
    expect(replace).toHaveBeenCalledWith(expect.any(String), {
      buyerTierId: TIER_SOUND_GA,
      items: [{ tierId: TIER_SOUND_GA, quantity: 2 }],
      guests: [{ phoneNumber: '+201022334455', name: 'Nour Hassan', tierId: TIER_SOUND_GA }],
    });
    replace.mockRestore();
  });

  it('lets a single-ticket buyer bring friends, a ticket each, or continue alone', async () => {
    mockParams.eventId = SOUND_BATH_ID;
    await signInAndComplete();
    useCheckoutStore.getState().start(SOUND_BATH_ID, TIER_SOUND_GA);

    renderWithProviders(<GuestsScreen />);
    expect(
      await screen.findByText('This ticket is yours. Add friends if they are coming.'),
    ).toBeTruthy();
    expect(screen.queryByTestId('person-Friend 1')).toBeNull();

    // The ceiling comes from the event, so the button waits for it.
    await waitFor(() => expect(screen.getByText('Bring a friend')).toBeTruthy());
    fireEvent.press(screen.getByText('Bring a friend'));
    expect(useCheckoutStore.getState().quantity).toBe(2);
    expect(screen.getByTestId('person-Friend 1')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Remove Friend 1'));
    expect(useCheckoutStore.getState().quantity).toBe(1);
    expect(screen.queryByTestId('person-Friend 1')).toBeNull();
  });

  /** One usable ticket per phone per event: a holder's tickets are all friends'. */
  it('gives every ticket to a friend when the buyer already holds one', async () => {
    mockParams.eventId = TULUA_ID;
    await signInAndComplete();
    useCheckoutStore.getState().start(TULUA_ID, TIER_WEEKEND);

    renderWithProviders(<GuestsScreen />);

    // The seeded user already holds a Tulua ticket, so their single ticket is a friend's.
    await waitFor(() => expect(screen.getByTestId('person-Friend 1')).toBeTruthy());
    expect(screen.queryByText('You')).toBeNull();
    expect(
      screen.getByText(
        'You already have a ticket, so these are all for friends. Tickets arrive on WhatsApp.',
      ),
    ).toBeTruthy();

    fillFriend('Friend 1', 'Nour Hassan', '1022334455');
    fireEvent.press(screen.getByText('Continue'));
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith(`/checkout/addons?eventId=${TULUA_ID}`),
    );
  });

  it('names the friend the server refuses, next to them', async () => {
    mockParams.eventId = SOUND_BATH_ID;
    await signInAndComplete();
    useCheckoutStore.getState().start(SOUND_BATH_ID, TIER_SOUND_GA);
    useCheckoutStore.getState().setQuantity(2);
    const validate = jest.spyOn(mockApi.orders, 'validateGuests').mockResolvedValue({
      valid: false,
      issues: [{ guestIndex: 0, error: 'GUEST_ALREADY_HAS_TICKET' }],
    });

    renderWithProviders(<GuestsScreen />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Continue' })).not.toBeDisabled(),
    );
    fillFriend('Friend 1', 'Nour Hassan', '1022334455');
    fireEvent.press(screen.getByText('Continue'));

    await waitFor(() =>
      expect(
        within(person('Friend 1')).getByText(messageForCode('GUEST_ALREADY_HAS_TICKET')),
      ).toBeTruthy(),
    );
    expect(mockRouter.push).not.toHaveBeenCalled();
    validate.mockRestore();
  });

  /** A contact picked from the phone fills the row; it is never required (rule: manual entry). */
  it('fills a friend from the phone contacts, asking which number when there are several', async () => {
    mockParams.eventId = SOUND_BATH_ID;
    contactsPermission({ status: 'granted', accessPrivileges: 'limited' });
    mockPicker.mockResolvedValue({
      firstName: 'Omar',
      lastName: 'Fathy',
      phoneNumbers: [{ number: '01555000111' }, { number: '01555000222' }],
    });
    await signInAndComplete();
    useCheckoutStore.getState().start(SOUND_BATH_ID, TIER_SOUND_GA);
    useCheckoutStore.getState().setQuantity(2);

    renderWithProviders(<GuestsScreen />);
    await screen.findByLabelText('Choose Friend 1 from contacts');
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Choose Friend 1 from contacts'));
    });
    // Nobody is filled in on the strength of a guess.
    expect(within(person('Friend 1')).getByLabelText('Friend 1 full name').props.value).toBe('');

    fireEvent.press(screen.getByText('015 55000222'));
    expect(within(person('Friend 1')).getByLabelText('Friend 1 full name').props.value).toBe(
      'Omar Fathy',
    );
  });

  /** Friends come from anywhere: a number under its own country is accepted as that country's. */
  it('takes a friend number from another country', async () => {
    mockParams.eventId = SOUND_BATH_ID;
    await signInAndComplete();
    useCheckoutStore.getState().start(SOUND_BATH_ID, TIER_SOUND_GA);
    useCheckoutStore.getState().setQuantity(2);

    renderWithProviders(<GuestsScreen />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Continue' })).not.toBeDisabled(),
    );
    fireEvent.press(within(person('Friend 1')).getByLabelText('Country: +20. Change'));
    fireEvent.changeText(screen.getByLabelText('Search country'), 'germany');
    fireEvent.press(screen.getByLabelText('Germany +49'));
    fillFriend('Friend 1', 'Lena Weber', '15112345678');
    fireEvent.press(screen.getByText('Continue'));

    await waitFor(() => expect(mockRouter.push).toHaveBeenCalled());
    expect(useCheckoutStore.getState().guests).toEqual([
      expect.objectContaining({ phoneNumber: '+4915112345678', name: 'Lena Weber' }),
    ]);
  });

  /** A converted cart's ticket save routes to payment through the stored order id. */
  it('hands a converted cart to payment instead of retrying the ticket save', async () => {
    mockParams.eventId = SOUND_BATH_ID;
    await signInAndComplete();
    useCheckoutStore.getState().start(SOUND_BATH_ID, TIER_SOUND_GA);
    useCheckoutStore.getState().setQuantity(1);
    useCheckoutStore.getState().setBuyerTakesTicket(true);
    const cart = await mockApi.carts.create(SOUND_BATH_ID);
    useCheckoutStore.getState().setCartId(cart.id);
    useCheckoutStore.getState().setOrderId('ord-99');

    const refuse = jest
      .spyOn(mockApi.carts, 'replaceTickets')
      .mockRejectedValue(Object.assign(new Error('placed'), { code: 'CART_NOT_EDITABLE' }));

    renderWithProviders(<GuestsScreen />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Continue' })).not.toBeDisabled(),
    );

    fireEvent.press(screen.getByText('Continue'));

    await waitFor(() =>
      expect(mockRouter.replace).toHaveBeenCalledWith('/checkout/payment?orderId=ord-99'),
    );
    expect(mockRouter.push).not.toHaveBeenCalled();
    refuse.mockRestore();
  });

  /**
   * Coming back through this step to fix one thing must not throw away the extras. They are
   * re-pointed at the rebuilt cart, since `PUT /tickets` makes no promise a person keeps the
   * same `cartAttendeeId`.
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
    await waitFor(() =>
      expect(within(person('Friend 1')).getByLabelText('Friend 1 full name').props.value).toBe(
        'Nour Hassan',
      ),
    );

    fireEvent.press(screen.getByText('Continue'));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalled());

    const kept = useCheckoutStore.getState().addons;
    expect(kept).toHaveLength(1);
    const after = (await mockApi.carts.get(cart.id)).attendees;
    const sameGuest = after.find((attendee) => attendee.phoneNumber === '+201022334455')!;
    expect(kept[0]!.assignments![0]!.cartAttendeeId).toBe(sameGuest.cartAttendeeId);
    const saved = await mockApi.carts.get(cart.id);
    expect(saved.addons.map((line) => line.optionId)).toEqual(['opt-dinner']);
  });

  /** Someone replaced by somebody else loses their units; everyone who stayed keeps theirs. */
  it('drops only the units belonging to a friend who was swapped out', async () => {
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
    await waitFor(() => expect(screen.getByTestId('person-Friend 2')).toBeTruthy());
    // Omar's ticket goes to somebody else.
    fillFriend('Friend 2', 'Hana Said', '1155667788');
    fireEvent.press(screen.getByText('Continue'));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalled());

    const kept = useCheckoutStore.getState().addons;
    expect(kept).toHaveLength(1);
    const after = (await mockApi.carts.get(cart.id)).attendees;
    const sameNour = after.find((a) => a.phoneNumber === '+201022334455')!;
    expect(kept[0]!.assignments).toEqual([
      { cartAttendeeId: sameNour.cartAttendeeId, quantity: 1 },
    ]);
  });

  it('puts each friend on their own pass, and adds a friend at the bottom', async () => {
    mockParams.eventId = TULUA_ID;
    await signInAndComplete();
    const store = useCheckoutStore.getState();
    store.start(TULUA_ID, TIER_WEEKEND);
    store.setQuantity(1);
    store.setOtherTierCount(TIER_DAY1, 1);
    const replace = jest.spyOn(mockApi.carts, 'replaceTickets');

    renderWithProviders(<GuestsScreen />);
    // The holder's two tickets are both friends': Friend 1 on the weekend pass, Friend 2 a day.
    await waitFor(() => expect(screen.getByText(/Day 1 Pass/)).toBeTruthy());
    fireEvent.press(screen.getByText('Add another friend'));
    expect(within(person('Friend 2')).getByText(/Day 1 Pass/)).toBeTruthy();
    expect(within(person('Friend 3')).getByText(/Full Weekend Pass/)).toBeTruthy();

    fillFriend('Friend 1', 'Ali Hassan', '1011111111');
    fillFriend('Friend 2', 'Mona Adel', '1022222222');
    fillFriend('Friend 3', 'Omar Said', '1033333333');
    fireEvent.press(screen.getByText('Continue'));

    await waitFor(() => expect(mockRouter.push).toHaveBeenCalled());
    expect(replace).toHaveBeenCalledWith(expect.any(String), {
      buyerTierId: null,
      items: [
        { tierId: TIER_WEEKEND, quantity: 2 },
        { tierId: TIER_DAY1, quantity: 1 },
      ],
      guests: [
        { phoneNumber: '+201011111111', name: 'Ali Hassan', tierId: TIER_WEEKEND },
        { phoneNumber: '+201022222222', name: 'Mona Adel', tierId: TIER_DAY1 },
        { phoneNumber: '+201033333333', name: 'Omar Said', tierId: TIER_WEEKEND },
      ],
    });
    replace.mockRestore();
  });

  /** Children (owner's call, 2026-10-11): a name and an adult to come with, no number. */
  it('asks a child only for a name and who they come with, and sends them with no number', async () => {
    mockParams.eventId = TULUA_ID;
    await signInAndComplete();
    const store = useCheckoutStore.getState();
    store.start(TULUA_ID, TIER_WEEKEND);
    store.setQuantity(1);
    store.setOtherTierCount(TIER_KIDS, 1);
    const replace = jest.spyOn(mockApi.carts, 'replaceTickets');

    renderWithProviders(<GuestsScreen />);
    await waitFor(() => expect(screen.getByTestId('person-Child 1')).toBeTruthy());
    expect(within(person('Child 1')).queryByPlaceholderText(/\d/)).toBeNull();
    expect(within(person('Child 1')).getByText('Comes with')).toBeTruthy();
    expect(screen.getByText("They come in with this adult's QR code.")).toBeTruthy();

    fillFriend('Friend 1', 'Ali Hassan', '1011111111');
    fireEvent.changeText(within(person('Child 1')).getByLabelText('Child 1 full name'), 'Lina');
    fireEvent.press(screen.getByText('Continue'));

    await waitFor(() => expect(mockRouter.push).toHaveBeenCalled());
    // The holder's own ticket is the first adult offered.
    const ownTicket = (await mockApi.tickets.list()).data.find(
      (ticket) => ticket.event.id === TULUA_ID && ticket.status === 'active',
    )!;
    expect(replace).toHaveBeenCalledWith(expect.any(String), {
      buyerTierId: null,
      items: [
        { tierId: TIER_WEEKEND, quantity: 1 },
        { tierId: TIER_KIDS, quantity: 1 },
      ],
      guests: [
        { phoneNumber: '+201011111111', name: 'Ali Hassan', tierId: TIER_WEEKEND },
        { name: 'Lina', tierId: TIER_KIDS, child: true, guardianTicketId: ownTicket.id },
      ],
    });
    replace.mockRestore();
  });

  it('shows the group saving as friends are added, in the server figures', async () => {
    mockParams.eventId = TULUA_ID;
    await signInAndComplete();
    useCheckoutStore.getState().start(TULUA_ID, TIER_WEEKEND);
    useCheckoutStore.getState().setQuantity(3);

    renderWithProviders(<GuestsScreen />);
    // Three weekend passes: 15% of 4,800.
    await waitFor(() =>
      expect(screen.getByText('15% group discount: you save 720.00 EGP')).toBeTruthy(),
    );
  });
});

describe('10 Review & pay', () => {
  /** Three guests' tickets reach the first step: 15% off the tickets, in place of a promo. */
  async function groupOfThree(promo?: string) {
    mockParams.eventId = TULUA_ID;
    await signInAndComplete();
    useCheckoutStore.getState().start(TULUA_ID, TIER_WEEKEND);
    useCheckoutStore.getState().setQuantity(3);
    useCheckoutStore.getState().setBuyerTakesTicket(false);
    const cart = await startCartCheckout({
      eventId: TULUA_ID,
      buyerTierId: null,
      items: [{ tierId: TIER_WEEKEND, quantity: 1 }],
      guests: [{ phoneNumber: '+201022334455', name: 'Nour Hassan', tierId: TIER_WEEKEND }],
    });
    if (promo) {
      await mockApi.carts.applyPromo(cart.id, promo);
      useCheckoutStore.getState().setPromoCode(promo);
    }
    await mockApi.carts.replaceTickets(cart.id, {
      buyerTierId: null,
      items: [{ tierId: TIER_WEEKEND, quantity: 3 }],
      guests: [
        { phoneNumber: '+201022334455', name: 'Nour Hassan', tierId: TIER_WEEKEND },
        { phoneNumber: '+201033445566', name: 'Omar Fathy', tierId: TIER_WEEKEND },
        { phoneNumber: '+201044556677', name: 'Hana Said', tierId: TIER_WEEKEND },
      ],
    });
  }

  it('shows the group discount where a promo would be, and no promo field', async () => {
    await groupOfThree();
    renderWithProviders(<ReviewScreen />);

    await waitFor(() => expect(screen.getByText('Full Weekend Pass × 3')).toBeTruthy());
    // 15% of 4,800, off the tickets only; VAT on what is left: 4,080 × 14%.
    expect(screen.getByText('Group discount · 15% off')).toBeTruthy();
    expect(screen.getByText('−720.00 EGP')).toBeTruthy();
    expect(screen.getByText('571.20 EGP')).toBeTruthy();
    expect(screen.getByText('4,651.20 EGP')).toBeTruthy();
    expect(screen.getByText('15% group discount applied')).toBeTruthy();
    expect(screen.queryByLabelText('Promo code')).toBeNull();
  });

  it('says the group discount replaced a code the buyer had applied', async () => {
    const promo = Object.keys(promoCodes)[0]!;
    await groupOfThree(promo);
    renderWithProviders(<ReviewScreen />);

    await waitFor(() =>
      expect(screen.getByText(`Your group discount applies instead of ${promo}.`)).toBeTruthy(),
    );
    expect(useCheckoutStore.getState().promoCode).toBeNull();
  });

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
   * An event whose prices include VAT is charged the prices it shows. The owner's call: the
   * buyer is told the total includes VAT and nothing more, so there is no VAT row and no VAT
   * amount anywhere, only a note under the server's total.
   */
  it('shows an inclusive total with an "Includes VAT" note and no VAT row or amount', async () => {
    eventDetails[TULUA_ID]!.vatInclusive = true;
    mockParams.eventId = TULUA_ID;
    await signInAndComplete();
    useCheckoutStore.getState().start(TULUA_ID, TIER_WEEKEND);
    useCheckoutStore.getState().setQuantity(2);
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

    await waitFor(() => expect(screen.getByText('Full Weekend Pass × 2')).toBeTruthy());
    expect(screen.getByText('Total')).toBeTruthy();
    expect(screen.getByText('Includes VAT')).toBeTruthy();
    // The ticket line, the subtotal and the total: the server charges exactly the prices shown.
    expect(screen.getAllByText('3,200.00 EGP')).toHaveLength(3);
    expect(screen.queryByText('VAT (14%)')).toBeNull();
    // The server's informational VAT (392.98 inside 3,200.00) is never shown to the buyer.
    expect(screen.queryByText('392.98 EGP')).toBeNull();
    expect(screen.queryByText('3,648.00 EGP')).toBeNull();
  });

  it('keeps the additive VAT row and no inclusive note for an event that adds VAT', async () => {
    mockParams.eventId = TULUA_ID;
    await signInAndComplete();
    useCheckoutStore.getState().start(TULUA_ID, TIER_WEEKEND);
    useCheckoutStore.getState().setBuyerTakesTicket(false);
    await startCartCheckout({
      eventId: TULUA_ID,
      buyerTierId: null,
      items: [{ tierId: TIER_WEEKEND, quantity: 1 }],
      guests: [{ phoneNumber: '+201022334455', name: 'Nour Hassan', tierId: TIER_WEEKEND }],
    });

    renderWithProviders(<ReviewScreen />);

    await waitFor(() => expect(screen.getByText('1,824.00 EGP')).toBeTruthy());
    expect(screen.getByText('VAT (14%)')).toBeTruthy();
    expect(screen.queryByText('Includes VAT')).toBeNull();
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

  /**
   * Cancelling the card sheet leaves the order `awaiting_payment`, holding the event's
   * capacity, so placing a second one is refused. A tester hit exactly this on production and
   * got "Something went wrong. Try again." with no way forward until the hold lapsed: the
   * backend refuses with `CART_ACTIVE_ORDER_EXISTS`, which the app did not map at all, and
   * whose whole point is the order id it carries. The buyer is sent to finish the order they
   * already have.
   */
  it('shows the held order when a cancelled payment is tried again', async () => {
    await signInAndComplete();
    await placeOrderViaCart({
      eventId: TULUA_ID,
      buyerTierId: null,
      items: [{ tierId: TIER_WEEKEND, quantity: 1 }],
      guests: [{ phoneNumber: '+201022334455', name: 'Nour Hassan', tierId: TIER_WEEKEND }],
    });

    // A second cart for the same event, which is what the screen builds after a cancel.
    await startCartCheckout({
      eventId: TULUA_ID,
      buyerTierId: null,
      items: [{ tierId: TIER_WEEKEND, quantity: 1 }],
      guests: [{ phoneNumber: '+201022334455', name: 'Nour Hassan', tierId: TIER_WEEKEND }],
    });
    useCheckoutStore.getState().setTermsAccepted(true);

    renderWithProviders(<ReviewScreen />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Continue to payment' })).not.toBeDisabled(),
    );

    // The Paymob mocks are shared across this file, so only calls from here on count.
    mockPaymob.presentPayVC!.mockClear();
    fireEvent.press(screen.getByText('Continue to payment'));

    // The held order is shown with its own lines, to pay as it is or cancel: never paid silently.
    await waitFor(() =>
      expect(screen.getByText('You have an unpaid order for this event')).toBeTruthy(),
    );
    // Never the dead end the tester saw, and no second sheet for a second order.
    expect(screen.queryByText('Something went wrong. Try again.')).toBeNull();
    expect(mockPaymob.presentPayVC!).not.toHaveBeenCalled();

    fireEvent.press(screen.getByText('Pay for that order instead'));
    expect(mockRouter.replace).toHaveBeenCalledWith(
      expect.stringContaining('/checkout/payment?orderId='),
    );
  });

  /** Once placed, no cart edit is offered and every way out leads to payment. */
  it('stops offering cart edits once the order has been placed', async () => {
    mockParams.eventId = TULUA_ID;
    await signInAndComplete();
    useCheckoutStore.getState().start(TULUA_ID, TIER_WEEKEND);
    useCheckoutStore.getState().setQuantity(1);
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

    const place = jest.spyOn(mockApi.carts, 'placeOrder');
    renderWithProviders(<ReviewScreen />);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Continue to payment' })).not.toBeDisabled(),
    );
    expect(screen.getByLabelText('Promo code')).toBeTruthy();

    fireEvent.press(screen.getByText('Continue to payment'));

    await waitFor(() => expect(useCheckoutStore.getState().orderId).toBeTruthy());
    const orderId = useCheckoutStore.getState().orderId!;

    await waitFor(() => expect(screen.queryByLabelText('Promo code')).toBeNull());
    expect(screen.queryByText('Apply')).toBeNull();

    fireEvent.press(screen.getByText('Continue to payment'));
    await waitFor(() =>
      expect(mockRouter.replace).toHaveBeenCalledWith(`/checkout/payment?orderId=${orderId}`),
    );
    expect(place).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByLabelText('Go back'));
    expect(mockRouter.back).not.toHaveBeenCalled();

    place.mockRestore();
  });

  /** A resolved failure hands off to payment rather than growing a retry flow here. */
  it('hands a resolved sheet failure to the payment screen', async () => {
    mockParams.eventId = TULUA_ID;
    await signInAndComplete();
    useCheckoutStore.getState().start(TULUA_ID, TIER_WEEKEND);
    useCheckoutStore.getState().setQuantity(1);
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

    // The bank declines it: the simulated webhook fails the order as soon as it is asked.
    mockConfig.paymentOutcome = 'failed';
    const settleDelay = mockConfig.settleDelayMs;
    mockConfig.settleDelayMs = 0;

    renderWithProviders(<ReviewScreen />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Continue to payment' })).not.toBeDisabled(),
    );

    fireEvent.press(screen.getByText('Continue to payment'));
    await waitFor(() => expect(useCheckoutStore.getState().orderId).toBeTruthy());
    const orderId = useCheckoutStore.getState().orderId!;

    const listener = mockPaymob.setSdkListener!.mock.calls.at(-1)?.[0] as (r: unknown) => void;
    act(() => listener({ status: 'Fail' }));

    await waitFor(() =>
      expect(mockRouter.replace).toHaveBeenCalledWith(`/checkout/payment?orderId=${orderId}`),
    );
    mockConfig.settleDelayMs = settleDelay;
  });

  /**
   * A buyer stuck on the bank's verification page closes the sheet with X, and the sheet says
   * CANCELLED over a payment the bank may still confirm. Review must not tell them nothing was
   * charged: it checks the server first, and hands the still-pending order to the payment
   * screen, which says it is checking with the bank.
   */
  it('checks the server after a cancel, and never says nothing was charged over a pending payment', async () => {
    mockParams.eventId = TULUA_ID;
    await signInAndComplete();
    useCheckoutStore.getState().start(TULUA_ID, TIER_WEEKEND);
    useCheckoutStore.getState().setQuantity(1);
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
    mockConfig.paymentOutcome = 'stuck';
    const status = jest.spyOn(mockApi.payments, 'status');

    renderWithProviders(<ReviewScreen />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Continue to payment' })).not.toBeDisabled(),
    );

    fireEvent.press(screen.getByText('Continue to payment'));
    await waitFor(() => expect(useCheckoutStore.getState().orderId).toBeTruthy());
    const orderId = useCheckoutStore.getState().orderId!;
    const callsBeforeVerdict = status.mock.calls.length;

    const listener = mockPaymob.setSdkListener!.mock.calls.at(-1)?.[0] as (r: unknown) => void;
    act(() => listener({ status: 'Cancelled' }));

    await waitFor(() =>
      expect(mockRouter.replace).toHaveBeenCalledWith(`/checkout/payment?orderId=${orderId}`),
    );
    expect(status.mock.calls.length).toBeGreaterThan(callsBeforeVerdict);
    expect(screen.queryByText(/Nothing was charged/)).toBeNull();
    status.mockRestore();
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
    await payOrder(order.id);
    mockParams.orderId = order.id;

    renderWithProviders(<ConfirmationScreen />);

    await waitFor(() => expect(screen.getByText(new RegExp(`2 tickets to Tulua`))).toBeTruthy());
    expect(screen.getByText(/WhatsApp message/)).toBeTruthy();
    expect(screen.getByText('See my ticket')).toBeTruthy();
    // Nothing to be admitted with, so nothing to ask for.
    expect(screen.queryByText('We need your selfie to admit you to the event.')).toBeNull();
  });

  /**
   * The second place the selfie is asked for, and the only one that is not a ticket: a buyer
   * who kept a ticket for themselves is prompted while the purchase is still in front of
   * them. It is a prompt and not a gate, so the way past it is in the open.
   */
  it('asks a buyer who kept a ticket for a selfie, and lets them skip', async () => {
    await signInWithoutSelfie();
    const order = await placeOrderViaCart({
      eventId: SOUND_BATH_ID,
      buyerTierId: TIER_SOUND_GA,
      items: [{ tierId: TIER_SOUND_GA, quantity: 1 }],
      guests: [],
    });
    await payOrder(order.id);
    mockParams.orderId = order.id;

    renderWithProviders(<ConfirmationScreen />);

    await waitFor(() =>
      expect(screen.getByText('We need your selfie to admit you to the event.')).toBeTruthy(),
    );
    expect(screen.getByText('Take a selfie')).toBeTruthy();

    fireEvent.press(screen.getByText('Take a selfie'));
    expect(mockRouter.push).toHaveBeenCalledWith('/account/selfie');

    // Skipping goes where "See my ticket" goes: the ticket itself, or the tickets tab when
    // the list has not named it yet. Either is the screen's contract, neither is onboarding.
    fireEvent.press(screen.getByText('Not now, see my ticket'));
    expect(mockRouter.replace).toHaveBeenCalledWith(
      expect.stringMatching(/^\/ticket\/|^\/\(tabs\)\/tickets$/),
    );
  });

  /** As on the website: a room with a free spot, and a room asking for documents, each lead on. */
  it("offers the room's next steps: a roommate for its free spot, then its documents", async () => {
    await signInAndComplete();
    const cart = await mockApi.carts.create(TULUA_ID);
    const withTickets = await mockApi.carts.replaceTickets(cart.id, {
      buyerTierId: null,
      items: [{ tierId: TIER_WEEKEND, quantity: 1 }],
      guests: [{ phoneNumber: '+201022334455', name: 'Nour Hassan', tierId: TIER_WEEKEND }],
    });
    await mockApi.carts.replaceAddons(cart.id, [
      {
        optionId: 'opt-lodge-double-2',
        quantity: 1,
        // A double with one person in it: the other place is left for later.
        rooms: [{ occupants: [{ cartAttendeeId: withTickets.attendees[0]!.cartAttendeeId }] }],
      },
    ]);
    const preview = await mockApi.carts.preview(cart.id);
    const order = await mockApi.carts.placeOrder(
      cart.id,
      preview.pricing.pricingConfirmationToken!,
    );
    await payOrder(order.id);
    mockParams.orderId = order.id;

    renderWithProviders(<ConfirmationScreen />);

    await waitFor(() => expect(screen.getByText('Add a roommate')).toBeTruthy());
    expect(screen.getByText('Free spot in your room. Add a roommate any time.')).toBeTruthy();
    fireEvent.press(screen.getByText('Add a roommate'));
    expect(mockRouter.push).toHaveBeenCalledWith(`/rooms?eventId=${order.eventId}`);

    await waitFor(() => expect(screen.getByText('Upload room documents')).toBeTruthy());
    fireEvent.press(screen.getByText('Upload room documents'));
    expect(mockRouter.push).toHaveBeenCalledWith(`/accommodation?eventId=${order.eventId}`);
  });

  it('says nothing about a selfie to a buyer who already has one', async () => {
    await signInAndComplete();
    const order = await placeOrderViaCart({
      eventId: SOUND_BATH_ID,
      buyerTierId: TIER_SOUND_GA,
      items: [{ tierId: TIER_SOUND_GA, quantity: 1 }],
      guests: [],
    });
    await payOrder(order.id);
    mockParams.orderId = order.id;

    renderWithProviders(<ConfirmationScreen />);

    await waitFor(() => expect(screen.getByText('See my ticket')).toBeTruthy());
    expect(screen.queryByText('We need your selfie to admit you to the event.')).toBeNull();
    expect(screen.queryByText('Not now, see my ticket')).toBeNull();
  });

  /** "Your ticket is ready" is the server's to say: an unpaid order is still being confirmed. */
  it('says it is confirming with the bank until the server says paid', async () => {
    await signInAndComplete();
    const order = await placeOrderViaCart({
      eventId: SOUND_BATH_ID,
      buyerTierId: TIER_SOUND_GA,
      items: [{ tierId: TIER_SOUND_GA, quantity: 1 }],
      guests: [],
    });
    mockConfig.paymentOutcome = 'stuck';
    await mockApi.payments.initiate(order.id);
    mockParams.orderId = order.id;

    renderWithProviders(<ConfirmationScreen />);

    await waitFor(() =>
      expect(screen.getByText('Confirming your payment with your bank')).toBeTruthy(),
    );
    expect(screen.queryByText(/ticket is ready/)).toBeNull();
    expect(screen.queryByText(/entry pass is ready/)).toBeNull();
    expect(screen.queryByText('See my ticket')).toBeNull();
  });

  it('hands an order the server failed back to the payment screen', async () => {
    await signInAndComplete();
    const order = await placeOrderViaCart({
      eventId: SOUND_BATH_ID,
      buyerTierId: TIER_SOUND_GA,
      items: [{ tierId: TIER_SOUND_GA, quantity: 1 }],
      guests: [],
    });
    mockConfig.paymentOutcome = 'failed';
    const settleDelay = mockConfig.settleDelayMs;
    mockConfig.settleDelayMs = 0;
    await mockApi.payments.initiate(order.id);
    mockParams.orderId = order.id;

    renderWithProviders(<ConfirmationScreen />);

    await waitFor(() =>
      expect(mockRouter.replace).toHaveBeenCalledWith(`/checkout/payment?orderId=${order.id}`),
    );
    expect(screen.queryByText(/ticket is ready/)).toBeNull();
    mockConfig.settleDelayMs = settleDelay;
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

  /**
   * A guest gets the offer rather than a report on an account they do not have.
   *
   * This also still covers the original regression here: the tickets query is disabled while
   * signed out, and a disabled TanStack query reports `isPending: true` with
   * `fetchStatus: 'idle'` forever, so gating the spinner on `isPending` once left a
   * signed-out user staring at "Loading your tickets..." with no request ever in flight.
   * Nothing may spin, and "No tickets yet" is now the wrong answer too: it reads as a fault
   * to someone who has no account, and it talks past the ticket a friend may already have
   * attached to their number (CLAUDE.md rule 2).
   */
  it('offers sign-in when signed out, without spinning or reporting an empty account', async () => {
    useAuthStore.setState({ status: 'signed-out', user: null, pendingPhone: null });
    renderWithProviders(<TicketsScreen />);

    await waitFor(() => expect(screen.getByText('Your tickets live here')).toBeTruthy());
    expect(screen.getByText('Sign in')).toBeTruthy();
    expect(screen.queryByText('Loading your tickets...')).toBeNull();
    expect(screen.queryByText('No tickets yet')).toBeNull();
  });

  it('sends a guest to the number field rather than back through the welcome pitch', async () => {
    useAuthStore.setState({ status: 'signed-out', user: null, pendingPhone: null });
    renderWithProviders(<TicketsScreen />);

    fireEvent.press(await screen.findByText('Sign in'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(onboarding)/phone');
  });
});

describe('14 Entry pass', () => {
  // Inside the 12 hours before the first day of the seeded ticket (2026-10-23 13:00Z), when the
  // screen asks for a pass at all. Outside it, every ticket says the QR will show here later.
  const insideEntryWindow = Date.parse('2026-10-23T08:00:00.000Z');

  it('renders the live pass, the rotation notice and the holder details', async () => {
    await signInAndComplete();
    const { data } = await mockApi.tickets.list();
    mockParams.id = data[0]!.id;
    const now = jest.spyOn(Date, 'now').mockReturnValue(insideEntryWindow);

    try {
      renderWithProviders(<EntryPassScreen />);

      await waitFor(() => expect(screen.getByText('Tulua · live entry pass')).toBeTruthy());
      expect(screen.getByText('Full Weekend Pass')).toBeTruthy();
      expect(screen.getByText('Holder')).toBeTruthy();
      expect(screen.getByText('Yasmin El Sayed')).toBeTruthy();
      expect(screen.getByText('Venue')).toBeTruthy();
      // The pass shows the ticket's full venue string, as the design draws it.
      expect(screen.getByText('El Gouna, Egypt')).toBeTruthy();
      // The mock's pass lives 30s and is refetched 3s before it expires; the clock is frozen.
      await waitFor(() => expect(screen.getByText('Refreshes in 27s')).toBeTruthy());
      expect(screen.queryByText('QR Code will show here.')).toBeNull();
    } finally {
      now.mockRestore();
    }
  });

  /*
   * Before the window, which is where a holder almost always is, the screen does not ask for a
   * pass at all. It says when the code will appear instead of loading or failing.
   */
  it('does not ask for a pass before the window opens, and says when it will', async () => {
    await signInAndComplete();
    const { data } = await mockApi.tickets.list();
    mockParams.id = data[0]!.id;
    const entryPass = jest.spyOn(mockApi.tickets, 'entryPass');
    // One minute before the window opens, 12 hours ahead of the first day.
    const now = jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-23T00:59:00.000Z'));

    try {
      renderWithProviders(<EntryPassScreen />);

      await waitFor(() =>
        expect(
          screen.getByText('Your entry pass opens 12 hours before the event starts.'),
        ).toBeTruthy(),
      );
      expect(screen.getByText('QR Code will show here.')).toBeTruthy();
      expect(screen.getByText('Yasmin El Sayed')).toBeTruthy();
      expect(screen.queryByText(/Refreshes in/)).toBeNull();
      expect(screen.queryByText('Try again')).toBeNull();
      expect(entryPass).not.toHaveBeenCalled();
    } finally {
      now.mockRestore();
      entryPass.mockRestore();
    }
  });

  /*
   * An endpoint that answers but does not issue passes yet (501, 405, or an ENTRY_PASS_NOT_*
   * refusal) is not something the holder can retry, and the panel must not claim a code is
   * rotating when there is none. The same build renders the QR above as soon as it answers.
   */
  it('says the code will appear later while the endpoint is not serving a pass', async () => {
    await signInAndComplete();
    const { data } = await mockApi.tickets.list();
    mockParams.id = data[0]!.id;
    const notServing = Object.assign(new Error('Not implemented'), {
      code: 'NOT_IMPLEMENTED',
      status: 501,
    });
    const entryPass = jest.spyOn(mockApi.tickets, 'entryPass').mockRejectedValue(notServing);
    const now = jest.spyOn(Date, 'now').mockReturnValue(insideEntryWindow);

    try {
      renderWithProviders(<EntryPassScreen />);

      await waitFor(() =>
        expect(
          screen.getByText('The entry pass is not available yet. Try again closer to the event.'),
        ).toBeTruthy(),
      );
      expect(entryPass).toHaveBeenCalled();
      expect(screen.getByText('QR Code will show here.')).toBeTruthy();
      expect(screen.queryByText('Try again')).toBeNull();
      expect(screen.queryByText(/Refreshes in/)).toBeNull();
      // The ticket's own details still belong on the screen.
      expect(screen.getByText('Yasmin El Sayed')).toBeTruthy();
    } finally {
      now.mockRestore();
      entryPass.mockRestore();
    }
  });

  /**
   * The one place the selfie is asked for (CLAUDE.md rule 3). The ticket says why its QR is
   * not showing and hands over the camera; nothing earlier in the app does either.
   */
  it('demands the selfie only once the QR it protects can open', async () => {
    await signInWithoutSelfie();
    const { data } = await mockApi.tickets.list();
    expect(data[0]!.usageStatus).toBe('selfie_required');
    mockParams.id = data[0]!.id;
    // Inside the 12 hours before the first day of the seeded ticket (2026-10-23 13:00Z).
    const now = jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-23T08:00:00.000Z'));

    try {
      renderWithProviders(<EntryPassScreen />);

      // The demand sits inside the QR panel, where the code would be, rather than replacing it.
      await waitFor(() =>
        expect(screen.getByText('Take a selfie to activate your QR Code')).toBeTruthy(),
      );
      expect(screen.getByText('Tulua · ticket status')).toBeTruthy();
      expect(screen.queryByText(/This code regenerates every ~/)).toBeNull();
      expect(screen.queryByText('QR Code will show here.')).toBeNull();

      fireEvent.press(screen.getByText('Take selfie'));
      expect(mockRouter.push).toHaveBeenCalledWith('/account/selfie');
    } finally {
      now.mockRestore();
    }
  });

  it('only offers the selfie while the QR is still days away', async () => {
    await signInWithoutSelfie();
    const { data } = await mockApi.tickets.list();
    mockParams.id = data[0]!.id;
    const now = jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-01T08:00:00.000Z'));

    try {
      renderWithProviders(<EntryPassScreen />);

      await waitFor(() => expect(screen.getByText('QR Code will show here.')).toBeTruthy());
      expect(screen.getByText(/It needs your selfie, so add it any time before then/)).toBeTruthy();
      expect(screen.queryByText('Take a selfie to activate your QR Code')).toBeNull();

      fireEvent.press(screen.getByText('Add selfie now'));
      expect(mockRouter.push).toHaveBeenCalledWith('/account/selfie?next=back');
    } finally {
      now.mockRestore();
    }
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
    const now = jest.spyOn(Date, 'now').mockReturnValue(insideEntryWindow);

    try {
      renderWithProviders(<EntryPassScreen />);

      await waitFor(() =>
        expect(
          screen.getByText('Something went wrong on our side. Try again in a moment.'),
        ).toBeTruthy(),
      );
      expect(screen.getByText('Try again')).toBeTruthy();
      expect(screen.queryByText('QR Code will show here.')).toBeNull();
      expect(screen.queryByText(/Refreshes in/)).toBeNull();
    } finally {
      now.mockRestore();
      entryPass.mockRestore();
    }
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
    // Nothing to resume: this account is complete.
    expect(screen.queryByText(/Finish setup/)).toBeNull();
  });

  /**
   * A guest is shown what an account is for, not a hollow one. The rows would otherwise offer
   * to edit a profile that does not exist and to sign out of nothing, and a zero ticket count
   * reads as data lost rather than data absent. Legal stays reachable either way.
   */
  it('offers sign-in to a guest instead of an empty account', () => {
    useAuthStore.setState({ status: 'signed-out', user: null });
    renderWithProviders(<ProfileTabScreen />);

    expect(screen.getByText('Sign in to Sukun')).toBeTruthy();
    expect(screen.getByText('Privacy policy & terms')).toBeTruthy();
    expect(screen.queryByText('Edit profile')).toBeNull();
    expect(screen.queryByText('Sign out')).toBeNull();
    expect(screen.queryByText('Delete account')).toBeNull();
    expect(screen.queryByText('Your profile')).toBeNull();
  });

  /**
   * The only route back into a registration the user stepped out of, now that the launch
   * redirect lets them past it. It names what is outstanding, so the cost of having skipped
   * is legible from the one screen they will come looking for it on.
   */
  it('carries the way back into an unfinished registration', () => {
    useAuthStore.setState({
      status: 'signed-in',
      user: { ...emptyForeignUser(), fullName: 'Yasmin El Sayed' },
      setupDeferred: true,
    });
    renderWithProviders(<ProfileTabScreen />);

    fireEvent.press(screen.getByText(/Finish setup/));
    expect(mockRouter.push).toHaveBeenCalledWith('/(onboarding)/profile');
  });

  /**
   * Profile does not nag about the selfie. It is not an unfinished registration and it does
   * not gate anything this screen offers: the one ticket that needs it asks for it itself.
   */
  it('offers a missing selfie as optional, for the QR code, not as unfinished setup', async () => {
    await signInAndComplete();
    useAuthStore.setState({
      user: { ...useAuthStore.getState().user!, selfieUploaded: false, selfieUrl: null },
    });
    renderWithProviders(<ProfileTabScreen />);

    expect(screen.queryByText(/Finish setup/)).toBeNull();
    fireEvent.press(screen.getByText('Add your selfie for your QR code'));
    expect(mockRouter.push).toHaveBeenCalledWith('/account/selfie?next=back');
  });

  it('says nothing about the selfie once there is one', async () => {
    await signInAndComplete();
    useAuthStore.setState({
      user: { ...useAuthStore.getState().user!, selfieUploaded: true },
    });
    renderWithProviders(<ProfileTabScreen />);

    expect(screen.queryByText(/selfie/i)).toBeNull();
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

/**
 * Where the app stops asking for browsing and starts asking for an account.
 *
 * It used to be the Get tickets button, which put the price of a ticket behind a sign-in: a
 * visitor could read an entire event and then be asked to register to find out what it cost.
 * The gate now sits on the Continue out of the pass step, which is the first thing that needs
 * the backend for anything (it creates the cart), and everything before it is public data.
 */
describe('08 Choose your pass · the account gate', () => {
  it('lets a visitor with no account read every tier and price', async () => {
    mockParams.eventId = TULUA_ID;
    useCheckoutStore.getState().start(TULUA_ID, TIER_WEEKEND);

    renderWithProviders(<ChoosePassScreen />);

    await waitFor(() => expect(screen.getByText('Choose your pass')).toBeTruthy());
    expect(screen.getByText('Full Weekend Pass')).toBeTruthy();
    expect(screen.getByText('Day 1 Pass')).toBeTruthy();
    expect(screen.getAllByText('1,600.00 EGP').length).toBeGreaterThan(0);
    // Nothing was redirected away: the old gate replaced this screen with Welcome.
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('names the sign-in on the button rather than pretending to continue', async () => {
    mockParams.eventId = TULUA_ID;
    useCheckoutStore.getState().start(TULUA_ID, TIER_WEEKEND);

    renderWithProviders(<ChoosePassScreen />);

    await waitFor(() => expect(screen.getByText('Sign in to continue')).toBeTruthy());
    expect(screen.queryByText('Continue')).toBeNull();
  });

  it('remembers the event so signing in comes back to the pass, not Discover', async () => {
    mockParams.eventId = TULUA_ID;
    useCheckoutStore.getState().start(TULUA_ID, TIER_WEEKEND);

    renderWithProviders(<ChoosePassScreen />);
    await waitFor(() => expect(screen.getByText('Sign in to continue')).toBeTruthy());
    fireEvent.press(screen.getByText('Sign in to continue'));

    expect(mockRouter.push).toHaveBeenCalledWith('/(onboarding)/welcome?gate=1');
    expect(useAuthStore.getState().pendingCheckoutEventId).toBe(TULUA_ID);

    // What the end of onboarding then does with it.
    resumeAfterOnboarding(mockRouter as never);
    expect(mockRouter.replace).toHaveBeenCalledWith(`/checkout/pass?eventId=${TULUA_ID}`);
    // Used once: a later sign-in must not be dragged back into this checkout.
    expect(useAuthStore.getState().pendingCheckoutEventId).toBeNull();
  });

  it('asks a signed-in account with an unfinished profile for the profile, not a sign-in', async () => {
    mockParams.eventId = TULUA_ID;
    useAuthStore.setState({ status: 'signed-in', user: emptyForeignUser() });
    useCheckoutStore.getState().start(TULUA_ID, TIER_WEEKEND);

    renderWithProviders(<ChoosePassScreen />);

    await waitFor(() => expect(screen.getByText('Finish your profile to continue')).toBeTruthy());
    fireEvent.press(screen.getByText('Finish your profile to continue'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(onboarding)/profile');
  });

  it('still sends a visitor to Welcome where the guest path is switched off', async () => {
    mockParams.eventId = TULUA_ID;
    useFlagsStore.setState({ status: 'ready', allowGuestBrowsing: false });
    useCheckoutStore.getState().start(TULUA_ID, TIER_WEEKEND);

    renderWithProviders(<ChoosePassScreen />);

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/(onboarding)/welcome'));
    expect(screen.queryByText('Full Weekend Pass')).toBeNull();
  });

  it('takes a visitor from the event straight to the passes', async () => {
    mockParams.slug = 'tulua';

    renderWithProviders(<EventDetailScreen />);

    await waitFor(() => expect(screen.getByText('Get tickets')).toBeTruthy());
    fireEvent.press(screen.getByText('Get tickets'));

    expect(mockRouter.push).toHaveBeenCalledWith(`/checkout/pass?eventId=${TULUA_ID}`);
    expect(mockRouter.push).not.toHaveBeenCalledWith('/(onboarding)/welcome?gate=1');
  });
});

/**
 * On 24 Sep 2026 a buyer whose card was declined in the Paymob sheet had nothing that worked
 * for the rest of the hold. The order was still awaiting payment with a failed attempt, which
 * this screen counted as finished: Pay was disabled, "Try payment again" was sent to a refusal,
 * and the cancel that would have freed them was hidden.
 */
const CHECKING_WITH_BANK =
  "We're checking with your bank. If you were charged, your ticket will appear here automatically.";

describe('11 Payment after a declined card', () => {
  const placeTuluaOrder = async () => {
    await signInAndComplete();
    const order = await placeOrderViaCart({
      eventId: TULUA_ID,
      buyerTierId: null,
      items: [{ tierId: TIER_WEEKEND, quantity: 1 }],
      guests: [{ phoneNumber: '+201022334455', name: 'Nour Hassan', tierId: TIER_WEEKEND }],
    });
    mockParams.orderId = order.id;
    return order;
  };
  const statusIs = (partial: Record<string, unknown>) =>
    jest.spyOn(mockApi.payments, 'status').mockResolvedValue({
      orderStatus: 'awaiting_payment',
      paymentStatus: 'failed',
      ticketsIssued: 0,
      paidAt: null,
      ...partial,
    } as never);

  afterEach(() => jest.restoreAllMocks());

  it('offers a retry and a cancel for an order still awaiting payment', async () => {
    await placeTuluaOrder();
    statusIs({});
    const retry = jest.spyOn(mockApi.payments, 'retry');

    renderWithProviders(<PaymentScreen />);

    await waitFor(() => expect(screen.getByText('Try payment again')).toBeTruthy());
    expect(screen.getByText('Cancel this order')).toBeTruthy();
    expect(screen.getByText('The payment did not go through. Nothing was charged.')).toBeTruthy();

    fireEvent.press(screen.getByText('Try payment again'));
    await waitFor(() => expect(retry).toHaveBeenCalled());
  });

  it('retries a failed order through retry-payment', async () => {
    const order = await placeTuluaOrder();
    statusIs({ orderStatus: 'failed' });
    const retry = jest.spyOn(mockApi.payments, 'retry');

    renderWithProviders(<PaymentScreen />);

    await waitFor(() => expect(screen.getByText('Try payment again')).toBeTruthy());
    fireEvent.press(screen.getByText('Try payment again'));

    await waitFor(() => expect(retry).toHaveBeenCalledWith(order.id));
  });

  it('waits, rather than offering a retry, while the last attempt is still settling', async () => {
    await placeTuluaOrder();
    statusIs({ paymentStatus: 'confirming' });

    renderWithProviders(<PaymentScreen />);

    await waitFor(() => expect(screen.getByText(CHECKING_WITH_BANK)).toBeTruthy());
    expect(screen.queryByText('Try payment again')).toBeNull();
    expect(screen.queryByText('Cancel this order')).toBeNull();
  });

  /**
   * Inside the hold a pending attempt is a live intention, which initiate hands back. The buyer
   * who closed the sheet before entering a card reopens it with Pay; retry and cancel, which the
   * backend refuses over that attempt, are not offered.
   */
  it('reopens a pending intention with Pay inside the hold, and offers no retry or cancel', async () => {
    const order = await placeTuluaOrder();
    statusIs({ paymentStatus: 'pending' });
    const initiate = jest.spyOn(mockApi.payments, 'initiate');
    const retry = jest.spyOn(mockApi.payments, 'retry');

    renderWithProviders(<PaymentScreen />);

    await waitFor(() =>
      expect(
        screen.getByText('If you already finished paying, this will update by itself.'),
      ).toBeTruthy(),
    );
    expect(screen.queryByText(CHECKING_WITH_BANK)).toBeNull();
    expect(screen.queryByText('Try payment again')).toBeNull();
    expect(screen.queryByText('Cancel this order')).toBeNull();

    const pay = screen.getAllByRole('button', { name: /Pay / }).at(-1)!;
    expect(pay).not.toBeDisabled();
    fireEvent.press(pay);

    await waitFor(() => expect(initiate).toHaveBeenCalledWith(order.id));
    await waitFor(() => expect(mockPaymob.presentPayVC).toHaveBeenCalled());
    expect(retry).not.toHaveBeenCalled();
  });

  it('shows the checking copy, with nothing to tap, when initiate answers 409', async () => {
    await placeTuluaOrder();
    statusIs({ paymentStatus: 'pending' });
    jest.spyOn(mockApi.payments, 'initiate').mockRejectedValue(
      Object.assign(new Error('pending'), {
        code: 'PAYMENT_CONFIRMATION_PENDING',
        status: 409,
      }),
    );

    renderWithProviders(<PaymentScreen />);

    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /Pay / }).at(-1)).not.toBeDisabled(),
    );
    fireEvent.press(screen.getAllByRole('button', { name: /Pay / }).at(-1)!);

    await waitFor(() => expect(screen.getByText(CHECKING_WITH_BANK)).toBeTruthy());
    expect(screen.getAllByRole('button', { name: /Pay / }).at(-1)).toBeDisabled();
    expect(screen.queryByText(/still confirming your last payment attempt/)).toBeNull();
  });

  it('offers the retry once the hold has run out over a pending attempt', async () => {
    const order = await placeTuluaOrder();
    statusIs({ orderStatus: 'expired', paymentStatus: 'pending' });
    const retry = jest.spyOn(mockApi.payments, 'retry');

    renderWithProviders(<PaymentScreen />);

    await waitFor(() => expect(screen.getByText('Try payment again')).toBeTruthy());
    expect(screen.getByText('This payment hold expired. You can try again.')).toBeTruthy();
    fireEvent.press(screen.getByText('Try payment again'));
    await waitFor(() => expect(retry).toHaveBeenCalledWith(order.id));
  });

  it('reads a 409 PAYMENT_CONFIRMATION_PENDING as still confirming, not as an error', async () => {
    await placeTuluaOrder();
    statusIs({ orderStatus: 'failed' });
    jest.spyOn(mockApi.payments, 'retry').mockRejectedValue(
      Object.assign(new Error('pending'), {
        code: 'PAYMENT_CONFIRMATION_PENDING',
        status: 409,
      }),
    );

    renderWithProviders(<PaymentScreen />);

    await waitFor(() => expect(screen.getByText('Try payment again')).toBeTruthy());
    fireEvent.press(screen.getByText('Try payment again'));

    await waitFor(() => expect(screen.getByText(CHECKING_WITH_BANK)).toBeTruthy());
    expect(screen.queryByText(/still confirming your last payment attempt/)).toBeNull();
    expect(screen.queryByText('Try payment again')).toBeNull();
  });

  it("names the bank's reason when the server gives one", async () => {
    await placeTuluaOrder();
    statusIs({ orderStatus: 'failed', failureReason: 'insufficient_funds' });

    renderWithProviders(<PaymentScreen />);

    await waitFor(() =>
      expect(
        screen.getByText(
          "The card didn't have enough funds for this payment. Nothing was charged. Try another card.",
        ),
      ).toBeTruthy(),
    );
  });

  it('offers nothing for an order that was cancelled', async () => {
    await placeTuluaOrder();
    statusIs({ orderStatus: 'cancelled', paymentStatus: 'failed' });

    renderWithProviders(<PaymentScreen />);

    await waitFor(() =>
      expect(screen.getByText('This order was cancelled and cannot be paid.')).toBeTruthy(),
    );
    expect(screen.queryByText('Try payment again')).toBeNull();
    expect(screen.queryByText('Cancel this order')).toBeNull();
  });

  it('says a refused start charged nothing, and does not blame the connection', async () => {
    await placeTuluaOrder();
    statusIs({ orderStatus: 'failed' });
    jest
      .spyOn(mockApi.payments, 'retry')
      .mockRejectedValue(
        Object.assign(new Error('refused'), { code: 'PAYMENT_PROVIDER_ERROR', status: 502 }),
      );

    renderWithProviders(<PaymentScreen />);

    await waitFor(() => expect(screen.getByText('Try payment again')).toBeTruthy());
    fireEvent.press(screen.getByText('Try payment again'));

    await waitFor(() =>
      expect(
        screen.getByText('The payment could not be started. Nothing was charged. Try again.'),
      ).toBeTruthy(),
    );
  });
});

describe('19 Order receipt for an unpaid order', () => {
  it('leads back to paying an order still awaiting payment', async () => {
    const order = await (async () => {
      await signInAndComplete();
      return placeOrderViaCart({
        eventId: TULUA_ID,
        buyerTierId: null,
        items: [{ tierId: TIER_WEEKEND, quantity: 1 }],
        guests: [{ phoneNumber: '+201022334455', name: 'Nour Hassan', tierId: TIER_WEEKEND }],
      });
    })();
    mockParams.id = order.id;

    renderWithProviders(<OrderDetailScreen />);

    await waitFor(() => expect(screen.getByText('Continue to payment')).toBeTruthy());
    fireEvent.press(screen.getByText('Continue to payment'));
    expect(mockRouter.push).toHaveBeenCalledWith(`/checkout/payment?orderId=${order.id}`);
    expect(screen.getByText('Cancel order')).toBeTruthy();
  });
});
