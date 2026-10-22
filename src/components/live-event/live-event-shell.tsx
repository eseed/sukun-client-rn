import { StyleSheet, View } from 'react-native';
import { colors, fontFamily, radius } from '../../theme/tokens';
import { Text } from '../ui/Text';

/**
 * The dark LIVE pill with its dot, on the live schedule's title row (reference pack screens 03).
 *
 * The Home / Schedule / My Schedule segmented control that used to share this file is gone
 * (owner's call, 2026-10-22): it duplicated the bottom bar's Live tab and Event Home's own tiles,
 * and "Home" next to the bar's own read as two different homes.
 */
export function LiveEventBadge() {
  return (
    <View style={styles.liveBadge} accessibilityLabel="Event is LIVE">
      <View style={styles.dot} />
      <Text style={styles.liveText}>LIVE</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.sage500, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  dot: { width: 6, height: 6, borderRadius: radius.circle, backgroundColor: colors.sage300 },
  liveText: { color: colors.creme, fontFamily: fontFamily.bodyMedium, fontSize: 10, letterSpacing: 0.8 },
});
