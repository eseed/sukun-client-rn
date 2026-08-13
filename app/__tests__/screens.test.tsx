import { mockApi, mockConfig, MOCK_OTP_CODE, resetMockState } from '../../src/api/mock';
import { TIER_WEEKEND, TULUA_ID } from '../../src/api/mock/fixtures';
import { useAuthStore } from '../../src/stores/auth';
import { useCheckoutStore } from '../../src/stores/checkout';
import { renderWithProviders, screen, waitFor } from '../../src/test-utils';

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

async function signInAndComplete() {
  await mockApi.auth.requestOtp('+201012345678');
  const { user } = await mockApi.auth.verifyOtp('+201012345678', MOCK_OTP_CODE);
  await mockApi.profile.update({
    fullName: 'Yasmin El Sayed',
    email: 'yasmin@email.com',
    dateOfBirth: '1994-03-12',
    gender: 'female',
    areaId: 'ar-cairo',
  });
  const complete = await mockApi.profile.uploadSelfie('file:///selfie.jpg');
  useAuthStore.setState({ status: 'signed-in', user: complete, pendingPhone: null });
  return { user, complete };
}

beforeEach(() => {
  resetMockState();
  mockConfig.latencyMs = 0;
  for (const key of Object.keys(mockParams)) delete mockParams[key];
  mockRouter.push.mockClear();
  mockRouter.replace.mockClear();
  useAuthStore.setState({ status: 'signed-out', user: null, pendingPhone: null });
  useCheckoutStore.getState().reset();
});

describe('01 Welcome', () => {
  it('shows the wordmark lockup, tagline and CTA', () => {
    renderWithProviders(<WelcomeScreen />);
    expect(screen.getByText('Everything wellness.')).toBeTruthy();
    expect(screen.getByText("Let's move!")).toBeTruthy();
    expect(
      screen.getByText('By continuing you agree to our terms & privacy policy'),
    ).toBeTruthy();
  });
});

describe('03 Verify code', () => {
  it('shows the number the code went to, and the resend affordance', () => {
    useAuthStore.setState({ pendingPhone: '+201012345678' });
    renderWithProviders(<OtpScreen />);

    expect(screen.getByText('Step 1 of 3')).toBeTruthy();
    expect(screen.getByText('Check your texts')).toBeTruthy();
    expect(screen.getByText('+20 101 234 5678')).toBeTruthy();
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
    expect(screen.getByPlaceholderText('DD/MM/YYYY')).toBeTruthy();
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
    expect(screen.getByText('Festivals')).toBeTruthy();

    await waitFor(() => expect(screen.getByText('Tulua')).toBeTruthy());
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
  it('lists tiers with prices and a server-computed subtotal', async () => {
    mockParams.eventId = TULUA_ID;
    await signInAndComplete();
    useCheckoutStore.getState().start(TULUA_ID, TIER_WEEKEND);
    useCheckoutStore.getState().setQuantity(2);

    renderWithProviders(<ChoosePassScreen />);

    await waitFor(() => expect(screen.getByText('Choose your pass')).toBeTruthy());
    expect(screen.getByText('Checkout · step 1 of 3')).toBeTruthy();
    expect(screen.getByText('Full Weekend Pass')).toBeTruthy();
    expect(screen.getByText('1,600.00 EGP')).toBeTruthy();
    expect(screen.getByText('Day 1 & 2')).toBeTruthy();
    expect(screen.getByText('Quantity')).toBeTruthy();
    // 1,600 × 2, priced by the api rather than the screen.
    await waitFor(() => expect(screen.getByText('3,200.00 EGP')).toBeTruthy());
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
    expect(screen.getByText('You bought 2 tickets. Attach 1 guest from your contacts.')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Nour Hassan')).toBeTruthy());
    expect(screen.getByText('010 2233 4455')).toBeTruthy();
    expect(screen.getByText('0 of 1 picked')).toBeTruthy();
    expect(screen.getByText('Not in your contacts?')).toBeTruthy();
    expect(screen.getByPlaceholderText('Enter phone number')).toBeTruthy();
  });
});

describe('10 Review & pay', () => {
  it('shows server totals, VAT and the terms gate', async () => {
    mockParams.eventId = TULUA_ID;
    await signInAndComplete();
    useCheckoutStore.getState().start(TULUA_ID, TIER_WEEKEND);
    useCheckoutStore.getState().setQuantity(2);

    renderWithProviders(<ReviewScreen />);

    await waitFor(() => expect(screen.getByText('Checkout · step 3 of 3')).toBeTruthy());
    expect(screen.getByText('Review & pay')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Full Weekend Pass × 2')).toBeTruthy());
    expect(screen.getByText('3,200.00 EGP')).toBeTruthy();
    expect(screen.getByText('VAT (14%)')).toBeTruthy();
    expect(screen.getByText('Total')).toBeTruthy();
    expect(
      screen.getByText('I understand tickets are non-refundable and non-transferable.'),
    ).toBeTruthy();
    expect(screen.getByText('Continue to payment')).toBeTruthy();
  });
});

describe('11 Payment', () => {
  it('shows the Paymob amount and says card entry happens there, not here', async () => {
    await signInAndComplete();
    const order = await mockApi.orders.create({
      eventId: TULUA_ID,
      buyerTierId: TIER_WEEKEND,
      items: [{ tierId: TIER_WEEKEND, quantity: 2 }],
      guests: [{ phoneNumber: '+201022334455', name: 'Nour Hassan', tierId: TIER_WEEKEND }],
    });
    mockParams.orderId = order.id;

    renderWithProviders(<PaymentScreen />);

    await waitFor(() => expect(screen.getByText('Payment')).toBeTruthy());
    expect(screen.getByText('Secured by Paymob · charged in EGP')).toBeTruthy();
    await waitFor(() => expect(screen.getAllByText('Pay 3,648.00 EGP').length).toBe(2));
    expect(screen.getByText('Card number')).toBeTruthy();
    expect(
      screen.getByText("Card details are entered in Paymob's secure sheet, not in Sukun."),
    ).toBeTruthy();
  });

});

describe('12 Confirmation', () => {
  it('names the order and explains the guest WhatsApp message', async () => {
    await signInAndComplete();
    const order = await mockApi.orders.create({
      eventId: TULUA_ID,
      buyerTierId: TIER_WEEKEND,
      items: [{ tierId: TIER_WEEKEND, quantity: 2 }],
      guests: [{ phoneNumber: '+201022334455', name: 'Nour Hassan', tierId: TIER_WEEKEND }],
    });
    mockParams.orderId = order.id;

    renderWithProviders(<ConfirmationScreen />);

    await waitFor(() =>
      expect(screen.getByText(new RegExp(`2 tickets to Tulua`))).toBeTruthy(),
    );
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
});

describe('15 Profile', () => {
  it('shows identity, stats and the account rows', async () => {
    await signInAndComplete();
    renderWithProviders(<ProfileTabScreen />);

    expect(screen.getByText('Profile')).toBeTruthy();
    expect(screen.getByText('Yasmin El Sayed')).toBeTruthy();
    expect(screen.getByText('+20 101 234 5678')).toBeTruthy();
    expect(screen.getByText('yasmin@email.com')).toBeTruthy();
    expect(screen.getByText('Account')).toBeTruthy();
    expect(screen.getByText('Privacy policy & terms')).toBeTruthy();
    expect(screen.getByText('Delete account')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Tickets')).toBeTruthy());
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
