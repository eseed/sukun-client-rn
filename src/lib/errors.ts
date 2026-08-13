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
  TIER_NOT_FOUND: 'That pass is no longer available.',
  ORDER_NOT_FOUND: "We couldn't find that order.",
  TICKET_NOT_FOUND: "We couldn't find that ticket.",
  TICKET_FORBIDDEN: 'That ticket is not yours.',

  GUEST_PHONE_INVALID: 'That does not look like an Egyptian mobile number.',
  GUEST_IS_BUYER: "That's your own number — your ticket is already included.",
  GUEST_DUPLICATE: "You've already added that number.",
  MAX_TICKETS_EXCEEDED: 'That is more tickets than this event allows in one order.',
  INVALID_PHONE_NUMBER: 'That does not look like an Egyptian mobile number.',
  SAME_AS_BUYER: "That's your own number — your ticket is already included.",
  DUPLICATE_IN_ORDER: "You've already added that number.",
  GUEST_ALREADY_HAS_TICKET: 'That guest cannot be added to this order.',

  // `GuestValidationIssueResponseDto.error` on the live backend — same guest-step copy above,
  // just the server's own vocabulary instead of the mock's.
  INVALID_PHONE_NUMBER: 'That does not look like an Egyptian mobile number.',
  DUPLICATE_IN_ORDER: "You've already added that number.",
  SAME_AS_BUYER: "That's your own number — your ticket is already included.",
  GUEST_ALREADY_HAS_TICKET: 'That guest already has a ticket to this event.',

  PROMO_CODE_INVALID: 'That promo code is not valid.',
  PAYMENT_FAILED: 'The payment did not go through. Nothing was charged.',
};

const FALLBACK = 'Something went wrong. Try again.';

export function messageForCode(code: string | undefined): string {
  if (!code) return FALLBACK;
  return MESSAGES[code] ?? FALLBACK;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
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
