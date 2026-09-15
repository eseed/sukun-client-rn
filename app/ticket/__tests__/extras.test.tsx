import { mockApi, mockConfig, MOCK_OTP_CODE, resetMockState } from '../../../src/api/mock';
import { TULUA_ID } from '../../../src/api/mock/fixtures';
import { useAuthStore } from '../../../src/stores/auth';
import { useCheckoutStore } from '../../../src/stores/checkout';
import {
  act,
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from '../../../src/test-utils';

import TicketExtrasScreen from '../[id]/extras';
import TicketExtrasReviewScreen from '../[id]/review';

/**
 * Design screens 22 and 23 · buying extras against a ticket already held.
 *
 * Two screens, as the design draws them: 22 is browsing and choosing, 23 is the price and the
 * payment. The join between them is the cart, which 22 leaves in the checkout store and 23 picks
 * up and re-prices, so nothing about the money travels through navigation.
 *
 * The whole point of this flow is a cart with **no ticket lines**: everything in it attaches to
 * one existing ticket, and the buyer pays once for the extras alone. Every figure asserted below
 * is checked against the figure the api itself returns for the same basket, so a total that ever
 * starts being worked out on this side of the boundary fails here (CLAUDE.md rule 7).
 *
 * There is no iOS runtime on this machine, so this is the click-through: it is the only thing
 * that has ever exercised these screens.
 */

const mockPaymob = jest.requireMock('paymob-reactnative').default as Record<string, jest.Mock>;

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

/** The ticket `seedTickets` gives every completed profile: a Full Weekend Pass to Tulua. */
const SEEDED_TICKET_ID = 'tk-seed-1';

/**
 * A fixed clock, because the extras catalogue is priced by window.
 *
 * The dinner voucher's early-bird window closes on 1 Sep 2026, so a real clock would price it at
 * 280.00 before that date and 340.00 after. Pinning "now" past the changeover is what lets these
 * tests assert the 340.00 the artboards draw.
 */
const NOW = Date.parse('2026-09-05T09:00:00.000Z');
const realNow = mockConfig.now;

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

/**
 * The server's own price for whatever the screens have put in the cart.
 *
 * `carts.create` creates *or reuses* the buyer's draft, so this hands back the very cart the
 * screens are working in. Nothing is recomputed here: the expected figures are the api's.
 */
async function serverPricing() {
  const cart = await mockApi.carts.create(TULUA_ID);
  const preview = await mockApi.carts.preview(cart.id);
  return preview.pricing;
}

/**
 * Picks an extra by the option label the catalogue publishes.
 *
 * By card rather than by text: an addon whose only option repeats its name ("Dinner voucher")
 * puts that string on screen more than once, and the card is the thing the buyer taps.
 */
function chooseExtra(label: string) {
  const card = screen
    .getAllByRole('radio')
    .find((node) => within(node).queryByText(label) !== null);

  if (!card) throw new Error(`No extra card labelled "${label}"`);
  fireEvent.press(card);
}

/** Renders screen 22 with the seeded ticket and waits for its catalogue. */
async function renderBrowse() {
  mockParams.id = SEEDED_TICKET_ID;
  const view = renderWithProviders(<TicketExtrasScreen />);
  await waitFor(() => expect(screen.getAllByText('Dinner voucher').length).toBeGreaterThan(0));
  return view;
}

/**
 * The way a buyer actually reaches screen 23: choose on 22, then Continue.
 *
 * Continue is only live once the server has priced the basket, so waiting for it is also what
 * guarantees the cart left behind holds the selection.
 */
async function browseAndContinue(labels: string[]) {
  const view = await renderBrowse();
  for (const label of labels) chooseExtra(label);

  await waitFor(() => expect(screen.getByRole('button', { name: 'Continue' })).not.toBeDisabled(), {
    timeout: 5000,
  });
  fireEvent.press(screen.getByText('Continue'));
  view.unmount();
}

/** Screen 23, opened on the cart screen 22 left in the store. */
async function renderReview() {
  mockParams.id = SEEDED_TICKET_ID;
  renderWithProviders(<TicketExtrasReviewScreen />);
  await waitFor(() => expect(screen.getByText('Review & pay')).toBeTruthy());
}

beforeEach(() => {
  resetMockState();
  mockConfig.latencyMs = 0;
  mockConfig.now = () => NOW;
  for (const key of Object.keys(mockParams)) delete mockParams[key];
  mockRouter.push.mockClear();
  mockRouter.back.mockClear();
  mockRouter.replace.mockClear();
  mockPaymob.presentPayVC!.mockClear();
  mockPaymob.setSdkListener!.mockClear();
  useAuthStore.setState({ status: 'signed-out', user: null, pendingPhone: null });
  useCheckoutStore.getState().reset();
});

afterAll(() => {
  mockConfig.now = realNow;
});

describe('22 Add extras to this ticket', () => {
  /**
   * Artboard 22 names the ticket being added to. An account with several tickets otherwise has
   * nothing on screen saying which one this is, and the context call carries ids only.
   */
  it('names the ticket the extras attach to, and lists that event catalogue', async () => {
    await signInAndComplete();
    await renderBrowse();

    expect(screen.getByText('Add extras')).toBeTruthy();
    expect(screen.getByText('Adding to an existing ticket')).toBeTruthy();

    // The ticket, exactly as the artboard identifies it.
    await waitFor(() => expect(screen.getByText('Full Weekend Pass')).toBeTruthy());
    expect(screen.getByText('Tulua · Yasmin El Sayed · SKN-2026-000482')).toBeTruthy();

    // Tulua's catalogue, priced by the server.
    expect(screen.getByText('Desert Lodge Room')).toBeTruthy();
    expect(screen.getAllByText('Dinner voucher').length).toBeGreaterThan(0);
    expect(screen.getByText('Cairo shuttle')).toBeTruthy();
    expect(screen.getByText('340.00 EGP')).toBeTruthy();
    expect(screen.getByText('600.00 EGP')).toBeTruthy();

    // The camp tent is genuinely sold out in the fixtures, which is an explicit 0 rather than a
    // withheld count.
    expect(screen.getByText('Sold out')).toBeTruthy();

    // Nothing is chosen, so there is no footer summary and nothing to continue to.
    expect(screen.getByText('Choose an extra')).toBeTruthy();
    expect(screen.queryByText('Assigned to you')).toBeNull();
  });

  /**
   * The split this screen exists to keep: browsing is browsing. A totals card at the bottom of a
   * catalogue is neither one screen nor the other, and the buyer cannot tell when they crossed
   * from choosing into paying.
   */
  it('never turns into a checkout, however much is chosen', async () => {
    await signInAndComplete();
    await renderBrowse();
    chooseExtra('Dinner voucher');

    await waitFor(() => expect(screen.getByText('1 extra')).toBeTruthy());

    expect(screen.queryByText('Review & pay')).toBeNull();
    expect(screen.queryByText('Extras only · pay once')).toBeNull();
    expect(screen.queryByText('Total')).toBeNull();
    expect(screen.queryByText('VAT (14%)')).toBeNull();
    expect(screen.queryByLabelText('Promo code')).toBeNull();
    expect(
      screen.queryByText('I understand extras are non-refundable and are redeemed at the event.'),
    ).toBeNull();
    expect(screen.queryByText('Pay 387.60 EGP')).toBeNull();
  });

  /**
   * Artboard 22's footer: what is chosen, what it comes to, who it is for, and the way on.
   *
   * The money is the cart preview's `addonsSubtotalEgp`, taken from the server, never a sum of
   * the option prices on screen (CLAUDE.md rule 7).
   */
  it('summarises the choice from the server price, and continues to review', async () => {
    await signInAndComplete();
    await renderBrowse();
    chooseExtra('Dinner voucher');

    await waitFor(() => expect(screen.getByText('1 extra')).toBeTruthy());
    expect(screen.getByText('Assigned to you')).toBeTruthy();

    // The option's own price and the footer's, which is why there are two of them.
    await waitFor(() => expect(screen.getAllByText('340.00 EGP')).toHaveLength(2));
    const pricing = await serverPricing();
    expect(pricing.addonsSubtotalEgp).toBe('340.00');
    // The footer is the extras before tax, so the taxed total belongs to the next screen only.
    expect(screen.queryByText('387.60 EGP')).toBeNull();

    fireEvent.press(screen.getByText('Continue'));

    expect(mockRouter.push).toHaveBeenCalledWith(`/ticket/${SEEDED_TICKET_ID}/review`);
    // Screen 23 finds the basket here rather than being handed figures to trust.
    expect(useCheckoutStore.getState().cartId).toBeTruthy();
  });

  /** Two of one extra is two extras, in the plural the footer has to get right. */
  it('counts the units it is carrying', async () => {
    await signInAndComplete();
    await renderBrowse();
    chooseExtra('Round trip');

    await waitFor(() => expect(screen.getByText('1 extra')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Add one ticket'));

    await waitFor(() => expect(screen.getByText('2 extras')).toBeTruthy());
    await waitFor(() => expect(screen.getByText('1,200.00 EGP')).toBeTruthy());

    const pricing = await serverPricing();
    expect(pricing.addonsSubtotalEgp).toBe('1200.00');
  });

  /**
   * `useTicketAddonContext` is disabled while signed out, and a disabled TanStack Query v5 query
   * reports `isPending` forever. Guarding on `isPending` held this screen on its spinner with
   * nothing fetching and no way out.
   */
  it('reaches its error state signed out instead of spinning forever', async () => {
    mockParams.id = SEEDED_TICKET_ID;

    renderWithProviders(<TicketExtrasScreen />);

    await waitFor(() => expect(screen.getByText("Extras aren't available")).toBeTruthy());
    expect(screen.queryByText('Loading extras...')).toBeNull();
  });

  /** Same hang, reached the other way: a route opened without a usable ticket id. */
  it('reaches its error state without a ticket id', async () => {
    await signInAndComplete();

    renderWithProviders(<TicketExtrasScreen />);

    await waitFor(() => expect(screen.getByText("Extras aren't available")).toBeTruthy());
    expect(screen.queryByText('Loading extras...')).toBeNull();
  });

  /**
   * A price the server will not quote is said in words. A dash beside a figure reads as "free",
   * and the app may never put a number of its own there (CLAUDE.md rule 7).
   */
  it('says so in words when the server has no price for an option', async () => {
    mockParams.id = SEEDED_TICKET_ID;
    await signInAndComplete();
    // Past every price window in the catalogue, so nothing has a current price.
    mockConfig.now = () => Date.parse('2100-01-01T00:00:00.000Z');

    renderWithProviders(<TicketExtrasScreen />);

    await waitFor(() => expect(screen.getAllByText('Not priced yet').length).toBeGreaterThan(0));
    expect(screen.queryByText('—')).toBeNull();
  });

  /**
   * Two quick taps used to open two carts: the id only reached the store after the create
   * resolved, so both effects saw `null` and both created one, orphaning the first.
   */
  it('opens one cart when two extras are picked before the first create returns', async () => {
    mockParams.id = SEEDED_TICKET_ID;
    await signInAndComplete();
    // Real latency, so the second pick genuinely lands while the create is still in flight.
    mockConfig.latencyMs = 40;
    const create = jest.spyOn(mockApi.carts, 'create');

    renderWithProviders(<TicketExtrasScreen />);
    await waitFor(() => expect(screen.getAllByText('Dinner voucher').length).toBeGreaterThan(0), {
      timeout: 5000,
    });

    chooseExtra('Round trip');
    chooseExtra('One way');

    // The count comes off the selection and lands at once; the money is the server's, so waiting
    // for it is what proves both picks actually reached a cart.
    await waitFor(() => expect(screen.getByText('2 extras')).toBeTruthy(), { timeout: 5000 });
    await waitFor(() => expect(screen.getByText('950.00 EGP')).toBeTruthy(), { timeout: 5000 });
    expect(create).toHaveBeenCalledTimes(1);

    // Both picks survived the race, in one basket, and the server priced them together.
    const pricing = await serverPricing();
    expect(pricing.addonLines).toHaveLength(2);
    expect(pricing.addonsSubtotalEgp).toBe('950.00');

    create.mockRestore();
  });
});

describe('23 Extras checkout', () => {
  /** Artboard 23's framing: this is a purchase of extras alone, paid for once. */
  it('reviews the extras alone, with every figure the server sent', async () => {
    await signInAndComplete();
    await browseAndContinue(['Dinner voucher']);
    await renderReview();

    expect(screen.getByText('Extras only · pay once')).toBeTruthy();
    expect(screen.getByText('These attach to your existing Tulua ticket.')).toBeTruthy();
    // The line says who it is for, as the artboard draws it.
    expect(screen.getByText('Yasmin El Sayed')).toBeTruthy();

    const pricing = await serverPricing();

    // No ticket lines at all: that is what makes this an extras-only cart.
    expect(pricing.ticketLines).toHaveLength(0);
    expect(pricing.addonLines).toHaveLength(1);
    expect(screen.queryByText('Tickets')).toBeNull();

    // Every figure on screen is the one the api returned, not one worked out here.
    expect(pricing.addonLines[0]!.lineTotalEgp).toBe('340.00');
    expect(pricing.vatEgp).toBe('47.60');
    expect(pricing.totalEgp).toBe('387.60');
    await waitFor(() => expect(screen.getByText('340.00 EGP')).toBeTruthy());
    expect(screen.getByText('VAT (14%)')).toBeTruthy();
    expect(screen.getByText('47.60 EGP')).toBeTruthy();
    expect(screen.getByText('Total')).toBeTruthy();
    expect(screen.getByText('387.60 EGP')).toBeTruthy();

    expect(
      screen.getByText('I understand extras are non-refundable and are redeemed at the event.'),
    ).toBeTruthy();
    expect(screen.getByText('Pay 387.60 EGP')).toBeTruthy();

    // The catalogue is nowhere on this screen. Choosing happened on the screen before.
    expect(screen.queryByText('Add extras')).toBeNull();
    expect(screen.queryByText('Desert Lodge Room')).toBeNull();
  });

  /**
   * A route reached without a cart, which is also what an expired draft leaves behind.
   *
   * `useCart` is disabled without a cart id and reports `isPending` forever, so the cart is
   * checked before any loading guard: guarding the other way round hangs the screen on a spinner
   * nothing will ever resolve.
   */
  it('says the checkout expired rather than hanging when there is no cart', async () => {
    mockParams.id = SEEDED_TICKET_ID;
    await signInAndComplete();
    expect(useCheckoutStore.getState().cartId).toBeNull();

    renderWithProviders(<TicketExtrasReviewScreen />);

    await waitFor(() => expect(screen.getByText('This checkout has expired')).toBeTruthy());
    expect(screen.queryByText('Loading your extras...')).toBeNull();
    expect(screen.queryByText('Pricing your extras...')).toBeNull();

    // A way out rather than a dead end: there is nothing to retry, the extras must be picked again.
    fireEvent.press(screen.getByText('Back to extras'));
    expect(mockRouter.replace).toHaveBeenCalledWith(`/ticket/${SEEDED_TICKET_ID}/extras`);
  });

  /**
   * Decision #8 kept the promo field on this checkout, with copy that explains scope rather than
   * failing generically. A tickets-only code is not invalid, it simply has nothing to discount in
   * a basket with no tickets in it, and "that code is not valid" would be a lie the buyer cannot
   * act on.
   */
  it('explains why a tickets-only code has nothing to discount here', async () => {
    await signInAndComplete();
    await browseAndContinue(['Dinner voucher']);
    await renderReview();
    await waitFor(() => expect(screen.getByText('387.60 EGP')).toBeTruthy());

    fireEvent.changeText(screen.getByLabelText('Promo code'), 'tulua500');
    fireEvent.press(screen.getByText('Apply'));

    await waitFor(() =>
      expect(
        screen.getByText(
          'TULUA500 has nothing to discount here. This is an extras-only purchase, so a code that only applies to tickets will not come off it.',
        ),
      ).toBeTruthy(),
    );
    // Refused, so the total is untouched and no promo was ever shown as applied.
    expect(screen.getByText('387.60 EGP')).toBeTruthy();
    expect(screen.queryByText('Promo TULUA500 applied')).toBeNull();
  });

  /** A code that does reach these extras discounts them, and says how far its scope reaches. */
  it('applies a code scoped to one extra, and takes it off before VAT', async () => {
    await signInAndComplete();
    await browseAndContinue(['Dinner voucher']);
    await renderReview();
    await waitFor(() => expect(screen.getByText('387.60 EGP')).toBeTruthy());

    fireEvent.changeText(screen.getByLabelText('Promo code'), 'dinner50');
    fireEvent.press(screen.getByText('Apply'));

    await waitFor(() => expect(screen.getByText('Promo · DINNER50, one extra only')).toBeTruthy());
    expect(screen.getByText('Promo DINNER50 applied')).toBeTruthy();

    // The discount, the VAT on the discounted net and the total are all the server's own figures.
    const pricing = await serverPricing();
    expect(pricing.promo?.discountEgp).toBe('50.00');
    expect(pricing.vatEgp).toBe('40.60');
    expect(pricing.totalEgp).toBe('330.60');
    expect(screen.getByText('−50.00 EGP')).toBeTruthy();
    expect(screen.getByText('40.60 EGP')).toBeTruthy();
    expect(screen.getByText('330.60 EGP')).toBeTruthy();
    expect(screen.getByText('Pay 330.60 EGP')).toBeTruthy();

    fireEvent.press(screen.getByText('Remove'));

    await waitFor(() => expect(screen.queryByText('Promo · DINNER50, one extra only')).toBeNull());
    expect(screen.getByText('387.60 EGP')).toBeTruthy();
  });

  /**
   * The whole point of the flow: an extras-only order, placed against the exact price shown, then
   * paid. Place Order does not open a Paymob intention in the cart flow, so `payment/initiate`
   * must always follow it.
   */
  it('places an extras-only order and opens the Paymob sheet', async () => {
    await signInAndComplete();
    const initiate = jest.spyOn(mockApi.payments, 'initiate');

    await browseAndContinue(['Dinner voucher']);
    await renderReview();
    await waitFor(() => expect(screen.getByText('Pay 387.60 EGP')).toBeTruthy());

    // Nothing is payable until the terms are accepted.
    expect(screen.getByRole('button', { name: 'Pay 387.60 EGP' })).toBeDisabled();
    fireEvent.press(
      screen.getByText('I understand extras are non-refundable and are redeemed at the event.'),
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Pay 387.60 EGP' })).not.toBeDisabled(),
    );

    fireEvent.press(screen.getByText('Pay 387.60 EGP'));

    await waitFor(() => expect(mockPaymob.presentPayVC!).toHaveBeenCalled());
    expect(initiate).toHaveBeenCalledTimes(1);

    // The order that was placed carries the extra and no tickets.
    const orderId = useCheckoutStore.getState().orderId!;
    const order = await mockApi.orders.detail(orderId);
    expect(order.items).toHaveLength(0);
    expect(order.addons).toHaveLength(1);
    expect(order.totalEgp).toBe('387.60');

    const listener = mockPaymob.setSdkListener!.mock.calls.at(-1)?.[0] as (r: unknown) => void;
    act(() => listener({ status: 'Success' }));

    await waitFor(() =>
      expect(mockRouter.replace).toHaveBeenCalledWith(
        `/checkout/confirmation?orderId=${order.id}`,
      ),
    );

    initiate.mockRestore();
  });
});
