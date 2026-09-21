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

function loadService(): typeof import('../acquisition-attribution') {
  let service!: typeof import('../acquisition-attribution');
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const reactNative = require('react-native') as typeof import('react-native');
  (reactNative.Platform as { OS: string }).OS = 'android';
  reactNative.NativeModules.KochavaMeasurement = {};
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

  it('only returns the OTP device ID after the backend confirms registration', async () => {
    const service = loadService();
    await expect(service.prepareAcquisitionDeviceForOtp()).resolves.toBe(DEVICE_ID);

    mockRegisterDevice.mockRejectedValueOnce(new MockApiError(409, 'DEVICE_PLATFORM_MISMATCH'));
    await expect(service.prepareAcquisitionDeviceForOtp()).resolves.toBeUndefined();
  });

  it('omits the OTP device ID when device registration times out', async () => {
    jest.useFakeTimers();
    try {
      mockRegisterDevice.mockImplementationOnce(() => new Promise(() => undefined));
      const service = loadService();
      const preparation = service.prepareAcquisitionDeviceForOtp();

      await jest.advanceTimersByTimeAsync(2_500);
      await expect(preparation).resolves.toBeUndefined();
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
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
    expect(mockStore.get('attribution-state')).toBe('delivered');

    mockAppStateListener?.('active');
    await flushPromises();
    expect(mockSubmitAttribution).toHaveBeenCalledTimes(1);
    expect(mockRegisterDevice).toHaveBeenCalledTimes(1);
    revoke();
  });
});
