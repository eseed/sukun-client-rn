import type { EntryPass, Ticket } from '../../api/types';
import {
  ENTRY_QR_OPEN_WINDOW_MS,
  getEntryPassExpiresAt,
  getEntryPassOpensAt,
  getEntryPassRefreshAt,
  getEntryPassShowUntil,
} from '../entry-pass';

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

describe('entry pass refresh timing', () => {
  const windowStart = Date.parse('2026-10-23T08:00:00.000Z');
  const windowEnd = windowStart + 60_000;

  function pass(serverTime?: number): EntryPass {
    return {
      ticketId: 'ticket-1',
      payload: 'code',
      issuedAt: new Date(windowStart).toISOString(),
      expiresAt: new Date(windowEnd).toISOString(),
      refreshAfterSeconds: 60,
      ...(serverTime === undefined ? {} : { serverTime: new Date(serverTime).toISOString() }),
    };
  }

  it('asks for the next code just after the window ends, not before', () => {
    const receivedAt = windowStart + 50_000;
    const refreshAt = getEntryPassRefreshAt(pass(receivedAt), receivedAt);
    expect(refreshAt).toBeGreaterThan(windowEnd);
    expect(refreshAt - windowEnd).toBeLessThan(1_000);
  });

  it('keeps the code on screen through part of the gate grace', () => {
    const receivedAt = windowStart + 50_000;
    const showUntil = getEntryPassShowUntil(pass(receivedAt), receivedAt);
    expect(showUntil).toBeGreaterThan(getEntryPassRefreshAt(pass(receivedAt), receivedAt));
    expect(showUntil - windowEnd).toBeLessThan(5_000);
  });

  it("places the window on a phone clock that runs ahead of the server's", () => {
    const serverNow = windowStart + 50_000;
    const phoneNow = serverNow + 20_000;
    expect(getEntryPassExpiresAt(pass(serverNow), phoneNow)).toBe(windowEnd + 20_000);
    expect(getEntryPassRefreshAt(pass(serverNow), phoneNow)).toBeGreaterThan(windowEnd + 20_000);
  });

  it('asks again within a second when a code arrives already over', () => {
    const receivedAt = windowEnd + 2_000;
    expect(getEntryPassRefreshAt(pass(), receivedAt) - receivedAt).toBeLessThanOrEqual(1_000);
  });
});

describe('entry pass timing from a backend that sends nextCodeAt', () => {
  const nextCodeAt = Date.parse('2026-10-23T08:02:00.000Z');
  const pass: EntryPass = {
    ticketId: 'ticket-1',
    payload: 'code',
    issuedAt: '2026-10-23T08:00:00.000Z',
    expiresAt: '2026-10-23T08:02:04.000Z',
    nextCodeAt: '2026-10-23T08:02:00.000Z',
    refreshAfterSeconds: 11,
    serverTime: '2026-10-23T08:01:50.000Z',
  };

  it('asks just after nextCodeAt and shows the code until expiresAt', () => {
    const receivedAt = Date.parse('2026-10-23T08:01:50.000Z');
    const refreshAt = getEntryPassRefreshAt(pass, receivedAt);
    expect(refreshAt).toBeGreaterThan(nextCodeAt);
    expect(refreshAt - nextCodeAt).toBeLessThan(1_000);
    expect(getEntryPassShowUntil(pass, receivedAt)).toBe(Date.parse(pass.expiresAt));
  });
});
