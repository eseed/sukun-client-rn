/**
 * Which platform each build profile opens the guest path for.
 *
 * `ALLOW_GUEST_BROWSING` is a single build-time variable and the app code never looks at
 * `Platform.OS`, so the whole iOS-yes / Android-no split lives in `eas.json` and nowhere
 * else. That makes it a one-character edit away from two expensive mistakes: an iOS build
 * that ships without the skip link is the configuration App Review rejected under guideline
 * 5.1.1(v), and an Android build that ships with it offers a way in Google never asked for.
 *
 * EAS merges a profile's `android.env` over its own `env` key by key, so the override adds
 * one entry rather than replacing the block. The last case guards that: an `android.env` that
 * was mistaken for the whole environment would take the API base url and the analytics ids
 * down with it, and the build would come out pointed at nothing.
 */

const easJson = require('../../eas.json') as {
  build: Record<
    string,
    { env?: Record<string, string>; android?: { env?: Record<string, string> }; extends?: string }
  >;
};

type Profile = (typeof easJson.build)[string];

const FLAG = 'EXPO_PUBLIC_ALLOW_GUEST_BROWSING';
const profiles = Object.entries(easJson.build);

/** The environment a build of `profile` for `platform` actually compiles with. */
function envFor(profile: Profile, platform: 'ios' | 'android'): Record<string, string> {
  return { ...profile.env, ...(platform === 'android' ? profile.android?.env : undefined) };
}

describe('eas.json guest browsing', () => {
  it('has profiles to check', () => {
    expect(profiles.length).toBeGreaterThan(0);
  });

  // `extends` would mean the flag can be inherited rather than stated, and `envFor` does not
  // resolve it. Nothing uses it today; this fails loudly on the day something does.
  it.each(profiles)('%s states its own environment rather than extending one', (_name, profile) => {
    expect(profile.extends).toBeUndefined();
  });

  it.each(profiles)('%s opens the guest path on iOS', (_name, profile) => {
    expect(envFor(profile, 'ios')[FLAG]).toBe('true');
  });

  it.each(profiles)('%s closes the guest path on Android', (_name, profile) => {
    expect(envFor(profile, 'android')[FLAG]).toBe('false');
  });

  it.each(profiles)('%s overrides only the flag for Android', (_name, profile) => {
    const ios = envFor(profile, 'ios');
    const android = envFor(profile, 'android');
    expect(Object.keys(android).sort()).toEqual(Object.keys(ios).sort());
    for (const key of Object.keys(ios)) {
      if (key !== FLAG) expect(android[key]).toBe(ios[key]);
    }
  });
});
