import type { EventDay } from '../../api/types';
import { type CalendarEvent, eventCalendarEntry, googleCalendarUrl, icsCalendar } from '../calendar';

function day(dayDate: string, startsAt: string, endsAt: string): EventDay {
  return { id: dayDate, dayDate, label: null, startsAt, endsAt, gatesOpenAt: null };
}

/** Tulua as production serves it: two days, 09:00 and 08:00 to 21:00 Cairo. */
const tulua: CalendarEvent = {
  title: 'Tulua Festival',
  tagline: 'A two day journey of human rising.',
  startDate: '2026-10-23',
  endDate: '2026-10-24',
  venue: {
    name: 'Il Monte Galala, Ain Sokhna',
    address: 'Ain El Sokhna, Zafarana Road, Galala Heights, Suez Governorate',
    mapUrl: null,
  },
  days: [
    day('2026-10-24', '2026-10-24T06:00:00.000Z', '2026-10-24T19:00:00.000Z'),
    day('2026-10-23', '2026-10-23T07:00:00.000Z', '2026-10-23T19:00:00.000Z'),
  ],
};

describe('eventCalendarEntry', () => {
  it('runs from the first day start to the last day end, whatever order the days come in', () => {
    const entry = eventCalendarEntry(tulua);
    expect(entry).toMatchObject({
      title: 'Tulua Festival',
      allDay: false,
      notes: 'A two day journey of human rising.',
    });
    expect(entry?.start.toISOString()).toBe('2026-10-23T07:00:00.000Z');
    expect(entry?.end.toISOString()).toBe('2026-10-24T19:00:00.000Z');
  });

  it('names the venue and its address once each', () => {
    expect(eventCalendarEntry(tulua)?.location).toBe(
      'Il Monte Galala, Ain Sokhna, Ain El Sokhna, Zafarana Road, Galala Heights, Suez Governorate',
    );
    const repeated = {
      ...tulua,
      venue: { name: 'Il Monte', address: 'Il Monte, Galala', mapUrl: null },
    };
    expect(eventCalendarEntry(repeated)?.location).toBe('Il Monte, Galala');
    expect(eventCalendarEntry({ ...tulua, venue: null })?.location).toBeNull();
  });

  it('falls back to an all-day entry over the dates when no day has usable times', () => {
    const entry = eventCalendarEntry({
      ...tulua,
      days: [day('2026-10-23', 'not a time', '2026-10-23T19:00:00.000Z')],
    });
    expect(entry?.allDay).toBe(true);
    expect(entry?.start).toEqual(new Date(2026, 9, 23));
    expect(entry?.end).toEqual(new Date(2026, 9, 25));
  });

  it('gives nothing when the event has no usable dates at all', () => {
    expect(eventCalendarEntry({ ...tulua, days: [], startDate: '', endDate: '' })).toBeNull();
  });
});

describe('googleCalendarUrl', () => {
  it('fills in the title, UTC times, place and tagline', () => {
    const url = new URL(googleCalendarUrl(eventCalendarEntry(tulua)!));
    expect(url.origin + url.pathname).toBe('https://calendar.google.com/calendar/render');
    expect(url.searchParams.get('action')).toBe('TEMPLATE');
    expect(url.searchParams.get('text')).toBe('Tulua Festival');
    expect(url.searchParams.get('dates')).toBe('20261023T070000Z/20261024T190000Z');
    expect(url.searchParams.get('location')).toContain('Il Monte Galala');
    expect(url.searchParams.get('details')).toBe('A two day journey of human rising.');
  });

  it('uses plain dates for an all-day entry, ending the day after', () => {
    const url = new URL(googleCalendarUrl(eventCalendarEntry({ ...tulua, days: [] })!));
    expect(url.searchParams.get('dates')).toBe('20261023/20261025');
  });
});

describe('icsCalendar', () => {
  const now = new Date('2026-10-17T10:00:00.000Z');

  it('writes one event with escaped text and CRLF lines', () => {
    const ics = icsCalendar(eventCalendarEntry(tulua)!, 'tulua@sukunwellness.co', now);
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('\r\nUID:tulua@sukunwellness.co\r\n');
    expect(ics).toContain('\r\nDTSTAMP:20261017T100000Z\r\n');
    expect(ics).toContain('\r\nDTSTART:20261023T070000Z\r\n');
    expect(ics).toContain('\r\nDTEND:20261024T190000Z\r\n');
    expect(ics).toContain('\r\nSUMMARY:Tulua Festival\r\n');
    expect(ics.replace(/\r\n /g, '')).toContain('LOCATION:Il Monte Galala\\, Ain Sokhna\\, Ain El');
  });

  it('marks an all-day entry with plain dates', () => {
    const ics = icsCalendar(eventCalendarEntry({ ...tulua, days: [] })!, 'uid', now);
    expect(ics).toContain('\r\nDTSTART;VALUE=DATE:20261023\r\n');
    expect(ics).toContain('\r\nDTEND;VALUE=DATE:20261025\r\n');
  });

  it('folds long lines at 75 octets', () => {
    const long = { ...tulua, title: 'Sukun '.repeat(30).trim(), days: [] };
    const lines = icsCalendar(eventCalendarEntry(long)!, 'uid', now).split('\r\n');
    for (const line of lines) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(lines.some((line) => line.startsWith(' '))).toBe(true);
  });
});
