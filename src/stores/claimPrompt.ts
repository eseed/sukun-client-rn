import { create } from 'zustand';

/**
 * Which granted tickets the claim screen has been shown for, and whether it is on screen now.
 *
 * In memory on purpose. A ticket still unclaimed is shown again the next time the app is
 * opened, which is what "the first thing they see" asks for. "Opened" is a cold start, a fresh
 * sign-in (`forgetShown` from the auth store), or a return to the app after it sat in the
 * background for a while (`ClaimGate`). A quick switch to another app and back does not bring
 * back a ticket the holder answered "Not now" to, but a ticket granted meanwhile has an id not
 * seen yet, so it is shown on return.
 */
interface ClaimPromptState {
  shownTicketIds: ReadonlySet<string>;
  /** True while `app/claim.tsx` is mounted, so the gate never stacks a second one on it. */
  open: boolean;
  markShown: (ticketIds: readonly string[]) => void;
  /** Puts every waiting ticket back in front of the holder the next time the gate looks. */
  forgetShown: () => void;
  setOpen: (open: boolean) => void;
  reset: () => void;
}

export const useClaimPromptStore = create<ClaimPromptState>((set) => ({
  shownTicketIds: new Set(),
  open: false,

  markShown(ticketIds) {
    set((state) => ({ shownTicketIds: new Set([...state.shownTicketIds, ...ticketIds]) }));
  },

  forgetShown() {
    set({ shownTicketIds: new Set() });
  },

  setOpen(open) {
    set({ open });
  },

  reset() {
    set({ shownTicketIds: new Set(), open: false });
  },
}));
