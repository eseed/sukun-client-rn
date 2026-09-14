import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { isCartNotEditableError } from '../lib/errors';
import { useCheckoutStore } from '../stores/checkout';

/**
 * Catches the one refusal an earlier checkout screen cannot act on: `CART_NOT_EDITABLE`.
 *
 * It means the cart has already become an order, and no cart endpoint will ever take another
 * edit for it. Retrying is a dead end, and reopening the cart is impossible on purpose, so the
 * only useful move is to finish paying the order that exists. Review keeps that order id in the
 * checkout store, and this sends the buyer to the payment screen, which owns retrying and
 * resolving the payment.
 *
 * Returns true when it handled the error and the caller must stop. False for any other refusal,
 * or for this one with no order id to route to; the caller shows the mapped error instead. It
 * never invents an order id.
 */
export function useConvertedCartRecovery(): (error: unknown) => boolean {
  const router = useRouter();
  const orderId = useCheckoutStore((s) => s.orderId);

  return useCallback(
    (error: unknown) => {
      if (!isCartNotEditableError(error) || !orderId) return false;
      router.replace(`/checkout/payment?orderId=${orderId}` as never);
      return true;
    },
    [orderId, router],
  );
}
