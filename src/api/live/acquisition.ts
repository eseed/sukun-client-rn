import { request } from './http';

export type AcquisitionPlatform = 'ios' | 'android';

export interface RegisterAcquisitionDeviceInput {
  deviceId: string;
  platform: AcquisitionPlatform;
  appVersion?: string;
}

export interface RegisterAcquisitionDeviceResponse {
  deviceId: string;
  attributionStatus: 'pending' | 'attributed' | 'organic' | 'unavailable';
  hasFirstAttribution: boolean;
}

export interface SubmitKochavaAttributionInput {
  provider: 'kochava';
  providerInstallationId?: string;
  providerSdkVersion: string;
  payload: object;
}

export interface SubmitKochavaAttributionResponse {
  id: string;
  deviceId: string;
  provider: 'kochava';
  status: 'attributed' | 'organic' | 'unavailable';
  isFirstAttribution: boolean;
  source?: string | null;
  campaignName?: string | null;
  creativeName?: string | null;
  receivedAt: string;
}

const REQUEST_TIMEOUT_MS = 8_000;

async function publicPost<T>(path: string, body: unknown): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await request<T>(path, {
      method: 'POST',
      body,
      auth: false,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

/** Public, idempotent registration for the app-owned installation UUID. */
export function registerAcquisitionDevice(
  input: RegisterAcquisitionDeviceInput,
): Promise<RegisterAcquisitionDeviceResponse> {
  return publicPost('mobile/devices', input);
}

/** Submit the provider's raw SDK result unchanged; the backend owns normalization. */
export function submitKochavaAttribution(
  deviceId: string,
  input: SubmitKochavaAttributionInput,
): Promise<SubmitKochavaAttributionResponse> {
  return publicPost(`mobile/devices/${encodeURIComponent(deviceId)}/attributions`, input);
}
