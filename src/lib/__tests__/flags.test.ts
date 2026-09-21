/**
 * The polarity of the compiled-in guest-path fallback, which is the opposite of the analytics
 * ids on purpose.
 *
 * The live value comes from the backend now (`src/stores/flags.ts`), so this constant is what
 * the app uses before the first response arrives and whenever it never does. That makes its
 * polarity more load bearing rather than less: a build that forgets
 * `EXPO_PUBLIC_ALLOW_GUEST_BROWSING` and cannot reach the backend must still offer the guest
 * path, because shipping without it is the configuration App Review rejected under guideline
 * 5.1.1(v). So "unset" and "misspelled" both have to fail towards enabled, and only the
 * literal "false" is an instruction to close it.
 */
function loadFlags(value: string | undefined): typeof import('../flags') {
  const previous = process.env.EXPO_PUBLIC_ALLOW_GUEST_BROWSING;
  if (value === undefined) delete process.env.EXPO_PUBLIC_ALLOW_GUEST_BROWSING;
  else process.env.EXPO_PUBLIC_ALLOW_GUEST_BROWSING = value;

  let mod!: typeof import('../flags');
  try {
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      mod = require('../flags') as typeof import('../flags');
    });
  } finally {
    if (previous === undefined) delete process.env.EXPO_PUBLIC_ALLOW_GUEST_BROWSING;
    else process.env.EXPO_PUBLIC_ALLOW_GUEST_BROWSING = previous;
  }
  return mod;
}

describe('ALLOW_GUEST_BROWSING_FALLBACK', () => {
  it('is enabled when the variable is not set', () => {
    expect(loadFlags(undefined).ALLOW_GUEST_BROWSING_FALLBACK).toBe(true);
  });

  it('is enabled when set to "true"', () => {
    expect(loadFlags('true').ALLOW_GUEST_BROWSING_FALLBACK).toBe(true);
  });

  it('is disabled only by the literal "false"', () => {
    expect(loadFlags('false').ALLOW_GUEST_BROWSING_FALLBACK).toBe(false);
  });

  it.each(['0', 'off', 'no', 'FALSE', ''])(
    'treats %p as enabled rather than guessing at an intent to close the guest path',
    (value) => {
      expect(loadFlags(value).ALLOW_GUEST_BROWSING_FALLBACK).toBe(true);
    },
  );
});
