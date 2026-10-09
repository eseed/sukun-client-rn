import { Redirect, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, AppState, StyleSheet, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { BottomNav } from '../../../src/components/ui/BottomNav';
import { Button, Screen, Text } from '../../../src/components/ui';
import { useLiveEventContext } from '../../../src/hooks/useLiveEventContext';
import { queryKeys } from '../../../src/hooks/queries';
import { useAuthStore } from '../../../src/stores/auth';
import { colors, space } from '../../../src/theme/tokens';
import { track } from '../../../src/lib/analytics';

export default function LiveEventLayout() {
  const client = useQueryClient();
  const params = useLocalSearchParams<{ eventId: string }>();
  const eventId = Array.isArray(params.eventId) ? params.eventId[0] : params.eventId;
  const authStatus = useAuthStore((state) => state.status);
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const live = useLiveEventContext();
  const liveEventSlug = live.status === 'ready' ? live.context.eventSlug : null;
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && userId) {
        void client.invalidateQueries({ queryKey: queryKeys.liveEventContextRoot(userId) });
        if (liveEventSlug) {
          void client.invalidateQueries({ queryKey: queryKeys.publicSchedule(liveEventSlug) });
          void client.invalidateQueries({ queryKey: queryKeys.myScheduleRoot });
        }
      }
    });
    return () => subscription.remove();
  }, [client, liveEventSlug, userId]);

  if (authStatus === 'loading' || live.status === 'loading' || live.status === 'idle') {
    return <View style={styles.loading}><ActivityIndicator color={colors.textPrimary} /></View>;
  }
  if (authStatus !== 'signed-in') {
    return <Redirect href="/(tabs)/discover" />;
  }
  // A network error is not "the Event ended": keep the attendee out of a dead end with a
  // retry instead of dropping them back to Discover (plan section 22).
  if (live.status === 'error') {
    return (
      <View style={styles.root}>
        <Screen edges={{ bottom: false }} contentStyle={styles.errorContent}>
          <Text variant="titleMd" accessibilityRole="header">Live event unavailable</Text>
          <Text variant="bodyMuted">
            We could not confirm the live event. Check your connection and try again. Your
            tickets and entry pass are still available under Tickets.
          </Text>
          <Button
            label="Retry"
            onPress={() => {
              void client.invalidateQueries({ queryKey: queryKeys.liveEventContextRoot(userId) });
            }}
          />
        </Screen>
        <BottomNav />
      </View>
    );
  }
  // More than one LIVE Event and no session choice yet: the chooser lives at launch.
  if (live.status === 'choose') {
    return <Redirect href="/" />;
  }
  // A confirmed re-resolution to no matching LIVE Event ends LIVE mode.
  if (live.status !== 'ready') {
    return <Redirect href="/(tabs)/discover" />;
  }
  // Deep link to a stale event while another is live: follow the live context.
  if (live.context.eventId !== eventId) {
    return <Redirect href={`/live-event/${live.context.eventId}`} />;
  }
  return (
    <View style={styles.root}>
      {/* No top navbar anywhere in the LIVE flow now. Event Home carries its own subnav;
          Schedule and My Schedule open straight on content, the session detail on its own
          back header, and the bottom bar carries Home back to Event Home. */}
      <Stack screenOptions={{ headerShown: false, contentStyle: styles.scene, animation: 'slide_from_right' }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="schedule" />
        <Stack.Screen name="my-schedule" />
        <Stack.Screen name="session/[blockId]" />
      </Stack>
      <BottomNav onNavigate={(href) => {
        if (href === '/(tabs)/discover' && live.status === 'ready') {
          track('live_event_discover_opened', { event_id: live.context.eventId });
        }
      }} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgPage },
  scene: { backgroundColor: colors.bgPage },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgPage },
  errorContent: { paddingHorizontal: space.s4, paddingTop: space.s6, gap: space.s3 },
});
