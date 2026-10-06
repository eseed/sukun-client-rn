import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';
import type { ScheduleBlock, ScheduleConflict } from '../../api/types';
import { formatTime } from '../../lib/format';
import { colors, fontFamily, radius, shadow, space } from '../../theme/tokens';
import { OverlayPill, PinIcon, ProfileIcon } from '../ui';
import { Text } from '../ui/Text';

export function ScheduleSessionCard({
  block,
  saved,
  pending,
  isLive = false,
  mediaLeft = false,
  inlineSave = false,
  bare = false,
  tint,
  conflicts = [],
  compactSave = false,
  stageAccent,
  onPress,
  onToggleSaved,
}: {
  block: ScheduleBlock;
  saved: boolean;
  pending?: boolean;
  /** Screen 03 draws a LIVE pill after the time while the session is running. */
  isLive?: boolean;
  /** Sheet rows mirror the card with the thumbnail leading. */
  mediaLeft?: boolean;
  /** Sheet rows dock the save circle inline at the row end instead of over the thumbnail. */
  inlineSave?: boolean;
  /** Sheet rows are borderless and flat. */
  bare?: boolean;
  /** Timeline cards wash the card in their group's pastel tint. */
  tint?: string;
  conflicts?: ScheduleConflict[];
  compactSave?: boolean;
  stageAccent?: string;
  onPress?: () => void;
  onToggleSaved?: () => void;
}) {
  // Panel 3 of the LIVE concept: the save affordance is a circular +/- button docked
  // to the card's content row. The bookmark variant stays as-is for My Schedule rows.
  const saveControl = !onToggleSaved ? null : compactSave ? (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: saved, disabled: pending }}
      accessibilityLabel={saved ? `Remove ${block.title} from My Schedule` : `Add ${block.title} to My Schedule`}
      disabled={pending}
      onPress={onToggleSaved}
      style={({ pressed }) => [styles.saveButton, styles.bookmarkButton, saved && styles.savedButton, pressed && styles.pressed]}
    >
      {pending ? <Text style={styles.bookmarkText}>…</Text> : <View style={styles.bookmarkIcon}><View style={[styles.bookmarkCutout, saved && styles.savedCutout]} /></View>}
    </Pressable>
  ) : (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: saved, disabled: pending }}
      accessibilityLabel={saved ? `Remove ${block.title} from My Schedule` : `Add ${block.title} to My Schedule`}
      disabled={pending}
      onPress={onToggleSaved}
      style={({ pressed }) => [styles.saveCircle, saved && styles.savedCircle, pressed && styles.pressed]}
    >
      <Text style={[styles.saveGlyph, saved && styles.savedGlyph]}>
        {pending ? '…' : saved ? '✓' : '+'}
      </Text>
    </Pressable>
  );

  const content = compactSave ? (
    <View style={styles.content}>
      {block.media[0] ? <Image
        source={{ uri: block.media[0].url }}
        accessibilityLabel={block.media[0].altText ?? block.title}
        contentFit="cover"
        cachePolicy="memory-disk"
        style={styles.image}
      /> : null}
      <View style={[styles.details, compactSave && styles.detailsWithBookmark]}>
        <Text variant="meta">{formatTime(block.startAt)} – {formatTime(block.endAt)}</Text>
        <Text variant="titleCard" numberOfLines={2} style={styles.title}>{block.title}</Text>
        <View style={styles.stageLine}>
          {stageAccent ? <View style={[styles.stageDot, { backgroundColor: stageAccent }]} /> : null}
          <Text variant="bodyMuted" numberOfLines={1} style={styles.stageText}>{block.stage.name}{block.facilitators.length ? ` · ${block.facilitators.map((item) => item.name).join(', ')}` : ''}</Text>
        </View>
      </View>
    </View>
  ) : (
    // Screen 03: text column on the left, thumbnail on the right, the circular save control
    // docked over the thumbnail's bottom corner. Sheet rows mirror the order and dock the
    // save circle inline at the row end instead.
    <View style={styles.contentWide}>
      {mediaLeft ? (
        <View style={styles.thumbWrap}>
          {block.media[0] ? <Image
            source={{ uri: block.media[0].url }}
            accessibilityLabel={block.media[0].altText ?? block.title}
            contentFit="cover"
            cachePolicy="memory-disk"
            style={styles.thumb}
          /> : <View style={[styles.thumb, styles.thumbFallback]} />}
        </View>
      ) : null}
      <View style={styles.detailsWide}>
        <View style={styles.timeRow}>
          <Text variant="meta">{formatTime(block.startAt)} – {formatTime(block.endAt)}</Text>
          {isLive ? <OverlayPill label="Live" /> : null}
        </View>
        <Text numberOfLines={2} style={styles.titleWide}>{block.title}</Text>
        <View style={styles.stageLine}>
          <PinIcon size={14} color={colors.sage500} />
          <Text variant="bodyValue" numberOfLines={1} style={styles.stageText}>{block.stage.name}</Text>
        </View>
        {block.facilitators[0] ? <View style={styles.stageLine}>
          <ProfileIcon size={14} color={colors.textMuted} />
          <Text variant="meta" numberOfLines={1} style={styles.stageText}>with {block.facilitators[0].name}</Text>
        </View> : null}
      </View>
      {!mediaLeft ? (
        <View style={styles.thumbWrap}>
          {block.media[0] ? <Image
            source={{ uri: block.media[0].url }}
            accessibilityLabel={block.media[0].altText ?? block.title}
            contentFit="cover"
            cachePolicy="memory-disk"
            style={styles.thumb}
          /> : <View style={[styles.thumb, styles.thumbFallback]} />}
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.card, tint ? { backgroundColor: tint } : null, bare && styles.bareCard, compactSave && stageAccent ? { borderLeftWidth: 3, borderLeftColor: stageAccent } : null]}>
      {onPress ? (
        <View style={styles.row}>
          <Pressable accessibilityRole="button" accessibilityLabel={`${formatTime(block.startAt)} to ${formatTime(block.endAt)}, ${block.title}, ${block.stage.name}`} onPress={onPress} style={styles.main}>
            {content}
          </Pressable>
          {compactSave || inlineSave ? saveControl : null}
        </View>
      ) : (
        <View style={styles.main}>
          {content}
          {compactSave || inlineSave ? saveControl : null}
        </View>
      )}
      {!compactSave && !inlineSave && saveControl ? <View style={styles.saveDock}>{saveControl}</View> : null}
      {conflicts.length ? (
        <View accessible accessibilityRole="alert" style={styles.conflict}>
          <Text variant="bodyValue" style={styles.conflictTitle}>Schedule conflict</Text>
          <Text variant="bodyMuted">Overlaps with {conflicts.map((item) => item.title).join(', ')}. This session is still saved.</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { position: 'relative', gap: space.s3, padding: space.s3, borderRadius: radius.card, backgroundColor: colors.bgSurface, borderWidth: 1, borderColor: colors.borderDefault, ...shadow.card },
  main: { flex: 1, minWidth: 0, gap: space.s1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.s3 },
  content: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: space.s4 },
  image: { width: 76, height: 76, borderRadius: radius.tile, backgroundColor: colors.bgPage },
  details: { flex: 1, minWidth: 0, minHeight: 76, justifyContent: 'center', gap: space.s2 },
  // Screen 03 default layout: text column, then the thumbnail the save circle docks over.
  contentWide: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'flex-start', gap: space.s3 },
  detailsWide: { flex: 1, minWidth: 0, minHeight: 124, justifyContent: 'center', gap: space.s1 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: space.s2 },
  titleWide: { fontFamily: fontFamily.bodyMedium, fontSize: 20, lineHeight: 24, color: colors.textPrimary },
  thumbWrap: { width: 100, flexShrink: 0 },
  thumb: { width: 100, height: 124, borderRadius: radius.tile, backgroundColor: colors.bgPage },
  thumbFallback: { backgroundColor: colors.sage100 },
  saveDock: { position: 'absolute', right: space.s3 + 8, bottom: space.s3 + 8, zIndex: 1 },
  bareCard: { backgroundColor: 'transparent', borderWidth: 0, padding: space.s2, elevation: 0, shadowOpacity: 0, shadowRadius: 0 },
  detailsWithBookmark: { paddingRight: 42 },
  stageLine: { flexDirection: 'row', alignItems: 'center', gap: space.s1 },
  stageText: { flex: 1, minWidth: 0 },
  stageDot: { width: 8, height: 8, flexShrink: 0, borderRadius: radius.circle },
  title: { fontSize: 22, lineHeight: 23 },
  saveButton: { minHeight: 40, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.s3, borderRadius: radius.pill, backgroundColor: colors.black },
  savedButton: { backgroundColor: colors.sage100 },
  bookmarkButton: { position: 'absolute', top: space.s2, right: space.s2, minHeight: 38, minWidth: 38, paddingHorizontal: space.s2, borderRadius: radius.circle, backgroundColor: colors.rose700, zIndex: 1 },
  bookmarkText: { color: colors.creme, fontSize: 18 },
  bookmarkIcon: { width: 12, height: 18, alignItems: 'center', justifyContent: 'flex-end', backgroundColor: colors.creme },
  bookmarkCutout: { position: 'absolute', bottom: 0, width: 0, height: 0, borderLeftWidth: 6, borderRightWidth: 6, borderBottomWidth: 6, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: colors.rose700 },
  savedCutout: { borderBottomColor: colors.sage100 },
  saveCircle: { width: 48, height: 48, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: radius.circle, backgroundColor: colors.black },
  savedCircle: { backgroundColor: colors.sage100 },
  saveGlyph: { color: colors.creme, fontSize: 24, lineHeight: 28, textAlign: 'center' },
  savedGlyph: { color: colors.black },
  conflict: { gap: space.s2, padding: space.s4, borderRadius: radius.card, backgroundColor: colors.rose100, borderWidth: 1, borderColor: colors.rose300 },
  conflictTitle: { color: colors.rose700 },
  pressed: { opacity: 0.75 },
});
