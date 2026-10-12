import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { ScheduleDay } from '../../api/types';
import { useMySchedule, usePublicEventSchedule, useRemoveScheduleBlock } from '../../hooks/queries';
import { useNow } from '../../hooks/useNow';
import { track } from '../../lib/analytics';
import { messageForError } from '../../lib/errors';
import { formatWeekdayDate } from '../../lib/format';
import { space } from '../../theme/tokens';
import { Button } from '../ui/Button';
import { ResourceState } from '../ui/ResourceState';
import { Text } from '../ui/Text';
import { ScheduleDayHeading } from './schedule-agenda';
import { ScheduleDayTrack } from './schedule-filters';
import {
  buildTimetable,
  dayTitle,
  defaultCalendarDay,
  groupByDay,
  isHappeningNow,
  sessionCount,
  stageColors,
} from './schedule-model';
import { ScheduleNotice, type ScheduleNoticeState } from './schedule-notice';
import { ScheduleSessionCard } from './schedule-session-card';
import { ScheduleTimetable } from './schedule-timetable';
import { ScheduleViewSwitcher, type ScheduleViewMode } from './schedule-view-switcher';

/**
 * A ticket holder's saved sessions, as a list by day or a calendar of one day, with the way
 * back to the full schedule. The LIVE flow and the event page (before the event is live) both
 * show it; each brings its own heading and says where a session and the full schedule open.
 */
export function MyScheduleView({
  eventId,
  eventSlug,
  bleed,
  onOpenSession,
  onBrowseSchedule,
}: {
  eventId: string | undefined;
  eventSlug: string | undefined;
  /** The screen's horizontal padding, which the calendar's timetable runs out over. */
  bleed: number;
  onOpenSession: (blockId: string) => void;
  onBrowseSchedule: () => void;
}) {
  const publicSchedule = usePublicEventSchedule(eventSlug);
  const query = useMySchedule(eventId);
  const remove = useRemoveScheduleBlock();
  const now = useNow();
  const [notice, setNotice] = useState<ScheduleNoticeState>(null);
  const [viewMode, setViewMode] = useState<ScheduleViewMode>('list');
  const [requestedDayId, setRequestedDayId] = useState<string | null>(null);

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

  const removeBlock = async (blockId: string, title: string) => {
    if (!eventId) return;
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
    <>
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
              bleed={bleed}
              onOpenSession={(block) => onOpenSession(block.id)}
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
                    onPress={() => onOpenSession(block.id)}
                    onToggleSaved={() => void removeBlock(block.id, block.title)}
                  />
                ))}
              </View>
            </View>
          ))}
        </View>}
      </ResourceState>
      <Button label="Browse Full Schedule" variant="secondary" onPress={onBrowseSchedule} />
    </>
  );
}

const styles = StyleSheet.create({
  calendar: { gap: space.s5 },
  list: { gap: space.s6 },
  sessions: { gap: space.s3 },
  empty: { paddingVertical: space.s5, textAlign: 'center' },
});
