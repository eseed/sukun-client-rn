/** Web never registers a native acquisition device or starts Kochava attribution. */
export function initializeAcquisitionAttribution(): () => void {
  return () => undefined;
}

export function ensureAcquisitionDeviceRegistered(): void {
  // Native-only attribution is intentionally unavailable on web.
}

export async function prepareAcquisitionDeviceForOtp(): Promise<undefined> {
  return undefined;
}
