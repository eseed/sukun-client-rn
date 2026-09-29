import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useClaimableTickets } from '../../hooks/useClaimableTickets';
import { useAuthStore } from '../../stores/auth';
import { useClaimPromptStore } from '../../stores/claimPrompt';

/**
 * Puts the claim screen in front of a holder with a granted ticket waiting, before anything
 * else they do in the app.
 *
 * It lives in the tabs layout because every way into the app ends there: a cold start, a fresh
 * sign-in, finishing or deferring the profile, and coming back from the background. The tabs
 * stay underneath, so "Not now" simply closes it. Each ticket is shown once per launch
 * (`useClaimPromptStore`), and the list is fetched again whenever the app returns to the
 * foreground, which is when a grant that arrived over WhatsApp is most likely to be opened.
 */
export function ClaimGate() {
  const router = useRouter();
  const signedIn = useAuthStore((s) => s.status === 'signed-in');
  const { tickets, query } = useClaimableTickets();
  const shownTicketIds = useClaimPromptStore((s) => s.shownTicketIds);
  const open = useClaimPromptStore((s) => s.open);
  const markShown = useClaimPromptStore((s) => s.markShown);
  const { refetch } = query;

  useEffect(() => {
    if (!signedIn) return;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refetch();
    });
    return () => subscription.remove();
  }, [refetch, signedIn]);

  useEffect(() => {
    if (!signedIn || open) return;
    if (!tickets.some((ticket) => !shownTicketIds.has(ticket.id))) return;
    markShown(tickets.map((ticket) => ticket.id));
    router.push('/claim');
  }, [markShown, open, router, shownTicketIds, signedIn, tickets]);

  return null;
}
