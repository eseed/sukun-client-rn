import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { ScheduleBlock, ScheduleConflict } from '../../api/types';
import { formatDuration, formatTime } from '../../lib/format';
import { colors, fontFamily, fontSize, radius, schedule, shadow, space, tracking } from '../../theme/tokens';
import { OverlayPill } from '../ui';
import { Text } from '../ui/Text';
import { blockMinutes, resolveStageColor, stageTint, type StageColor } from './schedule-model';
import { StageTag } from './stage-tag';

const THUMB_SIZE = 76;

/**
 * One session in the schedule's list, as the website draws it on a phone
 * (sukun-client-web ScheduleSessionCard): a rail in the stage's colour, the time and length,
 * the title, who leads it and the stage tag beside a small photo, then two quiet pills. "View
 * details" (the accent) opens the session, and the whole card opens it too; "My Schedule" saves
 * it, for a ticket holder. Without `onToggleSaved` the details pill takes the row.
 */
export function ScheduleSessionCard({
  block,
  color,
  live = false,
  saved = false,
  pending = false,
  conflicts = [],
  onPress,
  onToggleSaved,
}: {
  block: ScheduleBlock;
  color: StageColor | undefined;
  /** Running now: a LIVE pill after the time. */
  live?: boolean;
  saved?: boolean;
  pending?: boolean;
  /** My Schedule names the saved sessions this one overlaps. */
  conflicts?: ScheduleConflict[];
  onPress: () => void;
  onToggleSaved?: () => void;
}) {
  const stage = resolveStageColor(color);
  const facilitators = block.facilitators.map((person) => person.name).join(', ');

  return (
    <View style={styles.card}>
      {/* The card is not one accessible element, so both pills stay reachable on their own. */}
      <Pressable
        accessible={false}
        onPress={onPress}
        style={({ pressed }) => [styles.clip, pressed && styles.cardPressed]}
      >
        <View style={[styles.rail, { backgroundColor: stage.color }]} />
        <View style={styles.inner}>
          <View style={styles.top}>
            <View style={styles.lead}>
              <View style={styles.copy}>
                <View style={styles.when}>
                  <Text style={styles.time}>
                    {formatTime(block.startAt)} – {formatTime(block.endAt)}
                  </Text>
                  <View style={styles.length}>
                    <Text style={styles.duration}>·</Text>
                    <Text style={styles.duration}>{formatDuration(blockMinutes(block))}</Text>
                  </View>
                  {live ? <OverlayPill label="Live" /> : null}
                </View>
                <Text style={styles.title}>{block.title}</Text>
                {facilitators ? <Text style={styles.facilitators}>with {facilitators}</Text> : null}
              </View>
              <StageTag name={block.stage.name} color={stage} />
            </View>
            <SessionThumb url={block.media[0]?.url} color={stage.color} />
          </View>

          <View style={styles.actions}>
            {onToggleSaved ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={saved ? `Remove ${block.title} from My Schedule` : `Add ${block.title} to My Schedule`}
                accessibilityState={{ selected: saved, disabled: pending }}
                disabled={pending}
                onPress={onToggleSaved}
                style={({ pressed }) => [
                  styles.button,
                  styles.add,
                  saved && styles.added,
                  (pressed || pending) && styles.pressed,
                ]}
              >
                <Text style={[styles.buttonLabel, styles.addLabel]}>
                  {saved ? '✓ Saved' : '+ My Schedule'}
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`View details: ${block.title}`}
              onPress={onPress}
              style={({ pressed }) => [styles.button, styles.details, pressed && styles.pressed]}
            >
              <Text style={[styles.buttonLabel, styles.detailsLabel]}>View details</Text>
              <ArrowGlyph />
            </Pressable>
          </View>

          {conflicts.length ? (
            <View accessible accessibilityRole="alert" style={styles.conflict}>
              <Text variant="bodyValue" style={styles.conflictTitle}>Schedule conflict</Text>
              <Text variant="bodyMuted">
                Overlaps with {conflicts.map((item) => item.title).join(', ')}. This session is still saved.
              </Text>
            </View>
          ) : null}
        </View>
      </Pressable>
    </View>
  );
}

/**
 * The session's photo, decorative beside its title. Without one (or when it fails to load) the
 * tile takes the stage's tint with the logo's ring in the stage's colour, so every card keeps
 * the same shape and still carries its colour.
 */
function SessionThumb({ url, color }: { url: string | undefined; color: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  if (!url || url === failedUrl) {
    return (
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.thumb, styles.thumbEmpty, { backgroundColor: stageTint(color) }]}>
        <View style={[styles.ring, { borderColor: color }]} />
      </View>
    );
  }

  return (
    <Image
      source={{ uri: url }}
      accessible={false}
      contentFit="cover"
      cachePolicy="memory-disk"
      style={styles.thumb}
      onError={() => setFailedUrl(url)}
    />
  );
}

function ArrowGlyph() {
  return (
    <Svg width={14} height={14} viewBox="0 0 16 16" fill="none">
      <Path d="M3 8h9.5M8.5 4l4 4-4 4" stroke={colors.creme} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.card, backgroundColor: colors.bgSurface, ...shadow.card },
  clip: { overflow: 'hidden', borderRadius: radius.card, borderWidth: 1, borderColor: colors.borderDefault },
  cardPressed: { opacity: 0.9 },
  rail: { position: 'absolute', top: 0, bottom: 0, left: 0, width: schedule.stageRailWidth },
  inner: { gap: space.s3, padding: space.s4, paddingLeft: space.s4 + schedule.stageRailWidth },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: space.s3 },
  lead: { flex: 1, minWidth: 0, gap: space.s3 },
  copy: { gap: space.s2, alignItems: 'flex-start' },
  when: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space.s2, rowGap: space.s1 },
  time: { fontFamily: fontFamily.bodyMedium, fontSize: fontSize.bodySm, color: colors.textPrimary },
  duration: { fontFamily: fontFamily.body, fontSize: fontSize.bodySm, color: colors.textMuted },
  length: { flexDirection: 'row', gap: space.s2 },
  // The featured card's display italic at the phone's 22px, wrapping as long titles need.
  title: {
    fontFamily: fontFamily.displayItalic,
    fontSize: fontSize.headingLg,
    lineHeight: Math.round(fontSize.headingLg * 1.1),
    color: colors.textPrimary,
    paddingRight: 3,
  },
  facilitators: { fontFamily: fontFamily.body, fontSize: fontSize.bodySm, lineHeight: 16, color: colors.textMuted },
  thumb: { width: THUMB_SIZE, height: THUMB_SIZE, borderRadius: radius.tile, backgroundColor: colors.bgPage },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  ring: { width: Math.round(THUMB_SIZE * 0.34), height: Math.round(THUMB_SIZE * 0.34), borderWidth: 1.5, borderRadius: radius.circle },
  actions: { flexDirection: 'row', gap: space.s2, marginTop: space.s1 },
  // Two small pills in the "Get the app" type (12px Medium, uppercase, wide), 40 tall for a thumb.
  button: {
    flex: 1,
    minWidth: 0,
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: space.s3,
    borderRadius: radius.pill,
  },
  buttonLabel: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: fontSize.label,
    letterSpacing: tracking.wide(fontSize.label),
    textTransform: 'uppercase',
  },
  add: { borderWidth: 1, borderColor: colors.borderDefault, backgroundColor: colors.bgPage },
  added: { borderColor: colors.sage100, backgroundColor: colors.sage100 },
  addLabel: { color: colors.textPrimary },
  details: { backgroundColor: colors.gold500 },
  detailsLabel: { color: colors.creme },
  pressed: { opacity: 0.85 },
  conflict: { gap: space.s2, padding: space.s4, borderRadius: radius.card, backgroundColor: colors.rose100, borderWidth: 1, borderColor: colors.rose300 },
  conflictTitle: { color: colors.rose700 },
});
