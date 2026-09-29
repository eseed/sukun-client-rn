import type { OrderDetail } from '../../api/types';
import { track } from '../analytics';
import { trackMetaPurchase } from '../meta-events';
import {
  beginPaymentAttempt,
  resetPurchaseAnalyticsForTests,
  trackPaymentFailed,
  trackPurchaseCompleted,
} from '../purchase-analytics';
import { getSecureItem, SECURE_KEYS, setSecureItem } from '../secure-storage';

jest.mock('../analytics', () => ({ track: jest.fn() }));
jest.mock('../meta-events', () => ({ trackMetaPurchase: jest.fn() }));
const mockTrack = track as jest.Mock;
const mockMetaPurchase = trackMetaPurchase as jest.Mock;

function paidOrder(overrides: Partial<OrderDetail> = {}): OrderDetail {
  return {
    id: 'order-1',
    orderNumber: 'SKN26-4827195',
    eventId: 'event-1',
    status: 'paid',
    buyerTierId: 'tier-1',
    subtotalEgp: '2000.00',
    discountEgp: '0.00',
    netEgp: '2000.00',
    vatRate: '0.14',
    vatEgp: '280.00',
    totalEgp: '2280.00',
    currency: 'EGP',
    holdExpiresAt: '2026-10-01T10:00:00.000Z',
    createdAt: '2026-10-01T09:45:00.000Z',
    items: [
      { tierId: 'tier-1', quantity: 2 },
      { tierId: 'tier-2', quantity: 1 },
    ] as OrderDetail['items'],
    guests: [{ phoneNumber: '+201022334455' }] as OrderDetail['guests'],
    addons: [{ type: 'meal', quantity: 2 }] as OrderDetail['addons'],
    ...overrides,
  };
}

beforeEach(async () => {
  mockTrack.mockClear();
  mockMetaPurchase.mockClear();
  resetPurchaseAnalyticsForTests();
  await setSecureItem(SECURE_KEYS.reportedPurchases, '');
});

describe('trackPurchaseCompleted', () => {
  it('sends the order as purchase_completed, figures as the server gave them', async () => {
    await trackPurchaseCompleted(paidOrder({ discountEgp: '250.00' }));

    expect(mockTrack).toHaveBeenCalledTimes(1);
    expect(mockTrack).toHaveBeenCalledWith('purchase_completed', {
      order_id: 'order-1',
      event_id: 'event-1',
      total: 2280,
      currency: 'EGP',
      item_count: 3,
      guest_count: 1,
      addon_count: 1,
      has_promo: true,
    });
  });

  it('sends one event however many times the same order is reported', async () => {
    const order = paidOrder();
    // Two racing calls, as a re-render during the storage read would make, and a later one.
    await Promise.all([trackPurchaseCompleted(order), trackPurchaseCompleted(order)]);
    await trackPurchaseCompleted(order);

    expect(mockTrack).toHaveBeenCalledTimes(1);
    // Meta's Purchase rides on the same once-only rule.
    expect(mockMetaPurchase).toHaveBeenCalledTimes(1);
    expect(mockMetaPurchase).toHaveBeenCalledWith(order);
  });

  it('remembers a reported order across a restart', async () => {
    await trackPurchaseCompleted(paidOrder());
    // What a cold start looks like: memory gone, the keychain still there.
    resetPurchaseAnalyticsForTests();
    await trackPurchaseCompleted(paidOrder());

    expect(mockTrack).toHaveBeenCalledTimes(1);
    expect(JSON.parse((await getSecureItem(SECURE_KEYS.reportedPurchases))!)).toEqual(['order-1']);
  });

  it('counts different orders separately and keeps only the most recent ids', async () => {
    for (let i = 0; i < 25; i += 1) {
      await trackPurchaseCompleted(paidOrder({ id: `order-${i}` }));
    }

    expect(mockTrack).toHaveBeenCalledTimes(25);
    const stored = JSON.parse((await getSecureItem(SECURE_KEYS.reportedPurchases))!) as string[];
    expect(stored).toHaveLength(20);
    expect(stored.at(-1)).toBe('order-24');
  });

  it('survives an unreadable stored value', async () => {
    await setSecureItem(SECURE_KEYS.reportedPurchases, 'not json');
    await trackPurchaseCompleted(paidOrder());

    expect(mockTrack).toHaveBeenCalledTimes(1);
  });
});

describe('trackPaymentFailed', () => {
  it('sends one failure per attempt, and a new attempt can fail again', () => {
    beginPaymentAttempt('order-1');
    // The review screen hears the sheet, then the payment screen sees the server's verdict.
    trackPaymentFailed('order-1', 'cancelled');
    trackPaymentFailed('order-1', 'fail');

    expect(mockTrack).toHaveBeenCalledTimes(1);
    expect(mockTrack).toHaveBeenCalledWith('payment_failed', {
      order_id: 'order-1',
      outcome: 'cancelled',
    });

    beginPaymentAttempt('order-1');
    trackPaymentFailed('order-1', 'fail');

    expect(mockTrack).toHaveBeenCalledTimes(2);
    expect(mockTrack).toHaveBeenLastCalledWith('payment_failed', {
      order_id: 'order-1',
      outcome: 'fail',
    });
  });
});
