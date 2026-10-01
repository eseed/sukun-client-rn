import type { EntryPass, TicketDay } from '../api/types';

const DEFAULT_ENTRY_QR_REFRESH_SECONDS = 30;
const MAX_TIMER_DELAY_MS = 2_147_483_647;
const MAX_QR_PAYLOAD_LENGTH = 8_192;

function readRefreshSeconds(): number {
  const configured = Number(process.env.EXPO_PUBLIC_ENTRY_QR_REFRESH_SECONDS);
  if (!Number.isSafeInteger(configured) || configured <= 0) {
    return DEFAULT_ENTRY_QR_REFRESH_SECONDS;
  }
  return Math.min(configured, Math.floor(MAX_TIMER_DELAY_MS / 1000));
}

/** Client refresh cadence; the backend still controls the lifetime signed into each token. */
const ENTRY_QR_REFRESH_SECONDS = readRefreshSeconds();
export const ENTRY_QR_REFRESH_INTERVAL_MS = ENTRY_QR_REFRESH_SECONDS * 1000;
export const ENTRY_QR_EXPIRY_SAFETY_MARGIN_MS = 3_000;
export const ENTRY_QR_OPEN_WINDOW_MS = 12 * 60 * 60 * 1000;

/** Earliest safe fetch deadline, anchored to when this in-memory response was received. */
export function getEntryPassRefreshAt(pass: EntryPass, dataUpdatedAt: number): number {
  const serverRefreshMs =
    Number.isFinite(pass.refreshAfterSeconds) && pass.refreshAfterSeconds > 0
      ? pass.refreshAfterSeconds * 1000
      : ENTRY_QR_REFRESH_INTERVAL_MS;
  const refreshAt = dataUpdatedAt + Math.min(ENTRY_QR_REFRESH_INTERVAL_MS, serverRefreshMs);
  const expiresAt = Date.parse(pass.expiresAt);
  const expiryRefreshAt = expiresAt - ENTRY_QR_EXPIRY_SAFETY_MARGIN_MS;

  // A response already at/past its safety boundary is stale on arrival. Retry on the normal
  // cadence instead of issuing a tight loop of immediate GETs for the same expired pass.
  return Number.isFinite(expiresAt) && expiryRefreshAt > dataUpdatedAt
    ? Math.min(refreshAt, expiryRefreshAt)
    : refreshAt;
}

/** The app opens the entry-pass request window 12 hours before the earliest ticketed day. */
export function getEntryPassOpensAt(days: TicketDay[]): number | null {
  const startsAt = days
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
