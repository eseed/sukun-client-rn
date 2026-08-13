/** Paymob is a native SDK and is intentionally unavailable in browser builds. */
export function getPaymob(): null {
  if (process.env.JEST_WORKER_ID || process.env.NODE_ENV === 'test') {
    // Jest provides a virtual mock. Keep the native package hidden from Metro's web resolver.
    const load = eval('require') as (name: string) => unknown;
    return load('paymob-reactnative') as never;
  }
  return null;
}
