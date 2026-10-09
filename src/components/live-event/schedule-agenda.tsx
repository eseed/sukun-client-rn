import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { PublicEventSchedule, ScheduleBlock, ScheduleDay, SchedulePracticeType, ScheduleStage } from '../../api/types';
import { useNow } from '../../hooks/useNow';
import { track } from '../../lib/analytics';
import { formatWeekdayDate } from '../../lib/format';
import { colors, fontFamily, fontSize, radius, space, tracking } from '../../theme/tokens';
import { ResourceState, Text } from '../ui';
import { ScheduleDayTrack, ScheduleFilterControls } from './schedule-filters';
import {
  buildTimetable,
  dayTitle,
  defaultCalendarDay,
  filterBlocks,
  groupByDay,
  isHappeningNow,
  sessionCount,
  stageColors,
} from './schedule-model';
import { ScheduleSessionCard } from './schedule-session-card';
import { ScheduleTimetable } from './schedule-timetable';
import { ScheduleViewSwitcher, type ScheduleViewMode } from './schedule-view-switcher';

const EMPTY_SAVED_IDS: ReadonlySet<string> = new Set();
const EMPTY_BLOCKS: ScheduleBlock[] = [];
const EMPTY_DAYS: ScheduleDay[] = [];
const EMPTY_STAGES: ScheduleStage[] = [];
const EMPTY_PRACTICES: SchedulePracticeType[] = [];

/**
 * An event's schedule, built as the website builds it (sukun-client-web EventSchedulePage):
 * the day track, the search, the colour-keyed stage chips and the practice chips, then List or
 * Calendar. The list shows each day's sessions as cards under a "Doors open" heading; the
 * calendar shows one day as a timetable of stages, and is where the schedule opens. Every stage
 * has its own colour, carried by its chip, its sessions' rails and tags, and its calendar
 * column, so the colours read as a key.
 *
 * A ticket holder also saves sessions to My Schedule from the cards (`onToggleSaved`).
 */
export function ScheduleAgenda({
  eventId,
  schedule,
  status,
  onRetry,
  bleed = 0,
  savedIds = EMPTY_SAVED_IDS,
  pending = false,
  personalScheduleError = false,
  initialView = 'calendar',
  analyticsScope = 'live',
  onOpenSession,
  onToggleSaved,
}: {
  eventId: string;
  schedule: PublicEventSchedule | undefined;
  status: 'loading' | 'error' | 'ready';
  onRetry: () => void;
  /** The screen's side padding, which the calendar's stages run on into. */
  bleed?: number;
  savedIds?: ReadonlySet<string>;
  pending?: boolean;
  personalScheduleError?: boolean;
  initialView?: ScheduleViewMode;
  analyticsScope?: 'live' | 'public';
  onOpenSession: (block: ScheduleBlock, view: ScheduleViewMode) => void;
  onToggleSaved?: (block: ScheduleBlock) => void;
}) {
  const [view, setView] = useState<ScheduleViewMode>(initialView);
  const [requestedDayId, setRequestedDayId] = useState<string | null>(null);
  const [stageIds, setStageIds] = useState<ReadonlySet<string>>(() => new Set());
  const [practiceIds, setPracticeIds] = useState<ReadonlySet<string>>(() => new Set());
  const [query, setQuery] = useState('');
  const now = useNow();

  const days = schedule?.days ?? EMPTY_DAYS;
  const stages = schedule?.stages ?? EMPTY_STAGES;
  const practices = schedule?.practiceTypes ?? EMPTY_PRACTICES;
  const blocks = schedule?.blocks ?? EMPTY_BLOCKS;
  const colorsByStage = useMemo(() => stageColors(stages), [stages]);
  const requestedDay = days.find((day) => day.id === requestedDayId) ?? null;
  const eventName = analyticsScope === 'live' ? 'live_schedule_filter_changed' : 'event_schedule_filter_changed';

  // Every day's sessions that pass the stage, practice and search filters.
  const matching = useMemo(
    () => filterBlocks(blocks, stages, { dayId: null, stageIds, practiceIds, query }),
    [blocks, practiceIds, query, stageIds, stages],
  );
  const listed = useMemo(
    () => (requestedDay ? matching.filter((block) => block.eventDayId === requestedDay.id) : matching),
    [matching, requestedDay],
  );
  const dayGroups = useMemo(() => groupByDay(days, listed), [days, listed]);
  const calendarDay = requestedDay ?? defaultCalendarDay(days, matching, now);
  const calendarIndex = calendarDay ? days.findIndex((day) => day.id === calendarDay.id) : -1;
  const timetable = useMemo(
    () => (calendarDay ? buildTimetable(calendarDay.id, matching, stages) : null),
    [calendarDay, matching, stages],
  );
  const shownCount = view === 'list'
    ? listed.length
    : timetable ? timetable.columns.reduce((total, column) => total + column.items.length, 0) : 0;
  const filtered =
    stageIds.size > 0 ||
    practiceIds.size > 0 ||
    query.trim() !== '' ||
    (view === 'list' && requestedDay !== null);

  const changeDay = (dayId: string | null) => {
    setRequestedDayId(dayId);
    track(eventName, {
      event_id: eventId,
      filter: 'day',
      ...(dayId ? { event_day_id: dayId } : {}),
      action: dayId === null ? 'clear' : 'add',
    });
  };

  const toggle = (filter: 'stage' | 'practice', id: string | null) => {
    const current = filter === 'stage' ? stageIds : practiceIds;
    const next = new Set(current);
    if (id === null) next.clear();
    else if (next.has(id)) next.delete(id);
    else next.add(id);
    if (filter === 'stage') setStageIds(next);
    else setPracticeIds(next);
    track(eventName, {
      event_id: eventId,
      filter,
      ...(filter === 'stage' && id ? { stage_id: id } : {}),
      ...(filter === 'practice' && id ? { practice_type_id: id } : {}),
      action: id === null ? 'clear' : current.has(id) ? 'remove' : 'add',
    });
  };

  const clearFilters = () => {
    setQuery('');
    setRequestedDayId(null);
    setStageIds(new Set());
    setPracticeIds(new Set());
  };

  const card = (block: ScheduleBlock) => (
    <ScheduleSessionCard
      key={block.id}
      block={block}
      color={colorsByStage.get(block.stageId)}
      live={isHappeningNow(block, now)}
      saved={savedIds.has(block.id)}
      pending={pending}
      onPress={() => onOpenSession(block, 'list')}
      onToggleSaved={onToggleSaved ? () => onToggleSaved(block) : undefined}
    />
  );

  const resourceStatus = status === 'ready' ? (blocks.length ? 'success' : 'empty') : status;

  return (
    <ResourceState
      status={resourceStatus}
      loadingLabel="Loading the schedule..."
      errorMessage="We couldn't load this Event's schedule."
      onRetry={onRetry}
      emptyTitle="No sessions published yet"
      emptyMessage="Please check again later."
    >
      <View style={styles.layout}>
        <View style={styles.filters}>
          <ScheduleDayTrack
            days={days}
            dayId={view === 'calendar' ? (calendarDay?.id ?? null) : requestedDayId}
            allowAllDays={view === 'list'}
            onChange={changeDay}
          />
          <ScheduleFilterControls
            query={query}
            onQueryChange={setQuery}
            stages={stages}
            colors={colorsByStage}
            stageIds={stageIds}
            onToggleStage={(id) => toggle('stage', id)}
            onClearStages={() => toggle('stage', null)}
            practices={practices}
            practiceIds={practiceIds}
            onTogglePractice={(id) => toggle('practice', id)}
            onClearPractices={() => toggle('practice', null)}
          />
        </View>

        <View style={styles.main}>
          <View style={styles.toolbar}>
            <ScheduleViewSwitcher value={view} onChange={setView} />
            <View style={styles.countRow}>
              <Text accessibilityLiveRegion="polite" style={styles.count}>
                {sessionCount(shownCount)}
                {view === 'list' && filtered ? ` of ${blocks.length}` : ''}
              </Text>
              {filtered ? (
                <Pressable accessibilityRole="button" onPress={clearFilters} hitSlop={8}>
                  <Text style={styles.clear}>Clear filters</Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          {personalScheduleError ? (
            <Text variant="bodyMuted">Your saved sessions could not be loaded. You can still browse the schedule.</Text>
          ) : null}

          {shownCount === 0 ? (
            <View style={styles.noMatch}>
              <Text variant="titleSm" style={styles.noMatchTitle}>No sessions match these filters</Text>
              <Text variant="bodyMuted" style={styles.centered}>Try another search, day, or filter to see more sessions.</Text>
              <Pressable
                accessibilityRole="button"
                onPress={clearFilters}
                style={({ pressed }) => [styles.noMatchButton, pressed && styles.pressed]}
              >
                <Text style={styles.noMatchLabel}>Clear filters</Text>
              </Pressable>
            </View>
          ) : view === 'list' ? (
            <View style={styles.dayGroups}>
              {dayGroups.map((group) => (
                <View key={group.day.id}>
                  <ScheduleDayHeading
                    title={dayTitle(group.day, group.index)}
                    meta={`${formatWeekdayDate(group.day.dayDate)} · ${sessionCount(group.blocks.length)}`}
                  />
                  <View style={styles.sessions}>{group.blocks.map(card)}</View>
                </View>
              ))}
            </View>
          ) : calendarDay && timetable ? (
            <View>
              <ScheduleDayHeading
                title={dayTitle(calendarDay, Math.max(0, calendarIndex))}
                meta={formatWeekdayDate(calendarDay.dayDate)}
                calendar
              />
              <ScheduleTimetable
                timetable={timetable}
                now={now}
                bleed={bleed}
                onOpenSession={(block) => onOpenSession(block, 'calendar')}
              />
            </View>
          ) : null}

          {onToggleSaved ? (
            <Text variant="bodyMuted">Sessions may run at the same time. Saving a conflict is allowed; the schedule will identify the overlap.</Text>
          ) : null}
        </View>
      </View>
    </ResourceState>
  );
}

/** A day's name with its doors-open time, and its date (and, in the list, its count). */
export function ScheduleDayHeading({ title, meta, calendar = false }: { title: string; meta: string; calendar?: boolean }) {
  return (
    <View style={[styles.dayHeading, calendar && styles.dayHeadingCalendar]}>
      <Text variant="titleSm" accessibilityRole="header" style={styles.dayTitle}>{title}</Text>
      <Text variant="fieldLabel">{meta}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  layout: { width: '100%', gap: space.s5 },
  filters: { gap: space.s3 },
  main: { gap: space.s5 },
  toolbar: { gap: space.s2 },
  countRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space.s3, rowGap: space.s2, minHeight: 32 },
  count: { fontFamily: fontFamily.body, fontSize: fontSize.bodySm, color: colors.textPrimary },
  clear: { fontFamily: fontFamily.body, fontSize: fontSize.bodySm, color: colors.textMuted, textDecorationLine: 'underline' },
  dayGroups: { gap: space.s6 },
  dayHeading: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    columnGap: space.s3,
    rowGap: space.s1,
    paddingVertical: space.s3,
  },
  dayHeadingCalendar: { paddingTop: 0 },
  // The italic leans past its box; keep the last letter clear of the date.
  dayTitle: { flexShrink: 1, paddingRight: 4 },
  sessions: { gap: space.s3 },
  noMatch: {
    alignItems: 'center',
    gap: space.s2,
    paddingVertical: space.s7,
    paddingHorizontal: space.s5,
    borderRadius: radius.card,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderDefault,
  },
  noMatchTitle: { textAlign: 'center' },
  centered: { textAlign: 'center' },
  noMatchButton: {
    marginTop: space.s3,
    paddingVertical: 9,
    paddingHorizontal: 18,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
  },
  noMatchLabel: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: fontSize.label,
    letterSpacing: tracking.wide(fontSize.label),
    textTransform: 'uppercase',
    color: colors.textPrimary,
  },
  pressed: { opacity: 0.85 },
});
