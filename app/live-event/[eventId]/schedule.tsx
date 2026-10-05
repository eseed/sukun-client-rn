import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import type { ScheduleBlock } from '../../../src/api/types';
import { ScheduleAgenda } from '../../../src/components/live-event/schedule-agenda';
import { scheduleScreenContent } from '../../../src/components/live-event/schedule-screen-layout';
import { Screen, Text } from '../../../src/components/ui';
import { useEvent, useMySchedule, usePublicEventSchedule, useRemoveScheduleBlock, useSaveScheduleBlock } from '../../../src/hooks/queries';
import { messageForError } from '../../../src/lib/errors';
import { track } from '../../../src/lib/analytics';

export default function LiveScheduleScreen() {
  const params = useLocalSearchParams<{ eventId: string }>();
  const eventId = Array.isArray(params.eventId) ? params.eventId[0] : params.eventId;
  const router = useRouter();
  const eventQuery = useEvent(eventId);
  const schedule = usePublicEventSchedule(eventQuery.data?.slug);
  const mine = useMySchedule(eventId);
  const save = useSaveScheduleBlock();
  const remove = useRemoveScheduleBlock();
  const [notice, setNotice] = useState('');

  useEffect(() => { track('live_schedule_opened', { event_id: eventId }); }, [eventId]);
  const savedIds = useMemo(() => new Set((mine.data?.blocks ?? []).map((block) => block.id)), [mine.data?.blocks]);

  const toggleSaved = async (block: ScheduleBlock) => {
    setNotice('');
    try {
      if (savedIds.has(block.id)) {
        await remove.mutateAsync({ eventId, blockId: block.id });
        track('live_schedule_session_removed', { event_id: eventId, block_id: block.id });
        setNotice(`${block.title} removed from My Schedule.`);
      } else {
        const result = await save.mutateAsync({ eventId, blockId: block.id });
        track('live_schedule_session_saved', { event_id: eventId, block_id: block.id, conflict_count: result.conflicts.length });
        if (result.conflicts.length) track('live_schedule_conflict_shown', { event_id: eventId, block_id: block.id });
        setNotice(result.conflicts.length
          ? `${block.title} is saved. It overlaps with ${result.conflicts.map((item) => item.title).join(', ')}.`
          : `${block.title} added to My Schedule.`);
      }
    } catch (error) {
      setNotice(messageForError(error));
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
    <Screen scroll edges={{ bottom: false }} contentStyle={scheduleScreenContent}>
      <Text variant="titleMd" accessibilityRole="header">Full Schedule</Text>
      <Text variant="bodyMuted">Explore all sessions, workshops, and experiences by day, stage, or practice type.</Text>
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
        notice={notice}
        personalScheduleError={mine.isError}
        onOpenSession={(block) => router.push(`/live-event/${eventId}/session/${block.id}` as never)}
        onToggleSaved={(block) => { void toggleSaved(block); }}
      />
    </Screen>
  );
}
