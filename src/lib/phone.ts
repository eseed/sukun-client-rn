/**
 * Phone numbers. The phone number is identity (CLAUDE.md rule 1), so this is the one place
 * that decides what a valid number is and what its canonical form looks like.
 *
 * Canonical form is E.164, from any country. Mirrors
 * `sukun-backend/src/modules/phone-normalization`, including its exclusions, so a number the
 * field accepts is a number the API accepts.
 */
import {
  AsYouType,
  getCountryCallingCode,
  isSupportedCountry,
  parsePhoneNumberFromString,
  validatePhoneNumberLength,
  type CountryCode,
} from 'libphonenumber-js/mobile';
import { COUNTRIES, type CountryInfo } from './countries.data';

/**
 * Never offered. Mirrors `EXCLUDED_COUNTRIES` in the backend's phone normalizer, which refuses
 * these numbers regardless of what the app sends.
 */
const EXCLUDED_COUNTRIES = new Set(['IL']);

/** Region used to read a number typed without a country calling code, and the preselection. */
export const DEFAULT_COUNTRY: CountryCode = 'EG';

/** The countries the picker offers, in the order it offers them. */
export const SUPPORTED_COUNTRIES: readonly CountryInfo[] = buildCountryList();

/** E.164 allows 15 digits in total, calling code included. */
const MAX_E164_DIGITS = 15;

const SUPPORTED_CODES = new Set(SUPPORTED_COUNTRIES.map((c) => c.code));

function buildCountryList(): readonly CountryInfo[] {
  const offerable = COUNTRIES.filter((country) => !EXCLUDED_COUNTRIES.has(country.code));
  const home = offerable.find((country) => country.code === DEFAULT_COUNTRY);

  // The home market sits at the top rather than under E, because it is what almost everyone
  // picking from this list wants and it is already the preselected value.
  return home
    ? [home, ...offerable.filter((country) => country.code !== DEFAULT_COUNTRY)]
    : offerable;
}

/** 🇪🇬 from `EG` — the two regional indicator symbols, so there is no flag asset table. */
export function flagFor(code: string): string {
  const upper = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return '';
  return String.fromCodePoint(
    ...[...upper].map((ch) => 0x1f1e6 + (ch.charCodeAt(0) - 'A'.charCodeAt(0))),
  );
}

/** `20` for `EG`. Without the leading `+`. */
export function dialCodeFor(code: string): string {
  const known = COUNTRIES.find((c) => c.code === code);
  if (known) return known.dialCode;
  return isSupportedCountry(code) ? getCountryCallingCode(code) : '';
}

export function countryInfo(code: string): CountryInfo | null {
  return COUNTRIES.find((c) => c.code === code) ?? null;
}

/** An example number for the country, grouped as the input groups it, for use as a hint. */
export function placeholderFor(country: CountryCode = DEFAULT_COUNTRY): string {
  return countryInfo(country)?.placeholder ?? '';
}

/**
 * The E.164 form, or `null` if this is not a mobile number we accept. Applies the country
 * allow list, exactly as the backend does, so the field never accepts what the API refuses.
 */
export function normalizePhone(
  input: string,
  country: CountryCode = DEFAULT_COUNTRY,
): string | null {
  const parsed = parse(input, country);
  if (!parsed) return null;
  return SUPPORTED_CODES.has(parsed.country ?? '') ? parsed.e164 : null;
}

export function isValidPhone(input: string, country: CountryCode = DEFAULT_COUNTRY): boolean {
  return normalizePhone(input, country) !== null;
}

/**
 * True when the number is a real mobile number but from a country we do not serve — worth
 * telling apart from a typo, because no amount of correcting will fix it.
 */
export function isUnsupportedCountry(
  input: string,
  country: CountryCode = DEFAULT_COUNTRY,
): boolean {
  const parsed = parse(input, country);
  return parsed !== null && !SUPPORTED_CODES.has(parsed.country ?? '');
}

/** The country a number belongs to, whether or not we currently serve it. */
export function countryOf(
  input: string,
  country: CountryCode = DEFAULT_COUNTRY,
): CountryCode | null {
  return parse(input, country)?.country ?? null;
}

/**
 * Display form: `+20 10 12345678`, `+1 213 373 4253` — grouped the way the number's own
 * country writes it. Falls back to the raw input if it is not a number we can place, and does
 * not apply the allow list, so a number stored before a country closed still reads correctly.
 */
export function formatPhoneForDisplay(input: string): string {
  return parse(input, DEFAULT_COUNTRY)?.international ?? input;
}

/** Local display used in the contact list: `010 12345678`. */
export function formatPhoneLocal(input: string): string {
  return parse(input, DEFAULT_COUNTRY)?.national ?? input;
}

/**
 * Strips everything the national-number input should not contain: non-digits, the trunk
 * prefix, and anything past what E.164 has room for after the calling code.
 */
export function sanitizeNationalInput(
  input: string,
  country: CountryCode = DEFAULT_COUNTRY,
): string {
  const maxDigits = Math.max(1, MAX_E164_DIGITS - dialCodeFor(country).length);
  return input.replace(/\D/g, '').replace(/^0+/, '').slice(0, maxDigits);
}

/** Groups the national number as the user types, per country: `10 12345678`, `213 373 4253`. */
export function formatNationalInput(
  digits: string,
  country: CountryCode = DEFAULT_COUNTRY,
): string {
  const national = sanitizeNationalInput(digits, country);
  if (national.length === 0) return '';

  const dial = dialCodeFor(country);
  // Formatted as international and then unprefixed: `AsYouType` groups a bare national number
  // only for the countries that have no trunk prefix, which would leave most of them unspaced.
  const formatted = new AsYouType().input(`+${dial}${national}`);
  return formatted.slice(1 + dial.length).replace(/^[\s-]/, '');
}

/** The national digits of a number, for seeding the input when a number is already known. */
export function nationalDigitsOf(input: string): string {
  return parse(input, DEFAULT_COUNTRY)?.nationalNumber ?? '';
}

/** Builds the E.164 candidate for a national number entered under a chosen country. */
export function toE164(national: string, country: CountryCode = DEFAULT_COUNTRY): string {
  return `+${dialCodeFor(country)}${sanitizeNationalInput(national, country)}`;
}

/** Areas are Egyptian governorates, so only Egypt has a living area to pick. */
export const AREA_COUNTRY = 'EG';

/**
 * `areas` holds Egyptian governorates, so the living-area field only means anything for a
 * number in Egypt — asking someone abroad to pick one has no right answer. Mirrors
 * `AppUserProfileCompletenessService.isAreaRequired` on the backend.
 */
export function requiresLivingArea(phoneE164: string | null | undefined): boolean {
  if (!phoneE164) return false;
  return countryRequiresLivingArea(countryOf(phoneE164));
}

/** The same rule for a country that has been picked but not yet attached to a number. */
export function countryRequiresLivingArea(country: string | null | undefined): boolean {
  return country === AREA_COUNTRY;
}

export type PhoneProblem = 'empty' | 'too-short' | 'too-long' | 'unsupported-country' | 'invalid';

/**
 * What is wrong with a national number entered under `country`, or `null` if nothing is.
 * Length is asked of libphonenumber rather than hardcoded, because "how many digits" is a
 * different answer in every country.
 */
export function phoneProblem(
  national: string,
  country: CountryCode = DEFAULT_COUNTRY,
): PhoneProblem | null {
  const digits = sanitizeNationalInput(national, country);
  if (digits.length === 0) return 'empty';

  const candidate = toE164(digits, country);
  const lengthIssue = validatePhoneNumberLength(candidate);
  if (lengthIssue === 'TOO_SHORT') return 'too-short';
  if (lengthIssue === 'TOO_LONG') return 'too-long';

  if (isValidPhone(candidate, country)) return null;
  if (isUnsupportedCountry(candidate, country)) return 'unsupported-country';
  return 'invalid';
}

/**
 * The message shown under the field. Kept here rather than in each screen so the three places
 * that ask for a number say the same thing.
 */
export function phoneErrorMessage(
  national: string,
  country: CountryCode = DEFAULT_COUNTRY,
): string | null {
  const problem = phoneProblem(national, country);
  if (problem === null) return null;

  const name = countryInfo(country)?.name;

  switch (problem) {
    case 'empty':
      return 'Enter your mobile number.';
    case 'too-short':
      return 'That number is too short.';
    case 'too-long':
      return 'That number is too long.';
    case 'unsupported-country':
      return "We don't send to that country yet.";
    default:
      // Phrased around the country name rather than its adjective: there is no table of
      // demonyms here, and "a Egypt mobile number" is what guessing one produces.
      return name
        ? `That doesn't look like a mobile number in ${name}.`
        : "That doesn't look like a mobile number.";
  }
}

interface ParsedPhone {
  e164: string;
  country: CountryCode | undefined;
  international: string;
  national: string;
  nationalNumber: string;
}

/**
 * `parsePhoneNumberFromString` returns `undefined` rather than throwing on an unknown calling
 * code, which is the input a country picker invites.
 */
function parse(input: string, country: CountryCode): ParsedPhone | null {
  if (typeof input !== 'string' || input.trim().length === 0) return null;

  const cleaned = prepare(input);
  let parsed = parsePhoneNumberFromString(cleaned, country);

  // Only after a straight read fails, so a national number whose trunk prefix is a genuine
  // leading zero is never reinterpreted as a country calling code. A parse that succeeded but
  // is invalid has to fall through too, which is why this is not a `??`.
  if (!parsed?.isValid() && /^0[1-9]\d+$/.test(cleaned)) {
    const fallback = parsePhoneNumberFromString(`+${cleaned.slice(1)}`);
    if (fallback?.isValid()) parsed = fallback;
  }

  if (!parsed?.isValid()) return null;

  return {
    e164: parsed.number,
    country: parsed.country,
    international: parsed.formatInternational(),
    national: parsed.formatNational(),
    nationalNumber: parsed.nationalNumber,
  };
}

const ARABIC_INDIC_OFFSET = 0x0660;
const EASTERN_ARABIC_OFFSET = 0x06f0;

function prepare(input: string): string {
  let value = input.trim();

  // Arabic-indic and eastern-arabic digits arrive from Arabic keyboards and from contacts.
  value = value.replace(/[٠-٩]/g, (ch) => String(ch.charCodeAt(0) - ARABIC_INDIC_OFFSET));
  value = value.replace(/[۰-۹]/g, (ch) => String(ch.charCodeAt(0) - EASTERN_ARABIC_OFFSET));

  value = value.replace(/[\s\-().‎‏ ]/g, '');

  if (value.startsWith('00')) value = `+${value.slice(2)}`;

  return value;
}
