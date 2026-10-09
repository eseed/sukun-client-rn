import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { BackIcon, Screen, Text } from '../../../src/components/ui';
import { ScheduleAgenda } from '../../../src/components/live-event/schedule-agenda';
import { ScheduleNotice, ScheduleSaveSheet } from '../../../src/components/live-event/schedule-notice';
import { scheduleScreenContent } from '../../../src/components/live-event/schedule-screen-layout';
import { useEvent, usePublicEventSchedule } from '../../../src/hooks/queries';
import { useScheduleSaving } from '../../../src/hooks/useScheduleSaving';
import { track } from '../../../src/lib/analytics';
import { colors, space } from '../../../src/theme/tokens';

/**
 * An event's published schedule, built as the website's (sukun-client-web EventSchedulePage):
 * it opens on the calendar, the list is one tap away. A ticket holder saves sessions to My
 * Schedule from the cards.
 */
export default function PublicEventScheduleScreen() {
  const params = useLocalSearchParams<{ slug: string; view?: string }>();
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const view = (Array.isArray(params.view) ? params.view[0] : params.view) === 'list' ? 'list' : 'calendar';
  const router = useRouter();
  const event = useEvent(slug);
  const schedule = usePublicEventSchedule(event.data?.slug);
  const eventId = event.data?.id;
  const eventSlug = event.data?.slug;
  const saving = useScheduleSaving(eventId, schedule.data?.blocks);

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
      {/* Screen does not space its children (the LIVE home's quirk), so the sections stack here. */}
      <View style={styles.stack}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to event" onPress={() => router.back()} style={({ pressed }) => [styles.backLink, pressed && styles.backPressed]}>
        <BackIcon size={16} color={colors.textMuted} />
        <Text variant="meta">Back to event</Text>
      </Pressable>
      <View style={styles.header}>
        {event.data?.title ? <Text variant="eyebrow" style={styles.eyebrow}>{event.data.title}</Text> : null}
        <Text variant="titleLg" accessibilityRole="header">Full Schedule</Text>
        <Text variant="bodyMuted">Explore all sessions, workshops, and experiences by day, stage, or practice type.</Text>
      </View>
      {saving.notice ? <ScheduleNotice message={saving.notice.message} onDismiss={saving.dismissNotice} /> : null}
      {saving.saveSheet ? <ScheduleSaveSheet
        title={saving.saveSheet.title}
        conflicts={saving.saveSheet.conflicts}
        onClose={saving.closeSaveSheet}
      /> : null}
      <ScheduleAgenda
        key={eventId ?? slug}
        eventId={eventId ?? ''}
        schedule={schedule.data}
        status={status}
        bleed={space.s5}
        initialView={view}
        analyticsScope="public"
        savedIds={saving.savedIds}
        pending={saving.pending}
        onOpenSession={(block, sessionView) => {
          const targetSlug = eventSlug ?? slug;
          if (targetSlug === undefined) return;
          router.push(`/event/${targetSlug}/schedule/${block.id}?view=${sessionView}`);
        }}
        onToggleSaved={saving.toggle}
        onRetry={() => {
          void event.refetch();
          if (event.data?.slug) void schedule.refetch();
        }}
      />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.s5 },
  header: { gap: space.s2 },
  eyebrow: { color: colors.gold700 },
  backLink: { minHeight: 40, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: space.s2, paddingRight: space.s3, marginTop: -space.s3, marginBottom: -space.s2 },
  backPressed: { opacity: 0.65 },
});
