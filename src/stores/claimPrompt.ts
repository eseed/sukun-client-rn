import { create } from 'zustand';

/**
 * Which granted tickets the claim screen has been shown for since the app started, and whether
 * it is on screen now.
 *
 * In memory on purpose. A ticket still unclaimed is shown again the next time the app is
 * opened, which is what "the first thing they see" asks for. One the holder answered "Not now"
 * to does not come back every time they switch apps and return, but a ticket granted while the
 * app sat in the background has an id not seen yet, so it is shown on return.
 */
interface ClaimPromptState {
  shownTicketIds: ReadonlySet<string>;
  /** True while `app/claim.tsx` is mounted, so the gate never stacks a second one on it. */
  open: boolean;
  markShown: (ticketIds: readonly string[]) => void;
  setOpen: (open: boolean) => void;
  reset: () => void;
}

export const useClaimPromptStore = create<ClaimPromptState>((set) => ({
  shownTicketIds: new Set(),
  open: false,

  markShown(ticketIds) {
    set((state) => ({ shownTicketIds: new Set([...state.shownTicketIds, ...ticketIds]) }));
  },

  setOpen(open) {
    set({ open });
  },

  reset() {
    set({ shownTicketIds: new Set(), open: false });
  },
}));
