import { useEffect } from 'react';
import { AppState } from 'react-native';
import { codeForError, isEntryPassNotIssued } from '../lib/errors';

/** After a failed refresh: soon, since the holder may be standing at the gate. */
export const ENTRY_PASS_RETRY_AFTER_ERROR_MS = 5_000;
/** While the server says the pass is not issued yet: it may be a few minutes early. */
export const ENTRY_PASS_RETRY_NOT_ISSUED_MS = 30_000;

/**
 * Keeps asking for the entry pass while it is open on screen and the last answer was no code:
 * a refresh that failed (a weak signal in the queue) or a pass not issued yet (a phone clock a
 * little ahead at the 12-hour mark). Without it the screen waited for the holder to leave the
 * app and come back. Only while the screen is focused and the app is in the foreground, and
 * never for a refused ticket, which the screen sends back to its ticket state instead.
 */
export function useEntryPassRetry({
  enabled,
  error,
  hasPayload,
  isFetching,
  refetch,
}: {
  /** Focused, a usable ticket, and inside the entry window. */
  enabled: boolean;
  error: unknown;
  /** Whether the last answer carried a code. */
  hasPayload: boolean;
  isFetching: boolean;
  refetch: () => unknown;
}) {
  const refused = ['TICKET_NOT_FOUND', 'TICKET_NOT_ACTIVE'].includes(codeForError(error) ?? '');
  const notIssued = (error ? isEntryPassNotIssued(error) : false) || (!error && !hasPayload);
  const delay = refused
    ? null
    : notIssued
      ? ENTRY_PASS_RETRY_NOT_ISSUED_MS
      : error
        ? ENTRY_PASS_RETRY_AFTER_ERROR_MS
        : null;

  useEffect(() => {
    if (!enabled || isFetching || delay === null) return;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (timeout) clearTimeout(timeout);
      timeout =
        AppState.currentState === 'active' ? setTimeout(() => void refetch(), delay) : undefined;
    };
    const appState = AppState.addEventListener('change', schedule);
    schedule();
    return () => {
      if (timeout) clearTimeout(timeout);
      appState.remove();
    };
  }, [enabled, isFetching, delay, refetch]);
}
