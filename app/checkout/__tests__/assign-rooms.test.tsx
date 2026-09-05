import { mockApi, mockConfig, MOCK_OTP_CODE, resetMockState } from '../../../src/api/mock';
import {
  ADDON_ACCOMMODATION,
  ADDON_MEALS,
} from '../../../src/api/mock/addon-fixtures';
import { TIER_WEEKEND, TULUA_ID } from '../../../src/api/mock/fixtures';
import { useAuthStore } from '../../../src/stores/auth';
import { useCheckoutStore, type DraftAddon } from '../../../src/stores/checkout';
import { act, fireEvent, renderWithProviders, screen, waitFor } from '../../../src/test-utils';

import AssignAddonsScreen from '../assign';
import RoomsScreen from '../rooms';

/**
 * Designs 13 (Assign add-ons), 14 (Room occupancy) and 15 (Add-on states).
 *
 * These two screens decide who gets an extra, and they are the only place in the app that says
 * anything at all about somebody else's ticket. Most of what is asserted here is a refusal: that
 * the address book is never swept, that a person who cannot receive an extra is told so in one
 * sentence that reveals nothing about whether they have an account, and that a cart can never
 * leave these screens in a state the till would reject.
 */

const mockContacts = jest.requireMock('expo-contacts') as {
  requestPermissionsAsync: jest.Mock;
  getPermissionsAsync: jest.Mock;
  Contact: { getAllDetails: jest.Mock };
};

const mockPicker = (
  jest.requireMock('expo-contacts/legacy') as { presentContactPickerAsync: jest.Mock }
).presentContactPickerAsync;

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

const BUYER = '+201012345678';
/** Holds their own Tulua ticket, so they can be given an extra without being in this cart. */
const TICKET_HOLDER = '+201099887766';
/** Registered, but with no ticket to Tulua. */
const REGISTERED_NO_TICKET = '+201233445566';
/** Never seen before. Must be indistinguishable from the number above (CLAUDE.md rule 4). */
const NO_ACCOUNT = '+201555000999';
/** Holds a Tulua ticket and a room bought with it. */
const ROOM_HOLDER = '+201066554433';

let clock = Date.parse('2026-08-12T12:00:00.000Z');

beforeEach(() => {
  mockContacts.requestPermissionsAsync.mockResolvedValue({ status: 'granted' });
  mockContacts.getPermissionsAsync.mockResolvedValue({ status: 'granted' });
  mockContacts.Contact.getAllDetails.mockClear();
  mockPicker.mockReset();
  mockPicker.mockResolvedValue(null);
  resetMockState();
  clock = Date.parse('2026-08-12T12:00:00.000Z');
  mockConfig.latencyMs = 0;
  mockConfig.settleDelayMs = 4000;
  mockConfig.now = () => clock;
  for (const key of Object.keys(mockParams)) delete mockParams[key];
  mockRouter.push.mockClear();
  mockRouter.replace.mockClear();
  useAuthStore.setState({ status: 'signed-out', user: null, pendingPhone: null });
  useCheckoutStore.getState().reset();
});

async function signIn(phoneNumber: string, fullName: string) {
  await mockApi.auth.requestOtp(phoneNumber);
  await mockApi.auth.verifyOtp(phoneNumber, MOCK_OTP_CODE);
  await mockApi.profile.update({
    fullName,
    email: `${fullName.split(' ')[0]!.toLowerCase()}@email.com`,
    dateOfBirth: '1994-03-12',
    gender: 'female',
    areaId: 'ar-maadi',
  });
  const complete = await mockApi.profile.uploadSelfie('file:///selfie.jpg');
  useAuthStore.setState({ status: 'signed-in', user: complete, pendingPhone: null });
  return complete;
}

/**
 * The buyer, with somebody else already holding the fixture's Tulua ticket.
 *
 * The mock hands its seeded ticket to whoever completes a profile first. Parking it on another
 * number does two jobs at once: it leaves the buyer free to take a ticket in this order, so the
 * screen has a buyer attendee to pre-assign, and it produces a real person outside the cart who
 * already holds a ticket to the event.
 */
async function signInAsBuyer() {
  await signIn(TICKET_HOLDER, 'Karim Adel');
  await mockApi.auth.logout();
  // Registered, with nothing to their name: the other half of the rule-4 pair.
  await mockApi.auth.requestOtp(REGISTERED_NO_TICKET);
  await mockApi.auth.verifyOtp(REGISTERED_NO_TICKET, MOCK_OTP_CODE);
  await mockApi.auth.logout();
  return signIn(BUYER, 'Yasmin El Sayed');
}

/** A paid Tulua order that leaves this number holding a ticket and a room. */
async function giveRoomTo(phoneNumber: string, name: string) {
  const cart = await mockApi.carts.create(TULUA_ID);
  await mockApi.carts.replaceTickets(cart.id, {
    buyerTierId: null,
    items: [{ tierId: TIER_WEEKEND, quantity: 1 }],
    guests: [{ phoneNumber, name, tierId: TIER_WEEKEND }],
  });
  const withTickets = await mockApi.carts.get(cart.id);
  await mockApi.carts.replaceAddons(cart.id, [
    {
      optionId: 'opt-lodge-single-1',
      quantity: 1,
      rooms: [{ occupants: [{ cartAttendeeId: withTickets.attendees[0]!.cartAttendeeId }] }],
    },
  ]);
  const preview = await mockApi.carts.preview(cart.id);
  const order = await mockApi.carts.placeOrder(
    cart.id,
    preview.pricing.pricingConfirmationToken as string,
  );
  await mockApi.payments.initiate(order.id);
  clock += 10_000;
  await mockApi.payments.status(order.id);
}

interface CheckoutSetup {
  quantity: number;
  guests?: { phoneNumber: string; name: string }[];
  addons?: DraftAddon[];
}

/** The state the guests step leaves behind: a cart on the server and a matching local draft. */
async function seedCheckout({ quantity, guests = [], addons = [] }: CheckoutSetup) {
  const cart = await mockApi.carts.create(TULUA_ID);
  await mockApi.carts.replaceTickets(cart.id, {
    buyerTierId: TIER_WEEKEND,
    items: [{ tierId: TIER_WEEKEND, quantity }],
    guests: guests.map((guest) => ({ ...guest, tierId: TIER_WEEKEND })),
  });

  useCheckoutStore.getState().start(TULUA_ID, TIER_WEEKEND);
  useCheckoutStore.getState().setBuyerTakesTicket(true);
  useCheckoutStore.getState().setQuantity(quantity);
  for (const guest of guests) {
    useCheckoutStore.getState().addGuest({ ...guest, fromContacts: true });
  }
  for (const addon of addons) useCheckoutStore.getState().upsertAddon(addon);
  useCheckoutStore.getState().setCartId(cart.id);

  mockParams.eventId = TULUA_ID;
  return cart;
}

const dinner = (quantity: number, extra: Partial<DraftAddon> = {}): DraftAddon => ({
  addonId: ADDON_MEALS,
  addonName: 'Dinner voucher',
  type: 'meal',
  optionId: 'opt-dinner',
  optionLabel: 'Dinner voucher',
  unitPriceEgp: '280.00',
  quantity,
  ...extra,
});

const lodgeDouble = (quantity = 1, extra: Partial<DraftAddon> = {}): DraftAddon => ({
  addonId: ADDON_ACCOMMODATION,
  addonName: 'Desert Lodge Room',
  type: 'accommodation',
  optionId: 'opt-lodge-double-2',
  optionLabel: 'Double · 2 nights',
  unitPriceEgp: '2200.00',
  quantity,
  rooms: [],
  ...extra,
});

const lodgeSingle = (quantity = 1, extra: Partial<DraftAddon> = {}): DraftAddon => ({
  addonId: ADDON_ACCOMMODATION,
  addonName: 'Desert Lodge Room',
  type: 'accommodation',
  optionId: 'opt-lodge-single-1',
  optionLabel: 'Single · 1 night',
  unitPriceEgp: '1400.00',
  quantity,
  rooms: [],
  ...extra,
});

/** The OS picker hands back name parts and numbers, never a formatted name. */
function pickerReturns(firstName: string, lastName: string, ...numbers: string[]) {
  mockPicker.mockResolvedValue({
    firstName,
    lastName,
    phoneNumbers: numbers.map((number) => ({ number })),
  });
}

async function pressAddSomeoneElse() {
  await act(async () => {
    fireEvent.press(screen.getByText('Add someone else'));
  });
}

describe('13 Assign add-ons', () => {
  it('lists only the people in this order, and never reads the address book', async () => {
    const lookup = jest.spyOn(mockApi.carts, 'lookupRecipients');
    await signInAsBuyer();
    await seedCheckout({
      quantity: 2,
      guests: [{ phoneNumber: '+201022334455', name: 'Nour Hassan' }],
      addons: [dinner(2)],
    });

    renderWithProviders(<AssignAddonsScreen />);

    await waitFor(() => expect(screen.getByText('Yasmin El Sayed')).toBeTruthy());
    expect(screen.getByText('People in this order')).toBeTruthy();
    expect(screen.getByText('Add someone else')).toBeTruthy();
    expect(screen.getByText('Nour Hassan')).toBeTruthy();
    // The design's note names the tier the person's ticket is for.
    expect(screen.getByText('Full Weekend Pass · you')).toBeTruthy();
    expect(screen.getByText('Full Weekend Pass · in this cart')).toBeTruthy();

    // Karim holds a Tulua ticket and is in the seeded address book, but nobody asked for him.
    expect(screen.queryByText('Karim Adel')).toBeNull();
    expect(lookup).not.toHaveBeenCalled();
    expect(mockContacts.Contact.getAllDetails).not.toHaveBeenCalled();
    lookup.mockRestore();
  });

  it("seeds the buyer's own unit and says so, and lets them take it back", async () => {
    await signInAsBuyer();
    await seedCheckout({
      quantity: 2,
      guests: [{ phoneNumber: '+201022334455', name: 'Nour Hassan' }],
      addons: [dinner(2)],
    });

    renderWithProviders(<AssignAddonsScreen />);

    await waitFor(() => expect(screen.getByText('1 of 2')).toBeTruthy());
    expect(
      screen.getByText(
        "Every extra is attached to one person's ticket. Yours is assigned automatically.",
      ),
    ).toBeTruthy();
    expect(screen.getByText('Auto')).toBeTruthy();

    // The seeded unit is the buyer's to change.
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Remove one from Yasmin El Sayed'));
    });
    expect(screen.getByText('0 of 2')).toBeTruthy();
    expect(screen.queryByText('Auto')).toBeNull();
  });

  it('keeps Continue shut until every unit has somebody', async () => {
    await signInAsBuyer();
    const cart = await seedCheckout({
      quantity: 2,
      guests: [{ phoneNumber: '+201022334455', name: 'Nour Hassan' }],
      addons: [dinner(2)],
    });

    renderWithProviders(<AssignAddonsScreen />);

    await waitFor(() => expect(screen.getByText('1 of 2')).toBeTruthy());
    // A disabled button carries the same black fill as a live one, so the label has to say why.
    const blocked = screen.getByRole('button', { name: '1 extra still to assign' });
    expect(blocked).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();

    await act(async () => {
      fireEvent.press(blocked);
    });
    expect(mockRouter.push).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(screen.getByText('Nour Hassan'));
    });
    expect(screen.getByText('2 of 2')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue' })).not.toBeDisabled();

    await act(async () => {
      fireEvent.press(screen.getByText('Continue'));
    });

    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith(`/checkout/review?eventId=${TULUA_ID}`),
    );
    const saved = await mockApi.carts.get(cart.id);
    expect(saved.addons[0]!.assignments).toHaveLength(2);
  });

  it('adds somebody the buyer picks from the OS contact picker, labelled from the device', async () => {
    await signInAsBuyer();
    await seedCheckout({
      quantity: 2,
      guests: [{ phoneNumber: '+201022334455', name: 'Nour Hassan' }],
      addons: [dinner(3)],
    });
    pickerReturns('Karim', 'Adel', TICKET_HOLDER);

    renderWithProviders(<AssignAddonsScreen />);
    await waitFor(() => expect(screen.getByText('Add someone else')).toBeTruthy());
    await pressAddSomeoneElse();

    await waitFor(() => expect(screen.getByText('Karim Adel')).toBeTruthy());
    expect(screen.getByText('Has a ticket to Tulua')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByText('Karim Adel'));
    });
    expect(screen.getByText('2 of 3')).toBeTruthy();
  });

  it('asks which number when the picked contact has several', async () => {
    await signInAsBuyer();
    await seedCheckout({ quantity: 1, addons: [dinner(2)] });
    pickerReturns('Karim', 'Adel', '+201555000111', TICKET_HOLDER);

    renderWithProviders(<AssignAddonsScreen />);
    await waitFor(() => expect(screen.getByText('Add someone else')).toBeTruthy());
    await pressAddSomeoneElse();

    // Nothing is looked up on the strength of a guess.
    expect(screen.queryByText('Has a ticket to Tulua')).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByText('010 99887766'));
    });
    await waitFor(() => expect(screen.getByText('Has a ticket to Tulua')).toBeTruthy());
  });

  /**
   * CLAUDE.md rule 4, the single most important assertion in this file.
   *
   * A number with no account and a number with an account but no ticket must produce the same
   * screen, down to the byte. The server gives them one answer with no reason code; nothing here
   * may reconstruct the difference.
   */
  it('refuses an unregistered number and a registered one without a ticket identically', async () => {
    await signInAsBuyer();
    const cart = await seedCheckout({ quantity: 1, addons: [dinner(1)] });

    // Same label from the device, so the only thing that could differ is the number itself.
    pickerReturns('Laila', 'Mansour', REGISTERED_NO_TICKET);
    renderWithProviders(<AssignAddonsScreen />);
    await waitFor(() => expect(screen.getByText('Add someone else')).toBeTruthy());
    await pressAddSomeoneElse();

    await waitFor(() =>
      expect(
        screen.getByText(
          'Laila Mansour needs a ticket to Tulua before they can get an extra. Add one to this cart.',
        ),
      ).toBeTruthy(),
    );
    const registeredTree = JSON.stringify(screen.toJSON());

    pickerReturns('Laila', 'Mansour', NO_ACCOUNT);
    await act(async () => {
      fireEvent.press(screen.getByText('Choose someone else'));
    });

    await waitFor(() =>
      expect(
        screen.getByText(
          'Laila Mansour needs a ticket to Tulua before they can get an extra. Add one to this cart.',
        ),
      ).toBeTruthy(),
    );
    expect(JSON.stringify(screen.toJSON())).toEqual(registeredTree);

    // And the answer the screen was given carries nothing to tell them apart either.
    const [registered] = await mockApi.carts.lookupRecipients(cart.id, [REGISTERED_NO_TICKET]);
    const [unknown] = await mockApi.carts.lookupRecipients(cart.id, [NO_ACCOUNT]);
    expect({ ...registered, phoneNumber: '' }).toEqual({ ...unknown, phoneNumber: '' });
  });

  it('adds a ticket for a refused contact without losing a single extra', async () => {
    await signInAsBuyer();
    const cart = await seedCheckout({
      quantity: 2,
      guests: [{ phoneNumber: '+201022334455', name: 'Nour Hassan' }],
      addons: [dinner(2)],
    });
    pickerReturns('Laila', 'Mansour', REGISTERED_NO_TICKET);

    renderWithProviders(<AssignAddonsScreen />);
    await waitFor(() => expect(screen.getByText('1 of 2')).toBeTruthy());

    // Both units spoken for before the cart is edited underneath them.
    await act(async () => {
      fireEvent.press(screen.getByText('Nour Hassan'));
    });
    expect(screen.getByText('2 of 2')).toBeTruthy();

    await pressAddSomeoneElse();
    await waitFor(() => expect(screen.getByText('Add a ticket for them')).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByText('Add a ticket for them'));
    });

    await waitFor(() => expect(screen.getByText('Laila Mansour')).toBeTruthy());

    // One more ticket, one more guest, and the draft still holds both dinners.
    expect(useCheckoutStore.getState().quantity).toBe(3);
    expect(useCheckoutStore.getState().guests.map((guest) => guest.phoneNumber)).toContain(
      REGISTERED_NO_TICKET,
    );
    expect(screen.getByText('2 of 2')).toBeTruthy();

    // `PUT /tickets` wipes the cart's extras, so the proof is on the server, not in the store.
    const saved = await mockApi.carts.get(cart.id);
    expect(saved.attendees).toHaveLength(3);
    expect(saved.addons[0]!.assignments).toHaveLength(2);

    // Every assignment points at an attendee that exists in the cart as it is now.
    const ids = new Set(saved.attendees.map((attendee) => attendee.cartAttendeeId));
    for (const assignment of saved.addons[0]!.assignments) {
      expect(ids.has(assignment.cartAttendeeId as string)).toBe(true);
    }
    for (const assignment of useCheckoutStore.getState().addons[0]!.assignments ?? []) {
      expect(ids.has(assignment.cartAttendeeId as string)).toBe(true);
    }
  });

  it('offers no extra ticket once the order is as big as the event allows', async () => {
    await signInAsBuyer();
    await seedCheckout({
      quantity: 6,
      guests: [
        { phoneNumber: '+201022334455', name: 'Nour Hassan' },
        { phoneNumber: '+201188776655', name: 'Omar Farouk' },
        { phoneNumber: '+201000000001', name: 'Guest Three' },
        { phoneNumber: '+201000000002', name: 'Guest Four' },
        { phoneNumber: '+201000000003', name: 'Guest Five' },
      ],
      addons: [dinner(1)],
    });
    pickerReturns('Laila', 'Mansour', REGISTERED_NO_TICKET);

    renderWithProviders(<AssignAddonsScreen />);
    await waitFor(() => expect(screen.getByText('Add someone else')).toBeTruthy());
    await pressAddSomeoneElse();

    await waitFor(() =>
      expect(
        screen.getByText(
          'Laila Mansour needs a ticket to Tulua before they can get an extra. Add one to this cart.',
        ),
      ).toBeTruthy(),
    );
    expect(screen.queryByText('Add a ticket for them')).toBeNull();
    expect(
      screen.getByText('That is more tickets than this event allows in one order.'),
    ).toBeTruthy();
    expect(screen.getByText('Choose someone else')).toBeTruthy();
  });

  /**
   * The picker can end four ways, and three of them are not a person. Backing out has to be
   * silent, and the other two have to say what to do next instead of leaving the buyer on a row
   * that appears to have done nothing.
   */
  it('handles a picker that is backed out of, has no number, or will not open', async () => {
    const lookup = jest.spyOn(mockApi.carts, 'lookupRecipients');
    await signInAsBuyer();
    await seedCheckout({ quantity: 1, addons: [dinner(1)] });

    renderWithProviders(<AssignAddonsScreen />);
    await waitFor(() => expect(screen.getByText('Add someone else')).toBeTruthy());

    // Dismissed without choosing anybody: no message, and nothing asked of the server.
    mockPicker.mockResolvedValue(null);
    await pressAddSomeoneElse();
    expect(screen.queryByText(/has no mobile number saved/)).toBeNull();
    expect(screen.queryByText(/needs a ticket to Tulua/)).toBeNull();
    expect(lookup).not.toHaveBeenCalled();

    // A contact with nothing textable is not a lookup either.
    mockPicker.mockResolvedValue({ firstName: 'Laila', lastName: 'Mansour', phoneNumbers: [] });
    await pressAddSomeoneElse();
    expect(
      screen.getByText('Laila Mansour has no mobile number saved. Pick someone else.'),
    ).toBeTruthy();
    expect(lookup).not.toHaveBeenCalled();

    mockPicker.mockRejectedValue(new Error('picker unavailable'));
    await pressAddSomeoneElse();
    expect(screen.getByText("We couldn't open your contacts. Try again in a moment.")).toBeTruthy();
    expect(lookup).not.toHaveBeenCalled();
    lookup.mockRestore();
  });

  it('says when the picked contact is already in this order, without looking them up', async () => {
    const lookup = jest.spyOn(mockApi.carts, 'lookupRecipients');
    await signInAsBuyer();
    await seedCheckout({
      quantity: 2,
      guests: [{ phoneNumber: '+201022334455', name: 'Nour Hassan' }],
      addons: [dinner(2)],
    });
    pickerReturns('Nour', 'Hassan', '+201022334455');

    renderWithProviders(<AssignAddonsScreen />);
    await waitFor(() => expect(screen.getByText('Add someone else')).toBeTruthy());
    await pressAddSomeoneElse();

    await waitFor(() =>
      expect(screen.getByText('Nour Hassan is already in this order.')).toBeTruthy(),
    );
    // Somebody in the cart is not a question about anybody's account.
    expect(lookup).not.toHaveBeenCalled();
    lookup.mockRestore();
  });

  /**
   * The ticket lands and the extras do not. The buyer has to hear it here: believing the extras
   * survived means finding out at the till, with a bigger order and none of the extras on it.
   */
  it('says so when the ticket went through but the extras did not save', async () => {
    await signInAsBuyer();
    // One unit, which the screen seeds onto the buyer, so the draft is whole and really is on
    // the cart. That is the only state in which losing it is possible, and worth reporting.
    await seedCheckout({ quantity: 1, addons: [dinner(1)] });
    pickerReturns('Laila', 'Mansour', REGISTERED_NO_TICKET);

    renderWithProviders(<AssignAddonsScreen />);
    await waitFor(() => expect(screen.getByText('1 of 1')).toBeTruthy());
    await pressAddSomeoneElse();
    await waitFor(() => expect(screen.getByText('Add a ticket for them')).toBeTruthy());

    const replace = jest
      .spyOn(mockApi.carts, 'replaceAddons')
      .mockRejectedValueOnce(new Error('network'));

    await act(async () => {
      fireEvent.press(screen.getByText('Add a ticket for them'));
    });

    await waitFor(() =>
      expect(
        screen.getByText(/Laila Mansour has a ticket now, but your extras did not save/),
      ).toBeTruthy(),
    );
    // They have one now, so the refusal that said they needed one must be gone: two answers that
    // contradict each other read as a broken screen.
    expect(screen.queryByText(/needs a ticket to/)).toBeNull();
    replace.mockRestore();
  });

  /**
   * A half-assigned draft is the normal state on this screen, and `PUT /carts/:id/addons` refuses
   * it outright: it is a commit, not a scratch pad. Sending one answered 400 against staging and
   * told the buyer their extras were lost, when the cart had never held them and nothing was.
   */
  it('does not push a half-assigned draft at the server when adding a ticket', async () => {
    await signInAsBuyer();
    await seedCheckout({
      quantity: 2,
      guests: [{ phoneNumber: '+201022334455', name: 'Nour Hassan' }],
      addons: [dinner(2)],
    });
    pickerReturns('Laila', 'Mansour', REGISTERED_NO_TICKET);

    renderWithProviders(<AssignAddonsScreen />);
    // One of the two units is seeded onto the buyer; the other is still nobody's.
    await waitFor(() => expect(screen.getByText('1 of 2')).toBeTruthy());
    await pressAddSomeoneElse();
    await waitFor(() => expect(screen.getByText('Add a ticket for them')).toBeTruthy());

    const replace = jest.spyOn(mockApi.carts, 'replaceAddons');

    await act(async () => {
      fireEvent.press(screen.getByText('Add a ticket for them'));
    });

    await waitFor(() => expect(screen.getByText('Laila Mansour')).toBeTruthy());
    expect(replace).not.toHaveBeenCalled();
    // No alarm either: nothing was lost, so nothing is reported.
    expect(screen.queryByText(/did not save/)).toBeNull();
    expect(screen.queryByText(/needs a ticket to/)).toBeNull();
    replace.mockRestore();
  });

  /**
   * The advisory check the guests step runs, run again here, because this is a guest being added
   * to the order by another door. Its refusals say what is wrong with the order, never whether
   * the number belongs to anybody (CLAUDE.md rule 4).
   */
  it('surfaces a guest refusal instead of adding the ticket', async () => {
    await signInAsBuyer();
    const cart = await seedCheckout({ quantity: 1, addons: [dinner(1)] });
    pickerReturns('Laila', 'Mansour', REGISTERED_NO_TICKET);

    const validate = jest
      .spyOn(mockApi.orders, 'validateGuests')
      .mockResolvedValue({ valid: false, issues: [{ guestIndex: 0, error: 'SAME_AS_BUYER' }] });

    renderWithProviders(<AssignAddonsScreen />);
    await waitFor(() => expect(screen.getByText('Add someone else')).toBeTruthy());
    await pressAddSomeoneElse();
    await waitFor(() => expect(screen.getByText('Add a ticket for them')).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByText('Add a ticket for them'));
    });

    await waitFor(() =>
      expect(
        screen.getByText("That's your own number. Your ticket is already included."),
      ).toBeTruthy(),
    );

    // The order is untouched: no seat bought, no guest, and the refusal still on screen.
    expect(useCheckoutStore.getState().quantity).toBe(1);
    expect(useCheckoutStore.getState().guests).toHaveLength(0);
    expect((await mockApi.carts.get(cart.id)).attendees).toHaveLength(1);
    expect(screen.getByText('Choose someone else')).toBeTruthy();
    validate.mockRestore();
  });

  it('offers nobody to assign to when the cart holds only rooms', async () => {
    await signInAsBuyer();
    await seedCheckout({
      quantity: 2,
      guests: [{ phoneNumber: '+201022334455', name: 'Nour Hassan' }],
      addons: [lodgeDouble(1)],
    });

    renderWithProviders(<AssignAddonsScreen />);

    await waitFor(() =>
      expect(screen.getByText('Your room is filled in on the next step.')).toBeTruthy(),
    );
    expect(screen.queryByText('Add someone else')).toBeNull();
    expect(screen.queryByText('People in this order')).toBeNull();
  });

  /**
   * A room line is still empty on this screen: its occupants are chosen on the next one. Sending
   * it here is a `ROOM_OCCUPANCY_UNFILLED` 400 that strands a buyer who has done nothing wrong,
   * on a screen whose own rules say they are finished. The meal goes now, the room goes later,
   * and the rooms step's `PUT` replaces the lot.
   */
  it('leaves the unfilled room out of the save and lets the buyer through', async () => {
    await signInAsBuyer();
    const cart = await seedCheckout({
      quantity: 2,
      guests: [{ phoneNumber: '+201022334455', name: 'Nour Hassan' }],
      addons: [dinner(1), lodgeDouble(1)],
    });

    renderWithProviders(<AssignAddonsScreen />);
    await waitFor(() => expect(screen.getByText('1 of 1')).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByText('Continue'));
    });

    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith(`/checkout/rooms?eventId=${TULUA_ID}`),
    );
    const saved = await mockApi.carts.get(cart.id);
    expect(saved.addons.map((line) => line.optionId)).toEqual(['opt-dinner']);
  });

  it('says the checkout expired rather than spinning when there is no cart', async () => {
    await signInAsBuyer();
    mockParams.eventId = TULUA_ID;

    renderWithProviders(<AssignAddonsScreen />);

    expect(screen.getByText('This checkout has expired')).toBeTruthy();
    expect(screen.queryByText('Loading your cart...')).toBeNull();
  });
});

describe('14 Room occupancy', () => {
  it('names the room, and says exactly what is missing before it will let the buyer on', async () => {
    await signInAsBuyer();
    await seedCheckout({
      quantity: 3,
      guests: [
        { phoneNumber: '+201022334455', name: 'Nour Hassan' },
        { phoneNumber: '+201188776655', name: 'Omar Farouk' },
      ],
      addons: [lodgeDouble(1)],
    });

    renderWithProviders(<RoomsScreen />);

    await waitFor(() => expect(screen.getByText('0 of 2 assigned')).toBeTruthy());
    // Design 14 heads the pickable rows, and labels each person by the tier they hold.
    expect(screen.getByText('People in this order')).toBeTruthy();
    expect(screen.getAllByText('Full Weekend Pass · in this cart')).toHaveLength(2);
    // Design 14's room card: the option, the stay, the price and the dates.
    expect(screen.getByText('Desert Lodge Room · Double')).toBeTruthy();
    expect(screen.getByText('2 nights · 2,200.00 EGP')).toBeTruthy();
    expect(screen.getByText('Check-in 23 Oct 2026 · Check-out 25 Oct 2026')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByText('Yasmin El Sayed'));
    });

    // Design 15's "Room not yet full", naming the room and the shortfall.
    expect(
      screen.getByText(
        'Desert Lodge Room · Double is 1 of 2 filled. Add one more occupant to check out.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Room not full yet')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByText('Nour Hassan'));
    });

    expect(screen.getByText('2 of 2 assigned')).toBeTruthy();
    expect(screen.queryByText('Room not full yet')).toBeNull();
    expect(screen.getByRole('button', { name: 'Continue' })).not.toBeDisabled();
  });

  it('will not let one person be in two rooms', async () => {
    await signInAsBuyer();
    await seedCheckout({
      quantity: 3,
      guests: [
        { phoneNumber: '+201022334455', name: 'Nour Hassan' },
        { phoneNumber: '+201188776655', name: 'Omar Farouk' },
      ],
      addons: [lodgeDouble(1), lodgeSingle(1)],
    });

    renderWithProviders(<RoomsScreen />);
    await waitFor(() => expect(screen.getByText('0 of 2 assigned')).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getAllByText('Yasmin El Sayed')[0]!);
    });

    expect(screen.getByText('Already in another room')).toBeTruthy();
    expect(screen.getByText('Blocked')).toBeTruthy();
  });

  /**
   * Nothing upstream stops a buyer taking two accommodation options. Filling only the first one
   * used to enable Continue and produce a cart that `place-order` refuses with
   * `ROOM_OCCUPANCY_UNFILLED` and no way back.
   */
  it('makes every accommodation line be filled, not just the first', async () => {
    await signInAsBuyer();
    const cart = await seedCheckout({
      quantity: 3,
      guests: [
        { phoneNumber: '+201022334455', name: 'Nour Hassan' },
        { phoneNumber: '+201188776655', name: 'Omar Farouk' },
      ],
      addons: [lodgeDouble(1), lodgeSingle(1)],
    });

    renderWithProviders(<RoomsScreen />);
    await waitFor(() => expect(screen.getByText('0 of 2 assigned')).toBeTruthy());

    // The double, full.
    await act(async () => {
      fireEvent.press(screen.getAllByText('Nour Hassan')[0]!);
    });
    await act(async () => {
      fireEvent.press(screen.getAllByText('Omar Farouk')[0]!);
    });

    expect(screen.getByText('2 of 2 assigned')).toBeTruthy();
    // The single is still empty, so there is nowhere to go yet.
    expect(screen.getByRole('button', { name: 'Room not full yet' })).toBeDisabled();
    expect(
      screen.getByText(
        'Desert Lodge Room · Single is 0 of 1 filled. Add one more occupant to check out.',
      ),
    ).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getAllByText('Yasmin El Sayed')[1]!);
    });

    expect(screen.getByRole('button', { name: 'Continue' })).not.toBeDisabled();

    await act(async () => {
      fireEvent.press(screen.getByText('Continue'));
    });

    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith(`/checkout/review?eventId=${TULUA_ID}`),
    );
    const saved = await mockApi.carts.get(cart.id);
    expect(saved.addons).toHaveLength(2);
    for (const line of saved.addons) expect(line.assignments.length).toBeGreaterThan(0);
    expect(saved.validation?.canPlaceOrder).toBe(true);
  });

  it('refuses somebody who already has a room, and offers another choice', async () => {
    await signInAsBuyer();
    await giveRoomTo(ROOM_HOLDER, 'Dana Ward');
    await seedCheckout({
      quantity: 2,
      guests: [{ phoneNumber: '+201022334455', name: 'Nour Hassan' }],
      addons: [lodgeDouble(1)],
    });
    pickerReturns('Dana', 'Ward', ROOM_HOLDER);

    renderWithProviders(<RoomsScreen />);
    await waitFor(() => expect(screen.getByText('Add someone else')).toBeTruthy());
    await pressAddSomeoneElse();

    await waitFor(() =>
      expect(
        screen.getByText('Dana Ward already has a room for this event. One room per person.'),
      ).toBeTruthy(),
    );
    // A ticket cannot help somebody who already has one, so that exit is not offered here.
    expect(screen.queryByText('Add a ticket for them')).toBeNull();
    expect(screen.getByText('Choose someone else')).toBeTruthy();
  });

  it('refuses a picked contact with no ticket, in the same words as the assign step', async () => {
    await signInAsBuyer();
    await seedCheckout({
      quantity: 2,
      guests: [{ phoneNumber: '+201022334455', name: 'Nour Hassan' }],
      addons: [lodgeDouble(1)],
    });
    pickerReturns('Laila', 'Mansour', NO_ACCOUNT);

    renderWithProviders(<RoomsScreen />);
    await waitFor(() => expect(screen.getByText('Add someone else')).toBeTruthy());
    await pressAddSomeoneElse();

    await waitFor(() =>
      expect(
        screen.getByText(
          'Laila Mansour needs a ticket to Tulua before they can get an extra. Add one to this cart.',
        ),
      ).toBeTruthy(),
    );
  });

  /**
   * The point of the whole cross-user path: a friend who bought their own ticket can share the
   * room being paid for here. Their occupancy is sent as a `ticketId`, since they have no
   * attendee row in this cart to point at.
   */
  it('puts somebody who holds their own ticket into a room', async () => {
    await signInAsBuyer();
    const cart = await seedCheckout({ quantity: 1, addons: [lodgeDouble(1)] });
    pickerReturns('Karim', 'Adel', TICKET_HOLDER);

    renderWithProviders(<RoomsScreen />);
    await waitFor(() => expect(screen.getByText('Add someone else')).toBeTruthy());
    await pressAddSomeoneElse();

    await waitFor(() => expect(screen.getByText('Karim Adel')).toBeTruthy());
    expect(screen.getByText('Has a ticket to Tulua')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByText('Yasmin El Sayed'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Karim Adel'));
    });

    expect(screen.getByText('2 of 2 assigned')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    });

    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith(`/checkout/review?eventId=${TULUA_ID}`),
    );
    const saved = await mockApi.carts.get(cart.id);
    const occupants = saved.addons[0]!.assignments;
    expect(occupants).toHaveLength(2);
    expect(occupants.filter((occupant) => occupant.ticketId !== null)).toHaveLength(1);
    expect(saved.validation?.canPlaceOrder).toBe(true);
  });

  it('says the checkout expired rather than spinning when there is no cart', async () => {
    await signInAsBuyer();
    mockParams.eventId = TULUA_ID;
    useCheckoutStore.getState().start(TULUA_ID, TIER_WEEKEND);
    useCheckoutStore.getState().upsertAddon(lodgeDouble(1));

    renderWithProviders(<RoomsScreen />);

    expect(screen.getByText('This checkout has expired')).toBeTruthy();
    expect(screen.queryByText('Loading your room...')).toBeNull();
  });

  /** The addon query is switched off without a room line, so this branch has to come first. */
  it('says the room is gone rather than spinning when the draft holds none', async () => {
    await signInAsBuyer();
    await seedCheckout({ quantity: 1, addons: [dinner(1)] });

    renderWithProviders(<RoomsScreen />);

    expect(screen.getByText('That room is no longer in your cart')).toBeTruthy();
    expect(screen.queryByText('Loading your room...')).toBeNull();
  });
});

/**
 * The draft's own guarantee behind "Add a ticket for them".
 *
 * `setQuantity` drops the extras on purpose: its caller is the guests step, where a change of
 * quantity means the buyer is still deciding who is coming. The assignment steps need the
 * opposite, and get their own action rather than weakening that one for everybody.
 */
describe('the checkout draft when a seat is added for a refused contact', () => {
  it('keeps the extras that setQuantity would have thrown away', () => {
    const store = useCheckoutStore.getState();
    store.start(TULUA_ID, TIER_WEEKEND);
    store.setQuantity(2);
    store.addGuest({ phoneNumber: '+201022334455', name: 'Nour Hassan', fromContacts: true });
    store.upsertAddon(dinner(2, { assignments: [{ cartAttendeeId: 'att-1', quantity: 2 }] }));

    useCheckoutStore
      .getState()
      .addGuestSeat({ phoneNumber: REGISTERED_NO_TICKET, name: 'Laila Mansour', fromContacts: true });

    expect(useCheckoutStore.getState().quantity).toBe(3);
    expect(useCheckoutStore.getState().guests).toHaveLength(2);
    expect(useCheckoutStore.getState().addons).toHaveLength(1);
    expect(useCheckoutStore.getState().addons[0]!.assignments).toEqual([
      { cartAttendeeId: 'att-1', quantity: 2 },
    ]);

    // The same seat through the guests step's action would have cost the buyer their extras.
    useCheckoutStore.getState().setQuantity(4);
    expect(useCheckoutStore.getState().addons).toHaveLength(0);
  });

  it('does not buy a second seat for somebody already in the order', () => {
    const store = useCheckoutStore.getState();
    store.start(TULUA_ID, TIER_WEEKEND);
    store.setQuantity(2);
    store.addGuest({ phoneNumber: '+201022334455', name: 'Nour Hassan', fromContacts: true });

    useCheckoutStore
      .getState()
      .addGuestSeat({ phoneNumber: '+201022334455', name: 'Nour Hassan', fromContacts: true });

    expect(useCheckoutStore.getState().quantity).toBe(2);
    expect(useCheckoutStore.getState().guests).toHaveLength(1);
  });
});
