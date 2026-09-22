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
const ATTRIBUTION_STATE_VERSION = 2;
const ATTRIBUTION_POLICY_VERSION = 'kochava-raw-v2';
const CORRECTION_RETRY_DELAYS_MS = [
  5 * 60_000,
  30 * 60_000,
  2 * 60 * 60_000,
  8 * 60 * 60_000,
  24 * 60 * 60_000,
] as const;
const CONTRACT_RETRY_DELAYS_MS = [60 * 60_000, 6 * 60 * 60_000, 24 * 60 * 60_000] as const;
const TRANSIENT_RETRY_DELAYS_MS = [60_000, 15 * 60_000, 60 * 60_000, 6 * 60 * 60_000] as const;
const ATTRIBUTION_STATE = {
  pending: 'pending',
  delivered: 'delivered',
  rejected: 'rejected',
} as const;

type KochavaInstance = InstanceType<typeof KochavaMeasurement>;
type AttributionDeliveryState = (typeof ATTRIBUTION_STATE)[keyof typeof ATTRIBUTION_STATE];
type AttributionRetryKind = 'correction' | 'contract' | 'transient';

interface StoredAttributionState {
  version: number;
  delivery: AttributionDeliveryState;
  retryKind: AttributionRetryKind | null;
  retryAttempts: number;
  nextRetryAt: number | null;
  blockedPolicyVersion: string | null;
}

let consentEnabled = false;
let consentGeneration = 0;
let sdkInstance: KochavaInstance | null = null;
let sdkLoadPromise: Promise<KochavaInstance | null> | null = null;
let sdkLoadGeneration: number | null = null;
let sdkUnavailable = false;
let registrationPromise: Promise<boolean> | null = null;
let processingPromise: Promise<void> | null = null;
let processingGeneration: number | null = null;
let pendingProcessingGeneration: number | null = null;
let foregroundSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
const reportedIssues = new Set<string>();

function isNativePlatform(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

function isConsentGenerationActive(generation: number): boolean {
  return consentEnabled && generation === consentGeneration;
}

function recordIssue(reason: string): void {
  // Never include provider results, install identifiers, request bodies, or API error messages.
  if (reportedIssues.has(reason)) return;
  reportedIssues.add(reason);
  console.warn(`[attribution] ${reason}`);
}

function loadKochavaMeasurement(): typeof import('react-native-kochava-measurement') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('react-native-kochava-measurement') as typeof import('react-native-kochava-measurement');
}

async function getKochavaInstance(generation: number): Promise<KochavaInstance | null> {
  if (!isConsentGenerationActive(generation)) return null;
  if (sdkInstance) return sdkInstance;
  if (sdkUnavailable) return null;
  if (sdkLoadPromise && sdkLoadGeneration === generation) return sdkLoadPromise;

  const loadPromise = (async () => {
    // Kochava's JS entrypoint uses getEnforcing at import time. Check the TurboModule registry
    // first so Expo Go or a stale dev client degrades without a fatal module-load error.
    if (!TurboModuleRegistry.get<TurboModule>('KochavaMeasurement')) {
      if (isConsentGenerationActive(generation)) {
        sdkUnavailable = true;
        recordIssue('native module unavailable in this build');
      }
      return null;
    }

    const { KochavaMeasurement, KochavaMeasurementLogLevel } = loadKochavaMeasurement();
    // Consent may be revoked while loading. Only the current consent generation may start it.
    if (!isConsentGenerationActive(generation)) return null;

    const instance = KochavaMeasurement.instance;
    instance.setLogLevel(KochavaMeasurementLogLevel.None);
    instance.registerAndroidAppGuid(ANDROID_APP_GUID);
    instance.registerAppleAppGuid(APPLE_APP_GUID);
    if (!isConsentGenerationActive(generation)) return null;
    instance.start();
    sdkInstance = instance;
    return instance;
  })().catch(() => {
    if (isConsentGenerationActive(generation)) {
      sdkUnavailable = true;
      recordIssue('SDK initialization failed');
    }
    return null;
  });

  let currentLoadPromise: Promise<KochavaInstance | null>;
  currentLoadPromise = loadPromise.finally(() => {
    if (sdkLoadPromise === currentLoadPromise) {
      sdkLoadPromise = null;
      sdkLoadGeneration = null;
    }
  });
  sdkLoadPromise = currentLoadPromise;
  sdkLoadGeneration = generation;
  return currentLoadPromise;
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

function createAttributionState(
  delivery: AttributionDeliveryState = ATTRIBUTION_STATE.pending,
): StoredAttributionState {
  return {
    version: ATTRIBUTION_STATE_VERSION,
    delivery,
    retryKind: null,
    retryAttempts: 0,
    nextRetryAt: null,
    blockedPolicyVersion: null,
  };
}

async function getAttributionState(): Promise<StoredAttributionState> {
  const stored = await getSecureItem(SECURE_KEYS.acquisitionAttributionState);
  if (!stored) return createAttributionState();

  if (stored === ATTRIBUTION_STATE.pending) return createAttributionState();
  // Older releases stored only a string and could not distinguish an attributed result from an
  // organic/unavailable result or a retryable contract error. Re-open those states once so the
  // versioned policy below can classify them safely.
  if (stored === ATTRIBUTION_STATE.delivered || stored === ATTRIBUTION_STATE.rejected) {
    return createAttributionState();
  }

  try {
    const parsed = JSON.parse(stored) as Partial<StoredAttributionState>;
    if (
      parsed.version !== ATTRIBUTION_STATE_VERSION ||
      !Object.values(ATTRIBUTION_STATE).includes(parsed.delivery as AttributionDeliveryState) ||
      !['correction', 'contract', 'transient', null].includes(parsed.retryKind as string | null) ||
      typeof parsed.retryAttempts !== 'number' ||
      (parsed.nextRetryAt !== null && typeof parsed.nextRetryAt !== 'number') ||
      (parsed.blockedPolicyVersion !== null && typeof parsed.blockedPolicyVersion !== 'string')
    ) {
      return createAttributionState();
    }

    const state = parsed as StoredAttributionState;
    if (state.blockedPolicyVersion && state.blockedPolicyVersion !== ATTRIBUTION_POLICY_VERSION) {
      return createAttributionState();
    }
    return state;
  } catch {
    return createAttributionState();
  }
}

async function rememberAttributionState(
  generation: number,
  state: StoredAttributionState,
): Promise<void> {
  if (!isConsentGenerationActive(generation)) return;
  await setSecureItem(SECURE_KEYS.acquisitionAttributionState, JSON.stringify(state));
}

function withRetry(
  state: StoredAttributionState,
  kind: AttributionRetryKind,
  delays: readonly number[],
): StoredAttributionState {
  const attempts = state.retryKind === kind ? state.retryAttempts : 0;
  const nextAttempt = attempts + 1;
  const delay = delays[attempts];
  if (delay === undefined) {
    return {
      ...state,
      retryKind: kind,
      retryAttempts: nextAttempt,
      nextRetryAt: null,
      blockedPolicyVersion: kind === 'contract' ? ATTRIBUTION_POLICY_VERSION : null,
    };
  }

  return {
    ...state,
    retryKind: kind,
    retryAttempts: nextAttempt,
    nextRetryAt: Date.now() + delay,
    blockedPolicyVersion: null,
  };
}

async function rememberAcceptedObservation(
  generation: number,
  status: 'attributed' | 'organic' | 'unavailable',
): Promise<void> {
  const state = await getAttributionState();
  if (status === 'attributed') {
    await rememberAttributionState(generation, createAttributionState(ATTRIBUTION_STATE.delivered));
    return;
  }

  const nextState = withRetry(
    { ...state, delivery: ATTRIBUTION_STATE.delivered },
    'correction',
    CORRECTION_RETRY_DELAYS_MS,
  );
  await rememberAttributionState(generation, nextState);
}

async function handleSubmissionFailure(generation: number, error: unknown): Promise<void> {
  if (!isConsentGenerationActive(generation)) return;
  const state = await getAttributionState();
  if (error instanceof ApiError && error.status > 0 && error.status < 500 && error.status !== 408) {
    await rememberAttributionState(
      generation,
      withRetry(state, 'contract', CONTRACT_RETRY_DELAYS_MS),
    );
    recordIssue('attribution submission rejected; retry bounded');
    return;
  }

  await rememberAttributionState(
    generation,
    withRetry(state, 'transient', TRANSIENT_RETRY_DELAYS_MS),
  );
  recordIssue('attribution submission deferred');
}

async function submitObservation(
  generation: number,
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
    if (!isConsentGenerationActive(generation)) return;
    const response = await submitKochavaAttribution(deviceId, input);
    await rememberAcceptedObservation(generation, response.status);
    return;
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 404) {
      await handleSubmissionFailure(generation, error);
      return;
    }
  }

  // A missing registration can be repaired once; never loop on DEVICE_NOT_FOUND.
  if (!isConsentGenerationActive(generation)) return;
  if (!(await ensureDeviceRegistered()) || !isConsentGenerationActive(generation)) return;
  try {
    const response = await submitKochavaAttribution(deviceId, input);
    await rememberAcceptedObservation(generation, response.status);
  } catch (error) {
    await handleSubmissionFailure(generation, error);
  }
}

async function processPendingAttribution(generation: number): Promise<void> {
  if (!isConsentGenerationActive(generation) || !isNativePlatform()) return;
  if (API_MODE !== 'live') return;

  const deviceId = await withTimeout(getOrCreateSukunDeviceId(), 3_000);
  if (!deviceId || !isConsentGenerationActive(generation)) return;

  const attributionState = await getAttributionState();
  if (attributionState.delivery === ATTRIBUTION_STATE.rejected) return;
  if (attributionState.blockedPolicyVersion === ATTRIBUTION_POLICY_VERSION) return;
  if (attributionState.retryKind !== null && attributionState.nextRetryAt === null) return;
  if (attributionState.nextRetryAt !== null && attributionState.nextRetryAt > Date.now()) return;
  if (
    attributionState.delivery === ATTRIBUTION_STATE.delivered &&
    attributionState.retryKind === null
  ) {
    return;
  }
  if (!(await ensureDeviceRegistered()) || !isConsentGenerationActive(generation)) return;

  const instance = sdkInstance;
  if (!instance) return;

  const result = await withTimeout(instance.retrieveInstallAttribution(), 15_000);
  if (!result || !result.retrieved) {
    if (isConsentGenerationActive(generation)) {
      await rememberAttributionState(
        generation,
        withRetry(attributionState, 'transient', TRANSIENT_RETRY_DELAYS_MS),
      );
    }
    return;
  }
  if (!isConsentGenerationActive(generation)) return;

  // Pass Kochava's provider object unchanged. The actual native raw shape remains a device-level
  // integration gate; no envelope is synthesized here to match backend examples.
  const payload = result.raw;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    await rememberAttributionState(generation, createAttributionState(ATTRIBUTION_STATE.rejected));
    recordIssue('provider payload shape rejected; retry stopped');
    return;
  }

  const installId = await withTimeout(instance.retrieveInstallId(), 5_000);
  if (!isConsentGenerationActive(generation)) return;
  await submitObservation(generation, deviceId, payload, installId?.trim() || undefined);
}

function runInBackground(generation: number): void {
  if (!isConsentGenerationActive(generation) || !sdkInstance) return;
  if (processingPromise) {
    if (processingGeneration !== generation) pendingProcessingGeneration = generation;
    return;
  }

  processingGeneration = generation;
  const processPromise = processPendingAttribution(generation)
    .catch(() => {
      if (isConsentGenerationActive(generation)) recordIssue('attribution initialization deferred');
    })
    .finally(() => {
      if (processingGeneration !== generation) return;
      processingPromise = null;
      processingGeneration = null;
      const pendingGeneration = pendingProcessingGeneration;
      pendingProcessingGeneration = null;
      if (pendingGeneration !== null) runInBackground(pendingGeneration);
    });
  processingPromise = processPromise;
}

/** Start on consent grant and retry pending provider/backend work when the app returns active. */
export function initializeAcquisitionAttribution(): () => void {
  if (API_MODE !== 'live' || !isNativePlatform()) return () => undefined;

  const generation = ++consentGeneration;
  consentEnabled = true;
  void (async () => {
    const deviceId = await withTimeout(getOrCreateSukunDeviceId(), 1_000);
    if (!deviceId) recordIssue('installation identity unavailable');
    if (!isConsentGenerationActive(generation)) return;
    const instance = await getKochavaInstance(generation);
    if (!instance || !isConsentGenerationActive(generation)) return;
    instance.setSleep(false);
    runInBackground(generation);
  })().catch(() => {
    if (isConsentGenerationActive(generation)) recordIssue('SDK startup deferred');
  });

  foregroundSubscription?.remove();
  foregroundSubscription = AppState.addEventListener('change', (state) => {
    if (state === 'active' && isConsentGenerationActive(generation)) runInBackground(generation);
  });

  return () => {
    if (generation !== consentGeneration) return;
    consentEnabled = false;
    consentGeneration += 1;
    pendingProcessingGeneration = null;
    foregroundSubscription?.remove();
    foregroundSubscription = null;
    const instance = sdkInstance;
    sdkInstance = null;
    sdkLoadPromise = null;
    sdkLoadGeneration = null;
    sdkUnavailable = false;
    try {
      instance?.shutdown(true);
    } catch {
      recordIssue('SDK shutdown failed');
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

      return deviceId;
    } catch {
      recordIssue('installation identity unavailable during OTP');
      return undefined;
    }
  })();

  return preparation;
}
