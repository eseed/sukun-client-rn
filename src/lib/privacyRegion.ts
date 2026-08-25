import type { getCalendars, getLocales } from 'expo-localization';
import { hasExpoModule } from './nativeModules';

type LocalizationModule = {
  getLocales: typeof getLocales;
  getCalendars: typeof getCalendars;
};

/** EU + EEA member states, plus UK (UK GDPR) and Switzerland (FADP) — all GDPR-equivalent. */
const GDPR_EQUIVALENT_REGION_CODES = new Set([
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IE',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE', // EU
  'IS',
  'LI',
  'NO', // EEA
  'GB',
  'CH',
]);

/**
 * A device region code only identifies country, not US state, so California can't be detected
 * reliably this way. Pacific-time IANA zones are the closest cheap, offline proxy — imperfect
 * (covers non-CA Pacific-time areas too, and misses CA residents who travel or set another
 * timezone), but better than either gating all of the US or none of it.
 */
const CALIFORNIA_TIMEZONE_PROXIES = new Set(['America/Los_Angeles', 'America/Tijuana']);

/**
 * Best-effort, offline check for whether this device is likely EU/EEA/UK/Switzerland or
 * California — the populations CLAUDE.md and the product owner confirmed need a consent gate
 * before analytics initializes. Never calls out to a geo-IP service: doing that before consent
 * is resolved would itself send data off-device pre-consent.
 */
export function requiresPrivacyConsentGate(): boolean {
  // Loaded here rather than imported at the top of the file, and only once the binary is known
  // to carry it: expo-localization throws while it imports when its native module is missing,
  // and Metro reports that throw as a fatal error the `catch` below never sees. This module is
  // pulled in by the root layout, so an unguarded import took the app down on launch. See
  // `nativeModules.ts` for why the registry is consulted first.
  if (!hasExpoModule('ExpoLocalization')) {
    console.warn('[privacy] no localization module in this build, asking for consent');
    return true;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getLocales, getCalendars } = require('expo-localization') as LocalizationModule;

    const region = getLocales()[0]?.regionCode ?? null;
    if (region && GDPR_EQUIVALENT_REGION_CODES.has(region)) return true;
    if (region === 'US') {
      const timeZone = getCalendars()[0]?.timeZone ?? null;
      if (timeZone && CALIFORNIA_TIMEZONE_PROXIES.has(timeZone)) return true;
    }
    return false;
  } catch (error) {
    // Detection failing is not a signal that consent is safe to skip — fail toward asking.
    console.warn('[privacy] region detection unavailable, asking for consent', error);
    return true;
  }
}
