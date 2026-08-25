/**
 * Maps server error codes to user-facing copy.
 *
 * Note what is *absent*: no message here reveals whether a phone number belongs to a
 * registered account. Guest-validation copy is deliberately identical for registered and
 * unregistered numbers (CLAUDE.md rule 4).
 */

const MESSAGES: Record<string, string> = {
  INVALID_PHONE: 'Enter a valid Egyptian mobile number.',
  OTP_INVALID: 'That code is not right. Try again.',
  OTP_EXPIRED: 'That code has expired. Ask for a new one.',
  OTP_ATTEMPTS_EXCEEDED: 'Too many tries. Ask for a new code in a moment.',
  OTP_RATE_LIMITED: 'Give it a moment before asking for another code.',
  OTP_DELIVERY_FAILED: "We couldn't send the code. Try again in a moment.",
  AUTHENTICATION_UNAVAILABLE: 'Sign-in is unavailable right now. Try again shortly.',
  ACCOUNT_SUSPENDED: 'This account is not available. Contact support.',
  // Confirmed against staging: comes back as the raw i18n key ("mobileAuth.errors.tokenInvalid"),
  // not a translated message, even with Accept-Language: en — so it needs its own copy here.
  TOKEN_INVALID: 'Your session expired. Sign in again.',

  EMAIL_ALREADY_IN_USE: 'That email is already on another account.',
  PROFILE_INCOMPLETE: 'Complete your profile before buying tickets.',
  SELFIE_REQUIRED: 'Add your selfie to use this ticket.',
  FILE_REQUIRED: 'Choose a photo to upload.',

  EVENT_NOT_FOUND: "We couldn't find that event.",
  EVENT_NOT_PURCHASABLE: 'Tickets for this event are not on sale right now.',
  TIER_NOT_FOUND: 'That pass is no longer available.',
  ORDER_NOT_FOUND: "We couldn't find that order.",
  TICKET_NOT_FOUND: "We couldn't find that ticket.",
  TICKET_FORBIDDEN: 'That ticket is not yours.',
  TICKET_FILTER_INVALID: "We couldn't load your tickets. Try again.",
  BUYER_NOT_FOUND: 'Complete your profile before buying tickets.',
  SELFIE_NOT_FOUND: 'Add your selfie to use this ticket.',

  GUEST_PHONE_INVALID: 'That does not look like an Egyptian mobile number.',
  GUEST_IS_BUYER: "That's your own number. Your ticket is already included.",
  GUEST_DUPLICATE: "You've already added that number.",
  MAX_TICKETS_EXCEEDED: 'That is more tickets than this event allows in one order.',
  // `GuestValidationIssueResponseDto.error` on the live backend — same guest-step copy above,
  // just the server's own vocabulary instead of the mock's.
  INVALID_PHONE_NUMBER: 'That does not look like an Egyptian mobile number.',
  DUPLICATE_IN_ORDER: "You've already added that number.",
  SAME_AS_BUYER: "That's your own number. Your ticket is already included.",
  GUEST_ALREADY_HAS_TICKET: 'That guest already has a ticket to this event.',
  BUYER_ALREADY_HAS_TICKET:
    'You already have a ticket for this event. These ones go to your guests.',

  PROMO_CODE_INVALID: 'That promo code is not valid.',
  // The live backend's own promo vocabulary — `PROMO_CODE_INVALID` above is the mock's.
  PROMO_CODE_NOT_FOUND: 'That promo code is not valid.',
  PROMO_CODE_ALREADY_USED: "You've already used that promo code.",
  PROMO_CODE_NOT_APPLICABLE_TO_TIER: 'That promo code does not apply to this pass.',

  /*
   * Payment and order lifecycle. Every code below is one the backend really returns from
   * `mobile/orders/**` (verified against the staging OpenAPI schema) — without them a stalled
   * or already-settled payment fell through to the generic fallback, which told the buyer
   * nothing about what to do next.
   */
  PAYMENT_FAILED: 'The payment did not go through. Nothing was charged.',
  PAYMENT_CONFIRMATION_PENDING:
    "We're still confirming your last payment attempt. Give it a moment, then try again.",
  // The backend blocks only on an order still awaiting payment, and answers 200 when that order
  // already matches the request — so this code always means a *different* order is holding the
  // capacity. `useCreateOrder` turns it into a `HeldOrderError` so the screen can offer that
  // order instead of quietly swapping the buyer's basket for it.
  DUPLICATE_ACTIVE_ORDER: 'You already have an order in progress for this event.',
  PAYMENT_ALREADY_COMPLETED: 'This order is already paid. Check your tickets.',
  PAYMENT_PROVIDER_ERROR: "The payment provider couldn't be reached. Nothing was charged.",
  ORDER_HOLD_EXPIRED: 'Your reservation expired before payment. Start the order again.',
  ORDER_NOT_PAYABLE: 'This order can no longer be paid. Start a new one.',
  ORDER_NOT_RETRYABLE: 'This payment cannot be retried. Start a new order.',
  ORDER_NOT_CANCELLABLE: 'This order can no longer be cancelled.',
  MAX_TICKETS_PER_ORDER_EXCEEDED: 'That is more tickets than this event allows in one order.',
  GUEST_VALIDATION_RATE_LIMITED: 'Give it a moment before checking more numbers.',

  /* Session + auth codes the transport can surface before the refresh flow gives up. */
  ACCESS_TOKEN_EXPIRED: 'Your session expired. Sign in again.',
  ACCESS_TOKEN_INVALID: 'Your session expired. Sign in again.',
  REFRESH_TOKEN_EXPIRED: 'Your session expired. Sign in again.',
  REFRESH_TOKEN_INVALID: 'Your session expired. Sign in again.',
  REFRESH_TOKEN_REUSED: 'Your session expired. Sign in again.',
  SESSION_REVOKED: 'Your session ended. Sign in again.',
  AUTH_RATE_LIMITED: 'Too many attempts. Try again in a moment.',
  ACCOUNT_DEACTIVATED: 'This account is not available. Contact support.',
  // `mobile/auth/otp/verify` returns INVALID_CODE where the mock returns OTP_INVALID.
  INVALID_CODE: 'That code is not right. Try again.',
  OTP_PROVIDER_UNAVAILABLE: "We couldn't send the code. Try again in a moment.",
  OTP_IDEMPOTENCY_CONFLICT: 'That code request is already in flight. Give it a moment.',

  /* Account restoration + deletion. */
  ACCOUNT_ALREADY_RESTORED: 'This account is already active. Sign in normally.',
  ACCOUNT_RESTORATION_NOT_ALLOWED: 'This account cannot be restored. Contact support.',
  ACCOUNT_RESTORATION_WINDOW_EXPIRED: 'The window to restore this account has passed.',
  ACCOUNT_DELETION_NOT_ALLOWED: 'This account cannot be deleted right now.',
  ACCOUNT_DELETION_PAYMENT_IN_PROGRESS:
    'A payment is still being processed. Try deleting again once it settles.',
  FORFEIT_CONFIRMATION_REQUIRED: 'Confirm you understand your tickets will be voided.',

  /* Email verification (gates nothing — CLAUDE.md rule 1 — but still needs real copy). */
  EMAIL_ALREADY_VERIFIED: 'That email is already verified.',
  EMAIL_NOT_SET: 'Add an email address first.',
  EMAIL_INVALID: 'Enter a valid email address.',
  EMAIL_VERIFICATION_RATE_LIMITED: 'Give it a moment before asking for another email.',
  EMAIL_VERIFICATION_TOKEN_EXPIRED: 'That verification link expired. Send a new one.',
  EMAIL_VERIFICATION_TOKEN_INVALID: 'That verification link is not valid. Send a new one.',
  EMAIL_VERIFICATION_TARGET_MISMATCH: 'That link was for a different email address.',

  VALIDATION_ERROR: 'Some of those details are not valid. Check and try again.',
  INTERNAL_SERVER_ERROR: 'Something went wrong on our side. Try again in a moment.',
};

const FALLBACK = 'Something went wrong. Try again.';

export function messageForCode(code: string | undefined): string {
  if (!code) return FALLBACK;
  return MESSAGES[code] ?? FALLBACK;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** True only when the API explicitly says this account must use restoration. */
export function isAccountRestorationRequired(error: unknown): boolean {
  if (!isRecord(error)) return false;
  const code = typeof error.code === 'string' ? error.code : '';
  const message = typeof error.message === 'string' ? error.message.toLowerCase() : '';
  return (
    code === 'ACCOUNT_DELETED' ||
    code === 'ACCOUNT_RESTORATION_REQUIRED' ||
    message === 'appusers.errors.accountrestorationrequired' ||
    (code === 'AUTHENTICATION_UNAVAILABLE' &&
      message.includes('deleted') &&
      message.includes('restore'))
  );
}

/** Pulls a display message off whatever the api layer threw. */
export function messageForError(error: unknown): string {
  if (isRecord(error)) {
    const code = error.code;
    if (typeof code === 'string') {
      return messageForCode(code);
    }
    if (typeof error.message === 'string' && error.message.trim()) return error.message;
  }
  return FALLBACK;
}

/**
 * Thrown when order creation is refused because an earlier order for the same event is still
 * holding capacity. Carries that order's id when it could be located, so the screen can offer
 * to continue it — the one thing the buyer can actually do about it.
 */
export class HeldOrderError extends Error {
  readonly code = 'DUPLICATE_ACTIVE_ORDER';

  constructor(readonly heldOrderId: string | null) {
    super('You already have an order in progress for this event.');
    this.name = 'HeldOrderError';
  }
}

export function isHeldOrderError(error: unknown): error is HeldOrderError {
  return error instanceof HeldOrderError;
}
