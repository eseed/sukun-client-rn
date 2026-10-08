import { useCallback } from 'react';
import type { Cart } from '../api/types';
import { useAbandonCart, useCreateCart } from './queries';

/**
 * Whether a cart can carry extras for a ticket already held: an open draft for this event with no
 * tickets in it. Anything else belongs to another checkout (a ticket checkout took the buyer's one
 * draft for the event) or is finished with.
 */
export function isExtrasOnlyCart(cart: Cart, eventId: string): boolean {
  return cart.status === 'draft' && cart.eventId === eventId && cart.tickets.length === 0;
}

/** A draft that still has tickets in it after it was taken over: another checkout is using it. */
export class ExtrasCartTakenError extends Error {
  readonly code = 'CART_NOT_EDITABLE';

  constructor() {
    super('This checkout is no longer available. Start again from the event.');
    this.name = 'ExtrasCartTakenError';
  }
}

/**
 * Opens the cart for extras on a ticket the buyer already holds (`app/ticket/[id]/extras`): a
 * follow-up cart with no ticket lines. The web's `useOpenExtrasCart` does the same.
 *
 * The backend keeps one draft cart per buyer and event, and `POST carts` hands back that draft
 * whatever is in it. A draft with tickets in it is a ticket checkout's (one left unfinished in
 * this app, on another device or on the web), and tickets can only be replaced, never emptied, so
 * extras put on it were priced and placed with those tickets: an invited guest's room came to
 * 15,276 EGP instead of 9,006 because a ticket for themselves from a week before was still in the
 * draft, and placing it was refused. That draft is abandoned and a fresh one opened instead.
 * Whichever checkout runs last owns the draft; the ticket checkout recovers from a closed cart
 * (`useCartNotEditableRecovery`). A draft holding only extras is reused: `PUT addons` replaces
 * every line on it.
 */
export function useOpenExtrasCart() {
  const create = useCreateCart();
  const abandon = useAbandonCart();
  const { mutateAsync: createCart } = create;
  const { mutateAsync: abandonCart } = abandon;

  const open = useCallback(
    async (eventId: string): Promise<Cart> => {
      const draft = await createCart(eventId);
      if (isExtrasOnlyCart(draft, eventId)) return draft;

      await abandonCart(draft.id);
      const fresh = await createCart(eventId);
      if (!isExtrasOnlyCart(fresh, eventId)) throw new ExtrasCartTakenError();
      return fresh;
    },
    [abandonCart, createCart],
  );

  return { open, isPending: create.isPending || abandon.isPending };
}
