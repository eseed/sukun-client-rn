import { getCalendars, getLocales } from 'expo-localization';
import { requiresPrivacyConsentGate } from '../privacyRegion';

const localesMock = getLocales as jest.MockedFunction<typeof getLocales>;
const calendarsMock = getCalendars as jest.MockedFunction<typeof getCalendars>;

/** Puts the device in one region, and optionally one timezone, for the next call. */
function onDevice(regionCode: string, timeZone?: string): void {
  localesMock.mockReturnValueOnce([{ regionCode }] as unknown as ReturnType<typeof getLocales>);
  if (timeZone) {
    calendarsMock.mockReturnValueOnce([{ timeZone }] as unknown as ReturnType<typeof getCalendars>);
  }
}

/** Drops `ExpoLocalization` from the registry for one call: a binary built without it. */
function withoutLocalizationModule<T>(run: () => T): T {
  const registry = (globalThis as { expo?: { modules?: Record<string, unknown> } }).expo?.modules;
  const saved = registry?.ExpoLocalization;
  if (registry) delete registry.ExpoLocalization;

  try {
    return run();
  } finally {
    if (registry) registry.ExpoLocalization = saved;
  }
}

describe('requiresPrivacyConsentGate', () => {
  it('does not gate a device outside the covered regions', () => {
    expect(requiresPrivacyConsentGate()).toBe(false);
  });

  it.each(['DE', 'FR', 'IE', 'PL'])('gates a device in the EU (%s)', (regionCode) => {
    onDevice(regionCode);

    expect(requiresPrivacyConsentGate()).toBe(true);
  });

  /**
   * Not the EU, but GDPR-equivalent regimes the same gate answers for: UK GDPR, the Swiss
   * FADP, and the EEA states that adopted GDPR. Narrowing to the EU 27 would drop them.
   */
  it.each(['GB', 'CH', 'NO', 'IS', 'LI'])(
    'gates a device under a GDPR-equivalent regime (%s)',
    (regionCode) => {
      onDevice(regionCode);

      expect(requiresPrivacyConsentGate()).toBe(true);
    },
  );

  it('gates a US device on Pacific time, the proxy for California', () => {
    onDevice('US', 'America/Los_Angeles');

    expect(requiresPrivacyConsentGate()).toBe(true);
  });

  it.each(['America/New_York', 'America/Chicago', 'America/Denver'])(
    'leaves the rest of the US ungated (%s)',
    (timeZone) => {
      onDevice('US', timeZone);

      expect(requiresPrivacyConsentGate()).toBe(false);
    },
  );

  it.each(['EG', 'AE', 'SA', 'CA', 'AU', 'JP'])(
    'does not gate a device elsewhere (%s)',
    (regionCode) => {
      onDevice(regionCode);

      expect(requiresPrivacyConsentGate()).toBe(false);
    },
  );

  /**
   * The package reaches for its native module while it imports, and Metro reports a throw
   * during a module load as a fatal error no `try` at the call site can catch, so a binary
   * without the module has to be detected before the package is loaded, not after.
   */
  it('asks for consent without loading the package when the binary lacks the module', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    localesMock.mockClear();

    const gated = withoutLocalizationModule(() => requiresPrivacyConsentGate());

    expect(gated).toBe(true);
    expect(localesMock).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
