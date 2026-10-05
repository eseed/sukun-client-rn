import { Pressable, StyleSheet, View } from 'react-native';
import type { ScheduleBlock, ScheduleConflict } from '../../api/types';
import { formatTime } from '../../lib/format';
import { colors, radius, space } from '../../theme/tokens';
import { Text } from '../ui/Text';

export function ScheduleSessionCard({
  block,
  saved,
  pending,
  conflicts = [],
  onPress,
  onToggleSaved,
}: {
  block: ScheduleBlock;
  saved: boolean;
  pending?: boolean;
  conflicts?: ScheduleConflict[];
  onPress: () => void;
  onToggleSaved?: () => void;
}) {
  return (
    <View style={styles.card}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${formatTime(block.startAt)} to ${formatTime(block.endAt)}, ${block.title}, ${block.stage.name}`} onPress={onPress} style={styles.main}>
        <Text variant="meta">{formatTime(block.startAt)} – {formatTime(block.endAt)}</Text>
        <Text variant="titleSm">{block.title}</Text>
        <Text variant="bodyMuted">{block.stage.name}{block.practiceType ? ` · ${block.practiceType.name}` : ''}</Text>
        {block.facilitators.length ? <Text variant="bodyMuted">with {block.facilitators.map((item) => item.name).join(', ')}</Text> : null}
      </Pressable>
      {onToggleSaved ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: saved, disabled: pending }}
          accessibilityLabel={saved ? `Remove ${block.title} from My Schedule` : `Add ${block.title} to My Schedule`}
          disabled={pending}
          onPress={onToggleSaved}
          style={({ pressed }) => [styles.saveButton, saved && styles.savedButton, pressed && styles.pressed]}
        >
          <Text style={[styles.saveText, saved && styles.savedText]}>{pending ? 'Saving…' : saved ? 'Saved ✓' : '+ Add to My Schedule'}</Text>
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

const styles = StyleSheet.create({
  card: { gap: space.s3, padding: space.s3, borderRadius: radius.md, backgroundColor: colors.bgSurface, borderWidth: 1, borderColor: colors.borderDefault },
  main: { gap: space.s1 },
  saveButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.s3, borderRadius: radius.md, backgroundColor: colors.black },
  savedButton: { backgroundColor: colors.sage100 },
  saveText: { color: colors.creme, fontSize: 13 },
  savedText: { color: colors.sage500 },
  conflict: { gap: space.s1, padding: space.s3, borderRadius: radius.md, backgroundColor: colors.rose100, borderWidth: 1, borderColor: colors.rose300 },
  conflictTitle: { color: colors.rose700 },
  pressed: { opacity: 0.75 },
});
