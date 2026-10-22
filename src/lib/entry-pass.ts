import type { EntryPass, Ticket } from '../api/types';

const DEFAULT_ENTRY_QR_REFRESH_SECONDS = 120;
const MAX_TIMER_DELAY_MS = 2_147_483_647;
const MAX_QR_PAYLOAD_LENGTH = 8_192;

function readRefreshSeconds(): number {
  const configured = Number(process.env.EXPO_PUBLIC_ENTRY_QR_REFRESH_SECONDS);
  if (!Number.isSafeInteger(configured) || configured <= 0) {
    return DEFAULT_ENTRY_QR_REFRESH_SECONDS;
  }
  return Math.min(configured, Math.floor(MAX_TIMER_DELAY_MS / 1000));
}

/** Fallback code lifetime and cache time; each response's own window decides its refresh. */
const ENTRY_QR_REFRESH_SECONDS = readRefreshSeconds();
export const ENTRY_QR_REFRESH_INTERVAL_MS = ENTRY_QR_REFRESH_SECONDS * 1000;
export const ENTRY_QR_OPEN_WINDOW_MS = 12 * 60 * 60 * 1000;
/**
 * The backend issues one code per fixed clock window (`issuedAt` to `expiresAt`) and only starts
 * the next one when the window ends, so asking before then returns the same code. Ask just after.
 */
const ENTRY_QR_ROLLOVER_DELAY_MS = 250;
/**
 * The gate still accepts a code for a few seconds after its window (backend
 * `ENTRY_QR_EXPIRY_GRACE_SECONDS`, 5s), so the old code stays up while the next one loads
 * rather than a spinner. Newer backends say how long themselves, in `expiresAt`.
 */
const ENTRY_QR_DISPLAY_GRACE_MS = 3_000;
/** A code already over on arrival (this phone's clock is off): ask again soon, not a cycle later. */
const ENTRY_QR_STALE_RETRY_MS = 1_000;

/**
 * How far this phone's clock is behind the server's, from the `serverTime` the response carries.
 * Older backends send none, and the phone's clock is trusted as it is.
 */
function serverClockOffsetMs(pass: EntryPass, dataUpdatedAt: number): number {
  const serverTime = typeof pass.serverTime === 'string' ? Date.parse(pass.serverTime) : Number.NaN;
  return Number.isFinite(serverTime) ? serverTime - dataUpdatedAt : 0;
}

/** When the server issues the next code, on this phone's clock. */
export function getEntryPassExpiresAt(pass: EntryPass, dataUpdatedAt: number): number {
  const nextCodeAt = typeof pass.nextCodeAt === 'string' ? pass.nextCodeAt : pass.expiresAt;
  return Date.parse(nextCodeAt) - serverClockOffsetMs(pass, dataUpdatedAt);
}

/** Until when the code may stay on screen: past its window, inside the gate's grace. */
export function getEntryPassShowUntil(pass: EntryPass, dataUpdatedAt: number): number {
  if (typeof pass.nextCodeAt !== 'string') {
    return getEntryPassExpiresAt(pass, dataUpdatedAt) + ENTRY_QR_DISPLAY_GRACE_MS;
  }
  return Date.parse(pass.expiresAt) - serverClockOffsetMs(pass, dataUpdatedAt);
}

/** When to ask for the next code: the moment the server has one, on this phone's clock. */
export function getEntryPassRefreshAt(pass: EntryPass, dataUpdatedAt: number): number {
  const lifetimeMs =
    Number.isFinite(pass.refreshAfterSeconds) && pass.refreshAfterSeconds > 0
      ? pass.refreshAfterSeconds * 1000
      : ENTRY_QR_REFRESH_INTERVAL_MS;
  const expiresAt = getEntryPassExpiresAt(pass, dataUpdatedAt);
  if (!Number.isFinite(expiresAt)) return dataUpdatedAt + lifetimeMs;
  if (expiresAt <= dataUpdatedAt) return dataUpdatedAt + ENTRY_QR_STALE_RETRY_MS;
  return Math.min(expiresAt + ENTRY_QR_ROLLOVER_DELAY_MS, dataUpdatedAt + lifetimeMs);
}

/**
 * The app opens the entry-pass request window 12 hours before the earliest ticketed day, or at
 * once when an admin opened the event's QR codes early. Nothing here ever closes it again.
 */
export function getEntryPassOpensAt(ticket: Pick<Ticket, 'days' | 'event'>): number | null {
  if (ticket.event.entryQrOpenEarly) return 0;

  const startsAt = ticket.days
    .map((day) => Date.parse(day.startsAt))
    .filter((time) => Number.isFinite(time));

  if (startsAt.length === 0) return null;
  return Math.min(...startsAt) - ENTRY_QR_OPEN_WINDOW_MS;
}

/** Reject malformed or mismatched credentials before caching or rendering the QR payload. */
export function isEntryPassResponseForTicket(value: unknown, ticketId: string): value is EntryPass {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;

  const pass = value as Partial<EntryPass>;
  const issuedAt = typeof pass.issuedAt === 'string' ? Date.parse(pass.issuedAt) : Number.NaN;
  const expiresAt = typeof pass.expiresAt === 'string' ? Date.parse(pass.expiresAt) : Number.NaN;

  return (
    typeof pass.ticketId === 'string' &&
    pass.ticketId.toLowerCase() === ticketId.toLowerCase() &&
    typeof pass.payload === 'string' &&
    pass.payload.length > 0 &&
    pass.payload.length <= MAX_QR_PAYLOAD_LENGTH &&
    Number.isFinite(issuedAt) &&
    Number.isFinite(expiresAt) &&
    expiresAt > issuedAt &&
    typeof pass.refreshAfterSeconds === 'number' &&
    Number.isFinite(pass.refreshAfterSeconds) &&
    pass.refreshAfterSeconds > 0
  );
}
