import type { EventDetail } from '../api/types';

/**
 * The sentence under the event page's venue card: whether tickets can be bought, and if not, why.
 * Checked in this order.
 *
 * The backend keeps a tier with no end date visible after its event goes live, ends or is
 * cancelled (only `on_sale` makes a tier purchasable), so those three states get a sentence of
 * their own before the "not on sale yet" fallback, which would otherwise promise tickets to an
 * event that is over.
 */
export function eventAvailabilityMessage(event: Pick<EventDetail, 'tiers' | 'state'>): string {
  if (event.tiers.length === 0) return 'Tickets are not available for this event.';
  if (event.tiers.some((tier) => tier.isPurchasable)) return 'Tickets are available now.';
  if (
    event.state === 'sold_out' ||
    event.tiers.every((tier) => tier.availabilityStatus === 'sold_out')
  ) {
    return 'This event is sold out.';
  }
  if (event.state === 'sales_closed') return 'Sales for this event are closed.';
  if (event.state === 'cancelled') return 'This event was cancelled.';
  if (event.state === 'completed') return 'This event has ended.';
  if (event.state === 'live') return 'Ticket sales for this event have ended.';
  return 'Tickets are not on sale yet.';
}
