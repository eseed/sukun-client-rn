/**
 * The order the guest-path flag is resolved in, and what happens when each source fails.
 *
 * This is the part that can go wrong quietly. The flag decides whether the first screen
 * offers a way in without an account, App Store review rejected a build that did not, and the
 * backend is now what answers. So the cases worth pinning are not "it reads the endpoint" but
 * the ones where the endpoint does not answer: a first launch offline has to land on the
 * compiled fallback, and a later launch offline has to land on whatever the device was last
 * told, rather than on whichever happens to be easier to implement.
 */
import { Platform } from 'react-native';

/** `Platform.OS` is typed readonly but is an ordinary property at runtime. */
function setPlatform(os: 'ios' | 'android'): void {
  (Platform as { OS: string }).OS = os;
}

const mockGet = jest.fn();
jest.mock('../../api', () => ({ api: { config: { get: () => mockGet() } } }));

const mockStore = new Map<string, string>();
jest.mock('../../lib/secure-storage', () => ({
  getSecureItem: jest.fn(async (key: string) => mockStore.get(key) ?? null),
  setSecureItem: jest.fn(async (key: string, value: string) => {
    mockStore.set(key, value);
  }),
  SECURE_KEYS: {
    allowGuestBrowsing: 'sukun.allowGuestBrowsing',
    forceUpdateRule: 'sukun.forceUpdateRule',
  },
}));

/** The installed build, for the force update comparisons below. */
jest.mock('../../lib/build-info', () => ({ APP_VERSION: '2.1.0' }));

const KEY = 'sukun.allowGuestBrowsing';
const RULE_KEY = 'sukun.forceUpdateRule';

let store!: typeof import('../flags').useFlagsStore;

/** A fresh store, since `load()` is a one-shot per launch. */
async function launch(): Promise<{
  allowGuestBrowsing: boolean;
  status: string;
  updateRequired: boolean;
}> {
  let mod!: typeof import('../flags');
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('../flags') as typeof import('../flags');
  });
  store = mod.useFlagsStore;
  await store.getState().load();
  const { allowGuestBrowsing, status, updateRequired } = store.getState();
  return { allowGuestBrowsing, status, updateRequired };
}

function configForcing(ios: string | null, android: string | null = null) {
  return {
    allowGuestBrowsing: { ios: true, android: false },
    forceUpdate: {
      ios: { enabled: ios !== null, minimumVersion: ios },
      android: { enabled: android !== null, minimumVersion: android },
    },
  };
}

beforeEach(() => {
  mockStore.clear();
  mockGet.mockReset();
  setPlatform('ios');
});

describe('the flags store', () => {
  it('takes the backend answer for this platform', async () => {
    mockGet.mockResolvedValue({ allowGuestBrowsing: { ios: false, android: true } });
    await expect(launch()).resolves.toMatchObject({ allowGuestBrowsing: false, status: 'ready' });

    setPlatform('android');
    mockStore.clear();
    mockGet.mockResolvedValue({ allowGuestBrowsing: { ios: false, android: true } });
    await expect(launch()).resolves.toMatchObject({ allowGuestBrowsing: true });
  });

  it('caches the answer so the next launch does not wait on the network', async () => {
    mockGet.mockResolvedValue({ allowGuestBrowsing: { ios: false, android: false } });
    await launch();
    expect(mockStore.get(KEY)).toBe('false');
  });

  it('uses the cached answer when the backend is unreachable', async () => {
    mockStore.set(KEY, 'false');
    mockGet.mockRejectedValue(new Error('offline'));

    // Not the compiled fallback, which on iOS would be `true`: the device was told otherwise
    // and nothing since has said different.
    await expect(launch()).resolves.toMatchObject({ allowGuestBrowsing: false, status: 'ready' });
  });

  /**
   * The case that costs a review if it goes the other way: no cache to fall back on and no
   * backend to ask. iOS has to open the guest path rather than close it.
   */
  it('falls back to the compiled default on a first launch with no backend', async () => {
    mockGet.mockRejectedValue(new Error('offline'));
    await expect(launch()).resolves.toMatchObject({ allowGuestBrowsing: true, status: 'ready' });
  });

  it('always reaches ready, so the splash cannot hang on it', async () => {
    mockGet.mockRejectedValue(new Error('offline'));
    await expect(launch()).resolves.toMatchObject({ status: 'ready' });
  });

  it('lets a later backend answer overwrite a stale cache', async () => {
    mockStore.set(KEY, 'true');
    mockGet.mockResolvedValue({ allowGuestBrowsing: { ios: false, android: false } });
    await launch();

    // The refresh runs even though the cache answered, which is what makes a change take
    // effect without a new build.
    expect(mockGet).toHaveBeenCalled();
    await new Promise((resolve) => setImmediate(resolve));
    expect(mockStore.get(KEY)).toBe('false');
  });
});

describe('force update', () => {
  it('blocks a build below the minimum for this platform only', async () => {
    mockGet.mockResolvedValue(configForcing('2.2.0'));
    await expect(launch()).resolves.toMatchObject({ updateRequired: true, status: 'ready' });

    setPlatform('android');
    mockStore.clear();
    await expect(launch()).resolves.toMatchObject({ updateRequired: false });
  });

  it('lets the minimum version itself through', async () => {
    mockGet.mockResolvedValue(configForcing('2.1.0'));
    await expect(launch()).resolves.toMatchObject({ updateRequired: false });
  });

  it('reads a backend that sends no rule as nothing forced', async () => {
    mockGet.mockResolvedValue({ allowGuestBrowsing: { ios: true, android: false } });
    await expect(launch()).resolves.toMatchObject({ updateRequired: false });
  });

  it('keeps a device that was told to update blocked when the backend is unreachable', async () => {
    mockGet.mockResolvedValue(configForcing('2.2.0'));
    await launch();
    await new Promise((resolve) => setImmediate(resolve));
    expect(mockStore.get(RULE_KEY)).toBeDefined();

    mockGet.mockRejectedValue(new Error('offline'));
    await expect(launch()).resolves.toMatchObject({ updateRequired: true, status: 'ready' });
  });

  it('forces nothing on a first launch that cannot reach the backend', async () => {
    mockGet.mockRejectedValue(new Error('offline'));
    await expect(launch()).resolves.toMatchObject({ updateRequired: false, status: 'ready' });
  });

  it('picks up a switch turned on while the app is open, and keeps it through a failed refresh', async () => {
    mockGet.mockResolvedValue(configForcing(null));
    await expect(launch()).resolves.toMatchObject({ updateRequired: false });

    mockGet.mockResolvedValue(configForcing('3.0.0'));
    await store.getState().refresh();
    expect(store.getState().updateRequired).toBe(true);

    mockGet.mockRejectedValue(new Error('offline'));
    await store.getState().refresh();
    expect(store.getState().updateRequired).toBe(true);
  });

  it('lifts the block when the switch is turned off again', async () => {
    mockGet.mockResolvedValue(configForcing('3.0.0'));
    await expect(launch()).resolves.toMatchObject({ updateRequired: true });

    mockGet.mockResolvedValue(configForcing(null));
    await store.getState().refresh();
    expect(store.getState().updateRequired).toBe(false);
  });
});
