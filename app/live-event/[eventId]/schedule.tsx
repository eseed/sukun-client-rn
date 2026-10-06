import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { ScheduleBlock } from '../../../src/api/types';
import { ScheduleAgenda } from '../../../src/components/live-event/schedule-agenda';
import { ScheduleNotice, ScheduleSaveSheet, type SaveConflict, type ScheduleNoticeState } from '../../../src/components/live-event/schedule-notice';
import { LiveEventBadge } from '../../../src/components/live-event/live-event-shell';
import { liveScheduleContent } from '../../../src/components/live-event/schedule-screen-layout';
import { Screen, Text } from '../../../src/components/ui';
import { useEvent, useMySchedule, usePublicEventSchedule, useRemoveScheduleBlock, useSaveScheduleBlock } from '../../../src/hooks/queries';
import { messageForError } from '../../../src/lib/errors';
import { track } from '../../../src/lib/analytics';
import { colors, fontFamily, fontSize, space } from '../../../src/theme/tokens';

export default function LiveScheduleScreen() {
  const params = useLocalSearchParams<{ eventId: string }>();
  const eventId = Array.isArray(params.eventId) ? params.eventId[0] : params.eventId;
  const router = useRouter();
  const eventQuery = useEvent(eventId);
  const schedule = usePublicEventSchedule(eventQuery.data?.slug);
  const mine = useMySchedule(eventId);
  const save = useSaveScheduleBlock();
  const remove = useRemoveScheduleBlock();
  const [notice, setNotice] = useState<ScheduleNoticeState>(null);
  const [saveSheet, setSaveSheet] = useState<{ title: string; conflicts: SaveConflict[] } | null>(null);

  useEffect(() => { track('live_schedule_opened', { event_id: eventId }); }, [eventId]);
  const savedIds = useMemo(() => new Set((mine.data?.blocks ?? []).map((block) => block.id)), [mine.data?.blocks]);

  const openSession = (block: ScheduleBlock) => {
    if (!eventId) return;
    router.push(`/live-event/${eventId}/session/${block.id}`);
  };

  const openMySchedule = () => {
    if (!eventId) return;
    router.push(`/live-event/${eventId}/my-schedule`);
  };

  const toggleSaved = async (block: ScheduleBlock) => {
    setNotice(null);
    setSaveSheet(null);
    try {
      if (savedIds.has(block.id)) {
        await remove.mutateAsync({ eventId, blockId: block.id });
        track('live_schedule_session_removed', { event_id: eventId, block_id: block.id });
        setSaveSheet({ title: 'Removed from My Schedule', conflicts: [] });
      } else {
        const result = await save.mutateAsync({ eventId, blockId: block.id });
        track('live_schedule_session_saved', { event_id: eventId, block_id: block.id, conflict_count: result.conflicts.length });
        if (result.conflicts.length) track('live_schedule_conflict_shown', { event_id: eventId, block_id: block.id });
        setSaveSheet({
          title: 'Added to My Schedule',
          conflicts: result.conflicts.map((conflict) => ({
            title: conflict.title,
            startAt: conflict.startAt,
            endAt: conflict.endAt,
            stage: schedule.data?.blocks.find((item) => item.id === conflict.blockId)?.stage.name ?? null,
          })),
        });
      }
    } catch (error) {
      setNotice({ message: messageForError(error), conflicted: false });
    }
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
      {/* Screen 03 identity row: event title with its LIVE pill, ahead of the day pills. */}
      <View style={styles.stack}>
      {eventQuery.data ? (
        <View style={styles.titleRow}>
          <Text style={styles.title}>{eventQuery.data.title}</Text>
          <LiveEventBadge />
        </View>
      ) : null}
      {notice ? <ScheduleNotice
        message={notice.message}
        onDismiss={() => setNotice(null)}
        onViewSchedule={notice.conflicted ? openMySchedule : undefined}
      /> : null}
      {saveSheet ? <ScheduleSaveSheet
        title={saveSheet.title}
        conflicts={saveSheet.conflicts}
        onClose={() => setSaveSheet(null)}
      /> : null}
      <ScheduleAgenda
        key={eventId}
        eventId={eventId}
        schedule={schedule.data}
        status={status}
        onRetry={() => {
          void eventQuery.refetch();
          if (eventQuery.data?.slug) void schedule.refetch();
        }}
        savedIds={savedIds}
        pending={save.isPending || remove.isPending || mine.isLoading}
        personalScheduleError={mine.isError}
        onOpenSession={openSession}
        onToggleSaved={(block) => { void toggleSaved(block); }}
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
