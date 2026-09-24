import { ApiError } from '../../api/live/http';
import {
  heldOrderIdFromError,
  HeldOrderError,
  isCartNotEditableError,
  messageForError,
} from '../errors';

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

  it('speaks neutrally about any cart that is no longer editable', () => {
    expect(messageForError(apiError('CART_NOT_EDITABLE'))).toBe(
      'This checkout is no longer available. Start again from the event.',
    );
    expect(messageForError(apiError('ROOM_OCCUPANCY_UNFILLED'))).toBe(
      'Every room has to be full before you can check out.',
    );
    expect(messageForError(apiError('ADDON_ASSIGNMENT_COUNT_MISMATCH'))).toBe(
      'Every extra needs somebody to go to.',
    );

    for (const code of [
      'CART_NOT_EDITABLE',
      'ROOM_OCCUPANCY_UNFILLED',
      'ADDON_ASSIGNMENT_COUNT_MISMATCH',
    ]) {
      expect(messageForError(apiError(code))).not.toBe('Something went wrong. Try again.');
    }
  });
});

describe('isCartNotEditableError', () => {
  it('reads the refusal off the api error', () => {
    expect(isCartNotEditableError(apiError('CART_NOT_EDITABLE'))).toBe(true);
  });

  it('is false for any other refusal, so nothing else is rerouted', () => {
    expect(isCartNotEditableError(apiError('CART_ACTIVE_ORDER_EXISTS'))).toBe(false);
    expect(isCartNotEditableError(new Error('boom'))).toBe(false);
    expect(isCartNotEditableError(null)).toBe(false);
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

describe('payment provider refusals', () => {
  it('does not blame the connection when Paymob answered and refused', () => {
    expect(messageForError(apiError('PAYMENT_PROVIDER_ERROR'))).toBe(
      'The payment could not be started. Nothing was charged. Try again.',
    );
  });

  it('names an outage when Paymob could not be reached', () => {
    expect(messageForError(apiError('PAYMENT_PROVIDER_UNAVAILABLE'))).toBe(
      "The payment provider couldn't be reached. Nothing was charged. Try again in a moment.",
    );
  });
});
