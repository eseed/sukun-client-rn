/**
 * The polarity of the guest-path flag, which is the opposite of the analytics ids on purpose.
 *
 * A build that forgets `EXPO_PUBLIC_ALLOW_GUEST_BROWSING` must still offer the guest path:
 * shipping without it is the configuration App Review rejected under guideline 5.1.1(v), so
 * "unset" and "misspelled" both have to fail towards enabled. Only the literal "false" is an
 * instruction to close it.
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

describe('ALLOW_GUEST_BROWSING', () => {
  it('is enabled when the variable is not set', () => {
    expect(loadFlags(undefined).ALLOW_GUEST_BROWSING).toBe(true);
  });

  it('is enabled when set to "true"', () => {
    expect(loadFlags('true').ALLOW_GUEST_BROWSING).toBe(true);
  });

  it('is disabled only by the literal "false"', () => {
    expect(loadFlags('false').ALLOW_GUEST_BROWSING).toBe(false);
  });

  it.each(['0', 'off', 'no', 'FALSE', ''])(
    'treats %p as enabled rather than guessing at an intent to close the guest path',
    (value) => {
      expect(loadFlags(value).ALLOW_GUEST_BROWSING).toBe(true);
    },
  );
});
