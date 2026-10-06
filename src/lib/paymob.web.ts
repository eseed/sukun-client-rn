import type { PaymobResultEnum, PaymobSdk } from './paymob';

/** The web twin of the native adapter's return: a module shape, or nothing on web. */
type PaymobModule = {
  default?: PaymobSdk;
  PaymentStatus?: PaymobResultEnum;
  PaymentResult?: PaymobResultEnum;
} | null;

/** Paymob is a native SDK and is intentionally unavailable in browser builds. */
export function getPaymob(): PaymobModule {
  if (process.env.JEST_WORKER_ID || process.env.NODE_ENV === 'test') {
    // Jest provides a virtual mock. Keep the native package hidden from Metro's web resolver.
    const load = eval('require') as (name: string) => unknown;
    return load('paymob-reactnative') as PaymobModule;
  }
  return null;
}
