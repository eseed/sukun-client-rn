import { request } from './http';

export interface RegisterPushTokenRequest {
  token: string;
  platform: 'ios' | 'android';
  deviceId: string;
  appVersion?: string;
}

/** Register or refresh the Expo token for this authenticated user and installation. */
export async function registerLivePushToken(
  input: RegisterPushTokenRequest,
  signal?: AbortSignal,
): Promise<void> {
  await request<void>('mobile/devices/push-token', { method: 'POST', body: input, signal });
}

/** Revoke push delivery for this authenticated user and canonical Sukun installation UUID. */
export async function revokeLivePushToken(deviceId: string, signal?: AbortSignal): Promise<void> {
  await request<void>('mobile/devices/push-token', {
    method: 'DELETE',
    body: { deviceId },
    retryOnUnauthorized: false,
    signal,
  });
}
