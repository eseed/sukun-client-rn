import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import type { ScheduleDay, SchedulePracticeType, ScheduleStage } from '../../api/types';
import { formatWeekdayDate } from '../../lib/format';
import { colors, fontFamily, fontSize, radius, space } from '../../theme/tokens';
import { SearchIcon } from '../ui/icons';
import { Text } from '../ui/Text';
import { resolveStageColor, type StageColor } from './schedule-model';

/**
 * The schedule's days as one segmented track, as the website draws them: "All days" first
 * where the view can show every day (the list), then one pill per day, the chosen one black.
 * Shown only when the event has more than one day.
 */
export function ScheduleDayTrack({ days, dayId, allowAllDays, onChange }: {
  days: readonly ScheduleDay[];
  /** The chosen day; null shows every day. */
  dayId: string | null;
  allowAllDays: boolean;
  onChange: (dayId: string | null) => void;
}) {
  if (days.length < 2) return null;
  return (
    <View style={styles.dayTrack}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayTrackContent}>
        {allowAllDays ? (
          <DayPill label="All days" selected={dayId === null} onPress={() => onChange(null)} />
        ) : null}
        {days.map((day, index) => (
          <DayPill
            key={day.id}
            label={formatWeekdayDate(day.dayDate)}
            accessibilityLabel={`Day ${index + 1}, ${formatWeekdayDate(day.dayDate)}`}
            selected={dayId === day.id}
            onPress={() => onChange(day.id)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function DayPill({ label, accessibilityLabel, selected, onPress }: {
  label: string;
  accessibilityLabel?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.day, selected && styles.daySelected]}
    >
      <Text style={[styles.dayLabel, selected && styles.selectedLabel]}>{label}</Text>
    </Pressable>
  );
}

/**
 * The search pill, the stage chips with the practice button at their end, and the practice
 * chips it opens: the website's `ScheduleFilters` below its day track. Each stage chip carries
 * its stage's colour, so the row doubles as the key to the colours below it.
 */
export function ScheduleFilterControls({
  query,
  onQueryChange,
  stages,
  colors: stageColors,
  stageIds,
  onToggleStage,
  onClearStages,
  practices,
  practiceIds,
  onTogglePractice,
  onClearPractices,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  stages: readonly ScheduleStage[];
  colors: ReadonlyMap<string, StageColor>;
  stageIds: ReadonlySet<string>;
  onToggleStage: (stageId: string) => void;
  onClearStages: () => void;
  practices: readonly SchedulePracticeType[];
  practiceIds: ReadonlySet<string>;
  onTogglePractice: (practiceId: string) => void;
  onClearPractices: () => void;
}) {
  // A practice already chosen keeps its chips open.
  const [practicesOpen, setPracticesOpen] = useState(() => practiceIds.size > 0);

  return (
    <View style={styles.controls}>
      <View style={styles.search}>
        <SearchIcon size={18} color={colors.textMuted} />
        <TextInput
          accessibilityLabel="Search sessions"
          placeholder="Search sessions, facilitators..."
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={onQueryChange}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          style={styles.searchInput}
        />
        {query ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear the search"
            onPress={() => onQueryChange('')}
            hitSlop={6}
            style={styles.clearSearch}
          >
            <CrossGlyph />
          </Pressable>
        ) : null}
      </View>

      {stages.length ? (
        <View style={styles.stageRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail} style={styles.railScroller}>
            <Chip label="All stages" selected={stageIds.size === 0} onPress={onClearStages} />
            {stages.map((stage) => (
              <Chip
                key={stage.id}
                label={stage.name}
                stage={resolveStageColor(stageColors.get(stage.id))}
                selected={stageIds.has(stage.id)}
                onPress={() => onToggleStage(stage.id)}
              />
            ))}
          </ScrollView>
          {practices.length ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={practiceIds.size ? `Practice filters, ${practiceIds.size} chosen` : 'Practice filters'}
              accessibilityState={{ expanded: practicesOpen }}
              onPress={() => setPracticesOpen((open) => !open)}
              hitSlop={4}
              style={[styles.practiceToggle, practicesOpen && styles.practiceToggleOpen]}
            >
              <SlidersGlyph open={practicesOpen} />
              {practiceIds.size ? (
                <View style={styles.count}>
                  <Text style={styles.countLabel}>{practiceIds.size}</Text>
                </View>
              ) : null}
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {practices.length && practicesOpen ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
          <Chip label="All practices" selected={practiceIds.size === 0} onPress={onClearPractices} />
          {practices.map((practice) => (
            <Chip
              key={practice.id}
              label={practice.name}
              selected={practiceIds.has(practice.id)}
              onPress={() => onTogglePractice(practice.id)}
            />
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

/** The Tag chip (32 tall, 1.5 border, 13px), black when chosen; a stage chip fills with its colour. */
function Chip({ label, stage, selected, onPress }: {
  label: string;
  stage?: StageColor;
  selected: boolean;
  onPress: () => void;
}) {
  const fill = selected ? stage ?? { color: colors.black, on: colors.creme } : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      hitSlop={{ top: 6, bottom: 6 }}
      style={({ pressed }) => [
        styles.chip,
        fill ? { backgroundColor: fill.color, borderColor: fill.color } : null,
        pressed && styles.pressed,
      ]}
    >
      {stage ? <View style={[styles.dot, { backgroundColor: selected ? stage.on : stage.color }]} /> : null}
      <Text style={[styles.chipLabel, fill ? { color: fill.on } : null]}>{label}</Text>
    </Pressable>
  );
}

/** Three rails with knobs, the website's sliders mark. */
function SlidersGlyph({ open }: { open: boolean }) {
  const stroke = open ? colors.creme : colors.textPrimary;
  const knob = open ? colors.black : colors.bgSurface;
  return (
    <Svg width={18} height={18} viewBox="0 0 20 20" fill="none">
      <Path d="M3 5.5h14M3 10h14M3 14.5h14" stroke={stroke} strokeWidth={1.5} strokeLinecap="round" />
      <Circle cx="6" cy="5.5" r="1.9" stroke={stroke} strokeWidth={1.5} fill={knob} />
      <Circle cx="13" cy="10" r="1.9" stroke={stroke} strokeWidth={1.5} fill={knob} />
      <Circle cx="9" cy="14.5" r="1.9" stroke={stroke} strokeWidth={1.5} fill={knob} />
    </Svg>
  );
}

function CrossGlyph() {
  return (
    <Svg width={18} height={18} viewBox="0 0 20 20" fill="none">
      <Path d="m5.5 5.5 9 9m0-9-9 9" stroke={colors.textMuted} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  dayTrack: {
    padding: space.s1,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    backgroundColor: colors.bgSurface,
  },
  dayTrackContent: { flexGrow: 1, gap: space.s1 },
  day: {
    flexGrow: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.s4,
    borderRadius: radius.pill,
  },
  daySelected: { backgroundColor: colors.bgInverse },
  dayLabel: { fontFamily: fontFamily.bodyMedium, fontSize: fontSize.bodySm, color: colors.textPrimary },
  selectedLabel: { color: colors.textInverse },
  controls: { gap: space.s3 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
    paddingLeft: space.s4,
    paddingRight: space.s2,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.borderDefault,
    backgroundColor: colors.bgSurface,
  },
  searchInput: { flex: 1, minWidth: 0, minHeight: 44, fontFamily: fontFamily.body, fontSize: fontSize.bodyMd, color: colors.textPrimary },
  clearSearch: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: radius.circle, backgroundColor: colors.bgPage },
  stageRow: { flexDirection: 'row', alignItems: 'center', gap: space.s2 },
  railScroller: { flex: 1 },
  rail: { alignItems: 'center', gap: space.s2, paddingVertical: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 32,
    paddingHorizontal: 15,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.borderDefault,
    backgroundColor: colors.bgSurface,
  },
  chipLabel: { fontFamily: fontFamily.body, fontSize: fontSize.bodySm, color: colors.textPrimary },
  dot: { width: 10, height: 10, borderRadius: radius.circle },
  pressed: { opacity: 0.85 },
  practiceToggle: {
    width: 40,
    height: 40,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.borderDefault,
    backgroundColor: colors.bgSurface,
  },
  practiceToggleOpen: { borderColor: colors.black, backgroundColor: colors.black },
  // How many practices are chosen: the tab bar's gold dot, grown to hold a number.
  count: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.gold500,
  },
  countLabel: { fontFamily: fontFamily.bodyMedium, fontSize: 10, lineHeight: 12, color: colors.creme },
});
