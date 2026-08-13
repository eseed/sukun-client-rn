/** Native Paymob adapter. The web adapter is selected automatically by Metro. */
export function getPaymob(): {
  default?: {
    setAppName: (name: string) => void;
    setButtonBackgroundColor: (color: string) => void;
    setButtonTextColor: (color: string) => void;
    setSdkListener: (listener: (result: string) => void) => void;
    presentPayVC: (clientSecret: string, publicKey: string) => void;
  };
  PaymentStatus?: { FAIL?: string; CANCELLED?: string };
} | null {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('paymob-reactnative');
}
