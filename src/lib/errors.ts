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

  PROMO_CODE_INVALID: 'That promo code is not valid.',
  PAYMENT_FAILED: 'The payment did not go through. Nothing was charged.',
};

const FALLBACK = 'Something went wrong. Try again.';

export function messageForCode(code: string | undefined): string {
  if (!code) return FALLBACK;
  return MESSAGES[code] ?? FALLBACK;
}

/** Pulls a display message off whatever the api layer threw. */
export function messageForError(error: unknown): string {
  if (error && typeof error === 'object') {
    const code = (error as { code?: string }).code;
    if (code && MESSAGES[code]) return MESSAGES[code];
    const message = (error as { message?: string }).message;
    if (message) return message;
  }
  return FALLBACK;
}
