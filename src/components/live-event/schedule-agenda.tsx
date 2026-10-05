import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { PublicEventSchedule, ScheduleBlock, ScheduleDay } from '../../api/types';
import { ResourceState, Text } from '../ui';
import { ScheduleSessionCard } from './schedule-session-card';
import { ScheduleFilters } from './schedule-filters';
import { ScheduleCalendar } from './schedule-calendar';
import { ScheduleViewSwitcher, type ScheduleViewMode } from './schedule-view-switcher';
import { scheduleStageAccents } from './schedule-stage-accent';
import { track } from '../../lib/analytics';
import { colors, space } from '../../theme/tokens';

const EMPTY_SAVED_IDS: ReadonlySet<string> = new Set();
const EMPTY_DAYS: ScheduleDay[] = [];
const EMPTY_IDS: string[] = [];

export function ScheduleAgenda({
  eventId,
  schedule,
  status,
  onRetry,
  savedIds = EMPTY_SAVED_IDS,
  pending = false,
  notice,
  personalScheduleError = false,
  defaultDay = 'current',
  initialView = 'list',
  analyticsScope = 'live',
  onOpenSession,
  onToggleSaved,
}: {
  eventId: string;
  schedule: PublicEventSchedule | undefined;
  status: 'loading' | 'error' | 'ready';
  onRetry: () => void;
  savedIds?: ReadonlySet<string>;
  pending?: boolean;
  notice?: string;
  personalScheduleError?: boolean;
  defaultDay?: 'current' | 'all';
  initialView?: ScheduleViewMode;
  analyticsScope?: 'live' | 'public';
  onOpenSession?: (block: ScheduleBlock, view: ScheduleViewMode) => void;
  onToggleSaved?: (block: ScheduleBlock) => void;
}) {
  const [dayIds, setDayIds] = useState<string[] | undefined>(undefined);
  const [stageIds, setStageIds] = useState<string[]>([]);
  const [practiceTypeIds, setPracticeTypeIds] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<ScheduleViewMode>(initialView);
  const [calendarDayId, setCalendarDayId] = useState<string | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const days = schedule?.days ?? EMPTY_DAYS;
  useEffect(() => {
    const timer = setTimeout(() => setNow(Date.now()), 0);
    return () => clearTimeout(timer);
  }, []);
  const preferredDayId = useMemo(() => {
    if (defaultDay === 'all' || days.length === 0) return null;
    if (now === null) return days[0]?.id ?? null;
    return days.find((day) => Date.parse(day.startsAt) <= now && Date.parse(day.endsAt) > now)?.id
      ?? days.find((day) => Date.parse(day.startsAt) > now)?.id
      ?? days[days.length - 1]?.id
      ?? null;
  }, [defaultDay, days, now]);
  const selectedDayIds = useMemo(() => dayIds ?? (defaultDay === 'all' || !preferredDayId ? EMPTY_IDS : [preferredDayId]), [dayIds, defaultDay, preferredDayId]);
  const validDayIds = useMemo(() => selectedDayIds.filter((id) => days.some((day) => day.id === id)), [days, selectedDayIds]);
  const selectedDaySet = useMemo(() => new Set(validDayIds), [validDayIds]);
  const selectedStageSet = useMemo(() => new Set(stageIds), [stageIds]);
  const selectedPracticeSet = useMemo(() => new Set(practiceTypeIds), [practiceTypeIds]);
  const stageAccents = useMemo(() => scheduleStageAccents(schedule?.stages ?? []), [schedule?.stages]);
  const calendarDays = useMemo(() => validDayIds.length ? days.filter((day) => selectedDaySet.has(day.id)) : days, [days, selectedDaySet, validDayIds.length]);

  const filtered = useMemo(() => (schedule?.blocks ?? [])
    .filter((block) => selectedDaySet.size === 0 || selectedDaySet.has(block.eventDayId))
    .filter((block) => selectedStageSet.size === 0 || selectedStageSet.has(block.stageId))
    .filter((block) => selectedPracticeSet.size === 0 || (block.practiceTypeId !== null && selectedPracticeSet.has(block.practiceTypeId)))
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt)),
  [schedule?.blocks, selectedDaySet, selectedPracticeSet, selectedStageSet]);

  const byDay = useMemo(() => {
    const result = new Map<string, ScheduleBlock[]>();
    for (const block of filtered) {
      const dayBlocks = result.get(block.eventDayId);
      if (dayBlocks) dayBlocks.push(block);
      else result.set(block.eventDayId, [block]);
    }
    return result;
  }, [filtered]);

  const changeFilter = (filter: 'day' | 'stage' | 'practice', value: string | null) => {
    const currentIds = filter === 'day' ? validDayIds : filter === 'stage' ? stageIds : practiceTypeIds;
    const toggle = (current: string[]) => value === null
      ? []
      : current.includes(value)
        ? current.filter((id) => id !== value)
        : [...current, value];
    if (filter === 'day') setDayIds((current) => toggle(current ?? selectedDayIds));
    else if (filter === 'stage') setStageIds(toggle);
    else setPracticeTypeIds(toggle);
    track(`${analyticsScope === 'live' ? 'live' : 'event'}_schedule_filter_changed`, {
      event_id: eventId,
      filter,
      ...(filter === 'day' && value ? { event_day_id: value } : {}),
      ...(filter === 'stage' && value ? { stage_id: value } : {}),
      ...(filter === 'practice' && value ? { practice_type_id: value } : {}),
      action: value === null ? 'clear' : currentIds.includes(value) ? 'remove' : 'add',
    });
  };

  return (
    <View style={styles.agenda}>
      <View style={styles.controls}>
        <ScheduleViewSwitcher value={viewMode} onChange={setViewMode} />
        {schedule ? <ScheduleFilters
          schedule={schedule}
          dayIds={selectedDaySet}
          stageIds={selectedStageSet}
          practiceIds={selectedPracticeSet}
          onChange={changeFilter}
        /> : null}
      </View>

      {notice ? <View accessibilityRole="alert" style={styles.notice}><Text variant="bodyValue">{notice}</Text></View> : null}
      {personalScheduleError ? <Text variant="bodyMuted">Your saved sessions could not be loaded. You can still browse the public schedule.</Text> : null}

      <ResourceState
        status={status === 'ready' ? filtered.length ? 'success' : 'empty' : status}
        loadingLabel="Loading the schedule..."
        errorMessage="We couldn't load this Event's schedule."
        onRetry={onRetry}
        emptyTitle={schedule?.blocks.length ? 'No sessions match these filters' : 'No sessions published yet'}
        emptyMessage={schedule?.blocks.length ? 'Choose another day or clear a filter to see more sessions.' : 'Please check again later.'}
      >
        {viewMode === 'calendar' && schedule ? <ScheduleCalendar
          days={calendarDays}
          blocks={filtered}
          stages={schedule.stages}
          savedIds={savedIds}
          pending={pending}
          selectedDayId={calendarDayId}
          onSelectDay={setCalendarDayId}
          onOpenSession={onOpenSession ? (block) => onOpenSession(block, 'calendar') : undefined}
          onToggleSaved={onToggleSaved}
        /> : <View style={styles.list}>
          {[...byDay.entries()].map(([key, blocks]) => (
            <View key={key} style={styles.dayGroup}>
              <View style={styles.dayHeading}>
                <Text variant="titleSm" style={styles.dayTitle}>{blocks[0]?.eventDay.label ?? blocks[0]?.eventDay.date}</Text>
                <Text variant="fieldLabel" style={styles.date}>{blocks[0]?.eventDay.date}</Text>
              </View>
              {blocks.map((block) => (
                <ScheduleSessionCard
                  key={block.id}
                  block={block}
                  saved={savedIds.has(block.id)}
                  pending={pending}
                  stageAccent={stageAccents.get(block.stageId)}
                  onPress={onOpenSession ? () => onOpenSession(block, 'list') : undefined}
                  onToggleSaved={onToggleSaved ? () => onToggleSaved(block) : undefined}
                />
              ))}
            </View>
          ))}
        </View>}
      </ResourceState>
      {schedule?.blocks.length && onToggleSaved ? <Text variant="bodyMuted" style={styles.note}>Sessions may run at the same time. Saving a conflict is allowed; the schedule will identify the overlap.</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  agenda: { width: '100%', gap: space.s5 },
  controls: { gap: space.s3 },
  list: { gap: space.s6 },
  dayGroup: { gap: space.s4 },
  dayHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.s2 },
  dayTitle: { flex: 1 },
  date: { fontSize: 10, textAlign: 'right' },
  notice: { padding: space.s3, backgroundColor: colors.gold100, borderRadius: 4 },
  note: { color: colors.textMuted },
});
