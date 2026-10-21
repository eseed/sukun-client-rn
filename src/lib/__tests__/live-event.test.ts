import type { EventDay, EventDetail } from '../../api/types';
import { isEventHappening } from '../live-event';

/**
 * Tulua's two days, in UTC: Friday 13:00 to Saturday 00:00, Saturday 13:00 to Sunday 00:00.
 * Friday's gates-open time is the real mistake from production, a month early.
 */
const days: EventDay[] = [
  {
    id: 'day-1',
    dayDate: '2026-10-23',
    label: null,
    startsAt: '2026-10-23T13:00:00.000Z',
    endsAt: '2026-10-24T00:00:00.000Z',
    gatesOpenAt: '2026-09-23T09:00:00.000Z',
  },
  {
    id: 'day-2',
    dayDate: '2026-10-24',
    label: null,
    startsAt: '2026-10-24T13:00:00.000Z',
    endsAt: '2026-10-25T00:00:00.000Z',
    gatesOpenAt: '2026-10-24T12:00:00.000Z',
  },
];

const at = (iso: string) => Date.parse(iso);
const event = (state: EventDetail['state']) => ({ state, days });

describe('isEventHappening', () => {
  it('opens 12 hours before the first day starts, whatever the gates-open time says', () => {
    expect(isEventHappening(event('on_sale'), at('2026-09-30T12:00:00.000Z'))).toBe(false);
    expect(isEventHappening(event('on_sale'), at('2026-10-23T00:59:00.000Z'))).toBe(false);
    expect(isEventHappening(event('on_sale'), at('2026-10-23T01:00:00.000Z'))).toBe(true);
  });

  it('stays open between the days and closes when the last day ends', () => {
    expect(isEventHappening(event('sales_closed'), at('2026-10-24T06:00:00.000Z'))).toBe(true);
    expect(isEventHappening(event('sold_out'), at('2026-10-24T23:59:00.000Z'))).toBe(true);
    expect(isEventHappening(event('on_sale'), at('2026-10-25T00:00:00.000Z'))).toBe(false);
  });

  it('never opens for a finished or cancelled event', () => {
    expect(isEventHappening(event('completed'), at('2026-10-23T15:00:00.000Z'))).toBe(false);
    expect(isEventHappening(event('cancelled'), at('2026-10-23T15:00:00.000Z'))).toBe(false);
  });

  it('still opens for an event an admin set live by hand', () => {
    expect(isEventHappening(event('live'), at('2026-09-01T00:00:00.000Z'))).toBe(true);
  });
});
