import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import type { ScheduleBlock } from '../../../src/api/types';
import { ScheduleAgenda } from '../../../src/components/live-event/schedule-agenda';
import { ScheduleNotice, ScheduleSaveSheet } from '../../../src/components/live-event/schedule-notice';
import { LiveEventBadge } from '../../../src/components/live-event/live-event-shell';
import { liveScheduleContent } from '../../../src/components/live-event/schedule-screen-layout';
import { Screen, Text } from '../../../src/components/ui';
import { useEvent, usePublicEventSchedule } from '../../../src/hooks/queries';
import { useScheduleSaving } from '../../../src/hooks/useScheduleSaving';
import { track } from '../../../src/lib/analytics';
import { colors, fontFamily, fontSize, space } from '../../../src/theme/tokens';

export default function LiveScheduleScreen() {
  const params = useLocalSearchParams<{ eventId: string }>();
  const eventId = Array.isArray(params.eventId) ? params.eventId[0] : params.eventId;
  const router = useRouter();
  const eventQuery = useEvent(eventId);
  const schedule = usePublicEventSchedule(eventQuery.data?.slug);
  const saving = useScheduleSaving(eventId, schedule.data?.blocks);

  useEffect(() => { track('live_schedule_opened', { event_id: eventId }); }, [eventId]);

  const openSession = (block: ScheduleBlock) => {
    if (!eventId) return;
    router.push(`/live-event/${eventId}/session/${block.id}`);
  };

  const status = eventQuery.isPending
    ? 'loading'
    : eventQuery.isError || schedule.isError
      ? 'error'
      : schedule.isPending
        ? 'loading'
        : 'ready';

  return (
    <Screen scroll edges={{ bottom: false }} contentStyle={liveScheduleContent}>
      {/* Screen 03 identity row: event title with its LIVE pill, ahead of the schedule. */}
      <View style={styles.stack}>
      {eventQuery.data ? (
        <View style={styles.titleRow}>
          <Text style={styles.title}>{eventQuery.data.title}</Text>
          <LiveEventBadge />
        </View>
      ) : null}
      {saving.notice ? <ScheduleNotice message={saving.notice.message} onDismiss={saving.dismissNotice} /> : null}
      {saving.saveSheet ? <ScheduleSaveSheet
        title={saving.saveSheet.title}
        conflicts={saving.saveSheet.conflicts}
        onClose={saving.closeSaveSheet}
      /> : null}
      <ScheduleAgenda
        key={eventId}
        eventId={eventId}
        schedule={schedule.data}
        status={status}
        bleed={space.s4}
        onRetry={() => {
          void eventQuery.refetch();
          if (eventQuery.data?.slug) void schedule.refetch();
        }}
        savedIds={saving.savedIds}
        pending={saving.pending}
        personalScheduleError={saving.mine.isError}
        onOpenSession={openSession}
        onToggleSaved={saving.toggle}
      />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.s4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.s3 },
  title: { flex: 1, minWidth: 0, fontFamily: fontFamily.bodyMedium, fontSize: fontSize.displayMd, color: colors.textPrimary },
});
