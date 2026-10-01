import { useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { api } from '../api';
import type { PaymentStatus } from '../api/types';
import { isPaymentUnsettled } from '../lib/orders';
import { clearPendingPayment, loadPendingPayment } from '../lib/pending-payment';
import { useAuthStore } from '../stores/auth';
import { isPaymobSheetOpen } from './usePaymobSheet';
import { queryKeys } from './queries';

/**
 * Picks up a payment the app lost track of.
 *
 * Paymob's sheet can leave a buyer stranded: the bank's verification page may never return to
 * Paymob, so no result ever comes back, and on Android a result that arrives after the OS
 * reclaimed the app (the buyer left for their SMS app) has nowhere to land. The sheet offers no
 * timeout and no way for the app to close it, so nothing here tries to. Instead, the order the
 * sheet was opened for is remembered (`usePaymobSheet`), and on every launch and every return to
 * the foreground the server is asked what became of it:
 *
 * - paid: the confirmation screen;
 * - failed or expired: the payment screen, which offers the retry;
 * - still awaiting payment: the payment screen, which says it is still confirming with the bank;
 * - cancelled or refunded: nothing to show, so the record is dropped.
 *
 * It stays out of the way of a sheet this process still has open, because navigating away would
 * unmount the screen whose listener is waiting for the result, and of the payment and
 * confirmation screens, which watch the order themselves.
 */
export function usePendingPaymentRecovery() {
  const router = useRouter();
  const pathname = usePathname();
  const client = useQueryClient();
  const signedIn = useAuthStore((s) => s.status === 'signed-in');

  const pathnameRef = useRef(pathname);
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);
  const running = useRef(false);

  const check = useCallback(async () => {
    if (running.current) return;
    if (isPaymobSheetOpen()) return;
    // The entry gate has not routed yet; navigating now would be undone by its redirect.
    if (pathnameRef.current === '/') return;
    running.current = true;
    try {
      const saved = await loadPendingPayment();
      if (!saved) return;

      let status: PaymentStatus;
      try {
        status = await client.fetchQuery({
          queryKey: queryKeys.paymentStatus(saved.orderId),
          queryFn: () => api.payments.status(saved.orderId),
          staleTime: 0,
        });
      } catch (err) {
        // Not this account's order, or gone. Anything else (offline) is tried again next time.
        if (isNotFound(err)) await clearPendingPayment(saved.orderId);
        return;
      }

      const target = recoveryTarget(saved.orderId, status);
      if (target.clear) await clearPendingPayment(saved.orderId);
      if (!target.href) return;
      if (isPaymobSheetOpen()) return;
      const here = pathnameRef.current;
      if (here.startsWith('/checkout/payment') || here.startsWith('/checkout/confirmation')) {
        return;
      }
      router.push(target.href as never);
    } finally {
      running.current = false;
    }
  }, [client, router]);

  // On launch, once there is a session to ask with and the entry gate has routed.
  const launched = useRef(false);
  useEffect(() => {
    if (!signedIn || launched.current || pathname === '/') return;
    launched.current = true;
    void check();
  }, [check, pathname, signedIn]);

  useEffect(() => {
    if (!signedIn) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check();
    });
    return () => subscription.remove();
  }, [check, signedIn]);
}

/**
 * Where a remembered payment sends the buyer, and whether it is finished with. Exported for
 * tests. An awaiting order stays remembered only while its attempt is still with the bank.
 */
export function recoveryTarget(
  orderId: string,
  status: PaymentStatus,
): { href: string | null; clear: boolean } {
  switch (status.orderStatus) {
    case 'paid':
      return { href: `/checkout/confirmation?orderId=${orderId}`, clear: true };
    case 'failed':
    case 'expired':
      return { href: `/checkout/payment?orderId=${orderId}`, clear: true };
    case 'cancelled':
    case 'refunded':
      return { href: null, clear: true };
    case 'awaiting_payment':
      return {
        href: `/checkout/payment?orderId=${orderId}`,
        clear: !isPaymentUnsettled(status),
      };
    default:
      return { href: null, clear: false };
  }
}

function isNotFound(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const { code, status } = err as { code?: unknown; status?: unknown };
  return (
    code === 'ORDER_NOT_FOUND' || code === 'ORDER_FORBIDDEN' || status === 404 || status === 403
  );
}
