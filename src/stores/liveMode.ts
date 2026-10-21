import { create } from 'zustand';
import { deleteSecureItem, getSecureItem, SECURE_KEYS, setSecureItem } from '../lib/secure-storage';

/**
 * Live mode is the holder's choice (owner's call, 2026-10-22). While their event is happening a
 * holder can switch it on from Discover, Tickets or the event page, and the app then opens on
 * the event's live home until they exit it. Off, the app is the usual one: browse, buy, tickets.
 *
 * Saved on the device so a cold start during the festival lands back where they chose to be.
 * Tied to the account, so another sign-in on the same phone starts with it off.
 */
export interface LiveModeChoice {
  userId: string;
  eventId: string;
}

interface LiveModeState {
  status: 'loading' | 'ready';
  choice: LiveModeChoice | null;
  load: () => Promise<void>;
  enter: (userId: string, eventId: string) => void;
  exit: () => void;
}

function parse(raw: string | null): LiveModeChoice | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<LiveModeChoice>;
    return typeof value.userId === 'string' && typeof value.eventId === 'string'
      ? { userId: value.userId, eventId: value.eventId }
      : null;
  } catch {
    return null;
  }
}

export const useLiveModeStore = create<LiveModeState>((set, get) => ({
  status: 'loading',
  choice: null,

  async load() {
    const choice = parse(await getSecureItem(SECURE_KEYS.liveMode));
    // A choice made while the read was in flight wins over the saved one.
    if (get().status === 'ready') return;
    set({ status: 'ready', choice });
  },

  enter(userId, eventId) {
    const current = get().choice;
    if (current?.userId === userId && current.eventId === eventId) return;
    set({ status: 'ready', choice: { userId, eventId } });
    void setSecureItem(SECURE_KEYS.liveMode, JSON.stringify({ userId, eventId }));
  },

  exit() {
    set({ status: 'ready', choice: null });
    void deleteSecureItem(SECURE_KEYS.liveMode);
  },
}));

/** Whether this account has live mode on for this event. */
export function useLiveModeOn(userId: string | null | undefined, eventId: string | null | undefined): boolean {
  return useLiveModeStore((state) =>
    Boolean(userId && eventId && state.choice?.userId === userId && state.choice.eventId === eventId),
  );
}
