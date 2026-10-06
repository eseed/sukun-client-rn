import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { BackIcon, Screen, Text } from '../../../src/components/ui';
import { ScheduleAgenda } from '../../../src/components/live-event/schedule-agenda';
import { scheduleScreenContent } from '../../../src/components/live-event/schedule-screen-layout';
import { useEvent, usePublicEventSchedule } from '../../../src/hooks/queries';
import { track } from '../../../src/lib/analytics';
import { colors, space } from '../../../src/theme/tokens';

export default function PublicEventScheduleScreen() {
  const params = useLocalSearchParams<{ slug: string; view?: string }>();
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const view = (Array.isArray(params.view) ? params.view[0] : params.view) === 'calendar' ? 'calendar' : 'list';
  const router = useRouter();
  const event = useEvent(slug);
  const schedule = usePublicEventSchedule(event.data?.slug);
  const eventId = event.data?.id;
  const eventSlug = event.data?.slug;

  useEffect(() => {
    if (eventId && eventSlug) track('event_schedule_opened', { event_id: eventId, event_slug: eventSlug });
  }, [eventId, eventSlug]);

  const status = event.isPending
    ? 'loading'
    : event.isError || schedule.isError
      ? 'error'
      : schedule.isPending
        ? 'loading'
        : 'ready';

  return (
    <Screen scroll contentStyle={scheduleScreenContent}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to event" onPress={() => router.back()} style={({ pressed }) => [styles.backLink, pressed && styles.backPressed]}>
        <BackIcon size={16} color={colors.textMuted} />
        <Text variant="meta">Back to event</Text>
      </Pressable>
      <View style={styles.header}>
        <Text variant="titleMd" accessibilityRole="header">Full Schedule</Text>
        <Text variant="bodyMuted">Explore all sessions, workshops, and experiences by day, stage, or practice type.</Text>
      </View>
      <ScheduleAgenda
        key={eventId ?? slug}
        eventId={eventId ?? ''}
        schedule={schedule.data}
        status={status}
        defaultDay="all"
        initialView={view}
        analyticsScope="public"
        onOpenSession={(block, sessionView) => {
          const targetSlug = eventSlug ?? slug;
          if (targetSlug === undefined) return;
          router.push(`/event/${targetSlug}/schedule/${block.id}?view=${sessionView}`);
        }}
        onRetry={() => {
          void event.refetch();
          if (event.data?.slug) void schedule.refetch();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: space.s2 },
  backLink: { minHeight: 40, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: space.s2, paddingRight: space.s3 },
  backPressed: { opacity: 0.65 },
});
