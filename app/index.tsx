import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAllowGuestBrowsing } from '../src/stores/flags';
import { ONBOARDING_RESUME_ROUTE, useAuthStore } from '../src/stores/auth';
import { useLiveModeStore } from '../src/stores/liveMode';
import { colors } from '../src/theme/tokens';
import { useLiveEventContext } from '../src/hooks/useLiveEventContext';

/**
 * Entry gate. Sends signed-in holders who switched live mode on into their Event, other users
 * with a finished profile to Discover, users mid-onboarding back to their unfinished step,
 * and first-time visitors to Welcome. Successful sign-in returns here so both paths share
 * the same ticket check.
 *
 * Two cases are not a redirect into the flow, and they are the same case twice: someone who
 * has already been asked and already answered. `setupDeferred` is an account that declined a
 * registration step; `guestBrowsing` is a visitor with no account who took "Skip login". Both
 * land on Discover, because re-presenting the question on every cold start rebuilds the wall
 * the exit exists to remove (guideline 5.1.1(v)).
 *
 * The second of those was the gap: only the signed-in half was ever honoured, so a guest met
 * the Welcome screen on every single launch no matter how many times they had declined it,
 * and App Store review read that, correctly, as an app that demands registration to browse.
 *
 * Welcome still greets a genuinely new visitor, which is the product's intent. Sign-in stays
 * one tap away on the Profile tab, and purchase is still gated on `profileComplete`, so
 * nothing anyone skipped is waived.
 */
export default function Index() {
  const allowGuestBrowsing = useAllowGuestBrowsing();
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const setupDeferred = useAuthStore((s) => s.setupDeferred);
  const guestBrowsing = useAuthStore((s) => s.guestBrowsing);
  const pendingAccommodationEventId = useAuthStore((s) => s.pendingAccommodationEventId);
  const liveModeStatus = useLiveModeStore((s) => s.status);
  const liveModeChoice = useLiveModeStore((s) => s.choice);
  const liveEvent = useLiveEventContext(status === 'signed-in');

  if (status === 'loading') {
    return (
      <View style={styles.splash}>
        <ActivityIndicator color={colors.textPrimary} />
      </View>
    );
  }

  if (status === 'signed-out' || !user) {
    // A visitor who has already taken "Skip login" is not asked again. Welcome is a first-run
    // screen by design, and the product wants it to be, but re-presenting it on every cold
    // start turned it into a permanent registration wall for anyone without an account, which
    // is what guideline 5.1.1(v) forbids and what build 18 was rejected for. Sign-in stays one
    // tap away on the Profile tab. See `guestBrowsing` in `src/stores/auth.ts`.
    if (allowGuestBrowsing && guestBrowsing) {
      return <Redirect href="/(tabs)/discover" />;
    }
    return <Redirect href="/(onboarding)/welcome" />;
  }

  if (status === 'signed-in' && user) {
    // A room documents link opened the app (`app/+native-intent.tsx`): it goes first, once the
    // profile is done. The screen clears the pending event when it opens.
    if (user.profileComplete && pendingAccommodationEventId) {
      return <Redirect href={`/accommodation?eventId=${pendingAccommodationEventId}`} />;
    }
    // Live mode is the holder's choice: launch opens it only when they switched it on and
    // their event is still happening. An unfinished profile still owes its onboarding step
    // first (plan section 7). The resolver is awaited either way so an incomplete account does
    // not race past the ticket check into onboarding.
    if (liveModeStatus === 'loading') {
      return (
        <View style={styles.splash}>
          <ActivityIndicator color={colors.textPrimary} />
        </View>
      );
    }
    if (
      user.profileComplete &&
      liveEvent.status === 'ready' &&
      liveModeChoice?.userId === user.id &&
      liveModeChoice.eventId === liveEvent.context.eventId
    ) {
      return <Redirect href={`/live-event/${liveEvent.context.eventId}`} />;
    }
    if (liveEvent.status === 'loading') {
      return (
        <View style={styles.splash}>
          <ActivityIndicator color={colors.textPrimary} />
        </View>
      );
    }
  }

  // A finished profile with live mode off reaches the public catalogue.
  if (user?.profileComplete) {
    // Resolver failures must not strand the attendee at launch.
    return <Redirect href="/(tabs)/discover" />;
  }

  if (allowGuestBrowsing && setupDeferred) {
    return <Redirect href="/(tabs)/discover" />;
  }

  return <Redirect href={ONBOARDING_RESUME_ROUTE} />;
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgPage,
  },
});
