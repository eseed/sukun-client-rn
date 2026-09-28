import { NativeModules } from 'react-native';

/**
 * A binary built before Meta's SDK was added (a stale dev client or simulator build): the
 * package is in the bundle but its native modules are not. Meta's events go quiet; nothing
 * else may change.
 */
delete NativeModules.FBAppEventsLogger;

describe('a binary without the Meta SDK', () => {
  it('leaves Meta off without throwing, and warns once', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AppEventsLogger, Settings } = require('react-native-fbsdk-next') as jest.Mocked<
      typeof import('react-native-fbsdk-next')
    >;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const analytics = require('../analytics') as typeof import('../analytics');

    expect(() => analytics.enableAnalytics()).not.toThrow();
    analytics.trackMeta('ViewContent', { content_ids: ['event-1'] });
    analytics.trackMeta('Search', { search_string: 'yoga' });

    expect(Settings.initializeSDK).not.toHaveBeenCalled();
    expect(AppEventsLogger.logEvent).not.toHaveBeenCalled();
    expect(analytics.analyticsEnabled()).toBe(true);
    expect(warn.mock.calls.filter(([message]) => String(message).includes('Meta'))).toHaveLength(1);
    warn.mockRestore();
  });
});
