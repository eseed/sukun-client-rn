import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { colors, fontFamily, fontSize, radius, space } from '../../theme/tokens';
import { Button } from '../ui/Button';
import { CalendarIcon, CheckIcon } from '../ui/icons';
import { Text } from '../ui/Text';
import { formatScheduleTime } from '../../lib/format';

/**
 * The non-blocking save/conflict feedback from plan section 11.6: the save stands, the
 * overlap is named, and the attendee gets "View My Schedule" and "Dismiss" instead of a
 * dead-end line of text.
 */
/**
 * What a save/remove attempt reports back: the line to show and whether it names an
 * overlap (which is when "View My Schedule" is offered).
 */
export type ScheduleNoticeState = { message: string; conflicted: boolean } | null;

export function ScheduleNotice({
  message,
  onViewSchedule,
  onDismiss,
}: {
  message: string;
  /** Shown only for conflict warnings; My Schedule itself has nowhere to go. */
  onViewSchedule?: () => void;
  onDismiss: () => void;
}) {
  return (
    <View accessibilityRole="alert" style={styles.notice}>
      <Text variant="bodyValue">{message}</Text>
      <View style={styles.actions}>
        {onViewSchedule ? (
          <Button label="View My Schedule" variant="secondary" size="inline" onPress={onViewSchedule} />
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss this message"
          onPress={onDismiss}
          style={({ pressed }) => [styles.dismiss, pressed && styles.pressed]}
        >
          <Text variant="bodyMuted" style={styles.dismissText}>Dismiss</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: { gap: space.s3, padding: space.s4, backgroundColor: colors.gold100, borderRadius: radius.card },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.s3 },
  dismiss: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.s2 },
  dismissText: { textDecorationLine: 'underline' },
  pressed: { opacity: 0.65 },
  // The save-confirmation sheet (reference pack screen 08): success check, the overlap
  // when there is one, and a single Got it.
  sheetRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: colors.overlayScrim },
  sheet: { gap: space.s4, paddingHorizontal: space.s4, paddingTop: space.s6, paddingBottom: space.s6, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, backgroundColor: colors.bgSurface },
  checkCircle: { width: 64, height: 64, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', borderRadius: radius.circle, backgroundColor: colors.sage500 },
  sheetTitle: { textAlign: 'center', fontFamily: fontFamily.bodyMedium, fontSize: fontSize.headingLg, color: colors.textPrimary },
  conflictList: { flexGrow: 0, gap: space.s2 },
  conflictBox: { flexDirection: 'row', alignItems: 'center', gap: space.s3, padding: space.s4, borderRadius: radius.card, backgroundColor: 'rgba(224,128,56,0.12)' },
  conflictIcon: { width: 56, height: 56, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: radius.circle, backgroundColor: colors.rose100 },
  conflictCopy: { flex: 1, minWidth: 0, gap: 2 },
  conflictWith: { fontFamily: fontFamily.body, fontSize: fontSize.bodyMd, color: colors.textPrimary },
  conflictTitle: { fontFamily: fontFamily.bodyMedium, fontSize: fontSize.bodyLg, color: colors.textPrimary },
  conflictMeta: { fontFamily: fontFamily.body, fontSize: fontSize.bodyMd, color: colors.textMuted },
});

/** One overlap the backend returned for a save, with its stage resolved for display. */
export interface SaveConflict {
  title: string;
  startAt: string;
  endAt: string;
  stage?: string | null;
}

/**
 * The save-confirmation sheet (reference pack screen 08). The save stands either way; the
 * overlap is named inside the peach box when there is one, and Got it closes the sheet.
 */
export function ScheduleSaveSheet({ title, conflicts, onClose }: {
  title: string;
  conflicts: SaveConflict[];
  onClose: () => void;
}) {
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetRoot}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.backdrop} />
        <View style={styles.sheet}>
          <View style={styles.checkCircle}>
            <CheckIcon size={28} color={colors.creme} />
          </View>
          <Text style={styles.sheetTitle}>{title}</Text>
          {conflicts.length ? (
            <ScrollView style={styles.conflictList}>
              {conflicts.map((conflict, index) => (
                <View key={`${conflict.title}-${index}`} style={styles.conflictBox}>
                  <View style={styles.conflictIcon}>
                    <CalendarIcon size={28} color={colors.rose700} />
                  </View>
                  <View style={styles.conflictCopy}>
                    <Text style={styles.conflictWith}>Conflicts with</Text>
                    <Text style={styles.conflictTitle}>{conflict.title}</Text>
                    <Text style={styles.conflictMeta}>
                      {formatScheduleTime(conflict.startAt)} - {formatScheduleTime(conflict.endAt)}
                      {conflict.stage ? ` · ${conflict.stage}` : ''}
                    </Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          ) : null}
          <Button label="Got it" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}
