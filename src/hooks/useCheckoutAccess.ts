import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ONBOARDING_RESUME_ROUTE, useAuthStore } from '../stores/auth';
import { useAllowGuestBrowsing } from '../stores/flags';

interface CheckoutAccessOptions {
  /**
   * Let anyone stand on this screen, including a visitor with no account and an account whose
   * profile is unfinished. For the steps that show what a ticket costs and nothing else.
   */
  browsable?: boolean;
}

/**
 * Who may stand on a checkout screen, and who may leave it towards an order.
 *
 * Two different questions, and they used to be one. Every checkout screen demanded a signed-in
 * account with a complete profile before it would draw anything, so the pass step, which is
 * only a list of tiers and their prices and asks the server for nothing, turned the Get tickets
 * button into a sign-in wall. The tier list is public data (`public/events/:id`), so there was
 * never a reason it could not be read: the account is needed by what comes after it, where a
 * cart is created, recipients are looked up and the total is priced, and every one of those
 * endpoints is authenticated.
 *
 * So `browsable` screens are open, and `canPurchase` is what the Continue button asks. The gate
 * lands on the step that genuinely needs an account rather than in front of the prices.
 *
 * `browsable` is still subject to `allowGuestBrowsing`: where the guest path is switched off
 * (Android's default, see CLAUDE.md), a signed-out visitor is sent to Welcome exactly as
 * before, and nothing about this changes what that flag decides.
 *
 * The selfie is not part of any of this. It gates the entry pass, not the purchase, and is
 * asked for on the ticket that needs it (CLAUDE.md rule 3), so nobody is sent to a camera on
 * the way to paying.
 */
export function useCheckoutAccess({ browsable = false }: CheckoutAccessOptions = {}) {
  const router = useRouter();
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const allowGuestBrowsing = useAllowGuestBrowsing();

  const open = browsable && allowGuestBrowsing;
  const canPurchase = status === 'signed-in' && Boolean(user?.profileComplete);

  useEffect(() => {
    if (open || status === 'loading') return;
    if (status === 'signed-out') {
      router.replace('/(onboarding)/welcome');
    } else if (!user || !user.profileComplete) {
      router.replace(ONBOARDING_RESUME_ROUTE);
    }
  }, [open, router, status, user]);

  return {
    loading: status === 'loading',
    blocked: !open && !canPurchase,
    allowed: open || canPurchase,
    /** Whether this visitor may start an order, as opposed to read the page. */
    canPurchase,
    /** What the Continue button has to ask for first: nothing, a sign-in, or the profile form. */
    needs: canPurchase ? null : status === 'signed-in' ? ('profile' as const) : ('sign-in' as const),
  };
}
