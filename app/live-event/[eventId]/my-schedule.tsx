import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { ScheduleDay } from '../../../src/api/types';
import { Button, ResourceState, Screen, Text } from '../../../src/components/ui';
import { ScheduleDayHeading } from '../../../src/components/live-event/schedule-agenda';
import { ScheduleDayTrack } from '../../../src/components/live-event/schedule-filters';
import {
  buildTimetable,
  dayTitle,
  defaultCalendarDay,
  groupByDay,
  isHappeningNow,
  sessionCount,
  stageColors,
} from '../../../src/components/live-event/schedule-model';
import { ScheduleNotice, type ScheduleNoticeState } from '../../../src/components/live-event/schedule-notice';
import { ScheduleSessionCard } from '../../../src/components/live-event/schedule-session-card';
import { ScheduleTimetable } from '../../../src/components/live-event/schedule-timetable';
import { ScheduleViewSwitcher, type ScheduleViewMode } from '../../../src/components/live-event/schedule-view-switcher';
import { liveScheduleContent } from '../../../src/components/live-event/schedule-screen-layout';
import { useEvent, useMySchedule, usePublicEventSchedule, useRemoveScheduleBlock } from '../../../src/hooks/queries';
import { useNow } from '../../../src/hooks/useNow';
import { messageForError } from '../../../src/lib/errors';
import { formatWeekdayDate } from '../../../src/lib/format';
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
  const now = useNow();
  const [notice, setNotice] = useState<ScheduleNoticeState>(null);
  const [viewMode, setViewMode] = useState<ScheduleViewMode>('list');
  const [requestedDayId, setRequestedDayId] = useState<string | null>(null);
  useEffect(() => { track('live_my_schedule_opened', { event_id: eventId }); }, [eventId]);

  const saved = useMemo(() => query.data?.blocks ?? [], [query.data?.blocks]);
  const publicDays = publicSchedule.data?.days;
  const days = useMemo<ScheduleDay[]>(() => {
    if (publicDays) return publicDays;
    const byId = new Map<string, ScheduleDay>();
    for (const block of saved) byId.set(block.eventDayId, block.eventDay);
    return [...byId.values()].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  }, [publicDays, saved]);
  const stages = useMemo(() => publicSchedule.data?.stages ?? [], [publicSchedule.data?.stages]);
  const colorsByStage = useMemo(() => stageColors(stages), [stages]);
  const dayGroups = useMemo(() => groupByDay(days, saved), [days, saved]);
  const calendarDay = days.find((day) => day.id === requestedDayId) ?? defaultCalendarDay(days, saved, now);
  const calendarIndex = calendarDay ? days.findIndex((day) => day.id === calendarDay.id) : -1;
  const timetable = useMemo(
    () => (calendarDay ? buildTimetable(calendarDay.id, saved, stages) : null),
    [calendarDay, saved, stages],
  );

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
        status={query.isLoading ? 'loading' : query.isError ? 'error' : saved.length ? 'success' : 'empty'}
        loadingLabel="Loading your saved sessions..."
        errorMessage="We couldn't load your saved sessions."
        onRetry={() => void query.refetch()}
        emptyTitle="Build your day"
        emptyMessage="Save sessions from the Full Schedule and they will appear here."
      >
        {viewMode === 'calendar' ? <View style={styles.calendar}>
          <ScheduleDayTrack days={days} dayId={calendarDay?.id ?? null} allowAllDays={false} onChange={setRequestedDayId} />
          {calendarDay ? <View>
            <ScheduleDayHeading
              title={dayTitle(calendarDay, Math.max(0, calendarIndex))}
              meta={formatWeekdayDate(calendarDay.dayDate)}
              calendar
            />
            {timetable ? <ScheduleTimetable
              timetable={timetable}
              now={now}
              bleed={space.s4}
              onOpenSession={(block) => openSession(block.id)}
            /> : <Text variant="bodyMuted" style={styles.empty}>No saved sessions for this day.</Text>}
          </View> : null}
        </View> : <View style={styles.list}>
          {dayGroups.map((group) => (
            <View key={group.day.id}>
              <ScheduleDayHeading
                title={dayTitle(group.day, group.index)}
                meta={`${formatWeekdayDate(group.day.dayDate)} · ${sessionCount(group.blocks.length)}`}
              />
              <View style={styles.sessions}>
                {group.blocks.map((block) => (
                  <ScheduleSessionCard
                    key={block.id}
                    block={block}
                    color={colorsByStage.get(block.stageId)}
                    live={isHappeningNow(block, now)}
                    saved
                    pending={remove.isPending}
                    conflicts={block.conflicts}
                    onPress={() => openSession(block.id)}
                    onToggleSaved={() => void removeBlock(block.id, block.title)}
                  />
                ))}
              </View>
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
  calendar: { gap: space.s5 },
  list: { gap: space.s6 },
  sessions: { gap: space.s3 },
  empty: { paddingVertical: space.s5, textAlign: 'center' },
});
