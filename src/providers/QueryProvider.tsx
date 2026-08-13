import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useEffect, useState } from 'react';
import { setAuthQueryCacheClearHandler, useAuthStore } from '../stores/auth';

/**
 * One QueryClient for the app. Retries are off for mutations (an OTP or an order must not be
 * silently replayed) and modest for reads.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        staleTime: 30 * 1000,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(createQueryClient);
  const authStatus = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    setAuthQueryCacheClearHandler(() => client.clear());
    return () => setAuthQueryCacheClearHandler(null);
  }, [client]);

  useEffect(() => {
    if (authStatus === 'signed-in' && user) {
      client.setQueryData(['me'], user);
    }
  }, [authStatus, client, user]);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
