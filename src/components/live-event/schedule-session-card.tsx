import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';
import type { ScheduleBlock, ScheduleConflict } from '../../api/types';
import { formatTime } from '../../lib/format';
import { colors, radius, shadow, space } from '../../theme/tokens';
import { Text } from '../ui/Text';

export function ScheduleSessionCard({
  block,
  saved,
  pending,
  conflicts = [],
  compactSave = false,
  stageAccent,
  onPress,
  onToggleSaved,
}: {
  block: ScheduleBlock;
  saved: boolean;
  pending?: boolean;
  conflicts?: ScheduleConflict[];
  compactSave?: boolean;
  stageAccent?: string;
  onPress?: () => void;
  onToggleSaved?: () => void;
}) {
  return (
    <View style={[styles.card, stageAccent ? { borderLeftWidth: 3, borderLeftColor: stageAccent } : null]}>
      {onPress ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`${formatTime(block.startAt)} to ${formatTime(block.endAt)}, ${block.title}, ${block.stage.name}`} onPress={onPress} style={styles.main}>
          <SessionContent block={block} compactSave={compactSave} stageAccent={stageAccent} />
        </Pressable>
      ) : (
        <View style={styles.main}>
          <SessionContent block={block} compactSave={compactSave} stageAccent={stageAccent} />
        </View>
      )}
      {onToggleSaved ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: saved, disabled: pending }}
          accessibilityLabel={saved ? `Remove ${block.title} from My Schedule` : `Add ${block.title} to My Schedule`}
          disabled={pending}
          onPress={onToggleSaved}
          style={({ pressed }) => [styles.saveButton, compactSave && styles.bookmarkButton, saved && styles.savedButton, pressed && styles.pressed]}
        >
          {compactSave
            ? pending ? <Text style={styles.bookmarkText}>…</Text> : <View style={styles.bookmarkIcon}><View style={[styles.bookmarkCutout, saved && styles.savedCutout]} /></View>
            : <Text style={[styles.saveText, saved && styles.savedText]}>{pending ? 'Saving…' : saved ? '✓  In My Schedule' : '+  Add to My Schedule'}</Text>}
        </Pressable>
      ) : null}
      {conflicts.length ? (
        <View accessible accessibilityRole="alert" style={styles.conflict}>
          <Text variant="bodyValue" style={styles.conflictTitle}>Schedule conflict</Text>
          <Text variant="bodyMuted">Overlaps with {conflicts.map((item) => item.title).join(', ')}. This session is still saved.</Text>
        </View>
      ) : null}
    </View>
  );
}

function SessionContent({ block, compactSave, stageAccent }: { block: ScheduleBlock; compactSave: boolean; stageAccent?: string }) {
  return (
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
  );
}

const styles = StyleSheet.create({
  card: { position: 'relative', gap: space.s3, padding: space.s3, borderRadius: radius.card, backgroundColor: colors.bgSurface, borderWidth: 1, borderColor: colors.borderDefault, ...shadow.card },
  main: { gap: space.s1 },
  content: { flexDirection: 'row', alignItems: 'center', gap: space.s4 },
  image: { width: 76, height: 76, borderRadius: radius.tile, backgroundColor: colors.bgPage },
  details: { flex: 1, minWidth: 0, minHeight: 76, justifyContent: 'center', gap: space.s2 },
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
  saveText: { color: colors.creme, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  savedText: { color: colors.black },
  conflict: { gap: space.s1, padding: space.s3, borderRadius: radius.md, backgroundColor: colors.rose100, borderWidth: 1, borderColor: colors.rose300 },
  conflictTitle: { color: colors.rose700 },
  pressed: { opacity: 0.75 },
});
