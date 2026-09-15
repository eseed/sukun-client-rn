/**
 * Which build the app says it is.
 *
 * Staging and production submit to the same App Store Connect record, so a TestFlight tester sees
 * two builds in one list told apart only by their build number, and until this existed there was
 * nothing on screen to say which one they had opened. A bug filed against the wrong build costs a
 * day to work out.
 *
 * The answer is decided once, at import, from the environment the build was compiled with. Each
 * case therefore re-imports the module with the environment it is describing rather than trying
 * to change it in place, and this lives in a file of its own because resetting the module
 * registry mid-suite would pull the rug from under every screen test sharing an import.
 */

const ORIGINAL = process.env.EXPO_PUBLIC_ANALYTICS_ENV;

function buildInfoWith(env: string | undefined) {
  if (env === undefined) delete process.env.EXPO_PUBLIC_ANALYTICS_ENV;
  else process.env.EXPO_PUBLIC_ANALYTICS_ENV = env;
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../build-info') as typeof import('../build-info');
}

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.EXPO_PUBLIC_ANALYTICS_ENV;
  else process.env.EXPO_PUBLIC_ANALYTICS_ENV = ORIGINAL;
  jest.resetModules();
});

describe('which build this is', () => {
  it('badges a staging build', () => {
    const info = buildInfoWith('staging');

    expect(info.IS_STAGING_BUILD).toBe(true);
  });

  /** Production is the one build that must look like nothing out of the ordinary. */
  it('leaves a production build unbadged', () => {
    const info = buildInfoWith('production');

    expect(info.IS_STAGING_BUILD).toBe(false);
  });

  /**
   * Only staging is badged, so anything else is not. The version still has to be there: a build
   * nobody can identify is the problem this file exists for, badge or no badge.
   */
  it('reports the version and build number whether or not it badges', () => {
    const info = buildInfoWith(undefined);

    expect(info.APP_VERSION).toBe('2.0.0');
    expect(info.APP_BUILD).toBe('15');
    expect(info.APP_VERSION_LINE).toBe('2.0.0 (15)');
    expect(info.IS_STAGING_BUILD).toBe(false);
  });

  /**
   * The build number comes from the native bundle, never from the app config: EAS owns it
   * remotely (`appVersionSource: "remote"`), so the config on disk does not know it. A version
   * with no build number is still worth showing rather than showing nothing.
   */
  it('falls back to the bare version when there is no build number', () => {
    jest.resetModules();
    jest.doMock('expo-application', () => ({
      nativeApplicationVersion: '2.0.0',
      nativeBuildVersion: null,
    }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const info = require('../build-info') as typeof import('../build-info');

    expect(info.APP_VERSION_LINE).toBe('2.0.0');
    jest.dontMock('expo-application');
  });
});
