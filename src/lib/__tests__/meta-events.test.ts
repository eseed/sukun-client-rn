import type { Cart, OrderAddon, OrderDetail } from '../../api/types';
import { trackMeta } from '../analytics';
import {
  resetMetaEventsForTests,
  trackMetaAddExtra,
  trackMetaAddExtrasToTicket,
  trackMetaAddPaymentInfo,
  trackMetaAddTickets,
  trackMetaCompleteRegistration,
  trackMetaFindLocation,
  trackMetaInitiateCheckout,
  trackMetaPurchase,
  trackMetaSearch,
  trackMetaViewContent,
} from '../meta-events';

jest.mock('../analytics', () => ({ trackMeta: jest.fn() }));
const mockTrackMeta = trackMeta as jest.Mock;

const EVENT = { id: 'event-1', title: 'Tulua Festival', priceFromEgp: '1500.00' };
const TIER = { priceEgp: '1710.00' };

function orderAddon(overrides: Partial<OrderAddon> = {}): OrderAddon {
  return {
    orderAddonItemId: 'oa-1',
    addonOptionId: 'opt-room',
    type: 'accommodation',
    label: 'Lodge room',
    transportDirection: null,
    departureDate: null,
    departureTime: null,
    returnDate: null,
    returnTime: null,
    unitPriceEgp: '900.00',
    lineTotalEgp: '900.00',
    quantity: 1,
    originalQuantity: 1,
    activeQuantity: 1,
    pendingTicketReplacementQuantity: 0,
    cancelledQuantity: 0,
    voidedQuantity: 0,
    status: 'active',
    recipients: [],
    room: null,
    ...overrides,
  };
}

beforeEach(() => {
  mockTrackMeta.mockClear();
  resetMetaEventsForTests();
});

describe('browsing', () => {
  it('sends ViewContent for an event with its "From" price', () => {
    trackMetaViewContent(EVENT);
    expect(mockTrackMeta).toHaveBeenCalledWith('ViewContent', {
      content_ids: ['event-1'],
      content_type: 'product',
      content_name: 'Tulua Festival',
      value: 1500,
      currency: 'EGP',
    });
  });

  it('sends FindLocation for the venue link', () => {
    trackMetaFindLocation(EVENT);
    expect(mockTrackMeta).toHaveBeenCalledWith('FindLocation', {
      content_ids: ['event-1'],
      content_type: 'product',
      content_name: 'Tulua Festival',
    });
  });
});

describe('search', () => {
  it('sends the settled term, and the tag chip as the description', () => {
    trackMetaSearch('  Desert   Yoga ', 'wellness');
    expect(mockTrackMeta).toHaveBeenCalledWith('Search', {
      search_string: 'desert yoga',
      content_name: 'wellness',
    });
  });

  it('does not repeat the same search, but does once it was cleared', () => {
    trackMetaSearch('yoga', null);
    trackMetaSearch('Yoga ', null);
    expect(mockTrackMeta).toHaveBeenCalledTimes(1);

    trackMetaSearch('', null);
    trackMetaSearch('yoga', null);
    expect(mockTrackMeta).toHaveBeenCalledTimes(2);
  });

  it('never sends a term that could be an email address or a phone number', () => {
    trackMetaSearch('nour@example.com', null);
    trackMetaSearch('+20 100 123 4567', 'music');
    expect(mockTrackMeta).not.toHaveBeenCalled();

    trackMetaSearch('retreat 2026', null);
    expect(mockTrackMeta).toHaveBeenCalledWith('Search', { search_string: 'retreat 2026' });
  });
});

describe('the basket', () => {
  it('adds one ticket at the pass price, identified by its event', () => {
    trackMetaAddTickets(EVENT, TIER, 1);
    expect(mockTrackMeta).toHaveBeenCalledWith('AddToCart', {
      content_ids: ['event-1'],
      content_type: 'product',
      contents: [{ id: 'event-1', quantity: 1 }],
      num_items: 1,
      content_name: 'Tulua Festival',
      value: 1710,
      currency: 'EGP',
    });
  });

  it('adds several tickets without a value, which would be a price worked out here', () => {
    trackMetaAddTickets(EVENT, TIER, 3);
    expect(mockTrackMeta).toHaveBeenCalledWith('AddToCart', {
      content_ids: ['event-1'],
      content_type: 'product',
      contents: [{ id: 'event-1', quantity: 3 }],
      num_items: 3,
      content_name: 'Tulua Festival',
    });
  });

  it('adds an extra in checkout by its option, without a value', () => {
    trackMetaAddExtra({ optionId: 'opt-dinner', addonName: 'Dinner voucher', quantity: 2 });
    expect(mockTrackMeta).toHaveBeenCalledWith('AddToCart', {
      content_ids: ['opt-dinner'],
      content_type: 'product',
      contents: [{ id: 'opt-dinner', quantity: 2 }],
      num_items: 2,
      content_name: 'Dinner voucher',
    });
  });

  it("adds extras to a ticket already held at the server's subtotal", () => {
    trackMetaAddExtrasToTicket(
      [
        { id: 'opt-dinner', quantity: 2 },
        { id: 'opt-room', quantity: 1 },
      ],
      '1460.00',
    );
    expect(mockTrackMeta).toHaveBeenCalledWith('AddToCart', {
      content_ids: ['opt-dinner', 'opt-room'],
      content_type: 'product',
      contents: [
        { id: 'opt-dinner', quantity: 2 },
        { id: 'opt-room', quantity: 1 },
      ],
      num_items: 3,
      value: 1460,
      currency: 'EGP',
    });
  });
});

describe('checkout', () => {
  const cart: Pick<Cart, 'eventId' | 'tickets' | 'addons'> = {
    eventId: 'event-1',
    tickets: [
      { cartTicketItemId: 't-1', tierId: 'tier-1', quantity: 2 },
      { cartTicketItemId: 't-2', tierId: 'tier-2', quantity: 1 },
    ],
    addons: [
      {
        cartAddonItemId: 'a-1',
        optionId: 'opt-dinner',
        quantity: 2,
        type: 'meal',
        assignments: [],
        currentPrice: '280.00',
        available: null,
      },
    ],
  };

  it("initiates checkout with the server's cart and quote", () => {
    trackMetaInitiateCheckout({ cart, totalEgp: '6120.00' });
    expect(mockTrackMeta).toHaveBeenCalledWith('InitiateCheckout', {
      content_ids: ['event-1', 'opt-dinner'],
      content_type: 'product',
      contents: [
        { id: 'event-1', quantity: 3 },
        { id: 'opt-dinner', quantity: 2 },
      ],
      num_items: 5,
      value: 6120,
      currency: 'EGP',
    });
  });

  it('initiates checkout for extras on a ticket already held without a ticket line', () => {
    trackMetaInitiateCheckout({ cart: { ...cart, tickets: [] }, totalEgp: undefined });
    expect(mockTrackMeta).toHaveBeenCalledWith('InitiateCheckout', {
      content_ids: ['opt-dinner'],
      content_type: 'product',
      contents: [{ id: 'opt-dinner', quantity: 2 }],
      num_items: 2,
    });
  });

  it('sends CompleteRegistration with nothing about the person', () => {
    trackMetaCompleteRegistration();
    expect(mockTrackMeta).toHaveBeenCalledWith('CompleteRegistration');
  });

  it("sends AddPaymentInfo with the order's total, or bare without an order", () => {
    trackMetaAddPaymentInfo({ totalEgp: '2280.00', currency: 'EGP' });
    trackMetaAddPaymentInfo(undefined);
    expect(mockTrackMeta.mock.calls).toEqual([
      ['AddPaymentInfo', { value: 2280, currency: 'EGP' }],
      ['AddPaymentInfo', {}],
    ]);
  });

  it('sends Purchase with what was bought, the total, and the order id', () => {
    const order = {
      id: 'order-1',
      eventId: 'event-1',
      totalEgp: '4320.00',
      currency: 'EGP',
      items: [{ tierId: 'tier-1', quantity: 2, unitPriceEgp: '1710.00', lineTotalEgp: '3420.00' }],
      addons: [orderAddon()],
    } satisfies Partial<OrderDetail>;

    trackMetaPurchase(order);

    expect(mockTrackMeta).toHaveBeenCalledWith(
      'Purchase',
      {
        content_ids: ['event-1', 'opt-room'],
        content_type: 'product',
        contents: [
          { id: 'event-1', quantity: 2 },
          { id: 'opt-room', quantity: 1 },
        ],
        num_items: 3,
        value: 4320,
        currency: 'EGP',
      },
      { orderId: 'order-1' },
    );
  });
});
