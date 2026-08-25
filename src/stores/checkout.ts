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
  /**
   * Whether one of the order's tickets is the buyer's own. False once they are known to
   * already hold a ticket for the event, which makes every ticket in the order a guest's.
   */
  buyerTakesTicket: boolean;

  start: (eventId: string, tierId: string) => void;
  setTier: (tierId: string) => void;
  setQuantity: (quantity: number) => void;
  setBuyerTakesTicket: (takes: boolean) => void;
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
  buyerTakesTicket: true,
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
    set({
      quantity: next,
      guests: get().guests.slice(0, guestSlots(next, get().buyerTakesTicket)),
    });
  },

  setBuyerTakesTicket(buyerTakesTicket) {
    // Trims when the allowance shrinks, so the draft can never hold more guests than tickets.
    set({
      buyerTakesTicket,
      guests: get().guests.slice(0, guestSlots(get().quantity, buyerTakesTicket)),
    });
  },

  addGuest(guest) {
    const { guests, quantity, buyerTakesTicket } = get();
    // The cap is the slot count, not quantity − 1: an order bought entirely for other people
    // has a guest against every ticket, and the last one was being dropped here.
    if (guests.length >= guestSlots(quantity, buyerTakesTicket)) return;
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

/**
 * Guest slots available for this order. One ticket is the buyer's own, unless they already
 * hold a ticket for the event - then every ticket in the order is for someone else, and the
 * whole quantity is guest slots.
 */
export function guestSlots(quantity: number, buyerTakesTicket = true): number {
  return Math.max(0, quantity - (buyerTakesTicket ? 1 : 0));
}
