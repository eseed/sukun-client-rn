/**
 * Native Paymob adapter. The web adapter is selected automatically by Metro.
 *
 * The shape below mirrors the SDK's documented surface. Note that the docs name the result
 * enum `PaymentResult` while the shipped package exports it as `PaymentStatus`; both names are
 * accepted here so the screen keeps working whichever one a future release settles on.
 */
export interface PaymobSdk {
  setAppIcon: (base64Image: string) => void;
  setAppName: (name: string) => void;
  setButtonBackgroundColor: (color: string) => void;
  setButtonTextColor: (color: string) => void;
  setShowSaveCard: (isVisible: boolean) => void;
  setSaveCardDefault: (isEnabled: boolean) => void;
  /** Off hides the SDK's floating "Done" keyboard pill; iOS still dismisses the keyboard. */
  setKeyboardHandlingEnabled: (isEnabled: boolean) => void;
  /** Off skips the SDK's own pre-payment confirmation page. */
  setShowConfirmationPage: (isVisible: boolean) => void;
  /** Off skips the SDK's "Approved" result page, so the sheet returns instead of parking. */
  setShowTransactionResult: (isVisible: boolean) => void;
  /** See `readPaymobOutcome` — the emitted value is an object, not the documented bare string. */
  setSdkListener: (listener: (result: unknown) => void) => void;
  removeSdkListener: () => void;
  presentPayVC: (clientSecret: string, publicKey: string) => void;
}


/** `PaymentResult` in the docs, `PaymentStatus` in the package. */
export interface PaymobResultEnum {
  SUCCESS?: string;
  FAIL?: string;
  PENDING?: string;
  CANCELLED?: string;
}

export function getPaymob(): {
  default?: PaymobSdk;
  PaymentStatus?: PaymobResultEnum;
  PaymentResult?: PaymobResultEnum;
} | null {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('paymob-reactnative');
}
