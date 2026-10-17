import { create } from 'zustand';
import type { AddonType, CartAddonInput, ReplaceCartTicketsInput } from '../api/types';

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
  /** The option's published occupancy. Local draft metadata, never sent in the payload. */
  occupancy?: number | null;
}

export interface DraftGuest {
  /** E.164. A ticket can exist before its owner (CLAUDE.md rule 2). */
  phoneNumber: string;
  name: string;
  /** Set when the guest came from the OS contact picker rather than manual entry. */
  fromContacts: boolean;
  /** Their pass, when it is not the draft's own (`tierId`): a group buying mixed passes. */
  tierId?: string;
  /**
   * A child on a children's pass (owner's call, 2026-10-11): no number (`phoneNumber` is empty),
   * admitted with their guardian.
   */
  child?: boolean;
  /**
   * A child's guardian: `buyer` (the buyer's ticket in this order), `phone:<E.164>` (an adult
   * guest in this order) or `ticket:<id>` (a ticket the buyer already holds).
   */
  guardian?: string;
}

/** Who a person is inside one order: their number and their name (a child has no number). */
export function personKey(person: { phoneNumber: string | null; name?: string | null }): string {
  return `${person.phoneNumber ?? ''}|${(person.name ?? '').trim().toLowerCase()}`;
}

interface CheckoutState {
  eventId: string | null;
  /** The buyer's own pass, and every ticket's that no other pass claims. */
  tierId: string | null;
  /**
   * Tickets on other passes in the same order, by pass (a group buying mixed passes, children's
   * included). `quantity` is the whole order, so the main pass has what these leave.
   */
  otherTiers: Record<string, number>;
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
  /**
   * An extra the buyer asked for before they had a ticket (a logistics block's "Add" on the event
   * page). The extras step opens it once, when checkout reaches it, then clears it. A selection,
   * never a price.
   */
  preselectedAddonId: string | null;

  start: (eventId: string, tierId: string, options?: { addonId?: string }) => void;
  setTier: (tierId: string) => void;
  /** How many tickets on a pass other than the main one (0 takes it off). Keeps `quantity` whole. */
  setOtherTierCount: (tierId: string, count: number) => void;
  /**
   * Makes another pass the main one (the buyer's own), every pass keeping its count: the main
   * pass's tickets move to the other passes and that pass's come off them.
   */
  promoteTier: (tierId: string) => void;
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
  /** Every guest at once, in order, as "Who's coming?" lists them (cut to the guest slots). */
  replaceGuests: (guests: DraftGuest[]) => void;
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
  /** The extras step has opened the preselected extra (or found it no longer on sale). */
  clearPreselectedAddon: () => void;
  reset: () => void;
}

const initial = {
  eventId: null,
  tierId: null,
  otherTiers: {},
  quantity: 1,
  guests: [],
  promoCode: null,
  termsAccepted: false,
  orderId: null,
  cartId: null,
  addons: [],
  buyerTakesTicket: true,
  preselectedAddonId: null,
} satisfies Partial<CheckoutState>;

export const useCheckoutStore = create<CheckoutState>((set, get) => ({
  ...initial,

  start(eventId, tierId, options) {
    set({ ...initial, eventId, tierId, preselectedAddonId: options?.addonId ?? null });
  },

  setTier(tierId) {
    if (get().tierId === tierId) return;
    // Tickets already on that pass join the main pass's count, which `quantity` holds.
    const { [tierId]: _merged, ...otherTiers } = get().otherTiers;
    set({ tierId, otherTiers });
  },

  promoteTier(tierId) {
    const { tierId: main, otherTiers, quantity } = get();
    if (!main || main === tierId) return;
    const mainCount = quantity - Object.values(otherTiers).reduce((sum, n) => sum + n, 0);
    const { [tierId]: _promoted, ...rest } = otherTiers;
    set({
      tierId,
      otherTiers: mainCount > 0 ? { ...rest, [main]: mainCount } : rest,
      // Guests on the promoted pass keep it; those on the old main pass keep theirs.
      guests: get().guests.map((guest) =>
        guest.tierId === tierId
          ? { ...guest, tierId: undefined }
          : guest.tierId === undefined
            ? { ...guest, tierId: main }
            : guest,
      ),
    });
  },

  setOtherTierCount(tierId, count) {
    const { otherTiers, quantity, guests, buyerTakesTicket } = get();
    if (tierId === get().tierId) return;
    const next = Math.max(0, Math.floor(count));
    const before = otherTiers[tierId] ?? 0;
    if (next === before) return;
    const { [tierId]: _old, ...rest } = otherTiers;
    const total = quantity + next - before;
    // Who is coming changed: extras given to people are picked again, as `setQuantity` does.
    set({
      otherTiers: next > 0 ? { ...rest, [tierId]: next } : rest,
      quantity: total,
      guests: guests.slice(0, guestSlots(total, buyerTakesTicket)),
      addons: [],
    });
  },

  setQuantity(quantity) {
    // The other passes keep their tickets: this is the main pass's count plus theirs.
    const others = Object.values(get().otherTiers).reduce((sum, count) => sum + count, 0);
    const next = Math.max(1, others, quantity);
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

  replaceGuests(guests) {
    const { quantity, buyerTakesTicket } = get();
    set({ guests: guests.slice(0, guestSlots(quantity, buyerTakesTicket)) });
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

  clearPreselectedAddon() {
    set({ preselectedAddonId: null });
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

/**
 * `PUT /carts/:id/tickets` for the draft: a line per pass (the main pass has what the others
 * leave), the buyer on the main pass, and who each guest is on their pass. A child goes with a
 * name only and their guardian: an adult guest here by index, a ticket the buyer holds, or else
 * the buyer's ticket in this order.
 */
export function ticketsInput(
  tierId: string,
  people: { quantity: number; guests: readonly DraftGuest[]; buyerTakesTicket: boolean },
  otherTiers: Readonly<Record<string, number>> = {},
): ReplaceCartTicketsInput {
  const others = Object.entries(otherTiers).filter(
    ([otherTierId, count]) => otherTierId !== tierId && count > 0,
  );
  const mainCount = people.quantity - others.reduce((sum, [, count]) => sum + count, 0);
  return {
    buyerTierId: people.buyerTakesTicket ? tierId : null,
    items: [
      ...(mainCount > 0 ? [{ tierId, quantity: mainCount }] : []),
      ...others.map(([otherTierId, quantity]) => ({ tierId: otherTierId, quantity })),
    ],
    guests: people.guests.map((guest) => {
      if (!guest.child) {
        return { phoneNumber: guest.phoneNumber, name: guest.name, tierId: guest.tierId ?? tierId };
      }
      const guardian = guest.guardian ?? 'buyer';
      const guardianPhone = guardian.startsWith('phone:') ? guardian.slice('phone:'.length) : null;
      const guardianGuestIndex = guardianPhone
        ? people.guests.findIndex((other) => !other.child && other.phoneNumber === guardianPhone)
        : -1;
      return {
        name: guest.name,
        tierId: guest.tierId ?? tierId,
        child: true,
        ...(guardianGuestIndex >= 0 ? { guardianGuestIndex } : {}),
        ...(guardian.startsWith('ticket:')
          ? { guardianTicketId: guardian.slice('ticket:'.length) }
          : {}),
      };
    }),
  };
}
