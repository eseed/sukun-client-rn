import type { Cart, EventDetail, EventTier, OrderDetail } from '../api/types';
import { trackMeta, type MetaContent, type MetaParameters } from './analytics';

/**
 * What each action in the app sends to Meta, kept in one place so the mapping can be read
 * against Meta's standard events and the privacy copy. It is the website's mapping
 * (`sukun-client-web/src/lib/meta-events.ts`), sent through Meta's app SDK to the same dataset
 * as the website's Pixel. Everything goes through `trackMeta`, so it waits for analytics
 * consent and needs a build with a Meta app id.
 *
 * | Action in the app                                      | Meta event             |
 * | ------------------------------------------------------ | ---------------------- |
 * | installing and opening the app (Meta's own, automatic) | install / app open     |
 * | a search or a tag chip on Discover, once settled       | `Search`               |
 * | an event page                                          | `ViewContent`          |
 * | the venue's map link                                   | `FindLocation`         |
 * | Continue on the pass step, with the tickets chosen     | `AddToCart`            |
 * | each extra added in checkout                           | `AddToCart`            |
 * | Continue with extras for a ticket already held         | `AddToCart`            |
 * | the pay button on either review                        | `InitiateCheckout`     |
 * | a new account's profile saved (the end of sign-up)     | `CompleteRegistration` |
 * | Paymob's card sheet opening, on every attempt          | `AddPaymentInfo`       |
 * | a paid order (`trackPurchaseCompleted`)                | `Purchase`             |
 *
 * Where the app differs from the website:
 * - It sells several tickets and sells to guests, so a ticket line carries how many. The pass
 *   price is the value only for a single ticket: for more it would be a price worked out here.
 * - Extras for a ticket already held are priced by the server as they are picked, so their
 *   `AddToCart` carries that subtotal.
 * - The review's pay button places the order and opens the card sheet in one go, so
 *   `InitiateCheckout` and `AddPaymentInfo` arrive together. The contents of `InitiateCheckout`
 *   are the server's cart, and its value the server's quote.
 * - There is no page view and no link to the app. Meta's automatic app-open event stands for
 *   the first.
 */

/** The app sells in EGP only. */
const CURRENCY = 'EGP';
/** A search is a few words; anything longer is cut before it leaves. */
const SEARCH_MAX_LENGTH = 100;

/** A chosen extra, as the checkout draft holds it (`DraftAddon`). */
export interface MetaExtraLine {
  optionId: string;
  addonName: string;
  quantity: number;
}

/** A server amount as Meta's `value` and `currency`, or nothing when there is none. */
function amount(
  value: string | null | undefined,
  currency = CURRENCY,
): Pick<MetaParameters, 'value' | 'currency'> {
  const number = value ? Number(value) : Number.NaN;
  return Number.isFinite(number) ? { value: number, currency } : {};
}

/** What is in the basket, as Meta's product parameters. */
function products(
  contents: MetaContent[],
): Pick<MetaParameters, 'content_ids' | 'content_type' | 'contents' | 'num_items'> {
  const lines = contents.filter((line) => line.quantity > 0);
  if (lines.length === 0) return {};
  return {
    content_ids: lines.map((line) => line.id),
    content_type: 'product',
    contents: lines,
    num_items: lines.reduce((sum, line) => sum + line.quantity, 0),
  };
}

/* ------------------------------------------------------------------ browse */

/** The last search sent, so coming back to the same filtered list is not a new search. */
let lastSearch: string | null = null;

/**
 * Anything that could be an email address or a phone number. The privacy policy promises
 * neither reaches Meta.
 */
function looksLikeContactDetails(term: string): boolean {
  return term.includes('@') || term.replace(/\D/g, '').length >= 7;
}

/**
 * `Search`: what the visitor settled on in Discover's search box and tag chips. Call it with the
 * settled text, not every keystroke; it sends only when the search changes, and never a term
 * that could be contact details.
 */
export function trackMetaSearch(search: string, tag: string | null): void {
  const term = search.replace(/\s+/g, ' ').trim().toLowerCase().slice(0, SEARCH_MAX_LENGTH).trim();
  if (!term && !tag) {
    lastSearch = null;
    return;
  }
  if (looksLikeContactDetails(term)) return;
  const key = JSON.stringify([term, tag]);
  if (key === lastSearch) return;
  lastSearch = key;
  trackMeta('Search', {
    ...(term ? { search_string: term } : {}),
    ...(tag ? { content_name: tag } : {}),
  });
}

/** `ViewContent`: an event page, the app's product page, with its "From" price. */
export function trackMetaViewContent(
  event: Pick<EventDetail, 'id' | 'title' | 'priceFromEgp'>,
): void {
  trackMeta('ViewContent', {
    content_ids: [event.id],
    content_type: 'product',
    content_name: event.title,
    ...amount(event.priceFromEgp),
  });
}

/** `FindLocation`: the venue's map link, opened to find the way there. */
export function trackMetaFindLocation(event: Pick<EventDetail, 'id' | 'title'>): void {
  trackMeta('FindLocation', {
    content_ids: [event.id],
    content_type: 'product',
    content_name: event.title,
  });
}

/* ---------------------------------------------------------------- checkout */

/**
 * `AddToCart` for the tickets: Continue on the pass step. The pass's price is the value for a
 * single ticket only.
 */
export function trackMetaAddTickets(
  event: Pick<EventDetail, 'id' | 'title'>,
  tier: Pick<EventTier, 'priceEgp'>,
  quantity: number,
): void {
  trackMeta('AddToCart', {
    ...products([{ id: event.id, quantity }]),
    content_name: event.title,
    ...(quantity === 1 ? amount(tier.priceEgp) : {}),
  });
}

/** `AddToCart` for an extra, without a value (the server prices the line on the review). */
export function trackMetaAddExtra(line: MetaExtraLine): void {
  trackMeta('AddToCart', {
    ...products([{ id: line.optionId, quantity: line.quantity }]),
    content_name: line.addonName,
  });
}

/**
 * `AddToCart` for extras on a ticket already held: Continue with them picked, at the subtotal
 * the server priced them at.
 */
export function trackMetaAddExtrasToTicket(
  lines: readonly MetaContent[],
  subtotalEgp: string | null | undefined,
): void {
  trackMeta('AddToCart', { ...products([...lines]), ...amount(subtotalEgp) });
}

/**
 * `InitiateCheckout`: the pay button on a review. The contents are the server's cart (tickets
 * by event, extras by option), and the value the server's quote.
 */
export function trackMetaInitiateCheckout({
  cart,
  totalEgp,
}: {
  cart: Pick<Cart, 'eventId' | 'tickets' | 'addons'>;
  totalEgp: string | null | undefined;
}): void {
  const tickets = cart.tickets.reduce((sum, line) => sum + line.quantity, 0);
  trackMeta('InitiateCheckout', {
    ...products([
      { id: cart.eventId, quantity: tickets },
      ...cart.addons.map((line) => ({ id: line.optionId, quantity: line.quantity })),
    ]),
    ...amount(totalEgp),
  });
}

/** `CompleteRegistration`: a new account's profile saved, the end of sign-up. */
export function trackMetaCompleteRegistration(): void {
  trackMeta('CompleteRegistration');
}

/**
 * `AddPaymentInfo`: Paymob's card sheet opening for the buyer to enter a card, the nearest the
 * app comes to payment details (it never sees them). Every attempt, as `payment_started` and
 * `payment_retried` are, with the order's total when the screen has it.
 */
export function trackMetaAddPaymentInfo(
  order: Pick<OrderDetail, 'totalEgp' | 'currency'> | null | undefined,
): void {
  trackMeta('AddPaymentInfo', order ? amount(order.totalEgp, order.currency) : {});
}

/**
 * `Purchase` for a paid order: the total the server charged, what was bought, and the order id,
 * which lets Meta recognise a repeat of the same order. Call it only through
 * `trackPurchaseCompleted`, which sends it once per order.
 */
export function trackMetaPurchase(
  order: Pick<OrderDetail, 'id' | 'eventId' | 'totalEgp' | 'currency' | 'items' | 'addons'>,
): void {
  const tickets = order.items.reduce((sum, item) => sum + item.quantity, 0);
  trackMeta(
    'Purchase',
    {
      ...products([
        { id: order.eventId, quantity: tickets },
        ...order.addons.map((addon) => ({ id: addon.addonOptionId, quantity: addon.quantity })),
      ]),
      ...amount(order.totalEgp, order.currency),
    },
    { orderId: order.id },
  );
}

/** Forgets the last search sent. Tests only. */
export function resetMetaEventsForTests(): void {
  lastSearch = null;
}
