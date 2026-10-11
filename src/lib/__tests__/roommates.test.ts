import type { CartAttendee } from '../../api/types';
import { groupForRoom, peopleInOrder, type Roommate } from '../roommates';

const person = (key: string, guardianKey?: string): Roommate => ({
  key,
  ...(guardianKey ? { guardianKey } : {}),
});
const keys = (people: Roommate[]) => people.map((one) => one.key);

describe('groupForRoom', () => {
  it('fills the free places in order', () => {
    expect(keys(groupForRoom([person('you'), person('ali'), person('sara')], 2))).toEqual([
      'you',
      'ali',
    ]);
  });

  it('keeps a child with their guardian, skipping a family that does not fit whole', () => {
    const free = [person('you'), person('ali'), person('lina', 'ali'), person('sara')];
    expect(keys(groupForRoom(free, 2))).toEqual(['you', 'sara']);
    expect(keys(groupForRoom([person('ali'), person('lina', 'ali')], 2))).toEqual(['ali', 'lina']);
  });

  it('never puts a child in a room without their guardian', () => {
    const free = [person('ali'), person('lina', 'ali'), person('omar', 'ali')];
    expect(keys(groupForRoom(free, 2))).toEqual([]);
    // The guardian is already in the room: their child joins them.
    expect(keys(groupForRoom([person('lina', 'ali')], 1, ['ali']))).toEqual(['lina']);
  });

  it('leaves a child whose guardian is in another room to be placed by hand', () => {
    expect(keys(groupForRoom([person('lina', 'ali'), person('sara')], 2))).toEqual(['sara']);
  });
});

describe('peopleInOrder', () => {
  const attendee = (id: string, extra: Partial<CartAttendee> = {}): CartAttendee => ({
    cartAttendeeId: id,
    cartTicketItemId: 'item',
    attendeeType: 'guest',
    name: id,
    phoneNumber: null,
    email: null,
    ...extra,
  });

  it('puts you first and each child right after the adult they come with', () => {
    const order = peopleInOrder([
      attendee('ali'),
      attendee('lina', { isChild: true, guardianCartAttendeeId: 'sara' }),
      attendee('sara'),
      attendee('omar', { isChild: true, guardianCartAttendeeId: 'you' }),
      attendee('you', { attendeeType: 'buyer' }),
    ]).map((one) => one.cartAttendeeId);
    expect(order).toEqual(['you', 'omar', 'ali', 'sara', 'lina']);
  });

  it('keeps a child whose guardian is a ticket from before, at the end', () => {
    const order = peopleInOrder([
      attendee('kid', { isChild: true, guardianCartAttendeeId: null, guardianTicketId: 't-1' }),
      attendee('ali'),
    ]).map((one) => one.cartAttendeeId);
    expect(order).toEqual(['ali', 'kid']);
  });
});
