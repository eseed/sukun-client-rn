import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { fontFamily, radius } from '../../theme/tokens';
import { PinIcon } from '../ui/icons';
import { Text } from '../ui/Text';
import { resolveStageColor, type StageColor } from './schedule-model';

/**
 * A session's stage as a solid pill in the stage's colour, so the colour on the card, in the
 * calendar and on the filter chip always comes with its name. The Badge type (10px Medium,
 * uppercase, 0.1em) with the venue pin before the name: the website's `StageTag`.
 */
export function StageTag({
  name,
  color,
  wrap = false,
  style,
}: {
  name: string;
  color: StageColor | undefined;
  /** Let a long name run to a second line instead of ending in an ellipsis. */
  wrap?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const stage = resolveStageColor(color);
  return (
    <View style={[styles.tag, wrap && styles.wrap, { backgroundColor: stage.color }, style]}>
      <PinIcon size={12} color={stage.on} />
      <Text numberOfLines={wrap ? undefined : 1} style={[styles.label, { color: stage.on }]}>
        {name}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexShrink: 1,
    maxWidth: '100%',
    gap: 5,
    minHeight: 24,
    paddingLeft: 8,
    paddingRight: 10,
    borderRadius: radius.pill,
  },
  // Two lines for a long name: the pill becomes a rounded block around it.
  wrap: { paddingVertical: 5, borderRadius: radius.field },
  label: {
    flexShrink: 1,
    fontFamily: fontFamily.bodyMedium,
    fontSize: 10,
    letterSpacing: 10 * 0.1,
    textTransform: 'uppercase',
  },
});
