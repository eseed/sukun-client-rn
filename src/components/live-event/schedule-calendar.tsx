import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { MyScheduleBlock, ScheduleBlock, ScheduleDay, ScheduleStage } from '../../api/types';
import { formatTime } from '../../lib/format';
import { colors, radius, space } from '../../theme/tokens';
import { Text } from '../ui';
import { ScheduleSessionCard } from './schedule-session-card';
import { scheduleStageAccents } from './schedule-stage-accent';

export function ScheduleCalendar({ days, blocks, stages = [], savedIds, pending, personal = false, selectedDayId, onSelectDay, onOpenSession, onToggleSaved }: {
  days: ScheduleDay[];
  blocks: ScheduleBlock[];
  stages?: ScheduleStage[];
  savedIds?: ReadonlySet<string>;
  pending?: boolean;
  personal?: boolean;
  selectedDayId?: string | null;
  onSelectDay?: (dayId: string) => void;
  onOpenSession?: (block: ScheduleBlock) => void;
  onToggleSaved?: (block: ScheduleBlock) => void;
}) {
  const [localSelectedDayId, setLocalSelectedDayId] = useState<string | null>(null);
  const requestedDayId = selectedDayId ?? localSelectedDayId;
  const activeDayId = requestedDayId && days.some((day) => day.id === requestedDayId) ? requestedDayId : days[0]?.id ?? null;
  const activeDay = days.find((day) => day.id === activeDayId);
  const dayBlocks = useMemo(() => blocks.filter((block) => block.eventDayId === activeDayId)
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt)), [activeDayId, blocks]);
  const stageAccents = useMemo(() => scheduleStageAccents(stages), [stages]);
  const blockGroups = useMemo(() => groupOverlappingBlocks(dayBlocks), [dayBlocks]);
  const savedDayIds = useMemo(() => new Set(blocks.map((block) => block.eventDayId)), [blocks]);
  const activeDate = activeDay ? new Date(`${activeDay.date}T12:00:00`) : null;
  const monthLabel = activeDate && !Number.isNaN(activeDate.getTime())
    ? new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric' }).format(activeDate).toUpperCase()
    : '';

  return (
    <View style={styles.container}>
      {personal ? <View style={styles.summary}>
        <Text variant="fieldLabel">{monthLabel}</Text>
        <Text variant="fieldLabel">{blocks.length} SAVED</Text>
      </View> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayTabs}>
        {days.map((day, index) => {
          const selected = day.id === activeDayId;
          const date = new Date(`${day.date}T12:00:00`);
          const dateLabel = Number.isNaN(date.getTime()) ? day.date : new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(date);
          const dayName = Number.isNaN(date.getTime()) ? `Day ${index + 1}` : new Intl.DateTimeFormat('en', { weekday: 'short' }).format(date).toUpperCase();
          const dayNumber = Number.isNaN(date.getTime()) ? '' : String(date.getDate());
          const hasSavedBlocks = savedDayIds.has(day.id);
          return <Pressable key={day.id} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => {
            if (onSelectDay) onSelectDay(day.id);
            else setLocalSelectedDayId(day.id);
          }} style={[styles.dayTab, selected && styles.selectedDay]}>
            <Text variant="metaSm" style={[styles.dayTitle, selected && styles.selectedText]}>{personal ? dayName : `Day ${index + 1}`}</Text>
            <Text variant="meta" style={[styles.dayDate, selected && styles.selectedText]}>{personal ? dayNumber : dateLabel}</Text>
            {personal && hasSavedBlocks ? <View style={[styles.savedDot, selected && styles.selectedDot]} /> : null}
          </Pressable>;
        })}
      </ScrollView>
      {activeDay ? <View style={styles.dayHeading}>
        <Text variant="titleSm" numberOfLines={2} style={styles.dayName}>{personal
          ? `${activeDate && !Number.isNaN(activeDate.getTime()) ? new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: 'numeric' }).format(activeDate).toUpperCase() : activeDay.date} — DAY ${days.findIndex((day) => day.id === activeDay.id) + 1}`
          : activeDay.label ?? `Day ${days.findIndex((day) => day.id === activeDay.id) + 1}`}</Text>
        <Text variant="fieldLabel" style={styles.dateMeta}>{personal ? `${dayBlocks.length} SESSIONS` : activeDay.date}</Text>
      </View> : null}
      {dayBlocks.length ? <View style={styles.timeline}>
        {blockGroups.map((group) => {
          const firstBlock = group.blocks[0];
          if (!firstBlock) return null;
          const isOverlap = group.blocks.length > 1;
          return <View key={firstBlock.id} style={styles.timelineRow}>
            <Text variant="metaSm" style={styles.time}>{formatTime(firstBlock.startAt)}</Text>
            <View style={styles.rail}><View style={[styles.dot, isOverlap && styles.overlapDot]} /><View style={styles.line} /></View>
            <View style={styles.session}>
              {isOverlap ? <View style={styles.overlapGroup}>
                <View style={styles.overlapCards}>{group.blocks.map(renderBlock)}</View>
              </View> : renderBlock(firstBlock)}
            </View>
          </View>;
        })}
      </View> : <Text variant="bodyMuted" style={styles.empty}>{personal ? 'No saved sessions for this day.' : 'No sessions on this day.'}</Text>}
    </View>
  );

  function renderBlock(block: ScheduleBlock) {
    return <ScheduleSessionCard
      key={block.id}
      block={block}
      stageAccent={stageAccents.get(block.stageId) ?? colors.sage500}
      saved={savedIds?.has(block.id) ?? personal}
      pending={pending}
      compactSave={personal}
      conflicts={personal ? (block as Partial<MyScheduleBlock>).conflicts ?? [] : []}
      onPress={onOpenSession ? () => onOpenSession(block) : undefined}
      onToggleSaved={onToggleSaved ? () => onToggleSaved(block) : undefined}
    />;
  }
}

function groupOverlappingBlocks(blocks: ScheduleBlock[]) {
  const groups: { blocks: ScheduleBlock[]; endAt: string }[] = [];
  for (const block of blocks) {
    const group = groups[groups.length - 1];
    if (!group || Date.parse(block.startAt) >= Date.parse(group.endAt)) {
      groups.push({ blocks: [block], endAt: block.endAt });
    } else {
      group.blocks.push(block);
      if (Date.parse(block.endAt) > Date.parse(group.endAt)) group.endAt = block.endAt;
    }
  }
  return groups;
}

const styles = StyleSheet.create({
  container: { gap: space.s5 },
  summary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dayTabs: { gap: space.s2, paddingVertical: space.s1 },
  dayTab: { minWidth: 88, minHeight: 72, alignItems: 'center', justifyContent: 'center', gap: space.s1, paddingHorizontal: space.s4, paddingVertical: space.s3, borderRadius: radius.field, borderWidth: 1, borderColor: colors.borderDefault, backgroundColor: colors.bgSurface },
  selectedDay: { backgroundColor: colors.black, borderColor: colors.black },
  dayTitle: { color: colors.textPrimary },
  dayDate: { color: colors.textMuted },
  selectedText: { color: colors.creme },
  savedDot: { position: 'absolute', bottom: 5, width: 4, height: 4, borderRadius: radius.circle, backgroundColor: colors.gold500 },
  selectedDot: { backgroundColor: colors.creme },
  dayHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.s2 },
  dayName: { flex: 1 },
  dateMeta: { fontSize: 10, textAlign: 'right' },
  timeline: { gap: space.s2 },
  timelineRow: { flexDirection: 'row', alignItems: 'stretch', gap: space.s2 },
  time: { width: 58, paddingTop: space.s3, textAlign: 'right', color: colors.textPrimary },
  rail: { width: 12, alignItems: 'center' },
  dot: { width: 8, height: 8, marginTop: 18, borderRadius: radius.circle, backgroundColor: colors.gold500, zIndex: 1 },
  line: { position: 'absolute', top: 18, bottom: -12, width: 1, backgroundColor: colors.borderDefault },
  session: { flex: 1, paddingBottom: space.s2 },
  overlapGroup: { gap: space.s2, padding: space.s2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderDefault, borderStyle: 'dashed', backgroundColor: colors.bgPage },
  overlapCards: { gap: space.s2 },
  overlapDot: { width: 10, height: 10, backgroundColor: colors.rose700, borderWidth: 2, borderColor: colors.bgPage },
  empty: { paddingVertical: space.s5, textAlign: 'center' },
});
