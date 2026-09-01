import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from '../ui';
import { useHoldCountdown } from '../../hooks/useHoldCountdown';
import { formatCountdown } from '../../lib/format';
import { colors } from '../../theme/tokens';

export interface HoldTimerProps {
  /** `holdExpiresAt` from the order. Nothing renders without one. */
  holdExpiresAt: string | undefined | null;
  style?: StyleProp<ViewStyle>;
}

/**
 * "Your place is held for 12:04" above a checkout action, counting down to the order's own
 * `holdExpiresAt`. Turns to a past-the-deadline line rather than disappearing, because the
 * server releases the hold on a sweeper and the order may still be payable for a moment.
 */
export function HoldTimer({ holdExpiresAt, style }: HoldTimerProps) {
  const { secondsLeft, expired } = useHoldCountdown(holdExpiresAt);
  if (!holdExpiresAt) return null;

  return (
    <View style={[styles.row, style]}>
      <Text variant="metaSm" color={expired ? colors.rose700 : colors.textMuted}>
        {expired
          ? 'This hold has run out. Your place may no longer be reserved.'
          : `Your place is held for ${formatCountdown(secondsLeft)}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    marginBottom: 12,
  },
});
