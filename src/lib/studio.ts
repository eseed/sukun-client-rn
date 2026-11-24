import { randomUUID } from 'expo-crypto';
import { ApiError } from '../api/live/http';
import type { MemberPackageSummary, PackageValidityUnit, StudioBranch } from '../api/studio-types';
import { colors } from '../theme/tokens';
import { TIMEZONE } from './format';

/**
 * Studio (classes) presentation helpers. Presentation only: prices, passes, windows and
 * eligibility all come from the server (CLAUDE.md rule 7); nothing here decides a booking.
 */

/** A branch with no colour set in the admin reads in the brand's sage, never a guessed hue. */
export function branchColor(colorHex: string | null | undefined): string {
  return colorHex && /^#[0-9a-f]{6}$/i.test(colorHex) ? colorHex : colors.sage500;
}

/** `"Sukun Studios East"` → `"East"`: the short name the design uses in running copy. */
export function branchShortName(name: string | null | undefined): string {
  if (!name) return 'the studio';
  return name.replace(/^Sukun\s+Studios?\s+/i, '').trim() || name;
}

/** Branch picker order: the admin's sort order, so West then East as designed. */
export function sortBranches(branches: StudioBranch[]): StudioBranch[] {
  return [...branches].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

const WEEKDAY_SHORT = new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, weekday: 'short' });
const WEEKDAY_LONG = new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, weekday: 'long' });
const DAY_MONTH = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIMEZONE,
  day: 'numeric',
  month: 'short',
});
const DAY_MONTH_YEAR = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIMEZONE,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const CLOCK = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIMEZONE,
  hour: 'numeric',
  minute: '2-digit',
  hourCycle: 'h23',
});
const MONTH_YEAR = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIMEZONE,
  month: 'long',
  year: 'numeric',
});

/** `"9:00"`, Cairo, 24-hour without a leading zero, as the class cards write it. */
export function classTime(iso: string): string {
  // en-GB pads the hour ("07:00"); the design writes "7:00".
  return CLOCK.format(new Date(iso)).replace(/^0(\d)/, '$1');
}

/** `"Sat 21 Nov"` */
export function classDay(iso: string): string {
  const d = new Date(iso);
  return `${WEEKDAY_SHORT.format(d)} ${DAY_MONTH.format(d)}`;
}

/** `"Saturday 21 Nov · 9:00 – 10:15"` */
export function classWhenLong(startsAt: string, endsAt: string): string {
  const d = new Date(startsAt);
  return `${WEEKDAY_LONG.format(d)} ${DAY_MONTH.format(d)} · ${classTime(startsAt)} – ${classTime(endsAt)}`;
}

/** `"Sat 21 Nov · 9:00"` */
export function classWhenShort(startsAt: string): string {
  return `${classDay(startsAt)} · ${classTime(startsAt)}`;
}

/** `"SAT 21 NOV"` for the Bookings list's date headers; the year only when it isn't this one. */
export function classDateHeader(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const sameYear = DAY_MONTH_YEAR.format(d).slice(-4) === DAY_MONTH_YEAR.format(now).slice(-4);
  const text = sameYear
    ? `${WEEKDAY_SHORT.format(d)} ${DAY_MONTH.format(d)}`
    : DAY_MONTH_YEAR.format(d);
  return text.toUpperCase();
}

/** `"November 2026"` */
export function monthYear(iso: string): string {
  return MONTH_YEAR.format(new Date(iso));
}

/** `"14 Feb 2027"` from a Cairo calendar date (`YYYY-MM-DD`). */
export function calendarDate(isoDate: string | null | undefined): string {
  if (!isoDate) return '';
  return DAY_MONTH_YEAR.format(new Date(`${isoDate}T12:00:00.000Z`));
}

/** Class length as the cards write it: `60` → `"1h"`, `75` → `"1h 15"`, `45` → `"45 min"`. */
export function classDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h}h ${m}` : `${h}h`;
}

/** Cairo calendar date of an instant, `YYYY-MM-DD`. */
export function cairoDate(ms: number): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms));
  return parts;
}

/** Adds days to a Cairo calendar date. Noon UTC keeps it clear of any offset. */
export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Week strip labels for a Cairo date: `{ weekday: 'Mon', day: 16 }`. */
export function dayCell(isoDate: string): { weekday: string; day: number } {
  const d = new Date(`${isoDate}T12:00:00.000Z`);
  return {
    weekday: new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short' }).format(d),
    day: d.getUTCDate(),
  };
}

/** `"Free to cancel until Sat 8:30. After that the pass is used."` */
export function freeCancelUntil(startsAt: string, windowMinutes: number): string {
  const deadline = new Date(new Date(startsAt).getTime() - windowMinutes * 60_000).toISOString();
  return `${WEEKDAY_SHORT.format(new Date(deadline))} ${classTime(deadline)}`;
}

/** Minutes until an instant, rounded up, never below zero. */
export function minutesUntil(iso: string, now = Date.now()): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - now) / 60_000));
}

/** `"valid 3 months"`, `"valid 45 days"`, `"valid 1 day"`, `"valid for the term"`. */
export function validityText(value: number, unit: PackageValidityUnit): string {
  if (unit === 'term') return 'valid for the term';
  return `valid ${value} ${unit}${value === 1 ? '' : 's'}`;
}

/** `"10 classes"`, `"1 class"`, `"Unlimited"` */
export function passesText(passes: number | null): string {
  if (passes === null) return 'Unlimited';
  return `${passes} class${passes === 1 ? '' : 'es'}`;
}

/** The package card's line: `"6 of 10 passes left · expires 14 Feb 2027"`. */
export function packageLine(p: MemberPackageSummary): string {
  const expiry =
    p.status === 'incomplete'
      ? 'starts with your first class'
      : p.expiresOn
        ? `${p.status === 'expired' ? 'expired' : 'expires'} ${calendarDate(p.expiresOn)}`
        : '';
  const passes =
    p.passesTotal === null
      ? 'Unlimited'
      : `${p.passesRemaining ?? 0} of ${p.passesTotal} passes left`;
  return expiry ? `${passes} · ${expiry}` : passes;
}

/** Share of passes left, 0 to 1, for the progress bar. Unlimited reads as full. */
export function packageProgress(p: MemberPackageSummary): number {
  if (p.passesTotal === null || p.passesTotal === 0) return 1;
  return Math.max(0, Math.min(1, (p.passesRemaining ?? 0) / p.passesTotal));
}

export function packageStatusLabel(status: MemberPackageSummary['status']): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'frozen':
      return 'Frozen';
    case 'incomplete':
      return 'Not started';
    case 'expired':
      return 'Expired';
    case 'exhausted':
      return 'Used up';
    case 'cancelled':
      return 'Cancelled';
    default:
      return status;
  }
}

/** One key per attempt: the server replays the first result for a repeated tap. */
export function newIdempotencyKey(): string {
  return randomUUID();
}

/**
 * Copy for Studio refusals. The server already sends a translated `message` for every code, so
 * the app only overrides the handful whose design copy differs, and otherwise shows the
 * server's words rather than a generic fallback.
 */
const STUDIO_MESSAGES: Record<string, string> = {
  CLASS_BOOKING_FULL: 'This class is full. Check the schedule for another time.',
  CLASS_BOOKING_ALREADY_EXISTS: "You're already booked for this class.",
  CLASS_BOOKING_SESSION_CLOSED: 'Booking for this class has closed.',
  CLASS_BOOKING_SESSION_STARTED: 'This class has already started.',
  CLASS_BOOKING_ONLINE_DISABLED:
    'This class is booked through the studio. Contact Sukun for assistance.',
  CLASS_BOOKING_AGE_RESTRICTED: "This class has an age range, and your date of birth isn't in it.",
  CLASS_BOOKING_PREVIEW_STALE:
    'Something changed while you were deciding. Check the details and try again.',
  STUDIO_ORDER_TOTAL_CHANGED: 'The price changed. Check the new total and try again.',
  STUDIO_LEGAL_ACCEPTANCE_REQUIRED: 'Please accept the studio terms first.',
  CLASS_SESSION_BRANCH_UNAVAILABLE: 'Contact Sukun for assistance.',
  CLASS_INVITE_SELF: "That's your own number. Invite a friend's WhatsApp number instead.",
  CLASS_INVITE_ALREADY_INVITED: "You've already invited this number to this class.",
  CLASS_INVITE_FRIEND_ALREADY_BOOKED: "They're already booked for this class.",
  CLASS_INVITE_LIMIT_REACHED: 'You can invite up to 5 friends to a class.',
  PROMO_CODE_INVALID: "This promo code isn't valid.",
  ROOM_QR_INVALID: "This QR code isn't a Sukun room code. Scan the poster on the studio wall.",
  ROOM_QR_NO_CLASS: "There's no class in this room right now.",
  ROOM_QR_WINDOW_CLOSED: 'Check-in for this class has closed.',
  ROOM_QR_TERMS_REQUIRED: 'Accept the studio terms first, then scan again.',
  TOO_MANY_REQUESTS: 'Too many tries. Wait a moment and try again.',
};

export function studioErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const own = STUDIO_MESSAGES[error.code];
    if (own) return own;
    if (error.status === 0) return "We couldn't reach Sukun. Check your connection and try again.";
    if (error.message && !/^[A-Z_]+$/.test(error.message)) return error.message;
  }
  return 'Something went wrong. Try again.';
}

export function studioErrorCode(error: unknown): string | undefined {
  return error instanceof ApiError ? error.code : undefined;
}

/**
 * The website that pairs with the backend this build talks to: class share links, invite links
 * and room posters live there, and open the app where it is installed.
 */
export function webOrigin(apiBaseUrl: string = process.env.EXPO_PUBLIC_API_BASE_URL ?? ''): string {
  return /staging/i.test(apiBaseUrl)
    ? 'https://clientstaging.sukunwellness.co'
    : 'https://book.sukunwellness.co';
}

/** `https://<web>/classes/sessions/<id>`: opens this class in the app, or on the website. */
export function classShareUrl(sessionId: string): string {
  return `${webOrigin()}/classes/sessions/${sessionId}`;
}

/**
 * A room QR as printed on the poster: the web link (`https://<web>/checkin/<room>…#t=<code>`) or
 * the older bare `sukun-room:v1:…`. The text goes to the server unchanged (P4 room poster notes).
 */
export function isRoomQr(text: string): boolean {
  return /^sukun-room:v1:/i.test(text) || /^https:\/\/[^/]+\/checkin\/[^/?#]+/i.test(text);
}

const WEB_LINK_HOSTS = new Set(['book.sukunwellness.co', 'clientstaging.sukunwellness.co']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN_RE = /^[A-Za-z0-9_-]{8,200}$/;

/**
 * The app screen for a Studio link from the website (or a Sukun push), or null:
 *
 * - room poster `https://<web>/checkin/<room>?utm…#t=<code>` → the scanner, with the whole link
 *   as the scan (the `#` part included: the server needs it, and the browser never sends it);
 * - class share `https://<web>/classes/sessions/<id>` → the class;
 * - friend invite `https://<web>/classes/invites/<token>`, or `sukun(client)://classes/invites/<token>`
 *   from the invite push → the invitation.
 */
export function studioLinkPath(link: string): string | null {
  const scheme = /^sukun(?:client)?:\/\/classes\/invites\/([^/?#]+)$/.exec(link);
  if (scheme) return TOKEN_RE.test(scheme[1]!) ? `/classes/invites/${scheme[1]}` : null;
  // Studio push landings (backend #341): the class, the class to rate, a package, My packages.
  const app = /^sukun(?:client)?:\/\/(.+)$/.exec(link)?.[1];
  if (app) {
    const [a, b, c, d] = app.split('/');
    if (a === 'classes' && b === 'sessions' && c && UUID_RE.test(c) && d === undefined) {
      return `/classes/sessions/${c.toLowerCase()}`;
    }
    if (a === 'studio' && b === 'bookings' && c && UUID_RE.test(c) && d === 'rate') {
      return `/studio/bookings/${c.toLowerCase()}/rate`;
    }
    if (a === 'studio' && b === 'packages' && c === undefined) return '/studio/packages';
    if (a === 'studio' && b === 'packages' && c && UUID_RE.test(c) && d === undefined) {
      return `/studio/packages/${c.toLowerCase()}`;
    }
    return null;
  }
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || !WEB_LINK_HOSTS.has(url.hostname.toLowerCase())) return null;
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] === 'checkin' && parts.length === 2 && UUID_RE.test(parts[1]!)) {
    return `/studio/scan?payload=${encodeURIComponent(link)}`;
  }
  if (
    parts[0] === 'classes' &&
    parts[1] === 'sessions' &&
    parts.length === 3 &&
    UUID_RE.test(parts[2]!)
  ) {
    return `/classes/sessions/${parts[2]!.toLowerCase()}`;
  }
  if (
    parts[0] === 'classes' &&
    parts[1] === 'invites' &&
    parts.length === 3 &&
    TOKEN_RE.test(parts[2]!)
  ) {
    return `/classes/invites/${parts[2]}`;
  }
  return null;
}
