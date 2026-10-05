import { Pressable, StyleSheet, View } from 'react-native';
import { colors, radius, space } from '../../theme/tokens';
import { Text } from '../ui';

export type ScheduleViewMode = 'list' | 'calendar';

export function ScheduleViewSwitcher({ value, onChange }: { value: ScheduleViewMode; onChange: (value: ScheduleViewMode) => void }) {
  return (
    <View accessibilityRole="tablist" style={styles.container}>
      {(['list', 'calendar'] as const).map((mode) => {
        const selected = value === mode;
        return (
          <Pressable key={mode} accessibilityRole="tab" accessibilityState={{ selected }} accessibilityLabel={`${mode === 'list' ? 'List' : 'Calendar'} view`} onPress={() => onChange(mode)} style={[styles.tab, selected && styles.selected]}>
            <View style={styles.labelRow}>
              {mode === 'list' ? <View style={styles.listIcon}>{[0, 1, 2].map((key) => <View key={key} style={[styles.listLine, selected && styles.selectedIcon]} />)}</View> : <View style={[styles.calendarIcon, selected && styles.selectedCalendar]}><View style={[styles.calendarRule, selected && styles.selectedIcon]} /><View style={[styles.calendarDot, selected && styles.selectedIcon]} /><View style={[styles.calendarDot, selected && styles.selectedIcon]} /></View>}
              <Text variant="bodyValue" style={[styles.label, selected && styles.selectedLabel]}>{mode === 'list' ? 'List' : 'Calendar'}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', padding: space.s1, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderDefault, backgroundColor: colors.bgSurface },
  tab: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, paddingHorizontal: space.s2 },
  selected: { backgroundColor: colors.black },
  label: { fontSize: 14 },
  selectedLabel: { color: colors.creme },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: space.s2 },
  listIcon: { width: 14, height: 14, justifyContent: 'space-between', paddingVertical: 2 },
  listLine: { height: 2, borderRadius: radius.pill, backgroundColor: colors.black },
  selectedIcon: { backgroundColor: colors.creme },
  calendarIcon: { width: 14, height: 14, paddingTop: 4, flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center', borderWidth: 1.25, borderColor: colors.black, borderRadius: 3 },
  selectedCalendar: { borderColor: colors.creme },
  calendarRule: { position: 'absolute', top: 3, left: 0, right: 0, height: 1, backgroundColor: colors.black },
  calendarDot: { width: 2.5, height: 2.5, borderRadius: radius.circle, backgroundColor: colors.black },
});
