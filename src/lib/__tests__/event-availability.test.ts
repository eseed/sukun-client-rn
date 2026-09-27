import { eventAvailabilityMessage } from '../event-availability';
import type { EventDetail, EventTier } from '../../api/types';

function tier(partial: Partial<EventTier> = {}): EventTier {
  return {
    id: 'tier_1',
    name: 'Weekend Pass',
    description: null,
    priceEgp: '1500.00',
    availabilityStatus: 'available',
    isPurchasable: false,
    available: 100,
    quantityRemaining: null,
    days: [],
    ...partial,
  };
}

function event(state: EventDetail['state'], tiers: EventTier[] = [tier()]) {
  return { state, tiers };
}

describe('eventAvailabilityMessage', () => {
  it('says tickets are available while a tier can be bought', () => {
    expect(eventAvailabilityMessage(event('on_sale', [tier({ isPurchasable: true })]))).toBe(
      'Tickets are available now.',
    );
  });

  it('says so when the event sells no tickets at all', () => {
    expect(eventAvailabilityMessage(event('on_sale', []))).toBe(
      'Tickets are not available for this event.',
    );
  });

  it('says sold out, then closed, before anything else', () => {
    expect(eventAvailabilityMessage(event('sold_out'))).toBe('This event is sold out.');
    expect(
      eventAvailabilityMessage(event('on_sale', [tier({ availabilityStatus: 'sold_out' })])),
    ).toBe('This event is sold out.');
    expect(eventAvailabilityMessage(event('sales_closed'))).toBe(
      'Sales for this event are closed.',
    );
  });

  it('never promises tickets to an event that is live, over or cancelled', () => {
    expect(eventAvailabilityMessage(event('cancelled'))).toBe('This event was cancelled.');
    expect(eventAvailabilityMessage(event('completed'))).toBe('This event has ended.');
    expect(eventAvailabilityMessage(event('live'))).toBe('Ticket sales for this event have ended.');
  });

  it('says not on sale yet for an event whose sales have not opened', () => {
    expect(eventAvailabilityMessage(event('published'))).toBe('Tickets are not on sale yet.');
  });
});
