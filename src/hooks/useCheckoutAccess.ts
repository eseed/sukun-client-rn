import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { missingProfileFields, useAuthStore } from '../stores/auth';

export function useCheckoutAccess() {
  const router = useRouter();
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    if (status === 'signed-out') {
      router.replace('/(onboarding)/welcome');
    } else if (status === 'signed-in' && (!user || !user.profileComplete)) {
      const missing = missingProfileFields(user);
      router.replace(
        missing.length === 1 && missing[0] === 'selfie'
          ? '/(onboarding)/selfie'
          : '/(onboarding)/profile',
      );
    }
  }, [router, status, user]);

  return {
    loading: status === 'loading',
    blocked: status !== 'signed-in' || !user || !user.profileComplete,
    allowed: status === 'signed-in' && Boolean(user?.profileComplete),
  };
}
