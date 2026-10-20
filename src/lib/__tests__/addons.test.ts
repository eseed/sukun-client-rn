import {
  describeOption,
  describeTransportStop,
  isSendableAddonLine,
  ticketAddonDetail,
} from '../addons';

/**
 * The shared predicate behind every cart write: accommodation rooms must hold at least one
 * person and no more than the option's published occupancy, and an unknown occupancy fails
 * closed.
 */

function room(occupants: number) {
  return { occupants: Array.from({ length: occupants }, (_unused, index) => ({ id: index })) };
}

describe('isSendableAddonLine · accommodation', () => {
  it('accepts a room line when every room is full', () => {
    expect(
      isSendableAddonLine({
        type: 'accommodation',
        quantity: 2,
        occupancy: 2,
        rooms: [room(2), room(2)],
      }),
    ).toBe(true);
  });

  it('accepts a room with somebody in it and places left for later', () => {
    expect(
      isSendableAddonLine({
        type: 'accommodation',
        quantity: 2,
        occupancy: 2,
        rooms: [room(2), room(1)],
      }),
    ).toBe(true);
  });

  it('refuses a room nobody is in, or one holding more than it sleeps', () => {
    for (const rooms of [[room(2), room(0)], [room(3)]]) {
      expect(
        isSendableAddonLine({
          type: 'accommodation',
          quantity: rooms.length,
          occupancy: 2,
          rooms,
        }),
      ).toBe(false);
    }
  });

  it('refuses a line whose room count does not match the purchased quantity', () => {
    expect(
      isSendableAddonLine({
        type: 'accommodation',
        quantity: 2,
        occupancy: 2,
        rooms: [room(2)],
      }),
    ).toBe(false);
  });

  it('fails closed when the occupancy is unknown or zero', () => {
    for (const occupancy of [undefined, null, 0]) {
      expect(
        isSendableAddonLine({
          type: 'accommodation',
          quantity: 1,
          occupancy,
          rooms: [room(1)],
        }),
      ).toBe(false);
    }
  });
});

describe('isSendableAddonLine · everything else', () => {
  it('accepts a line only when the assignments add up to the quantity', () => {
    expect(
      isSendableAddonLine({
        type: 'meal',
        quantity: 3,
        assignments: [{ quantity: 2 }, { quantity: 1 }],
      }),
    ).toBe(true);

    expect(
      isSendableAddonLine({
        type: 'meal',
        quantity: 3,
        assignments: [{ quantity: 2 }],
      }),
    ).toBe(false);
  });

  it('treats an omitted quantity on an assignment as one unit', () => {
    expect(
      isSendableAddonLine({
        type: 'transport',
        quantity: 2,
        assignments: [{}, {}],
      }),
    ).toBe(true);
  });
});

describe('transport stops', () => {
  const bus = {
    transportDirection: 'one_way' as const,
    departureDate: '2026-10-23',
    departureTime: '08:00',
    returnDate: null,
    returnTime: null,
  };

  it('says where the bus stops, as the website does', () => {
    expect(describeTransportStop({ pickupPoint: 'New Cairo', transportStopType: 'pickup' })).toBe(
      'Pickup: New Cairo',
    );
    expect(describeTransportStop({ pickupPoint: 'Sokhna', transportStopType: 'drop_off' })).toBe(
      'Drop-off: Sokhna',
    );
    expect(describeTransportStop({ pickupPoint: 'Gate 13' })).toBe('Place: Gate 13');
    expect(describeTransportStop({ transportStopType: 'pickup' })).toBe('Pickup');
    expect(describeTransportStop({})).toBe('');
  });

  it('puts the stop before the times on an option', () => {
    const option = { ...bus, pickupPoint: 'New Cairo', transportStopType: 'pickup' as const };
    expect(describeOption(option as never)).toMatch(/^Pickup: New Cairo · Out /);
    expect(describeOption(bus as never)).toMatch(/^Out /);
  });

  it("adds the stop to a ticket's bus once, not when its label already names it", () => {
    const issued = {
      ...bus,
      type: 'transport',
      addonName: 'Bus: Cairo → Sokhna',
      status: 'active',
      room: null,
      quantity: 1,
      transportStopType: 'pickup',
    };
    expect(
      ticketAddonDetail({ ...issued, label: 'Friday 23', pickupPoint: 'New Cairo' } as never),
    ).toBe('Pickup: New Cairo · Friday 23');
    expect(
      ticketAddonDetail({
        ...issued,
        label: 'Friday 23 · New Cairo',
        pickupPoint: 'New Cairo',
      } as never),
    ).toBe('Friday 23 · New Cairo');
  });
});
