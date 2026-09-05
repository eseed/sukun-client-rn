import { create } from 'zustand';
import type { AddonType, CartAddonInput } from '../api/types';

/**
 * The in-progress checkout draft, held across pass → guests → extras → review.
 *
 * It holds *selections only* — never money. Totals always come from the cart preview
 * (CLAUDE.md rule 7). `unitPriceEgp` is carried only so a picked extra can be listed back
 * without refetching its catalogue entry; it is never added up here.
 */

/**
 * One chosen extra, shaped so it maps straight onto `PUT /carts/:id/addons`.
 *
 * `quantity` counts rooms for accommodation and units for everything else, which is the
 * distinction the backend draws and the one buyers get wrong. Recipients live in `rooms` for
 * accommodation and `assignments` for the rest; both start empty and are filled in on the
 * assignment steps, because nothing can be ordered until every unit has someone.
 */
export interface DraftAddon extends CartAddonInput {
  addonId: string;
  addonName: string;
  type: AddonType;
  optionLabel: string;
  unitPriceEgp: string | null;
}

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
  /** The server-side cart backing this checkout, created once tickets are settled. */
  cartId: string | null;
  addons: DraftAddon[];
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
  /**
   * Buys one more ticket for one more guest, and keeps the extras already chosen.
   *
   * This is the assignment steps' "Add a ticket for them", where the buyer has already picked
   * their extras and is only widening the order to fit one more person. `setQuantity` drops the
   * addon draft, which is right for its own caller (a change of quantity there means the buyer
   * is still choosing who is coming) and wrong here, where dropping it would silently throw away
   * everything they picked. The assignments in the kept draft still point at the cart as it was,
   * so the caller re-resolves them against the refreshed cart before sending them back.
   */
  addGuestSeat: (guest: DraftGuest) => void;
  removeGuest: (phoneNumber: string) => void;
  toggleGuest: (guest: DraftGuest) => void;
  setPromoCode: (code: string | null) => void;
  setTermsAccepted: (accepted: boolean) => void;
  setOrderId: (orderId: string | null) => void;
  setCartId: (cartId: string | null) => void;
  /** Adds or replaces the line for this option. Re-picking an extra edits it rather than doubling it. */
  upsertAddon: (addon: DraftAddon) => void;
  removeAddon: (optionId: string) => void;
  setAddonAssignments: (optionId: string, assignments: NonNullable<CartAddonInput['assignments']>) => void;
  setAddonRooms: (optionId: string, rooms: NonNullable<CartAddonInput['rooms']>) => void;
  /**
   * Replaces the whole draft in one write.
   *
   * For re-pointing every line at a cart that has just been rebuilt: `PUT /carts/:id/tickets`
   * makes no promise that a person keeps the same `cartAttendeeId`, so the surviving draft has
   * to be resolved again as a set rather than line by line.
   */
  setAddons: (addons: DraftAddon[]) => void;
  clearAddons: () => void;
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
  cartId: null,
  addons: [],
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
    // Extras are assigned to specific people, so a change in who is coming invalidates them.
    // The backend drops them on the same edit; keeping a stale draft here would only mean
    // re-sending assignments that point at attendees who no longer exist.
    set({
      quantity: next,
      guests: get().guests.slice(0, guestSlots(next, get().buyerTakesTicket)),
      addons: [],
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

  addGuestSeat(guest) {
    const { guests, quantity, buyerTakesTicket } = get();
    if (guests.some((g) => g.phoneNumber === guest.phoneNumber)) return;
    // The seat is bought in the same breath as the guest, so the slot always exists. `addons` is
    // deliberately left alone: see the interface note above.
    const next = quantity + 1;
    set({
      quantity: next,
      guests: [...guests, guest].slice(0, guestSlots(next, buyerTakesTicket)),
    });
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

  setCartId(cartId) {
    set({ cartId });
  },

  upsertAddon(addon) {
    const existing = get().addons.filter((item) => item.optionId !== addon.optionId);
    set({ addons: [...existing, addon] });
  },

  removeAddon(optionId) {
    set({ addons: get().addons.filter((item) => item.optionId !== optionId) });
  },

  setAddonAssignments(optionId, assignments) {
    set({
      addons: get().addons.map((item) =>
        item.optionId === optionId ? { ...item, assignments } : item,
      ),
    });
  },

  setAddonRooms(optionId, rooms) {
    set({
      addons: get().addons.map((item) => (item.optionId === optionId ? { ...item, rooms } : item)),
    });
  },

  setAddons(addons) {
    set({ addons });
  },

  clearAddons() {
    set({ addons: [] });
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
