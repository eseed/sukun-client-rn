import type { EventDetail } from '../api/types';

/**
 * "Add to calendar" on the event page: what goes into the visitor's calendar.
 *
 * Pure, and the same file in the app (`sukun-client-rn/src/lib/calendar.ts`) and on the web
 * (`sukun-client-web/src/lib/calendar.ts`); change them together. The app hands the entry to the
 * phone's own new-event screen (`add-to-calendar.ts`); the web offers Google Calendar or an `.ics`
 * file (`AddToCalendar`).
 */

export interface CalendarEntry {
  title: string;
  /** All-day entries start at midnight, device time, on the first day. */
  start: Date;
  /** Exclusive: an all-day entry ends at midnight after its last day. */
  end: Date;
  allDay: boolean;
  location: string | null;
  notes: string | null;
}

export type CalendarEvent = Pick<
  EventDetail,
  'title' | 'tagline' | 'startDate' | 'endDate' | 'days' | 'venue'
>;

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

function validDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** `2026-10-23` as midnight, device time, that day. */
function localDay(value: string): Date | null {
  const match = DATE_ONLY.exec(value);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** "Il Monte Galala, Ain Sokhna" and its address, without saying the name twice. */
function venueLocation(venue: CalendarEvent['venue']): string | null {
  const name = venue?.name?.trim() || null;
  const address = venue?.address?.trim() || null;
  if (name && address) return address.startsWith(name) ? address : `${name}, ${address}`;
  return name ?? address;
}

/**
 * One entry for the whole event: from the first day's start to the last day's end, as the
 * event's days set them. An event whose days carry no times becomes an all-day entry over its
 * dates. Null when neither gives a usable range.
 */
export function eventCalendarEntry(event: CalendarEvent): CalendarEntry | null {
  const location = venueLocation(event.venue);
  const notes = event.tagline?.trim() || null;

  let start: Date | null = null;
  let end: Date | null = null;
  for (const day of event.days) {
    const startsAt = validDate(day.startsAt);
    const endsAt = validDate(day.endsAt);
    if (!startsAt || !endsAt || endsAt <= startsAt) continue;
    if (!start || startsAt < start) start = startsAt;
    if (!end || endsAt > end) end = endsAt;
  }
  if (start && end) {
    return { title: event.title, start, end, allDay: false, location, notes };
  }

  const firstDay = localDay(event.startDate);
  const lastDay = localDay(event.endDate) ?? firstDay;
  if (!firstDay || !lastDay || lastDay < firstDay) return null;
  const dayAfter = new Date(lastDay.getFullYear(), lastDay.getMonth(), lastDay.getDate() + 1);
  return { title: event.title, start: firstDay, end: dayAfter, allDay: true, location, notes };
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** `20261023` from the device-time date, for all-day entries. */
function basicDate(date: Date): string {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

/** `20261023T070000Z`. */
function basicUtc(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

function entryDates(entry: CalendarEntry): [string, string] {
  return entry.allDay
    ? [basicDate(entry.start), basicDate(entry.end)]
    : [basicUtc(entry.start), basicUtc(entry.end)];
}

/** Google Calendar's new-event page, filled in. */
export function googleCalendarUrl(entry: CalendarEntry): string {
  const [start, end] = entryDates(entry);
  const params = new URLSearchParams({ action: 'TEMPLATE', text: entry.title });
  params.set('dates', `${start}/${end}`);
  if (entry.location) params.set('location', entry.location);
  if (entry.notes) params.set('details', entry.notes);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** RFC 5545 TEXT: backslashes, semicolons, commas and line breaks escaped. */
function icsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Lines longer than 75 octets continue on the next, after a space (RFC 5545 3.1). */
function foldLine(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = '';
  let bytes = 0;
  for (const char of Array.from(line)) {
    const size = encoder.encode(char).length;
    if (bytes + size > (parts.length === 0 ? 75 : 74)) {
      parts.push(current);
      current = '';
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

/**
 * The entry as an iCalendar file, which Apple Calendar, Outlook and most others open. `uid`
 * keeps it one entry when it is added twice; `now` is the stamp.
 */
export function icsCalendar(entry: CalendarEntry, uid: string, now: Date = new Date()): string {
  const [start, end] = entryDates(entry);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Sukun//Events//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${basicUtc(now)}`,
    entry.allDay ? `DTSTART;VALUE=DATE:${start}` : `DTSTART:${start}`,
    entry.allDay ? `DTEND;VALUE=DATE:${end}` : `DTEND:${end}`,
    `SUMMARY:${icsText(entry.title)}`,
    ...(entry.location ? [`LOCATION:${icsText(entry.location)}`] : []),
    ...(entry.notes ? [`DESCRIPTION:${icsText(entry.notes)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}
