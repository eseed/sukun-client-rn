import { Pressable, StyleSheet, View } from 'react-native';
import { colors, fontFamily, radius } from '../../theme/tokens';
import { Text } from '../ui';

/** The design's pill switch (Bookings: Classes | Events). */
export function SegmentedSwitch({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.track} accessibilityRole="tablist">
      {options.map((option) => {
        const on = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(option.value)}
            style={[styles.option, on && styles.on]}
          >
            <Text style={[styles.label, on && styles.labelOn]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: radius.pill,
    padding: 3,
    marginBottom: 14,
  },
  option: { flex: 1, paddingVertical: 8, borderRadius: radius.pill, alignItems: 'center' },
  on: { backgroundColor: colors.black },
  label: { fontSize: 13.5, fontFamily: fontFamily.bodyMedium, color: colors.textPrimary },
  labelOn: { color: colors.creme },
});
