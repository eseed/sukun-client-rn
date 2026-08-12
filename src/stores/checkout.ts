import { create } from 'zustand';

/**
 * The in-progress checkout draft, held across the pass → guests → review steps.
 *
 * It holds *selections only* — never money. Totals always come from the api
 * (CLAUDE.md rule 7).
 */

export interface DraftGuest {
  /** E.164. A ticket can exist before its owner (CLAUDE.md rule 2). */
  phoneNumber: string;
  name: string;
  /** Set when the guest came from the OS contact picker rather than manual entry. */
  fromContacts: boolean;
}

interface CheckoutState {
  eventId: string | null;
  tierId: string | null;
  quantity: number;
  guests: DraftGuest[];
  promoCode: string | null;
  termsAccepted: boolean;
  orderId: string | null;

  start: (eventId: string, tierId: string) => void;
  setTier: (tierId: string) => void;
  setQuantity: (quantity: number) => void;
  addGuest: (guest: DraftGuest) => void;
  removeGuest: (phoneNumber: string) => void;
  toggleGuest: (guest: DraftGuest) => void;
  setPromoCode: (code: string | null) => void;
  setTermsAccepted: (accepted: boolean) => void;
  setOrderId: (orderId: string | null) => void;
  reset: () => void;
}

const initial = {
  eventId: null,
  tierId: null,
  quantity: 1,
  guests: [],
  promoCode: null,
  termsAccepted: false,
  orderId: null,
} satisfies Partial<CheckoutState>;

export const useCheckoutStore = create<CheckoutState>((set, get) => ({
  ...initial,

  start(eventId, tierId) {
    set({ ...initial, eventId, tierId });
  },

  setTier(tierId) {
    set({ tierId });
  },

  setQuantity(quantity) {
    const next = Math.max(1, quantity);
    // Guest slots are (quantity − 1): the buyer always holds one ticket.
    set({ quantity: next, guests: get().guests.slice(0, Math.max(0, next - 1)) });
  },

  addGuest(guest) {
    const { guests, quantity } = get();
    if (guests.length >= quantity - 1) return;
    if (guests.some((g) => g.phoneNumber === guest.phoneNumber)) return;
    set({ guests: [...guests, guest] });
  },

  removeGuest(phoneNumber) {
    set({ guests: get().guests.filter((g) => g.phoneNumber !== phoneNumber) });
  },

  toggleGuest(guest) {
    const { guests } = get();
    if (guests.some((g) => g.phoneNumber === guest.phoneNumber)) {
      get().removeGuest(guest.phoneNumber);
    } else {
      get().addGuest(guest);
    }
  },

  setPromoCode(promoCode) {
    set({ promoCode });
  },

  setTermsAccepted(termsAccepted) {
    set({ termsAccepted });
  },

  setOrderId(orderId) {
    set({ orderId });
  },

  reset() {
    set({ ...initial });
  },
}));

/** Guest slots available for this order: one ticket is always the buyer's. */
export function guestSlots(quantity: number): number {
  return Math.max(0, quantity - 1);
}
