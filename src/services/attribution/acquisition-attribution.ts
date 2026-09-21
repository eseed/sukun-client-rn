import { AppState, Platform, TurboModuleRegistry } from 'react-native';
import type { TurboModule } from 'react-native/Libraries/TurboModule/RCTExport';
import { API_MODE } from '../../api';
import {
  registerAcquisitionDevice,
  submitKochavaAttribution,
  type AcquisitionPlatform,
} from '../../api/live/acquisition';
import { ApiError } from '../../api/live/http';
import { APP_VERSION } from '../../lib/build-info';
import { getSecureItem, SECURE_KEYS, setSecureItem } from '../../lib/secure-storage';
import type { KochavaMeasurement } from 'react-native-kochava-measurement';
import { getOrCreateSukunDeviceId } from './device-id';

const ANDROID_APP_GUID = 'kosukun-wellness-android-esks14i46';
const APPLE_APP_GUID = 'kosukun-wellness-ios-8xxgp1jzs';
const KOCHAVA_SDK_VERSION = '5.0.0';
const REGISTRATION_RETRY_DELAY_MS = 750;
const OTP_REGISTRATION_WAIT_MS = 2_500;
const OTP_PREPARATION_TIMEOUT_MS = 3_000;
const ATTRIBUTION_STATE = {
  pending: 'pending',
  delivered: 'delivered',
  rejected: 'rejected',
} as const;

type KochavaInstance = InstanceType<typeof KochavaMeasurement>;

let consentEnabled = false;
let sdkInstance: KochavaInstance | null = null;
let sdkLoadPromise: Promise<KochavaInstance | null> | null = null;
let sdkUnavailable = false;
let registrationPromise: Promise<boolean> | null = null;
let processingPromise: Promise<void> | null = null;
let foregroundSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
const reportedIssues = new Set<string>();

function isNativePlatform(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

function recordIssue(reason: string): void {
  // Never include provider results, install identifiers, request bodies, or API error messages.
  if (reportedIssues.has(reason)) return;
  reportedIssues.add(reason);
  console.warn(`[attribution] ${reason}`);
}

async function getKochavaInstance(): Promise<KochavaInstance | null> {
  if (sdkInstance) return sdkInstance;
  if (sdkUnavailable || !consentEnabled) return null;
  if (sdkLoadPromise) return sdkLoadPromise;

  sdkLoadPromise = (async () => {
    // Kochava's JS entrypoint uses getEnforcing at import time. Check the TurboModule registry
    // first so Expo Go or a stale dev client degrades without a fatal module-load error.
    if (!TurboModuleRegistry.get<TurboModule>('KochavaMeasurement')) {
      sdkUnavailable = true;
      recordIssue('native module unavailable in this build');
      return null;
    }

    const { KochavaMeasurement, KochavaMeasurementLogLevel } =
      await import('react-native-kochava-measurement');
    if (!consentEnabled) return null;

    const instance = KochavaMeasurement.instance;
    instance.setLogLevel(KochavaMeasurementLogLevel.None);
    instance.registerAndroidAppGuid(ANDROID_APP_GUID);
    instance.registerAppleAppGuid(APPLE_APP_GUID);
    instance.start();
    sdkInstance = instance;
    return instance;
  })()
    .catch(() => {
      sdkUnavailable = true;
      recordIssue('SDK initialization failed');
      return null;
    })
    .finally(() => {
      sdkLoadPromise = null;
    });

  return sdkLoadPromise;
}

function isTransientRegistrationFailure(error: unknown): boolean {
  return !(error instanceof ApiError) || error.status === 408 || error.status >= 500;
}

async function registerDeviceOnce(deviceId: string): Promise<boolean> {
  const invalidIdentity = await getSecureItem(SECURE_KEYS.acquisitionDeviceIdentityInvalid);
  if (invalidIdentity === 'true') return false;

  const platform = Platform.OS as AcquisitionPlatform;
  try {
    await registerAcquisitionDevice({
      deviceId,
      platform,
      ...(APP_VERSION ? { appVersion: APP_VERSION } : {}),
    });
    return true;
  } catch (error) {
    if (error instanceof ApiError && error.code === 'DEVICE_PLATFORM_MISMATCH') {
      await setSecureItem(SECURE_KEYS.acquisitionDeviceIdentityInvalid, 'true');
      recordIssue('installation identity platform mismatch');
      return false;
    }
    if (error instanceof ApiError && error.status === 400) {
      await setSecureItem(SECURE_KEYS.acquisitionDeviceIdentityInvalid, 'true');
      recordIssue('device registration rejected; retry stopped');
      return false;
    }
    throw error;
  }
}

function ensureDeviceRegistered(): Promise<boolean> {
  if (registrationPromise) return registrationPromise;

  registrationPromise = (async () => {
    const deviceId = await getOrCreateSukunDeviceId();
    if (!deviceId) return false;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await registerDeviceOnce(deviceId);
      } catch (error) {
        if (!isTransientRegistrationFailure(error) || attempt === 1) {
          recordIssue('device registration deferred');
          return false;
        }
        await new Promise((resolve) => setTimeout(resolve, REGISTRATION_RETRY_DELAY_MS));
      }
    }
    return false;
  })().finally(() => {
    registrationPromise = null;
  });

  return registrationPromise;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(null), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      () => {
        clearTimeout(timeout);
        resolve(null);
      },
    );
  });
}

async function getAttributionState(): Promise<string> {
  return (
    (await getSecureItem(SECURE_KEYS.acquisitionAttributionState)) ?? ATTRIBUTION_STATE.pending
  );
}

async function rememberAttributionState(
  state: (typeof ATTRIBUTION_STATE)[keyof typeof ATTRIBUTION_STATE],
): Promise<void> {
  await setSecureItem(SECURE_KEYS.acquisitionAttributionState, state);
}

async function handleSubmissionFailure(error: unknown): Promise<void> {
  if (error instanceof ApiError && error.status === 400) {
    await rememberAttributionState(ATTRIBUTION_STATE.rejected);
    recordIssue('provider payload rejected; retry stopped');
    return;
  }

  if (error instanceof ApiError && error.status > 0 && error.status < 500 && error.status !== 408) {
    await rememberAttributionState(ATTRIBUTION_STATE.rejected);
    recordIssue('attribution submission rejected; retry stopped');
    return;
  }

  recordIssue('attribution submission deferred');
}

async function submitObservation(
  deviceId: string,
  payload: object,
  providerInstallationId?: string,
): Promise<void> {
  const input = {
    provider: 'kochava' as const,
    providerSdkVersion: KOCHAVA_SDK_VERSION,
    payload,
    ...(providerInstallationId && providerInstallationId.length <= 128
      ? { providerInstallationId }
      : {}),
  };

  try {
    const response = await submitKochavaAttribution(deviceId, input);
    await rememberAttributionState(
      response.status === 'attributed' ? ATTRIBUTION_STATE.delivered : ATTRIBUTION_STATE.pending,
    );
    return;
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 404) {
      await handleSubmissionFailure(error);
      return;
    }
  }

  // A missing registration can be repaired once; never loop on DEVICE_NOT_FOUND.
  if (!(await ensureDeviceRegistered()) || !consentEnabled) return;
  try {
    const response = await submitKochavaAttribution(deviceId, input);
    await rememberAttributionState(
      response.status === 'attributed' ? ATTRIBUTION_STATE.delivered : ATTRIBUTION_STATE.pending,
    );
  } catch (error) {
    await handleSubmissionFailure(error);
  }
}

async function processPendingAttribution(): Promise<void> {
  if (!consentEnabled || !isNativePlatform()) return;
  if (API_MODE !== 'live') return;

  const deviceId = await withTimeout(getOrCreateSukunDeviceId(), 3_000);
  if (!deviceId || !consentEnabled) return;
  if (!(await ensureDeviceRegistered()) || !consentEnabled) return;

  const attributionState = await getAttributionState();
  if (
    attributionState === ATTRIBUTION_STATE.delivered ||
    attributionState === ATTRIBUTION_STATE.rejected
  ) {
    return;
  }

  const instance = sdkInstance;
  if (!instance) return;

  const result = await withTimeout(instance.retrieveInstallAttribution(), 15_000);
  if (!result || !result.retrieved || !consentEnabled) return;

  // Pass Kochava's provider object unchanged. The actual native raw shape remains a device-level
  // integration gate; no envelope is synthesized here to match backend examples.
  const payload = result.raw;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    await rememberAttributionState(ATTRIBUTION_STATE.rejected);
    recordIssue('provider payload shape rejected; retry stopped');
    return;
  }

  const installId = await withTimeout(instance.retrieveInstallId(), 5_000);
  if (!consentEnabled) return;
  await submitObservation(deviceId, payload, installId?.trim() || undefined);
}

function runInBackground(): void {
  if (!consentEnabled || processingPromise) return;
  processingPromise = processPendingAttribution()
    .catch(() => recordIssue('attribution initialization deferred'))
    .finally(() => {
      processingPromise = null;
    });
}

/** Start on consent grant and retry pending provider/backend work when the app returns active. */
export function initializeAcquisitionAttribution(): () => void {
  if (API_MODE !== 'live' || !isNativePlatform()) return () => undefined;

  consentEnabled = true;
  void (async () => {
    const deviceId = await withTimeout(getOrCreateSukunDeviceId(), 1_000);
    if (!deviceId) recordIssue('installation identity unavailable');
    if (!consentEnabled) return;
    const instance = await getKochavaInstance();
    if (!instance || !consentEnabled) return;
    instance.setSleep(false);
    runInBackground();
  })().catch(() => recordIssue('SDK startup deferred'));

  foregroundSubscription?.remove();
  foregroundSubscription = AppState.addEventListener('change', (state) => {
    if (state === 'active' && consentEnabled) runInBackground();
  });

  return () => {
    consentEnabled = false;
    foregroundSubscription?.remove();
    foregroundSubscription = null;
    try {
      sdkInstance?.setSleep(true);
    } catch {
      recordIssue('SDK pause failed');
    }
  };
}

/** Best-effort device registration before OTP; timeout never prevents authentication. */
export async function prepareAcquisitionDeviceForOtp(): Promise<string | undefined> {
  if (API_MODE !== 'live' || !isNativePlatform()) return undefined;

  const preparation = (async (): Promise<string | undefined> => {
    try {
      const deviceId = await getOrCreateSukunDeviceId();
      if (!deviceId) return undefined;

      const identityInvalid = await getSecureItem(SECURE_KEYS.acquisitionDeviceIdentityInvalid);
      if (identityInvalid === 'true') return undefined;

      await withTimeout(ensureDeviceRegistered(), OTP_REGISTRATION_WAIT_MS);
      const invalidAfterRegistration = await getSecureItem(
        SECURE_KEYS.acquisitionDeviceIdentityInvalid,
      );
      return invalidAfterRegistration === 'true' ? undefined : deviceId;
    } catch {
      recordIssue('installation identity unavailable during OTP');
      return undefined;
    }
  })();

  return (await withTimeout(preparation, OTP_PREPARATION_TIMEOUT_MS)) ?? undefined;
}
