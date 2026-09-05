import { mockApi, mockConfig, MOCK_OTP_CODE, resetMockState } from '../../src/api/mock';
import { TIER_WEEKEND, TULUA_ID } from '../../src/api/mock/fixtures';
import type { OrderAddon, TicketAddon, TicketAddonStatus } from '../../src/api/types';
import { useAuthStore } from '../../src/stores/auth';
import { renderWithProviders, screen, waitFor } from '../../src/test-utils';

import TicketsScreen from '../(tabs)/tickets';
import EntryPassScreen from '../ticket/[id]';
import OrderDetailScreen from '../orders/[id]';

/**
 * The three surfaces a bought extra shows up on after checkout, against the mock api:
 *
 *   20 · My tickets       the "3 add-ons attached" line and the "Add extras to this ticket" row
 *   21 · Entry pass / QR  the attached-extras block under the holder details
 *   19 · Order receipt    the add-on lines, their recipients, and the money
 *
 * None of it has been through a simulator, so this is the only thing standing between these
 * screens and a first real user. Everything is driven through the mock api's own calls: a cart
 * with extras, a payment, and the tickets that fall out of it, so the fixtures are the ones the
 * app really renders rather than hand-written objects.
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

const REAL_NOW = mockConfig.now;

/** The mock's clock. Addon price windows read it, so every test shares one fixed "today". */
let clock = Date.parse('2026-08-12T12:00:00.000Z');

function advance(ms: number) {
  clock += ms;
}

beforeEach(() => {
  resetMockState();
  mockConfig.latencyMs = 0;
  mockConfig.settleDelayMs = 4000;
  clock = Date.parse('2026-08-12T12:00:00.000Z');
  mockConfig.now = () => clock;
  for (const key of Object.keys(mockParams)) delete mockParams[key];
  mockRouter.push.mockClear();
  useAuthStore.setState({ status: 'signed-out', user: null, pendingPhone: null });
});

afterAll(() => {
  mockConfig.now = REAL_NOW;
});

/** A signed-in buyer with a complete profile, which is what seeds them a Tulua ticket. */
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

async function seedTicketId(): Promise<string> {
  const { data } = await mockApi.tickets.list();
  return data[0]!.id;
}

/**
 * The design's order: a guest ticket, a room the buyer shares with that guest, two dinner
 * vouchers, and a shuttle seat for the buyer alone.
 *
 * The buyer is a recipient by *ticket id* rather than as someone in this cart, because she
 * already holds the seeded Tulua ticket. That is decision 6's case: the server names people this
 * order named and nobody else, so her rows come back nameless on purpose.
 */
async function buyTheDesignsExtras() {
  const ticketId = await seedTicketId();
  const cart = await mockApi.carts.create(TULUA_ID);
  const withTickets = await mockApi.carts.replaceTickets(cart.id, {
    buyerTierId: null,
    items: [{ tierId: TIER_WEEKEND, quantity: 1 }],
    guests: [{ phoneNumber: '+201022334455', name: 'Nour Hassan', tierId: TIER_WEEKEND }],
  });
  const guest = withTickets.attendees[0]!;

  await mockApi.carts.replaceAddons(cart.id, [
    {
      optionId: 'opt-lodge-double-2',
      // Accommodation quantity is rooms, not people: one room, two occupants.
      quantity: 1,
      rooms: [{ occupants: [{ cartAttendeeId: guest.cartAttendeeId }, { ticketId }] }],
    },
    {
      optionId: 'opt-dinner',
      quantity: 2,
      assignments: [
        { cartAttendeeId: guest.cartAttendeeId, quantity: 1 },
        { ticketId, quantity: 1 },
      ],
    },
    { optionId: 'opt-shuttle-round-trip', quantity: 1, assignments: [{ ticketId, quantity: 1 }] },
  ]);

  const preview = await mockApi.carts.preview(cart.id);
  expect(preview.issues).toEqual([]);
  const placed = await mockApi.carts.placeOrder(
    cart.id,
    preview.pricing.pricingConfirmationToken!,
  );

  // place-order opens no intention of its own, so payment is initiated separately and the
  // simulated webhook is what marks the order paid and issues the extras.
  await mockApi.payments.initiate(placed.id);
  advance(5000);
  await mockApi.payments.status(placed.id);

  const order = await mockApi.orders.detail(placed.id);
  expect(order.status).toBe('paid');
  return { order, ticketId };
}

describe('20 · My tickets, extras on the card', () => {
  it('counts the attached extras and offers the extras row', async () => {
    await signInAndComplete();
    await buyTheDesignsExtras();

    renderWithProviders(<TicketsScreen />);

    // Room, dinner voucher and shuttle all landed on the buyer's own ticket.
    await waitFor(() => expect(screen.getByText('3 add-ons attached')).toBeTruthy());
    expect(screen.getByText('Add extras to this ticket')).toBeTruthy();
  });

  it('says nothing about extras on a ticket that has none', async () => {
    await signInAndComplete();

    renderWithProviders(<TicketsScreen />);

    await waitFor(() => expect(screen.getByText('Full Weekend Pass')).toBeTruthy());
    expect(screen.queryByText(/add-ons? attached/)).toBeNull();
    expect(screen.queryByText('0 add-ons attached')).toBeNull();
  });

  /*
   * Decision 11: flag-off and an empty catalogue are one silent state. No extras step, no entry
   * points, no error. The ticket itself cannot say whether its event sells extras, so the screen
   * asks the catalogue.
   */
  it('offers no entry point at all when the event sells no extras', async () => {
    await signInAndComplete();
    const catalogue = jest.spyOn(mockApi.addons, 'list').mockResolvedValue([]);

    renderWithProviders(<TicketsScreen />);

    await waitFor(() => expect(screen.getByText('Full Weekend Pass')).toBeTruthy());
    expect(screen.getByText('View entry pass →')).toBeTruthy();
    expect(screen.queryByText('Add extras to this ticket')).toBeNull();
    expect(screen.queryAllByText(/extras/i)).toHaveLength(0);

    catalogue.mockRestore();
  });

  // A build with extras switched off answers not-found for the catalogue. That is the same
  // silence, not an error the holder should ever see.
  it('stays silent when the catalogue endpoint is switched off', async () => {
    await signInAndComplete();
    const notFound = Object.assign(new Error('not found'), { code: 'NOT_FOUND', status: 404 });
    const catalogue = jest.spyOn(mockApi.addons, 'list').mockRejectedValue(notFound);

    renderWithProviders(<TicketsScreen />);

    await waitFor(() => expect(screen.getByText('Full Weekend Pass')).toBeTruthy());
    expect(screen.queryByText('Add extras to this ticket')).toBeNull();
    expect(screen.queryByText('Try again')).toBeNull();

    catalogue.mockRestore();
  });
});

describe('21 · Entry pass, attached extras', () => {
  it('lists every attached extra under the holder details', async () => {
    await signInAndComplete();
    const { ticketId } = await buyTheDesignsExtras();
    const attached = await mockApi.tickets.addons(ticketId);
    mockParams.id = ticketId;

    renderWithProviders(<EntryPassScreen />);

    await waitFor(() => expect(screen.getByText('Attached add-ons')).toBeTruthy());
    // Three extras, each labelled by the server rather than by the app.
    expect(attached).toHaveLength(3);
    for (const addon of attached) {
      expect(screen.getByText(addon.label)).toBeTruthy();
    }
    // The design's supporting line under each one: dates for the room and the shuttle, the
    // redemption note for the voucher.
    expect(screen.getByText('23 Oct 2026 → 25 Oct 2026 · redeem at the event')).toBeTruthy();
    expect(screen.getByText('Redeem at the event')).toBeTruthy();
    expect(screen.getByText('Out 23 Oct 2026 · back 25 Oct 2026')).toBeTruthy();
  });

  it('shows no extras section on a ticket with none', async () => {
    await signInAndComplete();
    mockParams.id = await seedTicketId();

    renderWithProviders(<EntryPassScreen />);

    await waitFor(() => expect(screen.getByText('Tulua · live entry pass')).toBeTruthy());
    expect(screen.queryByText('Attached add-ons')).toBeNull();
  });

  /*
   * The status the server sends is the status shown. Every quantity below still reads as a live
   * extra, so a label derived from the counters would say nothing at all.
   */
  it('renders the status the server sent, not one derived from the quantities', async () => {
    await signInAndComplete();
    const { ticketId } = await buyTheDesignsExtras();
    const attached = await mockApi.tickets.addons(ticketId);
    const statuses: TicketAddonStatus[] = ['cancelled', 'voided', 'pending_ticket_replacement'];
    const restated: TicketAddon[] = attached.map((addon, index) => ({
      ...addon,
      status: statuses[index]!,
    }));
    const addons = jest.spyOn(mockApi.tickets, 'addons').mockResolvedValue(restated);
    mockParams.id = ticketId;

    renderWithProviders(<EntryPassScreen />);

    await waitFor(() => expect(screen.getByText('Cancelled')).toBeTruthy());
    expect(screen.getByText('No longer valid')).toBeTruthy();
    expect(screen.getByText('Waiting to be reassigned')).toBeTruthy();

    addons.mockRestore();
  });

  // An em dash has no business in the most-looked-at row of the pass. A holder row with no name
  // is dropped instead.
  it('drops the holder row rather than filling it with a placeholder', async () => {
    await signInAndComplete();
    const ticketId = await seedTicketId();
    const ticket = await mockApi.tickets.detail(ticketId);
    const detail = jest
      .spyOn(mockApi.tickets, 'detail')
      .mockResolvedValue({ ...ticket, holderName: '' });
    mockParams.id = ticketId;

    renderWithProviders(<EntryPassScreen />);

    await waitFor(() => expect(screen.getByText('Venue')).toBeTruthy());
    expect(screen.queryByText('Holder')).toBeNull();
    expect(screen.queryByText('—')).toBeNull();

    detail.mockRestore();
  });
});

describe('19 · Order receipt', () => {
  it("reads as a receipt, with the design's labels", async () => {
    await signInAndComplete();
    const { order } = await buyTheDesignsExtras();
    mockParams.id = order.id;

    renderWithProviders(<OrderDetailScreen />);

    await waitFor(() =>
      expect(screen.getByText(`Order ${order.orderNumber} · 12 Aug 2026`)).toBeTruthy(),
    );
    expect(screen.getByText('Your receipt')).toBeTruthy();
    // Twice: the section heading the design asks for, and the bottom nav's own tab.
    expect(screen.getAllByText('Tickets')).toHaveLength(2);
    expect(screen.getByText('Add-ons')).toBeTruthy();
    // The percentage comes off the order's own VAT rate, never out of the money.
    expect(screen.getByText('VAT (14%)')).toBeTruthy();
    expect(screen.getByText('Paid')).toBeTruthy();
    expect(screen.queryByText('Order details')).toBeNull();
    expect(screen.queryByText('Passes')).toBeNull();
  });

  it('shows each add-on line with its dates and who it was bought for', async () => {
    await signInAndComplete();
    const { order } = await buyTheDesignsExtras();
    mockParams.id = order.id;

    renderWithProviders(<OrderDetailScreen />);

    await waitFor(() => expect(screen.getByText('Add-ons')).toBeTruthy());
    for (const addon of order.addons) {
      const label = addon.quantity > 1 ? `${addon.label} × ${addon.quantity}` : addon.label;
      expect(screen.getByText(label)).toBeTruthy();
    }
    // The room and the shuttle each carry the design's detail line; the voucher has none.
    expect(screen.getByText('Check-in 23 Oct 2026 · check-out 25 Oct 2026')).toBeTruthy();
    expect(screen.getByText('Out 23 Oct 2026, 08:00 · back 25 Oct 2026, 16:00')).toBeTruthy();
    // Decision 6: a recipient who brought their own ticket comes back with no name, so the
    // receipt says how many rather than inventing a label for a stranger.
    expect(screen.getByText('For a ticket holder')).toBeTruthy();
    expect(screen.getAllByText('Nour Hassan and 1 more').length).toBeGreaterThan(0);
  });

  it('closes with the extras footnote and a way back to the tickets', async () => {
    await signInAndComplete();
    const { order } = await buyTheDesignsExtras();
    mockParams.id = order.id;

    renderWithProviders(<OrderDetailScreen />);

    await waitFor(() =>
      expect(
        screen.getByText(
          "Extras are attached to each holder's ticket and redeemed at the event. Non-refundable.",
        ),
      ).toBeTruthy(),
    );
    expect(screen.getByText('See my tickets')).toBeTruthy();
  });

  it('has no add-ons section or footnote on an order without extras', async () => {
    await signInAndComplete();
    const cart = await mockApi.carts.create(TULUA_ID);
    await mockApi.carts.replaceTickets(cart.id, {
      buyerTierId: null,
      items: [{ tierId: TIER_WEEKEND, quantity: 1 }],
      guests: [{ phoneNumber: '+201022334455', name: 'Nour Hassan', tierId: TIER_WEEKEND }],
    });
    const preview = await mockApi.carts.preview(cart.id);
    const order = await mockApi.carts.placeOrder(
      cart.id,
      preview.pricing.pricingConfirmationToken!,
    );
    mockParams.id = order.id;

    renderWithProviders(<OrderDetailScreen />);

    await waitFor(() =>
      expect(screen.getByText(`Order ${order.orderNumber} · 12 Aug 2026`)).toBeTruthy(),
    );
    expect(screen.queryByText('Add-ons')).toBeNull();
    expect(screen.queryByText(/Extras are attached/)).toBeNull();
    // Nothing has been paid yet, so the last row is still the total and there is nowhere to go.
    expect(screen.getByText('Total')).toBeTruthy();
    expect(screen.queryByText('Paid')).toBeNull();
    expect(screen.queryByText('See my tickets')).toBeNull();
  });

  it('labels a refunded or cancelled add-on from the status the server sent', async () => {
    await signInAndComplete();
    const { order } = await buyTheDesignsExtras();
    const statuses: TicketAddonStatus[] = ['refunded', 'cancelled', 'voided'];
    // Every quantity still says "live", so these labels can only have come from `status`.
    const restated: OrderAddon[] = order.addons.map((addon, index) => ({
      ...addon,
      status: statuses[index]!,
    }));
    const detail = jest
      .spyOn(mockApi.orders, 'detail')
      .mockResolvedValue({ ...order, addons: restated });
    mockParams.id = order.id;

    renderWithProviders(<OrderDetailScreen />);

    await waitFor(() => expect(screen.getByText('Refunded')).toBeTruthy());
    expect(screen.getByText('Cancelled')).toBeTruthy();
    expect(screen.getByText('No longer valid')).toBeTruthy();

    detail.mockRestore();
  });

  it('says an add-on is waiting to be reassigned when the server says so', async () => {
    await signInAndComplete();
    const { order } = await buyTheDesignsExtras();
    const restated: OrderAddon[] = order.addons.map((addon) => ({
      ...addon,
      status: 'pending_ticket_replacement' as const,
    }));
    const detail = jest
      .spyOn(mockApi.orders, 'detail')
      .mockResolvedValue({ ...order, addons: restated });
    mockParams.id = order.id;

    renderWithProviders(<OrderDetailScreen />);

    await waitFor(() =>
      expect(screen.getAllByText('Waiting to be reassigned')).toHaveLength(order.addons.length),
    );

    detail.mockRestore();
  });
});
