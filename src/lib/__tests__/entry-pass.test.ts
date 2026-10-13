import type { Ticket } from '../../api/types';
import { ENTRY_QR_OPEN_WINDOW_MS, getEntryPassOpensAt } from '../entry-pass';

function ticket(entryQrOpenEarly: boolean, startsAt: string[]): Pick<Ticket, 'days' | 'event'> {
  return {
    event: {
      id: 'event-1',
      slug: 'tulua',
      title: 'Tulua',
      coverImageUrl: null,
      venueName: null,
      venueMapUrl: null,
      entryQrOpenEarly,
    },
    days: startsAt.map((value, index) => ({
      id: `day-${index}`,
      date: value.slice(0, 10),
      startsAt: value,
      gatesOpenAt: null,
    })),
  };
}

describe('getEntryPassOpensAt', () => {
  it('opens 12 hours before the earliest day', () => {
    expect(
      getEntryPassOpensAt(ticket(false, ['2026-10-24T08:00:00Z', '2026-10-23T08:00:00Z'])),
    ).toBe(Date.parse('2026-10-23T08:00:00Z') - ENTRY_QR_OPEN_WINDOW_MS);
  });

  it('is already open when an admin opened QR codes early', () => {
    expect(getEntryPassOpensAt(ticket(true, ['2099-01-01T08:00:00Z']))).toBeLessThanOrEqual(
      Date.now(),
    );
  });

  it('stays open after the event once it has opened', () => {
    const opensAt = getEntryPassOpensAt(ticket(false, ['2020-01-01T08:00:00Z']));
    expect(opensAt).not.toBeNull();
    expect(Date.now()).toBeGreaterThanOrEqual(opensAt!);
  });
});
