import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { MyScheduleBlock, ScheduleDay } from '../../../src/api/types';
import { Button, ResourceState, Screen, Text } from '../../../src/components/ui';
import { ScheduleSessionCard } from '../../../src/components/live-event/schedule-session-card';
import { ScheduleNotice, type ScheduleNoticeState } from '../../../src/components/live-event/schedule-notice';
import { ScheduleCalendar } from '../../../src/components/live-event/schedule-calendar';
import { ScheduleViewSwitcher, type ScheduleViewMode } from '../../../src/components/live-event/schedule-view-switcher';
import { scheduleStageAccents } from '../../../src/components/live-event/schedule-stage-accent';
import { liveScheduleContent } from '../../../src/components/live-event/schedule-screen-layout';
import { useEvent, useMySchedule, usePublicEventSchedule, useRemoveScheduleBlock } from '../../../src/hooks/queries';
import { messageForError } from '../../../src/lib/errors';
import { track } from '../../../src/lib/analytics';
import { space } from '../../../src/theme/tokens';

export default function MyScheduleScreen() {
  const params = useLocalSearchParams<{ eventId: string }>();
  const eventId = Array.isArray(params.eventId) ? params.eventId[0] : params.eventId;
  const router = useRouter();
  const event = useEvent(eventId);
  const publicSchedule = usePublicEventSchedule(event.data?.slug);
  const query = useMySchedule(eventId);
  const remove = useRemoveScheduleBlock();
  const [notice, setNotice] = useState<ScheduleNoticeState>(null);
  const [viewMode, setViewMode] = useState<ScheduleViewMode>('list');
  useEffect(() => { track('live_my_schedule_opened', { event_id: eventId }); }, [eventId]);

  const byDay = useMemo(() => {
    const groups = new Map<string, MyScheduleBlock[]>();
    for (const block of query.data?.blocks ?? []) {
      const dayBlocks = groups.get(block.eventDayId);
      if (dayBlocks) dayBlocks.push(block);
      else groups.set(block.eventDayId, [block]);
    }
    return [...groups.entries()];
  }, [query.data?.blocks]);
  const days = useMemo(() => {
    const result = new Map<string, ScheduleDay>();
    for (const block of query.data?.blocks ?? []) result.set(block.eventDayId, block.eventDay);
    return publicSchedule.data?.days ?? [...result.values()].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  }, [publicSchedule.data?.days, query.data?.blocks]);
  const stageAccents = useMemo(() => scheduleStageAccents(publicSchedule.data?.stages ?? []), [publicSchedule.data?.stages]);

  const openSession = (blockId: string) => {
    if (!eventId) return;
    router.push(`/live-event/${eventId}/session/${blockId}`);
  };

  const goSchedule = () => {
    if (!eventId) return;
    router.push(`/live-event/${eventId}/schedule`);
  };

  const removeBlock = async (blockId: string, title: string) => {
    setNotice(null);
    try {
      await remove.mutateAsync({ eventId, blockId });
      track('live_schedule_session_removed', { event_id: eventId, block_id: blockId });
      setNotice({ message: `${title} removed from My Schedule.`, conflicted: false });
    } catch (error) {
      setNotice({ message: messageForError(error), conflicted: false });
    }
  };

  return (
    <Screen scroll edges={{ bottom: false }} contentStyle={liveScheduleContent}>
      {/* Same Screen gap quirk as LIVE home: sections stack here. */}
      <View style={styles.stack}>
      <Text variant="titleMd" accessibilityRole="header">My Schedule</Text>
      <Text variant="bodyMuted">Your saved sessions for this Event.</Text>
      <ScheduleViewSwitcher value={viewMode} onChange={setViewMode} />
      {notice ? <ScheduleNotice message={notice.message} onDismiss={() => setNotice(null)} /> : null}
      <ResourceState
        status={query.isLoading ? 'loading' : query.isError ? 'error' : query.data?.blocks.length ? 'success' : 'empty'}
        loadingLabel="Loading your saved sessions..."
        errorMessage="We couldn't load your saved sessions."
        onRetry={() => void query.refetch()}
        emptyTitle="Build your day"
        emptyMessage="Save sessions from the Full Schedule and they will appear here."
      >
        {viewMode === 'calendar' ? <ScheduleCalendar
          days={days}
          blocks={query.data?.blocks ?? []}
          stages={publicSchedule.data?.stages}
          personal
          pending={remove.isPending}
          onOpenSession={(block) => openSession(block.id)}
          onToggleSaved={(block) => { void removeBlock(block.id, block.title); }}
        /> : <View style={styles.list}>
          {byDay.map(([dayId, blocks]) => (
            <View key={dayId} style={styles.dayGroup}>
              <View style={styles.dayHeading}>
                <Text variant="titleSm" style={styles.dayTitle}>{blocks[0]?.eventDay.label ?? blocks[0]?.eventDay.date}</Text>
                <Text variant="fieldLabel" style={styles.date}>{blocks[0]?.eventDay.date}</Text>
              </View>
              {blocks.map((block) => (
                <ScheduleSessionCard
                  key={block.id}
                  block={block}
                  saved
                  pending={remove.isPending}
                  stageAccent={stageAccents.get(block.stageId)}
                  conflicts={block.conflicts}
                  compactSave
                  onPress={() => openSession(block.id)}
                  onToggleSaved={() => void removeBlock(block.id, block.title)}
                />
              ))}
            </View>
          ))}
        </View>}
      </ResourceState>
      <Button label="Browse Full Schedule" variant="secondary" onPress={goSchedule} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.s4 },
  list: { gap: space.s6 },
  dayGroup: { gap: space.s4 },
  dayHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.s2 },
  dayTitle: { flex: 1 },
  date: { fontSize: 10, textAlign: 'right' },
});
