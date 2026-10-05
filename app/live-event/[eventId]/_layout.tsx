import { Redirect, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, AppState, StyleSheet, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { BottomNav } from '../../../src/components/ui/BottomNav';
import { LiveEventShell } from '../../../src/components/live-event/live-event-shell';
import { useLiveEventContext } from '../../../src/hooks/useLiveEventContext';
import { queryKeys } from '../../../src/hooks/queries';
import { useAuthStore } from '../../../src/stores/auth';
import { colors } from '../../../src/theme/tokens';
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

  if (authStatus === 'loading' || live.status === 'loading') {
    return <View style={styles.loading}><ActivityIndicator color={colors.textPrimary} /></View>;
  }
  if (authStatus !== 'signed-in' || live.status !== 'ready' || live.context.eventId !== eventId) {
    return <Redirect href="/(tabs)/discover" />;
  }
  return (
    <View style={styles.root}>
      <LiveEventShell />
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
});
