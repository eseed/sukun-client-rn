import { NativeModules } from 'react-native';

/**
 * A binary that does not carry Clarity's native module: a dev client built before the package
 * was added, or Expo Go. Clarity builds a `NativeEventEmitter` from `ClarityEmitter` while it
 * imports, and Metro turns a throw during a module load into a fatal error the call site cannot
 * catch, so the root layout importing analytics took the whole app down on launch. Analytics
 * going quiet is acceptable; the app not starting is not.
 */
delete NativeModules.ClarityEmitter;

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('a native module missing from the binary', () => {
  it('does not throw merely by importing the analytics module', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    expect(() => require('../analytics')).not.toThrow();
  });

  it('leaves the package unloaded, and warns once rather than on every event', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Clarity = require('@microsoft/react-native-clarity') as jest.Mocked<
      typeof import('@microsoft/react-native-clarity')
    >;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const analytics = require('../analytics') as typeof import('../analytics');

    expect(() => analytics.enableAnalytics()).not.toThrow();
    await flush();

    expect(Clarity.initialize).not.toHaveBeenCalled();
    expect(analytics.analyticsEnabled()).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);

    analytics.track('otp_requested');
    analytics.identify('user-1');
    analytics.resetAnalytics();
    await flush();

    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
