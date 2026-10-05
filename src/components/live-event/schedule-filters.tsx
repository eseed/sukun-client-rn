import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, LinearTransition, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import type { PublicEventSchedule } from '../../api/types';
import { colors, radius, shadow, space } from '../../theme/tokens';
import { Text } from '../ui';

const FILTER_LAYOUT = LinearTransition.duration(240).easing(Easing.bezier(0.2, 0, 0, 1)).reduceMotion(ReduceMotion.System);
const FILTER_ENTER = FadeIn.duration(160).reduceMotion(ReduceMotion.System);
const FILTER_EXIT = FadeOut.duration(120).reduceMotion(ReduceMotion.System);

type FilterKind = 'day' | 'stage' | 'practice';
type FilterOption = { id: string | null; label: string };
type FilterSection = { kind: FilterKind; title: string; selected: ReadonlySet<string>; options: FilterOption[]; allLabel: string };

export function ScheduleFilters({ schedule, dayIds, stageIds, practiceIds, onChange }: {
  schedule: PublicEventSchedule;
  dayIds: ReadonlySet<string>;
  stageIds: ReadonlySet<string>;
  practiceIds: ReadonlySet<string>;
  onChange: (kind: FilterKind, value: string | null) => void;
}) {
  const [expanded, setExpanded] = useState<FilterKind | null>(null);
  const days: FilterOption[] = [{ id: null, label: 'All days' }, ...schedule.days.map((day, index) => ({ id: day.id, label: day.label ?? `Day ${index + 1} · ${day.date}` }))];
  const stages: FilterOption[] = [{ id: null, label: 'All stages' }, ...schedule.stages.map((stage) => ({ id: stage.id, label: stage.name }))];
  const practices: FilterOption[] = [{ id: null, label: 'All practices' }, ...schedule.practiceTypes.map((practice) => ({ id: practice.id, label: practice.name }))];
  const sections = ([
    { kind: 'day', title: 'Day', selected: dayIds, options: days, allLabel: 'All days' },
    { kind: 'stage', title: 'Stage', selected: stageIds, options: stages, allLabel: 'All stages' },
    { kind: 'practice', title: 'Practice', selected: practiceIds, options: practices, allLabel: 'All practices' },
  ] satisfies FilterSection[]).filter((section) => section.options.length > 1);
  return (
    <View style={styles.stack}>
      {sections.map((section) => {
        const summary = section.selected.size === 0
          ? section.allLabel
          : section.selected.size === 1
            ? section.options.find((option) => option.id && section.selected.has(option.id))?.label ?? '1 selected'
            : `${section.selected.size} selected`;
        const isExpanded = expanded === section.kind;
        return (
          <Animated.View key={section.kind} layout={FILTER_LAYOUT} style={[styles.section, isExpanded && styles.openSection]}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: isExpanded }} onPress={() => setExpanded(isExpanded ? null : section.kind)} style={styles.row}>
              <View style={styles.labelGroup}>
                <FilterGlyph kind={section.kind} />
                <Text variant="bodyValue" style={styles.title}>{section.title}</Text>
              </View>
              <Text variant="bodyValue" numberOfLines={1} style={styles.value}>{summary}</Text>
              <FilterChevron open={isExpanded} />
            </Pressable>
            {isExpanded ? (
              <Animated.View entering={FILTER_ENTER} exiting={FILTER_EXIT} style={styles.options}>
                {section.options.map((option) => {
                  const active = option.id === null ? section.selected.size === 0 : section.selected.has(option.id);
                  return <Pressable key={option.id ?? 'all'} accessibilityRole="checkbox" accessibilityState={{ checked: active }} onPress={() => onChange(section.kind, option.id)} style={[styles.option, active && styles.activeOption]}>
                    <Text variant="meta" style={[styles.optionText, active && styles.activeText]}>{option.label}</Text>
                  </Pressable>;
                })}
              </Animated.View>
            ) : null}
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.s3 },
  section: { borderRadius: radius.field, borderWidth: 1, borderColor: colors.borderDefault, backgroundColor: colors.bgSurface, overflow: 'hidden', ...shadow.card },
  openSection: { borderColor: colors.sage500 },
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.s4, gap: space.s3 },
  labelGroup: { width: 108, flexDirection: 'row', alignItems: 'center', gap: space.s2 },
  title: { flexShrink: 1, fontSize: 15 },
  glyphTile: { width: 24, height: 24, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: radius.tile, backgroundColor: colors.bgPage },
  value: { flex: 1, minWidth: 0, fontSize: 13, textAlign: 'right', color: colors.textPrimary },
  chevronDisc: { width: 20, height: 20, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: radius.circle },
  chevronDiscOpen: { backgroundColor: colors.bgPage },
  chevron: { width: 8, height: 8, borderRightWidth: 1.5, borderBottomWidth: 1.5, borderColor: colors.textMuted },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s3, paddingHorizontal: space.s4, paddingTop: space.s4, paddingBottom: space.s4, borderTopWidth: 1, borderTopColor: colors.borderDefault },
  option: { minHeight: 36, justifyContent: 'center', paddingHorizontal: space.s4, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderDefault, backgroundColor: colors.bgSurface },
  activeOption: { backgroundColor: colors.black, borderColor: colors.black },
  optionText: { color: colors.textPrimary },
  activeText: { color: colors.creme },
  calendarGlyph: { width: 13, height: 13, borderWidth: 1, borderColor: colors.textMuted, borderRadius: 2 },
  calendarTop: { height: 4, borderBottomWidth: 1, borderColor: colors.textMuted },
  calendarDots: { flexDirection: 'row', justifyContent: 'space-evenly', paddingTop: 2 },
  calendarDot: { width: 2, height: 2, borderRadius: radius.circle, backgroundColor: colors.textMuted },
  stageGlyph: { width: 13, height: 11, alignItems: 'center', justifyContent: 'flex-end', borderWidth: 1, borderColor: colors.textMuted, borderTopWidth: 0 },
  stageRoof: { position: 'absolute', top: -2, left: -2, right: -2, height: 1, backgroundColor: colors.textMuted },
  stageFloor: { width: 7, height: 3, marginBottom: 1, borderWidth: 1, borderColor: colors.textMuted },
  practiceGlyph: { width: 8, height: 8, borderWidth: 1, borderColor: colors.textMuted, transform: [{ rotate: '45deg' }] },
  practiceSmallGlyph: { position: 'absolute', top: 3, right: 3, width: 4, height: 4, borderWidth: 1, borderColor: colors.textMuted, transform: [{ rotate: '45deg' }] },
});

function FilterGlyph({ kind }: { kind: FilterKind }) {
  return <View accessibilityElementsHidden style={styles.glyphTile}>
    {kind === 'day' ? <View style={styles.calendarGlyph}><View style={styles.calendarTop} /><View style={styles.calendarDots}><View style={styles.calendarDot} /><View style={styles.calendarDot} /></View></View>
      : kind === 'stage' ? <View style={styles.stageGlyph}><View style={styles.stageRoof} /><View style={styles.stageFloor} /></View>
        : <><View style={styles.practiceGlyph} /><View style={styles.practiceSmallGlyph} /></>}
  </View>;
}

function FilterChevron({ open }: { open: boolean }) {
  const rotation = useSharedValue(open ? 225 : 45);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.get()}deg` }] }), [rotation]);
  useEffect(() => {
    rotation.set(withTiming(open ? 225 : 45, {
      duration: 200,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      reduceMotion: ReduceMotion.System,
    }));
  }, [open, rotation]);

  return <View accessibilityElementsHidden style={[styles.chevronDisc, open && styles.chevronDiscOpen]}>
    <Animated.View style={[styles.chevron, animatedStyle]} />
  </View>;
}
