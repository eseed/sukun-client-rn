import { ApiError } from '../../api/live/http';
import { heldOrderIdFromError, HeldOrderError, messageForError } from '../errors';

/**
 * The checkout moved onto the cart, and with it the code the backend uses to refuse a second
 * order for an event: `CART_ACTIVE_ORDER_EXISTS` rather than `DUPLICATE_ACTIVE_ORDER`. Only the
 * old name was mapped, so the live refusal read as "Something went wrong. Try again." and the
 * order already holding capacity was never offered. A tester hit it by cancelling the card
 * sheet and tapping again, which is the ordinary way to reach it.
 */

function apiError(code: string, extra: Record<string, unknown> = {}) {
  return new ApiError(code, 'refused', 409, [], undefined, undefined, undefined, extra);
}

describe('messageForError', () => {
  it('speaks plainly about the cart refusal, not just the legacy order one', () => {
    expect(messageForError(apiError('CART_ACTIVE_ORDER_EXISTS'))).toBe(
      'You already have an order in progress for this event.',
    );
    expect(messageForError(apiError('DUPLICATE_ACTIVE_ORDER'))).toBe(
      'You already have an order in progress for this event.',
    );
  });

  it('does not fall back to the generic copy for either of them', () => {
    for (const code of ['CART_ACTIVE_ORDER_EXISTS', 'DUPLICATE_ACTIVE_ORDER']) {
      expect(messageForError(apiError(code))).not.toBe('Something went wrong. Try again.');
    }
  });
});

describe('heldOrderIdFromError', () => {
  it('reads the order the backend named, so the screen can offer to finish it', () => {
    expect(heldOrderIdFromError(apiError('CART_ACTIVE_ORDER_EXISTS', { orderId: 'ord-9' }))).toBe(
      'ord-9',
    );
  });

  it('reads it from the legacy code too', () => {
    expect(heldOrderIdFromError(apiError('DUPLICATE_ACTIVE_ORDER', { orderId: 'ord-9' }))).toBe(
      'ord-9',
    );
  });

  /** The backend's second throw site sends no id, and there is then nothing to offer. */
  it('is null when that refusal carries no order', () => {
    expect(heldOrderIdFromError(apiError('CART_ACTIVE_ORDER_EXISTS'))).toBeNull();
    expect(heldOrderIdFromError(apiError('CART_ACTIVE_ORDER_EXISTS', { orderId: '' }))).toBeNull();
  });

  it('is null for any other refusal, so nothing else reroutes to payment', () => {
    expect(heldOrderIdFromError(apiError('CART_PRICING_CHANGED', { orderId: 'ord-9' }))).toBeNull();
    expect(heldOrderIdFromError(new Error('boom'))).toBeNull();
    expect(heldOrderIdFromError(null)).toBeNull();
  });

  it('still understands the HeldOrderError the older flow threw', () => {
    expect(heldOrderIdFromError(new HeldOrderError('ord-7'))).toBe('ord-7');
    expect(heldOrderIdFromError(new HeldOrderError(null))).toBeNull();
  });
});
