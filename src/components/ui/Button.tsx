import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { colors, radius } from '../../theme/tokens';
import { Text } from './Text';

/**
 * The pill CTA used on every screen.
 *
 * Variants come straight from the design:
 *   `primary`   black fill, creme label      — most screens' main action
 *   `accent`    gold-500 fill, creme label   — "Let's move!", "Get tickets", "Pay …"
 *   `disabled`  border-strong fill           — the inactive "Verify" state on screen 03
 *   `secondary` bordered, transparent        — destructive/secondary confirmations
 */
export type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'danger';

export interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  label: string;
  variant?: ButtonVariant;
  loading?: boolean;
  /** Renders the compact inline size used by the event-detail bar and the guest "Add". */
  size?: 'block' | 'inline';
  style?: ViewStyle;
}

export function Button({
  label,
  variant = 'primary',
  loading = false,
  size = 'block',
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const isInert = Boolean(disabled) || loading;

  const background =
    variant === 'accent'
      ? colors.gold500
      : variant === 'secondary'
        ? 'transparent'
        : variant === 'danger'
          ? colors.rose700
          : colors.black;

  const labelColor = variant === 'secondary' ? colors.textPrimary : colors.creme;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isInert, busy: loading }}
      disabled={isInert}
      style={({ pressed }) => [
        styles.base,
        size === 'inline' ? styles.inline : styles.block,
        { backgroundColor: isInert && variant !== 'secondary' ? colors.borderStrong : background },
        variant === 'secondary' && styles.bordered,
        pressed && styles.pressed,
        isInert && styles.inert,
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={labelColor} size="small" />
        </View>
      ) : (
        <Text variant="buttonLabel" color={labelColor} style={styles.label}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  block: {
    paddingVertical: 17,
    paddingHorizontal: 20,
  },
  inline: {
    paddingVertical: 15,
    paddingHorizontal: 26,
  },
  bordered: {
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
  },
  pressed: {
    opacity: 0.85,
  },
  inert: {
    opacity: 0.9,
  },
  label: {
    textAlign: 'center',
  },
  loading: {
    height: 17,
    justifyContent: 'center',
  },
});
