import { useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { ScheduleBlock } from '../../api/types';
import { formatClockTime, formatTime } from '../../lib/format';
import { colors, fontFamily, fontSize, radius, schedule, space } from '../../theme/tokens';
import { usePageScroll } from '../ui/page-scroll';
import { Text } from '../ui/Text';
import { stageTint, type Timetable, type TimetableItem } from './schedule-model';
import { StageTag } from './stage-tag';

const HOUR = schedule.timetableHourHeight;
const RAIL = schedule.timetableRailWidth;
const COLUMN_MIN = schedule.timetableColumnMin;

/**
 * The schedule's calendar, as the website draws it (sukun-client-web ScheduleTimetable): one
 * day as a timetable, a column per stage under its stage tag and the hours down the side, each
 * session a block in its stage's tint sized to its length. Sessions that overlap on one stage
 * share the column side by side. While the day is on, a rule marks the current time.
 *
 * Wider than the screen, the stages scroll sideways with the hours pinned at the left. `bleed`
 * is the screen's side padding: the stages run on to the screen's right edge, so more of them
 * show at once.
 *
 * On a Screen with `trackScroll`, the stage names stay pinned under the status bar while the
 * page scrolls down the day (owner's call, 2026-10-22), so a session far down a column still
 * says which stage it is on. They ride with the stages sideways as before.
 */
export function ScheduleTimetable<T extends ScheduleBlock>({
  timetable,
  now,
  bleed = 0,
  onOpenSession,
}: {
  timetable: Timetable<T>;
  now: number;
  bleed?: number;
  onOpenSession: (block: T) => void;
}) {
  const [width, setWidth] = useState(0);
  const [headHeight, setHeadHeight] = useState(0);
  const { startMs, endMs, hours, columns } = timetable;
  const nowHours = now >= startMs && now < endMs ? (now - startMs) / 3_600_000 : null;
  const fill = columns.length ? (width - RAIL - bleed) / columns.length : 0;
  const columnWidth = Math.max(COLUMN_MIN, fill);
  const bodyHeight = HOUR * hours.length;

  // Where the calendar sits inside the page's scroll content, so the stage row can pin once the
  // page scrolls past it, and let go when the day's last hour scrolls away.
  const page = usePageScroll();
  const frameRef = useRef<View | null>(null);
  const [frameTop, setFrameTop] = useState<number | null>(null);
  const measure = () => {
    // The content container's host view; untyped in RN's ScrollView declarations.
    const scroller = page?.scrollRef.current as
      | (ScrollView & { getInnerViewRef?: () => View | null })
      | null
      | undefined;
    const content = scroller?.getInnerViewRef?.();
    if (!content || !frameRef.current) return;
    frameRef.current.measureLayout(content, (_x, y) => setFrameTop(y), () => undefined);
  };
  const pin =
    page && frameTop !== null && bodyHeight > 0
      ? page.scrollY.interpolate({
          inputRange: [frameTop - page.topInset, frameTop - page.topInset + bodyHeight],
          outputRange: [0, bodyHeight],
          extrapolate: 'clamp',
        })
      : null;
  const pinned = pin ? { transform: [{ translateY: pin }] } : null;

  return (
    <View
      ref={frameRef}
      onLayout={(event) => {
        setWidth(event.nativeEvent.layout.width);
        measure();
      }}
      style={[styles.frame, { marginRight: -bleed }]}
    >
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.rail}>
        {/* Covers the hours as they pass under the pinned stage row. */}
        <Animated.View style={[{ height: headHeight }, pinned && styles.pinnedCorner, pinned]} />
        <View style={{ height: bodyHeight }}>
          {hours.map((hour, index) => (
            <Text
              key={hour}
              style={[styles.hour, { top: index === 0 ? 0 : HOUR * index - 6 }]}
            >
              {formatClockTime(new Date(hour).toISOString())}
            </Text>
          ))}
          {nowHours !== null ? <View style={[styles.nowDot, { top: HOUR * nowHours - 5 }]} /> : null}
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingRight: bleed }}
      >
        {/*
          Claims the touch for the stages. Screen wraps the page in a touchable (tap to dismiss
          the keyboard), which otherwise takes a touch that starts between sessions, and then the
          stages only scroll from a session's own Pressable.
        */}
        <View onStartShouldSetResponder={() => true}>
          <Animated.View
            onLayout={(event) => setHeadHeight(event.nativeEvent.layout.height)}
            style={[styles.heads, pinned && styles.pinnedHeads, pinned]}
          >
            {columns.map((column) => (
              <View key={column.stage.id} style={[styles.head, { width: columnWidth }]}>
                <StageTag name={column.stage.name} color={column.color} wrap />
              </View>
            ))}
          </Animated.View>

          <View style={[styles.body, { height: bodyHeight }]}>
            {columns.map((column) => (
              <View key={column.stage.id} style={[styles.column, { width: columnWidth }]}>
                {hours.map((hour, index) => (
                  <View key={hour} style={[styles.hourLine, { top: HOUR * index }]} />
                ))}
                {column.items.map((item) => (
                  <TimetableBlock
                    key={item.block.id}
                    item={item}
                    color={column.color.color}
                    onPress={() => onOpenSession(item.block)}
                  />
                ))}
              </View>
            ))}
            {nowHours !== null ? <View pointerEvents="none" style={[styles.now, { top: HOUR * nowHours - 1 }]} /> : null}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function TimetableBlock<T extends ScheduleBlock>({ item, color, onPress }: {
  item: TimetableItem<T>;
  color: string;
  onPress: () => void;
}) {
  const { block, startMinute, minutes, lane, lanes } = item;
  const facilitators = block.facilitators.map((person) => person.name).join(', ');
  const start = formatTime(block.startAt);
  const end = formatTime(block.endAt);
  // Under 45 minutes there is room for the time and one line of title, no more.
  const compact = minutes < 45;

  return (
    <View
      style={[
        styles.slot,
        {
          top: (HOUR * startMinute) / 60,
          height: (HOUR * minutes) / 60,
          left: `${(lane / lanes) * 100}%`,
          width: `${100 / lanes}%`,
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${start} to ${end}, ${block.title}${facilitators ? `, with ${facilitators}` : ''}`}
        onPress={onPress}
        style={({ pressed }) => [
          styles.block,
          compact && styles.compact,
          { borderLeftColor: color, backgroundColor: stageTint(color) },
          pressed && styles.pressed,
        ]}
      >
        <Text numberOfLines={1} style={styles.blockTime}>{start} – {end}</Text>
        <Text numberOfLines={compact ? 1 : 3} style={styles.blockTitle}>{block.title}</Text>
        {facilitators && !compact ? <Text numberOfLines={1} style={styles.blockWith}>{facilitators}</Text> : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flexDirection: 'row' },
  // Above the stages, so the current time's dot can sit on the first column's rule.
  rail: { width: RAIL, zIndex: 1 },
  hour: {
    position: 'absolute',
    right: space.s3,
    fontFamily: fontFamily.body,
    fontSize: fontSize.label,
    lineHeight: 12,
    color: colors.textMuted,
  },
  heads: { flexDirection: 'row', alignItems: 'flex-end' },
  // Above the sessions it slides over, on the page colour so they do not show through.
  pinnedHeads: { zIndex: 2, elevation: 2, backgroundColor: colors.bgPage, borderBottomWidth: 1, borderBottomColor: colors.borderDefault },
  pinnedCorner: { zIndex: 2, elevation: 2, backgroundColor: colors.bgPage },
  head: { justifyContent: 'flex-end', paddingHorizontal: space.s1, paddingBottom: space.s3 },
  body: { flexDirection: 'row' },
  column: { position: 'relative', borderLeftWidth: 1, borderLeftColor: colors.borderDefault },
  hourLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: colors.borderDefault },
  slot: { position: 'absolute', paddingVertical: 2, paddingHorizontal: 3 },
  block: {
    flex: 1,
    gap: 2,
    overflow: 'hidden',
    paddingTop: 6,
    paddingBottom: 6,
    paddingLeft: 10,
    paddingRight: 8,
    borderLeftWidth: schedule.stageRailWidth,
    borderRadius: radius.tile,
  },
  compact: { gap: 0, paddingTop: 4, paddingBottom: 4 },
  pressed: { opacity: 0.9 },
  blockTime: { fontFamily: fontFamily.bodyMedium, fontSize: fontSize.label, lineHeight: 15, color: colors.textMuted },
  // The schedule's display italic, small: three lines at most, then an ellipsis.
  blockTitle: { fontFamily: fontFamily.displayItalic, fontSize: fontSize.headingMd, lineHeight: 20, color: colors.textPrimary },
  blockWith: { fontFamily: fontFamily.body, fontSize: fontSize.label, lineHeight: 15, color: colors.textMuted },
  // The current time, across every stage: the LIVE pill's rose, with a dot at the rail.
  now: { position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: schedule.timetableNow },
  nowDot: { position: 'absolute', right: -5, width: 10, height: 10, borderRadius: radius.circle, backgroundColor: schedule.timetableNow },
});
