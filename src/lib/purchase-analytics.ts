import type { OrderDetail } from '../api/types';
import { track } from './analytics';
import { trackMetaPurchase } from './meta-events';
import { getSecureItem, SECURE_KEYS, setSecureItem } from './secure-storage';

/**
 * The purchase funnel's two outcome events, reported once each however many screens see them.
 *
 * A payment can be observed by three screens: checkout review and extras review open the sheet
 * themselves, and the payment screen picks up anything still settling. `purchase_completed` used
 * to live on the payment screen alone, so the ordinary path (review, sheet, SUCCESS, straight to
 * confirmation) never reported a purchase at all. It is now sent from the confirmation screen,
 * which every paid order passes through, and deduplicated here by order id.
 */

/** How many reported order ids are remembered. Keychain values are small; a buyer's last few orders is plenty. */
const REMEMBERED_PURCHASES = 20;

const reportedPurchases = new Set<string>();
let storedPurchases: Promise<string[]> | null = null;

function loadStoredPurchases(): Promise<string[]> {
  storedPurchases ??= getSecureItem(SECURE_KEYS.reportedPurchases).then((raw) => {
    if (!raw) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.filter((id): id is string => typeof id === 'string')
        : [];
    } catch {
      return [];
    }
  });
  return storedPurchases;
}

/**
 * `purchase_completed`, at most once per order on this device. Call it only with an order the
 * server says is paid.
 *
 * The in-memory set answers a re-render or a second mount at once; the stored list answers a
 * revisit after the app was restarted. The order is claimed in memory before the stored list is
 * read, so two calls racing through the read still send one event.
 */
export async function trackPurchaseCompleted(order: OrderDetail): Promise<void> {
  if (reportedPurchases.has(order.id)) return;
  reportedPurchases.add(order.id);

  const stored = await loadStoredPurchases();
  if (stored.includes(order.id)) return;

  track('purchase_completed', {
    order_id: order.id,
    event_id: order.eventId,
    total: Number(order.totalEgp),
    currency: order.currency,
    item_count: order.items.reduce((sum, item) => sum + item.quantity, 0),
    guest_count: order.guests.length,
    addon_count: order.addons.length,
    has_promo: Number(order.discountEgp) > 0,
  });
  // Meta's Purchase: the same order, under the same once-only rule.
  trackMetaPurchase(order);

  const next = [...stored, order.id].slice(-REMEMBERED_PURCHASES);
  storedPurchases = Promise.resolve(next);
  await setSecureItem(SECURE_KEYS.reportedPurchases, JSON.stringify(next));
}

/**
 * Orders whose current payment attempt has already been reported as failed. In memory only: a
 * failure belongs to one attempt, and a new attempt clears it (`beginPaymentAttempt`).
 */
const reportedFailures = new Set<string>();

/** A new sheet is about to open for this order, so its failure, if any, is a new one. */
export function beginPaymentAttempt(orderId: string): void {
  reportedFailures.delete(orderId);
}

/**
 * `payment_failed`, once per attempt. A review screen hears the sheet's FAIL or CANCELLED first
 * and may then hand the order to the payment screen, which sees the same failure from the server
 * on arrival; this keeps that one failure from being counted twice.
 */
export function trackPaymentFailed(orderId: string, outcome: 'fail' | 'cancelled'): void {
  if (reportedFailures.has(orderId)) return;
  reportedFailures.add(orderId);
  track('payment_failed', { order_id: orderId, outcome });
}

/** Forgets everything reported. Tests only. */
export function resetPurchaseAnalyticsForTests(): void {
  reportedPurchases.clear();
  reportedFailures.clear();
  storedPurchases = null;
}
