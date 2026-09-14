import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { isCartNotEditableError } from '../lib/errors';
import { useCheckoutStore } from '../stores/checkout';

/**
 * Recovers from a cart that the backend no longer allows the app to edit.
 *
 * `CART_NOT_EDITABLE` does not identify why the cart is closed. It may be converted, abandoned,
 * or expired, so only an order id already held by this checkout can take the payment path. When
 * there is no such id, the stale checkout is discarded and the buyer starts again from its event.
 */
export function useCartNotEditableRecovery(eventIdOverride?: string): (error: unknown) => boolean {
  const router = useRouter();
  const orderId = useCheckoutStore((s) => s.orderId);
  const storedEventId = useCheckoutStore((s) => s.eventId);
  const reset = useCheckoutStore((s) => s.reset);
  const eventId = eventIdOverride ?? storedEventId;

  return useCallback(
    (error: unknown) => {
      if (!isCartNotEditableError(error)) return false;

      if (orderId) {
        router.replace(`/checkout/payment?orderId=${orderId}` as never);
        return true;
      }

      reset();
      router.replace(eventId ? (`/event/${eventId}` as never) : ('/(tabs)/discover' as never));
      return true;
    },
    [eventId, orderId, reset, router],
  );
}
