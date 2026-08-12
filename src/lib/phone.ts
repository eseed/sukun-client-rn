/**
 * Egyptian mobile numbers. The phone number is identity (CLAUDE.md rule 1), so this is the
 * one place that decides what a valid number is and what its canonical form looks like.
 *
 * Canonical form is E.164: `+20` followed by a 10-digit national number starting `1`
 * (`10`, `11`, `12`, `15`). Mirrors the backend's `EgyptianPhoneNumberNormalizer`.
 */

export const EG_DIAL_CODE = '+20';

/** Returns the E.164 form, or `null` if this is not a valid Egyptian mobile number. */
export function normalizeEgyptianPhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, '');
  let national = digits;

  if (national.startsWith('+20')) national = national.slice(3);
  else if (national.startsWith('0020')) national = national.slice(4);
  else if (national.startsWith('20') && national.length > 10) national = national.slice(2);
  if (national.startsWith('0')) national = national.slice(1);

  if (!/^1[0125]\d{8}$/.test(national)) return null;
  return `${EG_DIAL_CODE}${national}`;
}

export function isValidEgyptianPhone(input: string): boolean {
  return normalizeEgyptianPhone(input) !== null;
}

/**
 * Display form used across the design: `+20 101 234 5678`.
 * Falls back to the raw input if it is not a recognisable Egyptian number.
 */
export function formatPhoneForDisplay(e164OrLocal: string): string {
  const e164 = normalizeEgyptianPhone(e164OrLocal);
  if (!e164) return e164OrLocal;
  const n = e164.slice(3);
  return `${EG_DIAL_CODE} ${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
}

/** Local display used in the contact list: `010 2233 4455`. */
export function formatPhoneLocal(e164OrLocal: string): string {
  const e164 = normalizeEgyptianPhone(e164OrLocal);
  if (!e164) return e164OrLocal;
  const n = e164.slice(3);
  return `0${n.slice(0, 2)} ${n.slice(2, 6)} ${n.slice(6)}`;
}

/** Strips everything the national-number input should not contain. */
export function sanitizeNationalInput(input: string): string {
  return input.replace(/\D/g, '').replace(/^0+/, '').slice(0, 10);
}

/** Groups the national number as the user types: `10 1234 5678`. */
export function formatNationalInput(digits: string): string {
  const d = sanitizeNationalInput(digits);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `${d.slice(0, 2)} ${d.slice(2)}`;
  return `${d.slice(0, 2)} ${d.slice(2, 6)} ${d.slice(6)}`;
}
