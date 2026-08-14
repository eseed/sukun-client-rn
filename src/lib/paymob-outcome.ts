/**
 * Reading the Paymob sheet's verdict.
 *
 * This lives outside `paymob.ts` on purpose: that module is platform-split (`paymob.web.ts`),
 * so anything exported from it only exists on the platform Metro resolved. The normaliser below
 * is pure, so it stays in one place and both platforms import it directly.
 */

export type PaymobOutcome = 'success' | 'fail' | 'pending' | 'cancelled';

/**
 * Normalises whatever `onTransactionStatus` delivers into one of the four documented outcomes.
 *
 * The package's own `index.d.ts` types the listener as receiving a bare `PaymentResult` string
 * (`'Success' | 'Fail' | 'Cancelled' | 'Pending'`), but both native modules actually emit an
 * object — `{ status, details? }`. See `transactionAccepted` / `transactionRejected` /
 * `transactionCancelled` / `transactionPending` in
 * `node_modules/paymob-reactnative/ios/PaymobReactNativeModule/PaymobReactnative.swift`, and
 * `statusMap.putString("status", status)` in
 * `node_modules/paymob-reactnative/android/src/main/java/com/paymobreactnative/PaymobReactnativeModule.kt`.
 *
 * Switching on the raw value therefore matches nothing and silently swallows every payment
 * result. Both shapes are accepted here so the outcome survives whichever one arrives, and the
 * comparison is case-insensitive so a casing change between platforms cannot resurrect the bug.
 */
export function readPaymobOutcome(result: unknown): PaymobOutcome | null {
  const status =
    typeof result === 'string'
      ? result
      : typeof result === 'object' && result !== null
        ? (result as { status?: unknown }).status
        : undefined;

  if (typeof status !== 'string') return null;

  switch (status.toLowerCase()) {
    case 'success':
      return 'success';
    case 'fail':
      return 'fail';
    case 'pending':
      return 'pending';
    case 'cancelled':
      return 'cancelled';
    default:
      return null;
  }
}
