import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import type { StudioScheduleSession } from '../../src/api/studio-types';
import { HomeStudioBar } from '../../src/components/studio/BranchSheets';
import {
  ClassCard,
  PillButton,
  SectionLabel,
  SheetTitle,
  StudioIcon,
  StudioSheet,
  StudioTag,
  TextAction,
} from '../../src/components/studio/StudioUi';
import {
  Button,
  OptionSheet,
  PageHeader,
  ResourceState,
  Screen,
  Tag,
  Text,
} from '../../src/components/ui';
import { useMyClasses, useStudioHome, useStudioSchedule } from '../../src/hooks/studio';
import { useHomeStudio } from '../../src/hooks/useHomeStudio';
import { useNow } from '../../src/hooks/useNow';
import {
  addDays,
  branchColor,
  cairoDate,
  classDuration,
  classTime,
  dayCell,
  monthYear,
} from '../../src/lib/studio';
import { colors, fontFamily } from '../../src/theme/tokens';

/** Booking opens 90 days ahead (rule sc-3-1), so the strip pages through 13 weeks. */
const WEEKS_AHEAD = 13;
const DAY_START = 6;
const DAY_END = 22;

interface Filters {
  level: string | null;
  from: number;
  to: number;
  instructor: string | null;
}

const NO_FILTERS: Filters = { level: null, from: DAY_START, to: DAY_END, instructor: null };

/**
 * Design `class-schedule` + `schedule-filter` (P4 · BKG-01): one studio's week, a day at a time,
 * classes grouped by hour. Cancelled classes and classes not bookable online never arrive (the
 * server leaves them out); cards show no price and no spots left (sc-2-6).
 */
export default function ScheduleScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ categoryId?: string }>();
  const studio = useHomeStudio();
  const categories = useStudioHome().data?.categories ?? [];
  const today = cairoDate(useNow());
  const [weekIndex, setWeekIndex] = useState(0);
  const weekStart = addDays(today, weekIndex * 7);
  const [day, setDay] = useState(today);
  const [categoryId, setCategoryId] = useState<string | null>(
    typeof params.categoryId === 'string' ? params.categoryId : null,
  );
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [filtering, setFiltering] = useState(false);

  const branchId = studio.home?.id;
  const schedule = useStudioSchedule({ branchId, weekStart, categoryId: categoryId ?? undefined });
  const booked = useMyClasses('upcoming', studio.signedIn);
  const bookedSessions = useMemo(
    () =>
      new Map(
        (booked.data?.data ?? []).map((item) => [item.sessionId, item.displayStatus] as const),
      ),
    [booked.data],
  );

  const weekSessions = useMemo(
    () =>
      (schedule.data?.days ?? []).flatMap((d) =>
        d.hours.flatMap((h) => h.sessions.map((s) => ({ date: d.date, hour: h.hour, session: s }))),
      ),
    [schedule.data],
  );
  const levels = useMemo(
    () => [...new Set(weekSessions.map((x) => x.session.levelLabel).filter(Boolean))] as string[],
    [weekSessions],
  );
  const instructors = useMemo(
    () =>
      [
        ...new Set(weekSessions.map((x) => x.session.instructor?.name).filter(Boolean)),
      ].sort() as string[],
    [weekSessions],
  );
  const matches = (s: StudioScheduleSession, f: Filters) => {
    const hour = Number(classTime(s.startsAt).split(':')[0]);
    return (
      (!f.level || s.levelLabel === f.level) &&
      (!f.instructor || s.instructor?.name === f.instructor) &&
      hour >= f.from &&
      hour <= f.to
    );
  };

  const dayHours = (schedule.data?.days ?? [])
    .find((d) => d.date === day)
    ?.hours.map((h) => ({ ...h, sessions: h.sessions.filter((s) => matches(s, filters)) }))
    .filter((h) => h.sessions.length > 0);
  const daysWithBookings = new Set(
    weekSessions.filter((x) => bookedSessions.has(x.session.id)).map((x) => x.date),
  );
  const home = studio.home;
  const filtered = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);

  return (
    <Screen scroll contentStyle={styles.content}>
      <PageHeader title="Schedule" onBack={() => router.back()} style={styles.header} />
      {home ? (
        <HomeStudioBar home={home} branches={studio.branches} signedIn={studio.signedIn} />
      ) : null}

      <View style={styles.monthRow}>
        <Text style={styles.month}>{monthYear(`${day}T12:00:00.000Z`)}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={filtered ? 'Filter classes, filters on' : 'Filter classes'}
          onPress={() => setFiltering(true)}
          hitSlop={10}
          style={[styles.filterButton, filtered && styles.filterOn]}
        >
          <StudioIcon
            name="filter"
            size={20}
            color={filtered ? colors.creme : colors.textPrimary}
          />
        </Pressable>
      </View>

      <WeekStrip
        weekIndex={weekIndex}
        today={today}
        selected={day}
        dots={daysWithBookings}
        onWeek={(index) => {
          setWeekIndex(index);
          const start = addDays(today, index * 7);
          setDay(start);
        }}
        onDay={setDay}
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        style={styles.chipsOuter}
      >
        <Tag label="All" selected={categoryId === null} onPress={() => setCategoryId(null)} />
        {[...categories]
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((c) => (
            <Tag
              key={c.id}
              label={c.name}
              selected={categoryId === c.id}
              onPress={() => setCategoryId(c.id)}
            />
          ))}
      </ScrollView>

      <ResourceState
        status={
          !home || schedule.isPending
            ? 'loading'
            : schedule.isError
              ? 'error'
              : !dayHours || dayHours.length === 0
                ? 'empty'
                : 'success'
        }
        loadingLabel="Loading classes..."
        emptyTitle="No classes this day"
        emptyMessage={
          filtered
            ? 'Nothing matches your filters. Try another day or reset them.'
            : 'Try another day.'
        }
        errorMessage="We couldn't load the schedule."
        onRetry={() => void schedule.refetch()}
      >
        <View>
          {dayHours?.map((h) => (
            <View key={h.hour}>
              <Text style={styles.hour}>{h.hour.replace(/^0/, '')}</Text>
              {h.sessions.map((s) => {
                const mine = bookedSessions.get(s.id);
                const open = () => router.push(`/classes/sessions/${s.id}`);
                return (
                  <ClassCard
                    key={s.id}
                    time={classTime(s.startsAt)}
                    duration={classDuration(s.durationMinutes)}
                    railColor={branchColor(s.branch.colorHex ?? home?.colorHex)}
                    title={s.title}
                    sub={[s.instructor?.name, s.room?.name].filter(Boolean).join(' · ')}
                    onPress={open}
                    accessibilityLabel={`${s.title}, ${classTime(s.startsAt)}`}
                    right={
                      mine === 'incomplete' ? (
                        <StudioTag label="Incomplete" tone="amber" />
                      ) : mine ? (
                        <StudioTag label="Booked" tone="sage" />
                      ) : s.bookingAction === 'book_now' ? (
                        <PillButton
                          label="Book"
                          onPress={() => router.push(`/classes/sessions/${s.id}?book=1`)}
                          accessibilityLabel={`Book ${s.title}`}
                        />
                      ) : s.bookingAction === 'full' ? (
                        <StudioTag label="Full" tone="line" />
                      ) : s.bookingAction === 'ended' ? (
                        <StudioTag label="Ended" tone="line" />
                      ) : (
                        <StudioTag label="Closed" tone="line" />
                      )
                    }
                  />
                );
              })}
            </View>
          ))}
        </View>
      </ResourceState>

      <FilterSheet
        visible={filtering}
        value={filters}
        levels={levels}
        instructors={instructors}
        count={(next) =>
          weekSessions.filter((x) => x.date === day && matches(x.session, next)).length
        }
        onApply={(next) => {
          setFilters(next);
          setFiltering(false);
        }}
        onClose={() => setFiltering(false)}
      />
    </Screen>
  );
}

function WeekStrip({
  weekIndex,
  today,
  selected,
  dots,
  onWeek,
  onDay,
}: {
  weekIndex: number;
  today: string;
  selected: string;
  dots: Set<string>;
  onWeek: (index: number) => void;
  onDay: (date: string) => void;
}) {
  const { width } = useWindowDimensions();
  const pageWidth = width - 40;
  const weeks = Array.from({ length: WEEKS_AHEAD }, (_, i) => i);
  return (
    <FlatList
      data={weeks}
      horizontal
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      initialScrollIndex={weekIndex}
      getItemLayout={(_, index) => ({ length: pageWidth, offset: pageWidth * index, index })}
      keyExtractor={(w) => String(w)}
      onMomentumScrollEnd={(e) => {
        const index = Math.round(e.nativeEvent.contentOffset.x / pageWidth);
        if (index !== weekIndex) onWeek(index);
      }}
      style={styles.strip}
      renderItem={({ item: w }) => (
        <View style={[styles.week, { width: pageWidth }]}>
          {Array.from({ length: 7 }, (_, i) => addDays(today, w * 7 + i)).map((date) => {
            const { weekday, day } = dayCell(date);
            const on = date === selected;
            return (
              <Pressable
                key={date}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${weekday} ${day}${dots.has(date) ? ', you have a class' : ''}`}
                onPress={() => onDay(date)}
                style={[styles.day, on && styles.dayOn]}
              >
                <Text style={[styles.dayName, on && styles.dayTextOn]}>{weekday}</Text>
                <Text style={[styles.dayNum, on && styles.dayTextOn]}>{day}</Text>
                <View style={[styles.dot, dots.has(date) ? null : styles.dotHidden]} />
              </Pressable>
            );
          })}
        </View>
      )}
    />
  );
}

function FilterSheet({
  visible,
  value,
  levels,
  instructors,
  count,
  onApply,
  onClose,
}: {
  visible: boolean;
  value: Filters;
  levels: string[];
  instructors: string[];
  count: (filters: Filters) => number;
  onApply: (filters: Filters) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const [pickingInstructor, setPickingInstructor] = useState(false);
  const n = count(draft);
  const clamp = (h: number) => Math.max(DAY_START, Math.min(DAY_END, h));
  return (
    <StudioSheet visible={visible} onClose={onClose}>
      <View style={styles.sheetHead}>
        <SheetTitle>Filter classes</SheetTitle>
        <TextAction label="Reset" onPress={() => setDraft(NO_FILTERS)} />
      </View>

      <SectionLabel label="Level" />
      <View style={styles.wrap}>
        <Tag
          label="All classes"
          selected={!draft.level}
          onPress={() => setDraft({ ...draft, level: null })}
        />
        {levels.map((level) => (
          <Tag
            key={level}
            label={level}
            selected={draft.level === level}
            onPress={() => setDraft({ ...draft, level })}
          />
        ))}
      </View>

      <View style={styles.labelRow}>
        <SectionLabel label="Time of day" />
        <Text style={styles.range}>
          {draft.from}:00 – {draft.to}:00
        </Text>
      </View>
      <View style={styles.steppers}>
        <Stepper
          label="From"
          onLess={() => setDraft({ ...draft, from: clamp(draft.from - 1) })}
          onMore={() => setDraft({ ...draft, from: Math.min(draft.to, clamp(draft.from + 1)) })}
        />
        <Stepper
          label="To"
          onLess={() => setDraft({ ...draft, to: Math.max(draft.from, clamp(draft.to - 1)) })}
          onMore={() => setDraft({ ...draft, to: clamp(draft.to + 1) })}
        />
      </View>

      <SectionLabel label="Instructor" />
      <Pressable
        accessibilityRole="button"
        onPress={() => setPickingInstructor(true)}
        style={styles.select}
      >
        <Text>{draft.instructor ?? 'Any instructor'}</Text>
        <StudioIcon name="chevron" size={16} color={colors.textMuted} />
      </Pressable>
      <OptionSheet
        visible={pickingInstructor}
        title="Instructor"
        options={[
          { value: '', label: 'Any instructor' },
          ...instructors.map((i) => ({ value: i, label: i })),
        ]}
        selectedValue={draft.instructor ?? ''}
        onSelect={(v) => setDraft({ ...draft, instructor: v || null })}
        onClose={() => setPickingInstructor(false)}
      />

      <Button
        label={`Show ${n} class${n === 1 ? '' : 'es'}`}
        onPress={() => onApply(draft)}
        style={styles.apply}
      />
    </StudioSheet>
  );
}

function Stepper({
  label,
  onLess,
  onMore,
}: {
  label: string;
  onLess: () => void;
  onMore: () => void;
}) {
  return (
    <View style={styles.stepper}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.stepperButtons}>
        <PillButton
          label="−"
          variant="line"
          onPress={onLess}
          accessibilityLabel={`${label} earlier`}
        />
        <PillButton
          label="+"
          variant="line"
          onPress={onMore}
          accessibilityLabel={`${label} later`}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20 },
  header: { marginBottom: 12 },
  monthRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
  },
  month: { fontSize: 16, fontFamily: fontFamily.bodyMedium },
  filterButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgSurface,
  },
  filterOn: { backgroundColor: colors.black, borderColor: colors.black },
  strip: { marginTop: 8, flexGrow: 0, height: 64 },
  week: { flexDirection: 'row', justifyContent: 'space-between' },
  day: {
    width: 42,
    alignSelf: 'flex-start',
    alignItems: 'center',
    paddingVertical: 7,
    borderRadius: 21,
  },
  dayOn: { backgroundColor: colors.black },
  dayName: { fontSize: 10, letterSpacing: 0.8, color: colors.textMuted },
  dayNum: { fontSize: 15, fontFamily: fontFamily.bodyMedium, marginTop: 2 },
  dayTextOn: { color: colors.creme },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.gold500, marginTop: 3 },
  dotHidden: { opacity: 0 },
  chipsOuter: { marginHorizontal: -20, marginTop: 12, marginBottom: 6, flexGrow: 0 },
  chips: { paddingHorizontal: 20, gap: 7 },
  hour: { fontSize: 13, color: colors.textMuted, marginTop: 14, marginBottom: 8 },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  range: { fontSize: 13, marginBottom: 8 },
  steppers: { flexDirection: 'row', gap: 12 },
  stepper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: 8,
    padding: 8,
  },
  stepperLabel: { fontSize: 13 },
  stepperButtons: { flexDirection: 'row', gap: 6 },
  select: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  apply: { marginTop: 20 },
});
