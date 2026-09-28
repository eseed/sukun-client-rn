import * as Clarity from '@microsoft/react-native-clarity';
import { Mixpanel } from 'mixpanel-react-native';
import { AppEventsLogger, Settings } from 'react-native-fbsdk-next';

/**
 * The consent gate is the whole point of this module, so what is asserted here is mostly what
 * must *not* happen: no SDK may start on import, or while consent is withheld.
 */
function loadAnalytics(): typeof import('../analytics') {
  let mod!: typeof import('../analytics');
  jest.isolateModules(() => {
    // A fresh registry per test is the only way to observe the pre-consent state, and it
    // needs a runtime require rather than a hoisted import.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('../analytics') as typeof import('../analytics');
  });
  return mod;
}

const clarityMock = Clarity as jest.Mocked<typeof Clarity>;
const MixpanelMock = Mixpanel as unknown as jest.Mock;

/** Lets the promise chains inside the module settle before asserting on them. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('before consent', () => {
  it('starts no SDK merely by being imported', () => {
    loadAnalytics();

    expect(clarityMock.initialize).not.toHaveBeenCalled();
    expect(MixpanelMock).not.toHaveBeenCalled();
  });

  it('drops events instead of queuing them', async () => {
    const analytics = loadAnalytics();

    analytics.track('otp_requested');
    await flush();

    expect(analytics.analyticsEnabled()).toBe(false);
    expect(MixpanelMock).not.toHaveBeenCalled();
  });

  it('does not tag a session with a user id', async () => {
    const analytics = loadAnalytics();

    analytics.identify('user-1');
    await flush();

    expect(clarityMock.setCustomUserId).not.toHaveBeenCalled();
  });
});

describe('once consent is granted', () => {
  it('starts session replay and events together', async () => {
    const analytics = loadAnalytics();

    analytics.enableAnalytics();
    await flush();

    expect(analytics.analyticsEnabled()).toBe(true);
    expect(clarityMock.initialize).toHaveBeenCalledTimes(1);
    expect(MixpanelMock).toHaveBeenCalledTimes(1);
  });

  it('sends events', async () => {
    const analytics = loadAnalytics();

    analytics.enableAnalytics();
    await flush();
    analytics.track('otp_requested', { is_new_user: true });
    await flush();

    const instance = MixpanelMock.mock.results[0]!.value as { track: jest.Mock };
    expect(instance.track).toHaveBeenCalledWith('otp_requested', { is_new_user: true });
  });

  it('ties both SDKs to the same identity', async () => {
    const analytics = loadAnalytics();

    analytics.enableAnalytics();
    await flush();
    analytics.identify('user-1');
    await flush();

    const instance = MixpanelMock.mock.results[0]!.value as { identify: jest.Mock };
    expect(instance.identify).toHaveBeenCalledWith('user-1');
    expect(clarityMock.setCustomUserId).toHaveBeenCalledWith('user-1');
  });

  it('resumes rather than re-initializing on a second enable', async () => {
    const analytics = loadAnalytics();

    analytics.enableAnalytics();
    await flush();
    analytics.disableAnalytics();
    await flush();
    analytics.enableAnalytics();
    await flush();

    expect(clarityMock.initialize).toHaveBeenCalledTimes(1);
    expect(clarityMock.resume).toHaveBeenCalledTimes(1);
  });
});

describe('when consent is withdrawn', () => {
  it('stops session replay as well as events', async () => {
    const analytics = loadAnalytics();

    analytics.enableAnalytics();
    await flush();
    analytics.disableAnalytics();
    await flush();

    expect(analytics.analyticsEnabled()).toBe(false);
    expect(clarityMock.pause).toHaveBeenCalledTimes(1);
  });

  it('clears what Mixpanel is holding locally', async () => {
    const analytics = loadAnalytics();

    analytics.enableAnalytics();
    await flush();
    analytics.disableAnalytics();
    await flush();

    const instance = MixpanelMock.mock.results[0]!.value as { reset: jest.Mock };
    expect(instance.reset).toHaveBeenCalled();
  });

  it('sends nothing afterwards', async () => {
    const analytics = loadAnalytics();

    analytics.enableAnalytics();
    await flush();
    analytics.disableAnalytics();
    await flush();

    const instance = MixpanelMock.mock.results[0]!.value as { track: jest.Mock };
    instance.track.mockClear();

    analytics.track('otp_requested');
    await flush();

    expect(instance.track).not.toHaveBeenCalled();
  });
});

describe('sign-out', () => {
  it('starts a fresh replay session so the next person is not stitched onto the last', async () => {
    const analytics = loadAnalytics();

    analytics.enableAnalytics();
    await flush();
    analytics.resetAnalytics();
    await flush();

    expect(clarityMock.startNewSession).toHaveBeenCalledTimes(1);
  });
});

describe('Meta app events', () => {
  const metaSettings = Settings as jest.Mocked<typeof Settings>;
  const metaLogger = AppEventsLogger as jest.Mocked<typeof AppEventsLogger>;
  const TICKET = {
    content_ids: ['event-1'],
    content_type: 'product' as const,
    contents: [{ id: 'event-1', quantity: 1 }],
    num_items: 1,
    content_name: 'Tulua',
  };

  it('starts nothing and logs nothing before consent', () => {
    const analytics = loadAnalytics();

    analytics.trackMeta('AddToCart', TICKET);

    expect(metaSettings.initializeSDK).not.toHaveBeenCalled();
    expect(metaSettings.setAutoLogAppEventsEnabled).not.toHaveBeenCalled();
    expect(metaLogger.logEvent).not.toHaveBeenCalled();
  });

  it("starts the SDK with Meta's install and app-open events once consent is given", () => {
    const analytics = loadAnalytics();

    analytics.enableAnalytics();

    expect(metaSettings.setAutoLogAppEventsEnabled).toHaveBeenCalledWith(true);
    expect(metaLogger.setFlushBehavior).toHaveBeenCalledWith('auto');
    expect(metaSettings.initializeSDK).toHaveBeenCalledTimes(1);
  });

  it("sends each event under the SDK's names, with the value to sum", () => {
    const analytics = loadAnalytics();

    analytics.enableAnalytics();
    analytics.trackMeta('AddToCart', { ...TICKET, value: 1710, currency: 'EGP' });
    analytics.trackMeta('CompleteRegistration');
    analytics.trackMeta('Search', { search_string: 'yoga', content_name: 'wellness' });

    expect(metaLogger.logEvent.mock.calls).toEqual([
      [
        'fb_mobile_add_to_cart',
        1710,
        {
          fb_content_id: '["event-1"]',
          fb_content: '[{"id":"event-1","quantity":1}]',
          fb_content_type: 'product',
          fb_description: 'Tulua',
          fb_num_items: 1,
          fb_currency: 'EGP',
        },
      ],
      ['fb_mobile_complete_registration', {}],
      ['fb_mobile_search', { fb_search_string: 'yoga', fb_description: 'wellness' }],
    ]);
  });

  it('sends a Purchase through logPurchase, with the order id', () => {
    const analytics = loadAnalytics();

    analytics.enableAnalytics();
    analytics.trackMeta(
      'Purchase',
      { ...TICKET, value: 2280, currency: 'EGP' },
      { orderId: 'order-1' },
    );

    expect(metaLogger.logPurchase).toHaveBeenCalledWith(2280, 'EGP', {
      fb_content_id: '["event-1"]',
      fb_content: '[{"id":"event-1","quantity":1}]',
      fb_content_type: 'product',
      fb_description: 'Tulua',
      fb_num_items: 1,
      fb_currency: 'EGP',
      fb_order_id: 'order-1',
    });
    expect(metaLogger.logEvent).not.toHaveBeenCalled();
  });

  it('stops the automatic events and sends nothing once consent is withdrawn', () => {
    const analytics = loadAnalytics();

    analytics.enableAnalytics();
    analytics.disableAnalytics();
    analytics.trackMeta('AddToCart', TICKET);

    expect(metaSettings.setAutoLogAppEventsEnabled).toHaveBeenLastCalledWith(false);
    // Meta's dashboard can keep automatic events on: the queue stays on the device instead.
    expect(metaLogger.setFlushBehavior).toHaveBeenLastCalledWith('explicit_only');
    expect(metaLogger.logEvent).not.toHaveBeenCalled();
  });

  it('starts the SDK only once, however often consent comes back', () => {
    const analytics = loadAnalytics();

    analytics.enableAnalytics();
    analytics.disableAnalytics();
    analytics.enableAnalytics();

    expect(metaSettings.initializeSDK).toHaveBeenCalledTimes(1);
    expect(metaSettings.setAutoLogAppEventsEnabled).toHaveBeenLastCalledWith(true);
    expect(metaLogger.setFlushBehavior).toHaveBeenLastCalledWith('auto');
  });
});

describe('decideConsent', () => {
  it('honours a stored grant anywhere', () => {
    const { decideConsent } = loadAnalytics();

    expect(decideConsent('granted', true)).toBe('granted');
    expect(decideConsent('granted', false)).toBe('granted');
  });

  it('keeps honouring a denial after the user leaves a gated region', () => {
    const { decideConsent } = loadAnalytics();

    expect(decideConsent('denied', true)).toBe('denied');
    expect(decideConsent('denied', false)).toBe('denied');
  });

  it('asks someone who has never answered only where the region requires it', () => {
    const { decideConsent } = loadAnalytics();

    expect(decideConsent(null, true)).toBe('ask');
    expect(decideConsent(null, false)).toBe('granted');
  });
});

describe('a native module that is missing or broken', () => {
  it('degrades instead of crashing the app', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    clarityMock.initialize.mockImplementationOnce(() => {
      throw new Error('native module unavailable');
    });

    const analytics = loadAnalytics();

    expect(() => analytics.enableAnalytics()).not.toThrow();
    await flush();

    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
