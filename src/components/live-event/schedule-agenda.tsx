import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import type { PublicEventSchedule, ScheduleBlock, ScheduleDay } from '../../api/types';
import { ResourceState, SearchIcon, Text } from '../ui';
import { ScheduleSessionCard } from './schedule-session-card';
import { ScheduleCalendar } from './schedule-calendar';
import { ScheduleViewSwitcher, type ScheduleViewMode } from './schedule-view-switcher';
import { scheduleStageAccents } from './schedule-stage-accent';
import { happeningNow } from '../../lib/live-event';
import { track } from '../../lib/analytics';
import { colors, fontFamily, fontSize, radius, space } from '../../theme/tokens';

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
  const [query, setQuery] = useState('');
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
  const queryText = query.trim().toLowerCase();

  const filtered = useMemo(() => (schedule?.blocks ?? [])
    .filter((block) => selectedDaySet.size === 0 || selectedDaySet.has(block.eventDayId))
    .filter((block) => selectedStageSet.size === 0 || selectedStageSet.has(block.stageId))
    .filter((block) => selectedPracticeSet.size === 0 || (block.practiceTypeId !== null && selectedPracticeSet.has(block.practiceTypeId)))
    .filter((block) => {
      if (!queryText) return true;
      return block.title.toLowerCase().includes(queryText)
        || block.stage.name.toLowerCase().includes(queryText)
        || block.facilitators.some((facilitator) => facilitator.name.toLowerCase().includes(queryText));
    })
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt)),
  [schedule?.blocks, selectedDaySet, selectedPracticeSet, selectedStageSet, queryText]);

  const liveIds = useMemo(
    () => new Set(happeningNow(filtered, now ?? 0).map((block) => block.id)),
    [filtered, now],
  );

  const changeFilter = (filter: 'day' | 'stage' | 'practice', value: string | null) => {
    // Day pills are exclusive: one day at a time, tapping the active day shows everything.
    if (filter === 'day') {
      const base = dayIds ?? (preferredDayId ? [preferredDayId] : []);
      const next = value === null || (base.length === 1 && base[0] === value) ? [] : [value as string];
      setDayIds(next);
      track(`${analyticsScope === 'live' ? 'live' : 'event'}_schedule_filter_changed`, {
        event_id: eventId,
        filter,
        ...(value ? { event_day_id: value } : {}),
        action: value === null ? 'clear' : base.includes(value) ? 'remove' : 'add',
      });
      return;
    }
    const currentIds = filter === 'stage' ? stageIds : practiceTypeIds;
    const toggle = (current: string[]) => value === null
      ? []
      : current.includes(value)
        ? current.filter((id) => id !== value)
        : [...current, value];
    if (filter === 'stage') setStageIds(toggle);
    else setPracticeTypeIds(toggle);
    track(`${analyticsScope === 'live' ? 'live' : 'event'}_schedule_filter_changed`, {
      event_id: eventId,
      filter,
      ...(filter === 'stage' && value ? { stage_id: value } : {}),
      ...(filter === 'practice' && value ? { practice_type_id: value } : {}),
      action: value === null ? 'clear' : currentIds.includes(value) ? 'remove' : 'add',
    });
  };

  return (
    <View style={styles.agenda}>
      <View style={styles.controls}>
        {schedule ? <ScheduleControls
          schedule={schedule}
          dayIds={selectedDaySet}
          stageIds={selectedStageSet}
          practiceIds={selectedPracticeSet}
          query={query}
          onQueryChange={setQuery}
          onChange={changeFilter}
        /> : null}
        <ScheduleViewSwitcher value={viewMode} onChange={setViewMode} />
      </View>

      {notice ? <View accessibilityRole="alert" style={styles.notice}><Text variant="bodyValue">{notice}</Text></View> : null}
      {personalScheduleError ? <Text variant="bodyMuted">Your saved sessions could not be loaded. You can still browse the public schedule.</Text> : null}

      <ResourceState
        status={status === 'ready' ? filtered.length ? 'success' : 'empty' : status}
        loadingLabel="Loading the schedule..."
        errorMessage="We couldn't load this Event's schedule."
        onRetry={onRetry}
        emptyTitle={schedule?.blocks.length ? 'No sessions match these filters' : 'No sessions published yet'}
        emptyMessage={schedule?.blocks.length ? 'Try another search, day, or filter to see more sessions.' : 'Please check again later.'}
      >
        {viewMode === 'calendar' && schedule ? <ScheduleCalendar
          days={calendarDays}
          blocks={filtered}
          stages={schedule.stages}
          savedIds={savedIds}
          pending={pending}
          hideDayTabs
          liveIds={liveIds}
          onOpenSession={onOpenSession ? (block) => onOpenSession(block, 'calendar') : undefined}
          onToggleSaved={onToggleSaved}
        /> : <View style={styles.list}>
          {filtered.map((block) => (
            <ScheduleSessionCard
              key={block.id}
              block={block}
              saved={savedIds.has(block.id)}
              pending={pending}
              isLive={liveIds.has(block.id)}
              stageAccent={stageAccents.get(block.stageId)}
              onPress={onOpenSession ? () => onOpenSession(block, 'list') : undefined}
              onToggleSaved={onToggleSaved ? () => onToggleSaved(block) : undefined}
            />
          ))}
        </View>}
      </ResourceState>
      {schedule?.blocks.length && onToggleSaved ? <Text variant="bodyMuted" style={styles.note}>Sessions may run at the same time. Saving a conflict is allowed; the schedule will identify the overlap.</Text> : null}
    </View>
  );
}

/**
 * Screen 03 controls: exclusive day pills, the search pill, the stage chip rail with the
 * sliders button, and the expandable practice-type rail.
 */
function ScheduleControls({ schedule, dayIds, stageIds, practiceIds, query, onQueryChange, onChange }: {
  schedule: PublicEventSchedule;
  dayIds: ReadonlySet<string>;
  stageIds: ReadonlySet<string>;
  practiceIds: ReadonlySet<string>;
  query: string;
  onQueryChange: (value: string) => void;
  onChange: (filter: 'day' | 'stage' | 'practice', value: string | null) => void;
}) {
  const [showPractices, setShowPractices] = useState(false);
  return (
    <View style={styles.controlsStack}>
      <View style={styles.dayPills}>
        {schedule.days.map((day) => {
          const selected = dayIds.has(day.id);
          return (
            <Pressable
              key={day.id}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${day.label ?? day.date} sessions`}
              onPress={() => onChange('day', day.id)}
              style={[styles.dayPill, selected && styles.dayPillSelected]}
            >
              <Text style={[styles.dayPillText, selected && styles.dayPillTextSelected]}>
                {dayPillLabel(day.date, day.label)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.searchBar}>
        <SearchIcon size={18} color={colors.textMuted} />
        <TextInput
          accessibilityLabel="Search sessions"
          placeholder="Search sessions, facilitators..."
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={onQueryChange}
          returnKeyType="search"
          autoCorrect={false}
          style={styles.searchInput}
        />
      </View>
      <View style={styles.chipRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRail}>
          <FilterChip label="All" selected={stageIds.size === 0} onPress={() => onChange('stage', null)} />
          {schedule.stages.map((stage) => (
            <FilterChip key={stage.id} label={stage.name} selected={stageIds.has(stage.id)} onPress={() => onChange('stage', stage.id)} />
          ))}
        </ScrollView>
        {schedule.practiceTypes.length ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showPractices }}
            accessibilityLabel="More filters"
            onPress={() => setShowPractices((open) => !open)}
            style={[styles.slidersButton, showPractices && styles.slidersActive]}
          >
            <SlidersGlyph />
          </Pressable>
        ) : null}
      </View>
      {showPractices && schedule.practiceTypes.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRail}>
          <FilterChip label="All practices" selected={practiceIds.size === 0} onPress={() => onChange('practice', null)} />
          {schedule.practiceTypes.map((practice) => (
            <FilterChip key={practice.id} label={practice.name} selected={practiceIds.has(practice.id)} onPress={() => onChange('practice', practice.id)} />
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

/** `"2026-10-23"` → `"Thu 23 Oct"`, as the screen 03 day pills draw it. */
function dayPillLabel(date: string, fallback: string | null): string {
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return fallback ?? date;
  const weekday = new Intl.DateTimeFormat('en', { weekday: 'short' }).format(parsed);
  const month = new Intl.DateTimeFormat('en', { month: 'short' }).format(parsed);
  return `${weekday} ${parsed.getDate()} ${month}`;
}

function FilterChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

/** The sliders mark on the filter button: three staggered rails with knobs. */
function SlidersGlyph() {
  return (
    <View accessibilityElementsHidden style={styles.sliders}>
      {[2, 10, 6].map((offset, row) => (
        <View key={row} style={styles.sliderRow}>
          <View style={styles.sliderLine} />
          <View style={[styles.sliderKnob, { left: offset }]} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  agenda: { width: '100%', gap: space.s5 },
  controls: { gap: space.s3 },
  controlsStack: { gap: space.s3 },
  dayPills: { flexDirection: 'row', gap: space.s2 },
  dayPill: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.s2, borderRadius: radius.card, borderWidth: 1, borderColor: colors.borderDefault, backgroundColor: colors.bgSurface },
  dayPillSelected: { backgroundColor: colors.sage500, borderColor: colors.sage500 },
  dayPillText: { fontFamily: fontFamily.bodyMedium, fontSize: fontSize.bodyMd, color: colors.textPrimary, textAlign: 'center' },
  dayPillTextSelected: { color: colors.creme },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: space.s2, minHeight: 52, paddingHorizontal: space.s4, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderDefault, backgroundColor: colors.bgSurface },
  searchInput: { flex: 1, minHeight: 48, fontFamily: fontFamily.body, fontSize: fontSize.bodyMd, color: colors.textPrimary },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: space.s2 },
  chipRail: { flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: space.s2, paddingRight: space.s2 },
  chip: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.s4, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderDefault, backgroundColor: colors.bgSurface },
  chipSelected: { backgroundColor: colors.black, borderColor: colors.black },
  chipText: { fontFamily: fontFamily.bodyMedium, fontSize: fontSize.bodyMd, color: colors.textPrimary },
  chipTextSelected: { color: colors.creme },
  slidersButton: { width: 48, height: 48, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: radius.circle, borderWidth: 1, borderColor: colors.borderDefault, backgroundColor: colors.bgSurface },
  slidersActive: { backgroundColor: colors.black, borderColor: colors.black },
  sliders: { width: 18, gap: 4 },
  sliderRow: { position: 'relative', height: 6, justifyContent: 'center' },
  sliderLine: { height: 1.5, backgroundColor: colors.textMuted },
  sliderKnob: { position: 'absolute', width: 6, height: 6, borderRadius: radius.circle, backgroundColor: colors.textMuted },
  list: { gap: space.s3 },
  notice: { padding: space.s4, backgroundColor: colors.gold100, borderRadius: radius.card },
  note: { color: colors.textMuted },
});
