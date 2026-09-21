import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ONBOARDING_RESUME_ROUTE, useAuthStore } from '../stores/auth';

/**
 * Who may stand on a checkout screen: a signed-in account whose profile is complete.
 *
 * The selfie is not part of this. It gates the entry pass, not the purchase, and is asked for
 * on the ticket that needs it (CLAUDE.md rule 3), so nobody is sent to a camera on the way to
 * paying.
 */
export function useCheckoutAccess() {
  const router = useRouter();
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    if (status === 'signed-out') {
      router.replace('/(onboarding)/welcome');
    } else if (status === 'signed-in' && (!user || !user.profileComplete)) {
      router.replace(ONBOARDING_RESUME_ROUTE);
    }
  }, [router, status, user]);

  return {
    loading: status === 'loading',
    blocked: status !== 'signed-in' || !user || !user.profileComplete,
    allowed: status === 'signed-in' && Boolean(user?.profileComplete),
  };
}
