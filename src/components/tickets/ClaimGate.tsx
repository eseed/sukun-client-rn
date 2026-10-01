import { usePathname, useRouter } from 'expo-router';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, View } from 'react-native';
import { useClaimableTickets } from '../../hooks/useClaimableTickets';
import { useAuthStore } from '../../stores/auth';
import { useClaimPromptStore } from '../../stores/claimPrompt';
import { colors } from '../../theme/tokens';

/** Sign-up's screens (`app/(onboarding)`, and the selfie it offers), which the gate waits out. */
const ONBOARDING_PATHS = new Set(['/welcome', '/phone', '/otp', '/profile', '/account/selfie']);

/**
 * How long the app has to sit in the background before coming back counts as opening it again,
 * and puts a waiting invitation back in front of the holder. A quick trip to WhatsApp and back
 * is not that.
 */
export const REOPEN_AFTER_MS = 5 * 60 * 1000;

/**
 * Puts the claim screen in front of a holder with a granted ticket waiting, before anything
 * else they do in the app.
 *
 * It wraps the tabs because every way into the app ends there: a cold start, a fresh sign-in,
 * finishing or deferring the profile, and coming back from the background. Until it knows
 * whether an invitation is waiting it covers the tabs with a plain loading screen, so the claim
 * screen, not Discover, is the first thing a holder sees. The tabs are underneath it, so
 * "Not now" simply closes it.
 *
 * Each ticket is shown once per opening of the app (`useClaimPromptStore`): a cold start, a
 * sign-in, or a return after `REOPEN_AFTER_MS` in the background. The list is fetched again
 * whenever the app returns to the foreground, which is when a grant that arrived over WhatsApp
 * is most likely to be opened, and a ticket not seen yet is shown then too.
 *
 * It waits while sign-up is on screen. The tabs stay mounted underneath the onboarding screens,
 * so without this the claim screen opened over the profile form, a claim then asked for the form
 * a second time, and two stacked forms each moved on when one was saved, losing the claim.
 */
export function ClaimGate({ children }: { children?: ReactNode }) {
  const router = useRouter();
  const signedIn = useAuthStore((s) => s.status === 'signed-in');
  const userId = useAuthStore((s) => (s.status === 'signed-in' ? (s.user?.id ?? null) : null));
  const { tickets, query } = useClaimableTickets();
  const shownTicketIds = useClaimPromptStore((s) => s.shownTicketIds);
  const open = useClaimPromptStore((s) => s.open);
  const markShown = useClaimPromptStore((s) => s.markShown);
  const forgetShown = useClaimPromptStore((s) => s.forgetShown);
  const { refetch } = query;
  const pathname = usePathname();
  const onboarding = ONBOARDING_PATHS.has(pathname);
  const backgroundedAt = useRef<number | null>(null);

  const unseen = tickets.some((ticket) => !shownTicketIds.has(ticket.id));
  const checking = query.isPending && query.fetchStatus === 'fetching';
  // Only before the tabs are first seen by this account: covering them later would hide where
  // the holder was. Settled while rendering (React's "adjusting state when a prop changes"),
  // not in an effect, so the tabs are never drawn once and then covered.
  const [releasedFor, setReleasedFor] = useState<string | null | undefined>(undefined);
  const released = releasedFor === userId;
  const holding = !released && signedIn && !open && (checking || unseen);
  if (!holding && !released) setReleasedFor(userId);

  useEffect(() => {
    if (!signedIn) return;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'background') {
        backgroundedAt.current = Date.now();
        return;
      }
      if (next !== 'active') return;
      const away = backgroundedAt.current === null ? 0 : Date.now() - backgroundedAt.current;
      backgroundedAt.current = null;
      if (away >= REOPEN_AFTER_MS) forgetShown();
      void refetch();
    });
    return () => subscription.remove();
  }, [forgetShown, refetch, signedIn]);

  useEffect(() => {
    if (!signedIn || open || onboarding || !unseen) return;
    markShown(tickets.map((ticket) => ticket.id));
    router.push('/claim');
  }, [markShown, onboarding, open, router, signedIn, tickets, unseen]);

  // The tabs stay mounted under the cover, so the navigator and its routes are there throughout.
  return (
    <>
      {children}
      {holding ? (
        <View style={styles.holding} testID="claim-gate-holding">
          <ActivityIndicator color={colors.textPrimary} />
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  holding: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgPage,
  },
});
