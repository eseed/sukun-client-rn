import {
  clearPendingPayment,
  loadPendingPayment,
  PENDING_PAYMENT_MAX_AGE_MS,
  savePendingPayment,
} from '../pending-payment';
import { SECURE_KEYS, setSecureItem } from '../secure-storage';

beforeEach(async () => {
  await clearPendingPayment();
});

describe('pending payment', () => {
  it('remembers the order, the attempt and when the sheet opened', async () => {
    await savePendingPayment({ orderId: 'order-1', attemptId: 'pay-1', startedAt: 1000 });
    expect(await loadPendingPayment(2000)).toEqual({
      orderId: 'order-1',
      attemptId: 'pay-1',
      startedAt: 1000,
    });
  });

  it('drops a record older than a day', async () => {
    await savePendingPayment({ orderId: 'order-1', attemptId: null, startedAt: 0 });
    expect(await loadPendingPayment(PENDING_PAYMENT_MAX_AGE_MS + 1)).toBeNull();
    expect(await loadPendingPayment(0)).toBeNull();
  });

  it('drops a record it cannot read', async () => {
    await setSecureItem(SECURE_KEYS.pendingPayment, '{not json');
    expect(await loadPendingPayment()).toBeNull();
  });

  it("clears only the named order's record", async () => {
    await savePendingPayment({ orderId: 'order-2', attemptId: null, startedAt: Date.now() });
    await clearPendingPayment('order-1');
    expect((await loadPendingPayment())?.orderId).toBe('order-2');
    await clearPendingPayment('order-2');
    expect(await loadPendingPayment()).toBeNull();
  });
});
