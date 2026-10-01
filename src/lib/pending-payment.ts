import { deleteSecureItem, getSecureItem, SECURE_KEYS, setSecureItem } from './secure-storage';

/**
 * The payment this device last handed to Paymob's sheet, remembered across a killed app.
 *
 * The sheet can strand a buyer: the bank's verification page may never return to Paymob, and
 * on Android a result that arrives after the OS reclaimed the app (the buyer went to their SMS
 * app for the code) has no listener to land on. Either way the app forgets the order it was
 * paying, because the checkout draft lives in memory. This record is what lets the next launch,
 * or the next return to the foreground, ask the server what became of it.
 *
 * It holds identifiers only, never money or card data: the order, the payment attempt when the
 * server named one, and when the sheet was opened.
 */
export interface PendingPayment {
  orderId: string;
  /** `paymentId` from the intention the sheet was opened with, when there was one. */
  attemptId: string | null;
  /** Epoch milliseconds. */
  startedAt: number;
}

/**
 * Past this, a remembered payment is dropped unread. Holds last minutes, not days; anything this
 * old has long since settled one way or the other and is in the order history.
 */
export const PENDING_PAYMENT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export async function savePendingPayment(payment: PendingPayment): Promise<void> {
  await setSecureItem(SECURE_KEYS.pendingPayment, JSON.stringify(payment));
}

export async function loadPendingPayment(now = Date.now()): Promise<PendingPayment | null> {
  const raw = await getSecureItem(SECURE_KEYS.pendingPayment);
  if (!raw) return null;
  const parsed = parse(raw);
  if (!parsed || now - parsed.startedAt > PENDING_PAYMENT_MAX_AGE_MS) {
    await clearPendingPayment();
    return null;
  }
  return parsed;
}

/**
 * Forgets the remembered payment. With an `orderId`, only when it is that order's, so a screen
 * finishing with one order never erases a newer payment for another.
 */
export async function clearPendingPayment(orderId?: string): Promise<void> {
  if (orderId) {
    const raw = await getSecureItem(SECURE_KEYS.pendingPayment);
    const saved = raw ? parse(raw) : null;
    if (saved && saved.orderId !== orderId) return;
  }
  await deleteSecureItem(SECURE_KEYS.pendingPayment);
}

function parse(raw: string): PendingPayment | null {
  try {
    const value = JSON.parse(raw) as Partial<PendingPayment> | null;
    if (
      !value ||
      typeof value.orderId !== 'string' ||
      value.orderId.length === 0 ||
      typeof value.startedAt !== 'number'
    ) {
      return null;
    }
    return {
      orderId: value.orderId,
      attemptId: typeof value.attemptId === 'string' ? value.attemptId : null,
      startedAt: value.startedAt,
    };
  } catch {
    return null;
  }
}
