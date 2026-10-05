import { useCallback, useEffect, useState } from 'react';
import type { PaymentIntent } from '../api/types';
import { getPaymob } from '../lib/paymob';
import { readPaymobOutcome, type PaymobOutcome } from '../lib/paymob-outcome';
import { savePendingPayment } from '../lib/pending-payment';
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
 *
 * The SDK offers no timeout and no way to close the sheet from the app (its README documents
 * neither, and the native sheet blocks Back), so none is invented here. What the app can do is
 * remember the order the sheet was opened for (`present(intent, orderId)`), so that a sheet
 * stuck on the bank's page, or a result Android could not deliver to a reclaimed app, is
 * resolved from the server the next time the app is in front. See `usePendingPaymentRecovery`.
 */

/**
 * Whether a sheet this process presented has not reported back yet. Read by the recovery hook,
 * which must not navigate away from the screen whose listener is waiting for the result.
 */
let sheetOpen = false;

export function isPaymobSheetOpen(): boolean {
  return sheetOpen;
}

export function usePaymobSheet() {
  const paymob = getPaymob();
  const sdk = paymob?.default ?? null;

  /**
   * The verdict and when it was taken. `at` lets a screen tell a payment status fetched after
   * the verdict from one fetched before it, which is the difference between checking what the
   * sheet said and repeating it.
   */
  const [verdict, setVerdict] = useState<{ outcome: PaymobOutcome; at: number } | null>(null);

  // The listener is a native subscription; it must be torn down with the screen that owns it.
  useEffect(
    () => () => {
      sheetOpen = false;
      sdk?.removeSdkListener();
    },
    [sdk],
  );

  const present = useCallback(
    (
      intent: Pick<PaymentIntent, 'clientSecret' | 'publicKey'> &
        Partial<Pick<PaymentIntent, 'paymentId'>>,
      orderId?: string,
    ) => {
      if (!sdk) return false;
      setVerdict(null);

      if (orderId) {
        // Written before the sheet opens: once it is up, the app may not live to write anything.
        void savePendingPayment({
          orderId,
          attemptId: intent.paymentId ?? null,
          startedAt: Date.now(),
        });
      }

      // All customisation must happen before presentPayVC — later changes are ignored.
      sdk.setAppName('Sukun');
      sdk.setButtonBackgroundColor(colors.gold500);
      sdk.setButtonTextColor(colors.creme);
      // Sukun does not store cards, so `presentPayVC` is called without saved cards and the
      // save-card option is hidden rather than shown unchecked.
      sdk.setShowSaveCard(false);
      sdk.setSaveCardDefault(false);
      // Left on, which is the SDK's own default. Turning it off was tried, to drop the floating
      // "Done" pill the sheet draws above the keyboard, and TestFlight showed it does neither
      // thing that change assumed: the pill stayed, and the card fields stopped lifting, so the
      // keyboard covered the field being typed into. The pill belongs to the number pad inside
      // Paymob's own view controller, which has no return key and nothing else to dismiss it
      // with, and no bridge method reaches it. Keyboard avoidance is the half we do control.
      sdk.setKeyboardHandlingEnabled(true);
      // The SDK's own result screen is left on. Suppressing it was tried and does not remove the
      // page the buyer actually sees after 3DS — that one belongs to the acquirer — and the only
      // lever that does (`redirection_url`) costs the SUCCESS event this screen navigates on.

      sdk.setSdkListener((result: unknown) => {
        const next = readPaymobOutcome(result);
        if (!next) return;
        sheetOpen = false;

        setVerdict((current) => {
          // The sheet reports more than once: dismissing it after a completed payment emits
          // CANCELLED behind the SUCCESS that preceded it. Taking the latest event turned a paid
          // order into "Payment was cancelled". The first verdict of a session therefore stands,
          // and only SUCCESS may override an earlier one (PENDING can still resolve to paid).
          if (current === null || (next === 'success' && current.outcome !== 'success')) {
            return { outcome: next, at: Date.now() };
          }
          return current;
        });
      });

      sheetOpen = true;
      sdk.presentPayVC(intent.clientSecret, intent.publicKey);
      return true;
    },
    [sdk],
  );

  const reset = useCallback(() => setVerdict(null), []);

  return {
    available: Boolean(sdk),
    present,
    outcome: verdict?.outcome ?? null,
    /** Epoch milliseconds at which `outcome` arrived, or null without one. */
    outcomeAt: verdict?.at ?? null,
    reset,
  };
}
