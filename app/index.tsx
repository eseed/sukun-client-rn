import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useState } from 'react';
import { useAllowGuestBrowsing } from '../src/stores/flags';
import { ONBOARDING_RESUME_ROUTE, useAuthStore } from '../src/stores/auth';
import { colors, radius } from '../src/theme/tokens';
import { setSessionLiveEventChoice, useLiveEventContext } from '../src/hooks/useLiveEventContext';
import { Button, Screen, Text } from '../src/components/ui';

/**
 * Entry gate. Sends signed-in holders with a LIVE event ticket into that Event, other users
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
  const [selectedEventId, setSelectedEventId] = useState<string>();
  const liveEvent = useLiveEventContext(status === 'signed-in', selectedEventId);

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
    // LIVE mode is an app-ready destination only: an unfinished profile still owes its
    // onboarding step first (plan section 7). The resolver is awaited either way so an
    // incomplete account does not race past the ticket check into onboarding.
    if (user.profileComplete && liveEvent.status === 'ready') {
      return (
        <Redirect
          href={`/live-event/${liveEvent.context.eventId}`}
        />
      );
    }
    if (user.profileComplete && liveEvent.status === 'choose') {
      return (
        <Screen scroll contentStyle={styles.chooser}>
          <View style={styles.chooserStack}>
          <Text variant="titleMd" accessibilityRole="header">Choose your LIVE Event</Text>
          <Text variant="bodyMuted">You have active tickets for more than one Event happening now.</Text>
          {liveEvent.choices.map(({ event, ticket }) => (
            <View key={event.id} style={styles.choice}>
              <Text variant="titleSm">{event.title}</Text>
              <Text variant="bodyMuted">{event.venueName ?? 'Venue details unavailable'} · {ticket.tier.name}</Text>
              <Button
                label={`Open ${event.title}`}
                onPress={() => {
                  setSessionLiveEventChoice(user.id, event.id);
                  setSelectedEventId(event.id);
                }}
              />
            </View>
          ))}
          </View>
        </Screen>
      );
    }
    if (liveEvent.status === 'loading') {
      return (
        <View style={styles.splash}>
          <ActivityIndicator color={colors.textPrimary} />
        </View>
      );
    }
  }

  // A finished profile with no matching LIVE ticket reaches the public catalogue.
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
  chooser: { paddingHorizontal: 24 },
  chooserStack: { gap: 16 },
  choice: { gap: 10, padding: 16, borderRadius: radius.card, backgroundColor: colors.bgSurface, borderColor: colors.borderDefault, borderWidth: 1 },
});
