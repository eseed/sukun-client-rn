import type { AppStateStatus } from 'react-native';

const DEVICE_ID = 'cfa8c18c-77c0-40f7-a366-9423036f0325';
const mockStore = new Map<string, string>();
const mockGetOrCreateDeviceId = jest.fn();
const mockRegisterDevice = jest.fn();
const mockSubmitAttribution = jest.fn();
const mockStart = jest.fn();
const mockShutdown = jest.fn();
const mockSetSleep = jest.fn();
const mockSetLogLevel = jest.fn();
const mockRegisterAndroidGuid = jest.fn();
const mockRegisterAppleGuid = jest.fn();
const mockRetrieveInstallAttribution = jest.fn();
const mockRetrieveInstallId = jest.fn();
let mockOnSdkModuleLoad: (() => void) | null = null;
let mockAppStateListener: ((state: AppStateStatus) => void) | null = null;

class MockApiError extends Error {
  constructor(
    public status: number,
    public code = 'UNKNOWN',
  ) {
    super(code);
  }
}

const mockKochavaInstance = {
  setLogLevel: mockSetLogLevel,
  registerAndroidAppGuid: mockRegisterAndroidGuid,
  registerAppleAppGuid: mockRegisterAppleGuid,
  start: mockStart,
  shutdown: mockShutdown,
  setSleep: mockSetSleep,
  retrieveInstallAttribution: mockRetrieveInstallAttribution,
  retrieveInstallId: mockRetrieveInstallId,
};

jest.mock('../../../api', () => ({ API_MODE: 'live' }));
jest.mock('../../../api/live/acquisition', () => ({
  registerAcquisitionDevice: (...args: unknown[]) => mockRegisterDevice(...args),
  submitKochavaAttribution: (...args: unknown[]) => mockSubmitAttribution(...args),
}));
jest.mock('../../../api/live/http', () => ({ ApiError: MockApiError }));
jest.mock('../../../lib/secure-storage', () => ({
  getSecureItem: jest.fn(async (key: string) => mockStore.get(key) ?? null),
  setSecureItem: jest.fn(async (key: string, value: string) => {
    mockStore.set(key, value);
  }),
  SECURE_KEYS: {
    acquisitionDeviceIdentityInvalid: 'invalid-device',
    acquisitionAttributionState: 'attribution-state',
  },
}));
jest.mock('../device-id', () => ({
  getOrCreateSukunDeviceId: () => mockGetOrCreateDeviceId(),
}));
jest.mock('react-native-kochava-measurement', () => {
  mockOnSdkModuleLoad?.();
  return {
    KochavaMeasurement: { instance: mockKochavaInstance },
    KochavaMeasurementLogLevel: { None: 'None' },
  };
});

function loadService(nativeModuleAvailable = true): typeof import('../acquisition-attribution') {
  let service!: typeof import('../acquisition-attribution');
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const reactNative = require('react-native') as typeof import('react-native');
  (reactNative.Platform as { OS: string }).OS = 'android';
  if (nativeModuleAvailable) {
    reactNative.NativeModules.KochavaMeasurement = {};
  } else {
    delete (reactNative.NativeModules as Record<string, unknown>).KochavaMeasurement;
  }
  jest.spyOn(reactNative.AppState, 'addEventListener').mockImplementation((_event, listener) => {
    mockAppStateListener = listener;
    return { remove: jest.fn() };
  });

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  service = require('../acquisition-attribution') as typeof import('../acquisition-attribution');
  return service;
}

async function flushPromises(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 100; i += 1) await Promise.resolve();
}

beforeEach(() => {
  mockStore.clear();
  mockGetOrCreateDeviceId.mockReset().mockResolvedValue(DEVICE_ID);
  mockRegisterDevice.mockReset().mockResolvedValue({ deviceId: DEVICE_ID });
  mockSubmitAttribution.mockReset().mockResolvedValue({ status: 'organic' });
  mockStart.mockReset();
  mockShutdown.mockReset();
  mockSetSleep.mockReset();
  mockSetLogLevel.mockReset();
  mockRegisterAndroidGuid.mockReset();
  mockRegisterAppleGuid.mockReset();
  mockRetrieveInstallAttribution.mockReset().mockResolvedValue({ retrieved: false });
  mockRetrieveInstallId.mockReset().mockResolvedValue('kochava-install-id');
  mockOnSdkModuleLoad = null;
  mockAppStateListener = null;
  jest.restoreAllMocks();
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('Kochava consent and acquisition lifecycle', () => {
  it('shuts down and clears the SDK on revoke, then starts it again after a new grant', async () => {
    const service = loadService();
    const revokeFirstGrant = service.initializeAcquisitionAttribution();
    await flushPromises();

    expect(mockStart).toHaveBeenCalledTimes(1);
    revokeFirstGrant();
    expect(mockShutdown).toHaveBeenCalledWith(true);
    expect(mockSetSleep).not.toHaveBeenCalledWith(true);

    const revokeSecondGrant = service.initializeAcquisitionAttribution();
    await flushPromises();
    expect(mockStart).toHaveBeenCalledTimes(2);
    expect(mockRegisterAndroidGuid).toHaveBeenCalledTimes(2);
    revokeSecondGrant();
  });

  it('does not start the SDK if consent is revoked while its module is loading', async () => {
    const service = loadService();
    let revoke: (() => void) | undefined;
    mockOnSdkModuleLoad = () => revoke?.();
    revoke = service.initializeAcquisitionAttribution();

    await flushPromises();
    expect(mockStart).not.toHaveBeenCalled();
    expect(mockRegisterAndroidGuid).not.toHaveBeenCalled();
  });

  it('still registers the installation when the native Kochava module is absent', async () => {
    const service = loadService(false);
    const revoke = service.initializeAcquisitionAttribution();
    await flushPromises();

    expect(mockStart).not.toHaveBeenCalled();
    expect(mockRegisterDevice).toHaveBeenCalledTimes(1);
    await expect(service.prepareAcquisitionDeviceForOtp()).resolves.toBe(DEVICE_ID);
    revoke();
  });

  it('does not submit an in-flight provider result after consent is revoked', async () => {
    let resolveAttribution: ((value: { retrieved: boolean; raw: object }) => void) | undefined;
    mockRetrieveInstallAttribution.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAttribution = resolve;
        }),
    );
    const service = loadService();
    const revoke = service.initializeAcquisitionAttribution();
    await flushPromises();

    expect(mockRetrieveInstallAttribution).toHaveBeenCalledTimes(1);
    revoke();
    resolveAttribution?.({ retrieved: true, raw: { data: { attribution: true } } });
    await flushPromises();

    expect(mockShutdown).toHaveBeenCalledWith(true);
    expect(mockSubmitAttribution).not.toHaveBeenCalled();
  });

  it('repairs a missing backend registration and retries attribution once', async () => {
    mockRetrieveInstallAttribution.mockResolvedValue({
      retrieved: true,
      raw: { data: { attribution: true } },
    });
    mockSubmitAttribution
      .mockRejectedValueOnce(new MockApiError(404, 'DEVICE_NOT_FOUND'))
      .mockResolvedValueOnce({ status: 'attributed' });
    const service = loadService();
    const revoke = service.initializeAcquisitionAttribution();
    await flushPromises();

    expect(mockRegisterDevice).toHaveBeenCalledTimes(2);
    expect(mockSubmitAttribution).toHaveBeenCalledTimes(2);
    expect(JSON.parse(mockStore.get('attribution-state') ?? '{}')).toMatchObject({
      delivery: 'delivered',
      retryKind: null,
    });
    revoke();
  });

  it('holds the OTP device ID until an in-flight registration lands', async () => {
    let completeRegistration: (() => void) | undefined;
    mockRegisterDevice.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          completeRegistration = () => resolve();
        }),
    );
    const service = loadService();
    const revoke = service.initializeAcquisitionAttribution();
    await flushPromises();
    expect(mockRegisterDevice).toHaveBeenCalledTimes(1);

    let settled: string | undefined | 'pending' = 'pending';
    const preparation = service.prepareAcquisitionDeviceForOtp().then((value) => {
      settled = value;
      return value;
    });
    await flushPromises();
    expect(settled).toBe('pending');

    completeRegistration?.();
    await expect(preparation).resolves.toBe(DEVICE_ID);
    revoke();
  });

  it('hands the OTP device ID over anyway once the registration wait is spent', async () => {
    mockRegisterDevice.mockImplementation(() => new Promise(() => undefined));
    const service = loadService();
    const revoke = service.initializeAcquisitionAttribution();
    await flushPromises();

    jest.useFakeTimers();
    const preparation = service.prepareAcquisitionDeviceForOtp();
    await flushMicrotasks();
    jest.advanceTimersByTime(2_000);

    await expect(preparation).resolves.toBe(DEVICE_ID);
    revoke();
  });

  it('withholds an installation ID the backend has refused outright', async () => {
    const service = loadService();
    const revoke = service.initializeAcquisitionAttribution();
    await flushPromises();

    mockStore.set('invalid-device', 'true');
    await expect(service.prepareAcquisitionDeviceForOtp()).resolves.toBeUndefined();
    revoke();
  });

  it('marks an accepted organic observation delivered and does not resubmit on foreground', async () => {
    mockRetrieveInstallAttribution.mockResolvedValue({
      retrieved: true,
      raw: { data: { attribution: false } },
    });
    const service = loadService();
    const revoke = service.initializeAcquisitionAttribution();
    await flushPromises();

    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(mockRegisterDevice).toHaveBeenCalledTimes(1);
    expect(mockRetrieveInstallAttribution).toHaveBeenCalledTimes(1);
    expect(mockRetrieveInstallId).toHaveBeenCalledTimes(1);
    expect(mockSubmitAttribution).toHaveBeenCalledTimes(1);
    const state = JSON.parse(mockStore.get('attribution-state') ?? '{}') as {
      delivery?: string;
      retryKind?: string | null;
      retryAttempts?: number;
      nextRetryAt?: number | null;
    };
    expect(state.delivery).toBe('delivered');
    expect(state.retryKind).toBe('correction');
    expect(state.retryAttempts).toBe(1);
    expect(state.nextRetryAt).toEqual(expect.any(Number));

    mockAppStateListener?.('active');
    await flushPromises();
    expect(mockSubmitAttribution).toHaveBeenCalledTimes(1);
    expect(mockRegisterDevice).toHaveBeenCalledTimes(1);
    revoke();
  });

  it('polls organic correction only at bounded retry times', async () => {
    mockRetrieveInstallAttribution.mockResolvedValue({
      retrieved: true,
      raw: { data: { attribution: false } },
    });
    const service = loadService();
    const revoke = service.initializeAcquisitionAttribution();
    await flushPromises();

    jest.useFakeTimers();
    const initialState = JSON.parse(mockStore.get('attribution-state') ?? '{}') as {
      nextRetryAt: number;
    };
    jest.setSystemTime(initialState.nextRetryAt + 1);
    mockAppStateListener?.('active');
    await flushMicrotasks();
    expect(mockSubmitAttribution).toHaveBeenCalledTimes(2);

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const state = JSON.parse(mockStore.get('attribution-state') ?? '{}') as {
        nextRetryAt: number;
      };
      jest.setSystemTime(state.nextRetryAt + 1);
      mockAppStateListener?.('active');
      await flushMicrotasks();
    }
    expect(mockSubmitAttribution).toHaveBeenCalledTimes(6);

    mockAppStateListener?.('active');
    await flushMicrotasks();
    expect(mockSubmitAttribution).toHaveBeenCalledTimes(6);

    revoke();
  });

  it('backs off Kochava retrieval when attribution is not ready', async () => {
    const service = loadService();
    const revoke = service.initializeAcquisitionAttribution();
    await flushPromises();

    const state = JSON.parse(mockStore.get('attribution-state') ?? '{}') as {
      delivery?: string;
      retryKind?: string | null;
      retryAttempts?: number;
      nextRetryAt?: number | null;
    };
    expect(mockRetrieveInstallAttribution).toHaveBeenCalledTimes(1);
    expect(state.delivery).toBe('pending');
    expect(state.retryKind).toBe('transient');
    expect(state.retryAttempts).toBe(1);
    expect(state.nextRetryAt).toEqual(expect.any(Number));

    mockAppStateListener?.('active');
    await flushPromises();
    expect(mockRetrieveInstallAttribution).toHaveBeenCalledTimes(1);
    revoke();
  });

  it('backs off generic contract errors instead of permanently rejecting the installation', async () => {
    mockRetrieveInstallAttribution.mockResolvedValue({
      retrieved: true,
      raw: { data: { attribution: false } },
    });
    mockSubmitAttribution.mockRejectedValue(new MockApiError(400, 'INVALID_ATTRIBUTION_PAYLOAD'));
    const service = loadService();
    const revoke = service.initializeAcquisitionAttribution();
    await flushPromises();

    const state = JSON.parse(mockStore.get('attribution-state') ?? '{}') as {
      delivery?: string;
      retryKind?: string | null;
      retryAttempts?: number;
      nextRetryAt?: number | null;
    };
    expect(state.delivery).toBe('pending');
    expect(state.retryKind).toBe('contract');
    expect(state.retryAttempts).toBe(1);
    expect(state.nextRetryAt).toEqual(expect.any(Number));
    revoke();
  });

  it('reopens legacy terminal strings under the versioned attribution policy', async () => {
    mockStore.set('attribution-state', 'rejected');
    mockRetrieveInstallAttribution.mockResolvedValue({
      retrieved: true,
      raw: { data: { attribution: true } },
    });
    const service = loadService();
    const revoke = service.initializeAcquisitionAttribution();
    await flushPromises();

    expect(mockSubmitAttribution).toHaveBeenCalledTimes(1);
    expect(JSON.parse(mockStore.get('attribution-state') ?? '{}')).toMatchObject({
      delivery: 'delivered',
    });
    revoke();
  });
});
