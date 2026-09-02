import * as Clarity from '@microsoft/react-native-clarity';
import { Mixpanel } from 'mixpanel-react-native';

/**
 * Environments are separated by giving each build its own Mixpanel and Clarity project ids. A
 * build that carries neither must send nothing at all: falling back to a baked-in default
 * would quietly write staging or developer traffic into another environment's dataset, which
 * is the exact failure this split exists to prevent.
 */
function loadAnalytics(): typeof import('../analytics') {
  let mod!: typeof import('../analytics');
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('../analytics') as typeof import('../analytics');
  });
  return mod;
}

const clarityMock = Clarity as jest.Mocked<typeof Clarity>;
const MixpanelMock = Mixpanel as unknown as jest.Mock;

const flush = () => new Promise((resolve) => setImmediate(resolve));

const configured = {
  mixpanel: process.env.EXPO_PUBLIC_MIXPANEL_TOKEN,
  clarity: process.env.EXPO_PUBLIC_CLARITY_PROJECT_ID,
};

let warn: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  warn.mockRestore();
  process.env.EXPO_PUBLIC_MIXPANEL_TOKEN = configured.mixpanel;
  process.env.EXPO_PUBLIC_CLARITY_PROJECT_ID = configured.clarity;
});

describe('a build with no analytics ids', () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_MIXPANEL_TOKEN = '';
    process.env.EXPO_PUBLIC_CLARITY_PROJECT_ID = '';
  });

  it('starts neither SDK, even once consent is granted', async () => {
    const analytics = loadAnalytics();

    analytics.enableAnalytics();
    await flush();

    expect(MixpanelMock).not.toHaveBeenCalled();
    expect(clarityMock.initialize).not.toHaveBeenCalled();
  });

  it('drops events rather than queuing them for a project it cannot name', async () => {
    const analytics = loadAnalytics();

    analytics.enableAnalytics();
    await flush();
    analytics.track('otp_requested');
    analytics.identify('user-1');
    await flush();

    expect(MixpanelMock).not.toHaveBeenCalled();
    expect(clarityMock.setCustomUserId).not.toHaveBeenCalled();
  });

  it('warns once per SDK instead of on every event', async () => {
    const analytics = loadAnalytics();

    analytics.enableAnalytics();
    await flush();
    analytics.track('otp_requested');
    analytics.track('otp_verified');
    analytics.resetAnalytics();
    await flush();

    expect(warn).toHaveBeenCalledTimes(2);
  });
});

describe('one id missing', () => {
  it('leaves the configured SDK running', async () => {
    process.env.EXPO_PUBLIC_CLARITY_PROJECT_ID = '';
    const analytics = loadAnalytics();

    analytics.enableAnalytics();
    await flush();

    expect(MixpanelMock).toHaveBeenCalledTimes(1);
    expect(clarityMock.initialize).not.toHaveBeenCalled();
  });
});

describe('a configured build', () => {
  it('tags events and the replay session with the environment', async () => {
    const analytics = loadAnalytics();

    analytics.enableAnalytics();
    await flush();

    const instance = MixpanelMock.mock.results[0]!.value as {
      registerSuperProperties: jest.Mock;
    };
    expect(instance.registerSuperProperties).toHaveBeenCalledWith({ environment: 'test' });
    expect(clarityMock.setCustomTag).toHaveBeenCalledWith('environment', 'test');
  });
});
