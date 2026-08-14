import { useCallback, useEffect, useState } from 'react';
import type { PaymentIntent } from '../api/types';
import { getPaymob } from '../lib/paymob';
import { readPaymobOutcome, type PaymobOutcome } from '../lib/paymob-outcome';
import { colors } from '../theme/tokens';

/**
 * Presents Paymob's native payment sheet, per the React Native SDK documentation.
 *
 * The documented contract, in order: customise the sheet, register `setSdkListener`, then call
 * `presentPayVC(clientSecret, publicKey)` — customisation after `presentPayVC` is ignored, and
 * the listener is a native event subscription that outlives the screen unless removed. The
 * third `savedBankCards` argument is optional and Sukun does not store cards, so it is omitted.
 *
 * Outcomes are normalised by `readPaymobOutcome` because the shipped package emits an object
 * where its typings promise a bare status string — see that function for the details.
 */
export function usePaymobSheet() {
  const paymob = getPaymob();
  const sdk = paymob?.default ?? null;

  const [outcome, setOutcome] = useState<PaymobOutcome | null>(null);

  // The listener is a native subscription; it must be torn down with the screen that owns it.
  useEffect(() => () => sdk?.removeSdkListener(), [sdk]);

  const present = useCallback(
    (intent: Pick<PaymentIntent, 'clientSecret' | 'publicKey'>) => {
      if (!sdk) return false;
      setOutcome(null);

      // All customisation must happen before presentPayVC — later changes are ignored.
      sdk.setAppName('Sukun');
      sdk.setButtonBackgroundColor(colors.gold500);
      sdk.setButtonTextColor(colors.creme);

      sdk.setSdkListener((result: unknown) => {
        const next = readPaymobOutcome(result);
        if (next) setOutcome(next);
      });

      sdk.presentPayVC(intent.clientSecret, intent.publicKey);
      return true;
    },
    [sdk],
  );

  const reset = useCallback(() => setOutcome(null), []);

  return { available: Boolean(sdk), present, outcome, reset };
}
