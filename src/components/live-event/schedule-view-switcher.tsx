import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors, fontFamily, fontSize, radius, space } from '../../theme/tokens';
import { Text } from '../ui/Text';

export type ScheduleViewMode = 'list' | 'calendar';

const GLYPHS: Record<ScheduleViewMode, string> = {
  list: 'M7 5.5h9.5M7 10h9.5M7 14.5h9.5M3.5 5.5h.5M3.5 10h.5M3.5 14.5h.5',
  calendar:
    'M4.5 3.5v3M15.5 3.5v3M3 8h14M4.5 5h11A1.5 1.5 0 0 1 17 6.5v9a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 15.5v-9A1.5 1.5 0 0 1 4.5 5Z',
};

/** The List / Calendar switch: a white pill track, the chosen view black (as on the website). */
export function ScheduleViewSwitcher({ value, onChange }: { value: ScheduleViewMode; onChange: (value: ScheduleViewMode) => void }) {
  return (
    <View accessibilityRole="tablist" style={styles.container}>
      {(['list', 'calendar'] as const).map((mode) => {
        const selected = value === mode;
        const label = mode === 'list' ? 'List' : 'Calendar';
        const tint = selected ? colors.textInverse : colors.textPrimary;
        return (
          <Pressable
            key={mode}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={`${label} view`}
            onPress={() => onChange(mode)}
            style={[styles.tab, selected && styles.selected]}
          >
            <Svg width={16} height={16} viewBox="0 0 20 20" fill="none">
              <Path d={GLYPHS[mode]} stroke={tint} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
            <Text style={[styles.label, { color: tint }]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', padding: space.s1, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderDefault, backgroundColor: colors.bgSurface },
  tab: { flex: 1, minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: space.s3, borderRadius: radius.pill },
  selected: { backgroundColor: colors.bgInverse },
  label: { fontFamily: fontFamily.body, fontSize: fontSize.bodySm },
});
