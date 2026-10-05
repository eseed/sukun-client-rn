import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { ScheduleBlock } from '../../../src/api/types';
import { ResourceState, Screen, Tag, Text } from '../../../src/components/ui';
import { ScheduleSessionCard } from '../../../src/components/live-event/schedule-session-card';
import { useEvent, useMySchedule, usePublicEventSchedule, useRemoveScheduleBlock, useSaveScheduleBlock } from '../../../src/hooks/queries';
import { messageForError } from '../../../src/lib/errors';
import { track } from '../../../src/lib/analytics';
import { colors, space } from '../../../src/theme/tokens';

export default function LiveScheduleScreen() {
  const params = useLocalSearchParams<{ eventId: string }>();
  const eventId = Array.isArray(params.eventId) ? params.eventId[0] : params.eventId;
  const router = useRouter();
  const eventQuery = useEvent(eventId);
  const schedule = usePublicEventSchedule(eventQuery.data?.slug);
  const mine = useMySchedule(eventId);
  const save = useSaveScheduleBlock();
  const remove = useRemoveScheduleBlock();
  const [dayId, setDayId] = useState<string | null>(null);
  const [stageId, setStageId] = useState<string | null>(null);
  const [practiceTypeId, setPracticeTypeId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => { track('live_schedule_opened', { event_id: eventId }); }, [eventId]);
  const activeDayId = schedule.data?.days.some((day) => day.id === dayId)
    ? dayId
    : schedule.data?.days[0]?.id ?? null;

  const savedIds = useMemo(() => new Set((mine.data?.blocks ?? []).map((block) => block.id)), [mine.data?.blocks]);
  const filtered = useMemo(() => (schedule.data?.blocks ?? [])
    .filter((block) => !activeDayId || block.eventDayId === activeDayId)
    .filter((block) => !stageId || block.stageId === stageId)
    .filter((block) => !practiceTypeId || block.practiceTypeId === practiceTypeId)
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt)),
  [activeDayId, practiceTypeId, schedule.data?.blocks, stageId]);
  const byDay = useMemo(() => {
    const result = new Map<string, ScheduleBlock[]>();
    for (const block of filtered) {
      const dayBlocks = result.get(block.eventDayId);
      if (dayBlocks) dayBlocks.push(block);
      else result.set(block.eventDayId, [block]);
    }
    return result;
  }, [filtered]);

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

  const changeFilter = (filter: 'day' | 'stage' | 'practice', value: string | null, update: (next: string | null) => void) => {
    update(value);
    track('live_schedule_filter_changed', {
      event_id: eventId,
      filter,
      ...(filter === 'day' && value ? { event_day_id: value } : {}),
      ...(filter === 'stage' && value ? { stage_id: value } : {}),
      ...(filter === 'practice' && value ? { practice_type_id: value } : {}),
    });
  };

  const status = eventQuery.isLoading || schedule.isLoading ? 'loading' : eventQuery.isError || schedule.isError ? 'error' : filtered.length === 0 ? 'empty' : 'success';
  return (
    <Screen scroll edges={{ bottom: false }} contentStyle={styles.content}>
      <Text variant="titleMd" accessibilityRole="header">Full Schedule</Text>
      <Text variant="bodyMuted">Browse sessions by day, stage, or practice type.</Text>

      {schedule.data?.days.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {schedule.data.days.map((day) => <Tag key={day.id} label={day.label ?? day.date} selected={day.id === activeDayId} onPress={() => changeFilter('day', day.id, setDayId)} />)}
      </ScrollView> : null}

      {schedule.data?.stages.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Tag label="All stages" selected={stageId === null} onPress={() => changeFilter('stage', null, setStageId)} />
        {schedule.data.stages.map((stage) => <Tag key={stage.id} label={stage.name} selected={stage.id === stageId} onPress={() => changeFilter('stage', stage.id, setStageId)} />)}
      </ScrollView> : null}

      {schedule.data?.practiceTypes.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Tag label="All practices" selected={practiceTypeId === null} onPress={() => changeFilter('practice', null, setPracticeTypeId)} />
        {schedule.data.practiceTypes.map((practice) => <Tag key={practice.id} label={practice.name} selected={practice.id === practiceTypeId} onPress={() => changeFilter('practice', practice.id, setPracticeTypeId)} />)}
      </ScrollView> : null}

      {notice ? <View accessibilityRole="alert" style={styles.notice}><Text variant="bodyValue">{notice}</Text></View> : null}
      {mine.isError ? <Text variant="bodyMuted">Your saved sessions could not be loaded. You can still browse the public schedule.</Text> : null}
      <ResourceState
        status={status}
        loadingLabel="Loading the schedule..."
        errorMessage="We couldn't load this Event's schedule."
        onRetry={() => { void eventQuery.refetch(); void schedule.refetch(); }}
        emptyTitle={schedule.data?.blocks.length ? 'No sessions match these filters' : 'No sessions published yet'}
        emptyMessage={schedule.data?.blocks.length ? 'Choose another day or clear a filter to see more sessions.' : 'Please check again later.'}
      >
        <View style={styles.list}>
          {[...byDay.entries()].map(([key, blocks]) => (
            <View key={key} style={styles.dayGroup}>
              <Text variant="titleSm">{blocks[0]?.eventDay.label ?? blocks[0]?.eventDay.date}</Text>
              {blocks.map((block) => (
                <ScheduleSessionCard
                  key={block.id}
                  block={block}
                  saved={savedIds.has(block.id)}
                  pending={save.isPending || remove.isPending || mine.isLoading}
                  onPress={() => {
                    router.push(`/live-event/${eventId}/session/${block.id}` as never);
                  }}
                  onToggleSaved={() => void toggleSaved(block)}
                />
              ))}
            </View>
          ))}
        </View>
      </ResourceState>
      <Text variant="bodyMuted" style={styles.note}>Sessions may run at the same time. Saving a conflict is allowed; the schedule will identify the overlap.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.s4, paddingTop: space.s4, gap: space.s3 },
  chips: { gap: space.s2, paddingVertical: space.s1 },
  list: { gap: space.s4 },
  dayGroup: { gap: space.s2 },
  notice: { padding: space.s3, backgroundColor: colors.gold100, borderRadius: 4 },
  note: { color: colors.textMuted },
});
