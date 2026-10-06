import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import type { MyScheduleBlock, ScheduleBlock, ScheduleDay, ScheduleStage } from '../../api/types';
import { TIMEZONE, formatScheduleTime } from '../../lib/format';
import { colors, fontFamily, fontSize, radius, space } from '../../theme/tokens';
import { Button, PeopleIcon, Text } from '../ui';
import { ScheduleSessionCard } from './schedule-session-card';
import { scheduleStageAccents } from './schedule-stage-accent';

/**
 * Timeline pastels, derived from the palette at low alpha over the white card: peach from
 * gold500, mint from sage300, blue from sky300 (reference pack screen 03 calendar).
 */
const TIMELINE_TINTS = [
  'rgba(224,128,56,0.12)',
  'rgba(107,199,133,0.16)',
  'rgba(89,135,156,0.12)',
];

const cairoHourFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIMEZONE,
  hour: '2-digit',
  hour12: false,
  hourCycle: 'h23',
});

function cairoHour(ms: number): number {
  return Number(cairoHourFormatter.format(new Date(ms)));
}

function padHour(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

function tintAt(index: number): string {
  return TIMELINE_TINTS[index % TIMELINE_TINTS.length] ?? '#FFFFFF';
}

export function ScheduleCalendar({ days, blocks, stages = [], savedIds, pending, personal = false, interactive = true, hideDayTabs = false, liveIds, selectedDayId, onSelectDay, onOpenSession, onToggleSaved }: {
  days: ScheduleDay[];
  blocks: ScheduleBlock[];
  stages?: ScheduleStage[];
  savedIds?: ReadonlySet<string>;
  pending?: boolean;
  personal?: boolean;
  /** Display-only overview: day tabs render as plain views and no press handlers fire. */
  interactive?: boolean;
  /** The agenda owns day selection through its day pills, so the calendar shows no day tabs. */
  hideDayTabs?: boolean;
  liveIds?: ReadonlySet<string>;
  selectedDayId?: string | null;
  onSelectDay?: (dayId: string) => void;
  onOpenSession?: (block: ScheduleBlock) => void;
  onToggleSaved?: (block: ScheduleBlock) => void;
}) {
  const [localSelectedDayId, setLocalSelectedDayId] = useState<string | null>(null);
  const [openGroup, setOpenGroup] = useState<{ blocks: ScheduleBlock[]; startAt: string; endAt: string } | null>(null);
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

  const hours = useMemo(() => {
    if (!activeDay) return [];
    const start = Date.parse(activeDay.startsAt);
    const end = Date.parse(activeDay.endsAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
    const first = cairoHour(start);
    const span = Math.min(30, Math.round((end - start) / 3600000) + 1);
    return Array.from({ length: span }, (_, index) => (first + index) % 24);
  }, [activeDay]);

  const rows = useMemo(() => {
    const byHour = new Map<number, { blocks: ScheduleBlock[]; endAt: string }[]>();
    for (const group of blockGroups) {
      const first = group.blocks[0];
      if (!first) continue;
      const hour = cairoHour(Date.parse(first.startAt));
      const list = byHour.get(hour) ?? [];
      list.push(group);
      byHour.set(hour, list);
    }
    let cursor = 0;
    const tinted = hours.map((hour) => {
      const list = byHour.get(hour) ?? [];
      byHour.delete(hour);
      return { hour, groups: list.map((group) => ({ group, tint: tintAt(cursor++) })) };
    });
    const leftover = [...byHour.values()].flat();
    if (leftover.length && tinted.length) {
      const last = tinted[tinted.length - 1];
      if (last) last.groups.push(...leftover.map((group) => ({ group, tint: tintAt(cursor++) })));
    }
    return tinted;
  }, [blockGroups, hours]);

  return (
    <View style={styles.container}>
      {personal ? <View style={styles.summary}>
        <Text variant="fieldLabel">{monthLabel}</Text>
        <Text variant="fieldLabel">{blocks.length} SAVED</Text>
      </View> : null}
      {!hideDayTabs ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayTabs}>
        {days.map((day, index) => {
          const selected = day.id === activeDayId;
          const date = new Date(`${day.date}T12:00:00`);
          const dateLabel = Number.isNaN(date.getTime()) ? day.date : new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(date);
          const dayName = Number.isNaN(date.getTime()) ? `Day ${index + 1}` : new Intl.DateTimeFormat('en', { weekday: 'short' }).format(date).toUpperCase();
          const dayNumber = Number.isNaN(date.getTime()) ? '' : String(date.getDate());
          const hasSavedBlocks = savedDayIds.has(day.id);
          const tabContent = (<>
            <Text variant="metaSm" style={[styles.dayTitle, selected && styles.selectedText]}>{personal ? dayName : `Day ${index + 1}`}</Text>
            <Text variant="meta" style={[styles.dayDate, selected && styles.selectedText]}>{personal ? dayNumber : dateLabel}</Text>
            {personal && hasSavedBlocks ? <View style={[styles.savedDot, selected && styles.selectedDot]} /> : null}
          </>);
          return interactive ? <Pressable key={day.id} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => {
            if (onSelectDay) onSelectDay(day.id);
            else setLocalSelectedDayId(day.id);
          }} style={[styles.dayTab, selected && styles.selectedDay]}>
            {tabContent}
          </Pressable> : <View key={day.id} style={[styles.dayTab, selected && styles.selectedDay]}>
            {tabContent}
          </View>;
        })}
      </ScrollView> : null}
      {!hideDayTabs && activeDay ? <View style={styles.dayHeading}>
        <Text variant="titleSm" numberOfLines={2} style={styles.dayName}>{personal
          ? `${activeDate && !Number.isNaN(activeDate.getTime()) ? new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: 'numeric' }).format(activeDate).toUpperCase() : activeDay.date} — DAY ${days.findIndex((day) => day.id === activeDay.id) + 1}`
          : activeDay.label ?? `Day ${days.findIndex((day) => day.id === activeDay.id) + 1}`}</Text>
        <Text variant="fieldLabel" style={styles.dateMeta}>{personal ? `${dayBlocks.length} SESSIONS` : activeDay.date}</Text>
      </View> : null}
      {dayBlocks.length ? <View style={styles.timeline}>
        <View style={styles.railLine} />
        {rows.map((row) => (
          <View key={row.hour} style={styles.hourRow}>
            <Text variant="metaSm" style={styles.hourLabel}>{padHour(row.hour)}</Text>
            <View style={styles.hourDotWrap}><View style={styles.hourDot} /></View>
            <View style={styles.hourContent}>
              {row.groups.map(({ group, tint }) => {
                const firstBlock = group.blocks[0];
                if (!firstBlock) return null;
                return group.blocks.length > 1 ? <GroupCard
                  key={firstBlock.id}
                  blocks={group.blocks}
                  startAt={firstBlock.startAt}
                  endAt={group.endAt}
                  tint={tint}
                  onOpen={() => setOpenGroup({ blocks: group.blocks, startAt: firstBlock.startAt, endAt: group.endAt })}
                /> : <ScheduleSessionCard
                  key={firstBlock.id}
                  block={firstBlock}
                  stageAccent={stageAccents.get(firstBlock.stageId)}
                  saved={savedIds?.has(firstBlock.id) ?? personal}
                  pending={pending}
                  isLive={liveIds?.has(firstBlock.id) ?? false}
                  tint={tint}
                  compactSave={personal}
                  conflicts={personal ? (firstBlock as Partial<MyScheduleBlock>).conflicts ?? [] : []}
                  onPress={interactive && onOpenSession ? () => onOpenSession(firstBlock) : undefined}
                  onToggleSaved={interactive && onToggleSaved ? () => onToggleSaved(firstBlock) : undefined}
                />;
              })}
            </View>
          </View>
        ))}
      </View> : <Text variant="bodyMuted" style={styles.empty}>{personal ? 'No saved sessions for this day.' : 'No sessions on this day.'}</Text>}
      {openGroup ? <SessionGroupSheet
        key={`${openGroup.startAt}-${openGroup.blocks.length}`}
        blocks={openGroup.blocks}
        startAt={openGroup.startAt}
        endAt={openGroup.endAt}
        stages={stages}
        savedIds={savedIds}
        pending={pending}
        onClose={() => setOpenGroup(null)}
        onOpenSession={onOpenSession}
        onToggleSaved={onToggleSaved}
      /> : null}
    </View>
  );
}

/**
 * Screen 03 calendar group card: overlapping sessions collapse into one tinted card with a
 * thumbnail strip and a View sessions action that opens the group sheet.
 */
function GroupCard({ blocks, startAt, endAt, tint, onOpen }: {
  blocks: ScheduleBlock[];
  startAt: string;
  endAt: string;
  tint: string;
  onOpen: () => void;
}) {
  const stageNames = [...new Set(blocks.map((block) => block.stage.name))];
  const shownStages = stageNames.slice(0, 3).join(' · ');
  const stageLine = stageNames.length > 3 ? `${shownStages} +${stageNames.length - 3}` : shownStages;
  const thumbs = blocks.slice(0, 4);
  const overflow = blocks.length - thumbs.length;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${blocks.length} sessions happening, ${formatScheduleTime(startAt)} to ${formatScheduleTime(endAt)}. View sessions.`}
      onPress={onOpen}
      style={[styles.groupCard, { backgroundColor: tint }]}
    >
      <Text variant="meta">{formatScheduleTime(startAt)} – {formatScheduleTime(endAt)}</Text>
      <View style={styles.groupHeading}>
        <PeopleIcon size={22} color={colors.textPrimary} />
        <Text style={styles.groupTitle}>{blocks.length} sessions happening</Text>
      </View>
      <Text variant="bodyMuted" numberOfLines={1}>{stageLine}</Text>
      <View style={styles.thumbStrip}>
        {thumbs.map((block) => (
          block.media[0] ? <ScheduleThumb key={block.id} uri={block.media[0].url} label={block.media[0].altText ?? block.title} /> : null
        ))}
        {overflow > 0 ? <View style={styles.overflowTile}><Text variant="bodyValue">+{overflow}</Text></View> : null}
      </View>
      <Button label="View sessions →" onPress={onOpen} />
    </Pressable>
  );
}

function ScheduleThumb({ uri, label }: { uri: string; label: string }) {
  const [failed, setFailed] = useState(false);
  // `expo-image` has no placeholder slot: hide the frame only after the photo fails, so a
  // slow network never flashes an empty tile.
  if (failed) return <View style={[styles.stripThumb, styles.thumbFallback]} />;
  return (
    <Image
      source={{ uri }}
      accessibilityLabel={label}
      contentFit="cover"
      style={styles.stripThumb}
      onError={() => setFailed(true)}
    />
  );
}

/**
 * Screen 03 group sheet: the sessions inside one overlapping time group, filterable by
 * stage, each row opening its detail or saving straight from the sheet.
 */
function SessionGroupSheet({ blocks, startAt, endAt, stages, savedIds, pending, onClose, onOpenSession, onToggleSaved }: {
  blocks: ScheduleBlock[];
  startAt: string;
  endAt: string;
  stages: ScheduleStage[];
  savedIds?: ReadonlySet<string>;
  pending?: boolean;
  onClose: () => void;
  onOpenSession?: (block: ScheduleBlock) => void;
  onToggleSaved?: (block: ScheduleBlock) => void;
}) {
  const [stageId, setStageId] = useState<string | null>(null);
  const visible = stageId ? blocks.filter((block) => block.stageId === stageId) : blocks;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetRoot}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close sessions" onPress={onClose} style={styles.backdrop} />
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <View style={styles.sheetHeading}>
            <Text style={styles.sheetTitle}>Sessions happening now</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close sessions" onPress={onClose} hitSlop={10} style={styles.sheetClose}>
              <Text style={styles.sheetCloseGlyph}>×</Text>
            </Pressable>
          </View>
          <Text variant="bodyMuted">{formatScheduleTime(startAt)} – {formatScheduleTime(endAt)} · {blocks.length} sessions</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sheetChips}>
            <SheetChip label="All" selected={stageId === null} onPress={() => setStageId(null)} />
            {stages.filter((stage) => blocks.some((block) => block.stageId === stage.id)).map((stage) => (
              <SheetChip key={stage.id} label={stage.name} selected={stageId === stage.id} onPress={() => setStageId(stageId === stage.id ? null : stage.id)} />
            ))}
          </ScrollView>
          <ScrollView style={styles.sheetList} contentContainerStyle={styles.sheetListContent}>
            {visible.map((block) => (
              <ScheduleSessionCard
                key={block.id}
                block={block}
                saved={savedIds?.has(block.id) ?? false}
                pending={pending}
                mediaLeft
                inlineSave
                bare
                onPress={onOpenSession ? () => onOpenSession(block) : undefined}
                onToggleSaved={onToggleSaved ? () => onToggleSaved(block) : undefined}
              />
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function SheetChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
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

function groupOverlappingBlocks(blocks: ScheduleBlock[]) {
  // Overlapping sessions collapse into one card, but a group never spans more than two
  // hours: a longer run splits so the timeline and the sheet stay scannable.
  const MAX_SPAN_MS = 2 * 3600000;
  const groups: { blocks: ScheduleBlock[]; startAt: string; endAt: string }[] = [];
  for (const block of blocks) {
    const group = groups[groups.length - 1];
    const start = Date.parse(block.startAt);
    if (
      !group ||
      start >= Date.parse(group.endAt) ||
      start - Date.parse(group.startAt) >= MAX_SPAN_MS
    ) {
      groups.push({ blocks: [block], startAt: block.startAt, endAt: block.endAt });
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
  // The timeline: hour gutter, dotted rail, and one slot per hour holding the groups that
  // start inside it (reference pack screen 03 calendar).
  timeline: { position: 'relative' },
  railLine: { position: 'absolute', top: 10, bottom: 10, left: 51, width: 1, backgroundColor: colors.borderDefault },
  hourRow: { flexDirection: 'row', gap: space.s2, paddingVertical: space.s1 },
  hourLabel: { width: 44, paddingTop: space.s1, textAlign: 'right', color: colors.textMuted },
  hourDotWrap: { width: 16, alignItems: 'center', paddingTop: 6 },
  hourDot: { width: 8, height: 8, borderRadius: radius.circle, backgroundColor: colors.sage300, zIndex: 1 },
  hourContent: { flex: 1, minWidth: 0, gap: space.s2, paddingBottom: space.s2 },
  groupCard: { gap: space.s2, padding: space.s4, borderRadius: radius.card, borderWidth: 1, borderColor: colors.borderDefault },
  groupHeading: { flexDirection: 'row', alignItems: 'center', gap: space.s2 },
  groupTitle: { fontFamily: fontFamily.bodyMedium, fontSize: 20, color: colors.textPrimary },
  thumbStrip: { flexDirection: 'row', gap: space.s2 },
  stripThumb: { width: 72, height: 96, borderRadius: radius.tile, overflow: 'hidden', backgroundColor: colors.bgPage },
  thumbFallback: { backgroundColor: colors.sage100, alignItems: 'center', justifyContent: 'center' },
  overflowTile: { width: 72, height: 96, alignItems: 'center', justifyContent: 'center', borderRadius: radius.tile, backgroundColor: colors.bgPage },
  // The group sheet slides over the timeline (reference pack screen 03 sessions sheet).
  sheetRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: colors.overlayScrim },
  sheet: { maxHeight: '75%', gap: space.s3, paddingHorizontal: space.s4, paddingTop: space.s2, paddingBottom: space.s5, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, backgroundColor: colors.bgSurface },
  grabber: { width: 40, height: 4, alignSelf: 'center', borderRadius: radius.pill, backgroundColor: colors.borderDefault },
  sheetHeading: { flexDirection: 'row', alignItems: 'center', gap: space.s2 },
  sheetTitle: { flex: 1, fontFamily: fontFamily.bodyMedium, fontSize: fontSize.headingLg, color: colors.textPrimary },
  sheetClose: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.circle, backgroundColor: colors.bgPage },
  sheetCloseGlyph: { fontSize: 20, color: colors.textMuted },
  sheetChips: { flexDirection: 'row', alignItems: 'center', gap: space.s2, paddingRight: space.s2 },
  chip: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.s4, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderDefault, backgroundColor: colors.bgSurface },
  chipSelected: { backgroundColor: colors.black, borderColor: colors.black },
  chipText: { fontFamily: fontFamily.bodyMedium, fontSize: fontSize.bodyMd, color: colors.textPrimary },
  chipTextSelected: { color: colors.creme },
  sheetList: { flexGrow: 0 },
  sheetListContent: { gap: space.s2, paddingBottom: space.s2 },
  empty: { paddingVertical: space.s5, textAlign: 'center' },
});
