import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { colors, fontSize, lineHeightRatio, radius } from '../../theme/tokens';
import { Text } from './Text';

/** The filled/outlined radio dot used by the pass selector and the contact list. */
export function RadioDot({ selected, size = 22 }: { selected: boolean; size?: number }) {
  return (
    <View
      style={[
        styles.radio,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: selected ? colors.black : colors.borderStrong,
        },
      ]}
    >
      {selected ? (
        <View
          style={{
            width: size / 2,
            height: size / 2,
            borderRadius: size / 4,
            backgroundColor: colors.black,
          }}
        />
      ) : null}
    </View>
  );
}

/** The circular check used on a picked contact. */
export function CheckCircle({ selected, size = 24 }: { selected: boolean; size?: number }) {
  return (
    <View
      style={[
        styles.checkCircle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: selected ? colors.black : colors.borderStrong,
          backgroundColor: selected ? colors.black : 'transparent',
        },
      ]}
    >
      {selected ? <Text style={styles.checkGlyph}>✓</Text> : null}
    </View>
  );
}

/**
 * The square checkbox on the review screen's terms line.
 *
 * `pulse` breathes the box until it is ticked, for the one case where the box is easy to scroll
 * past and worth noticing. It never blocks anything — the pulse stops the moment `checked` turns
 * true, and honours the system's reduce-motion setting.
 *
 * `prominent` moves the label one step up the type scale, for a line the reader is agreeing to
 * rather than merely acknowledging.
 */
export function Checkbox({
  checked,
  onToggle,
  label,
  pulse = false,
  prominent = false,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  pulse?: boolean;
  prominent?: boolean;
}) {
  // `useState` rather than `useRef`, so the Animated.Value is constructed once without the
  // render-time ref read that the lint rule (rightly) forbids.
  const [scale] = useState(() => new Animated.Value(1));
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!pulse || checked || reduceMotion) {
      scale.stopAnimation();
      scale.setValue(1);
      return;
    }

    const beat = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.18,
          duration: 620,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 620,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );

    beat.start();

    return () => beat.stop();
  }, [checked, pulse, reduceMotion, scale]);

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={onToggle}
      style={styles.checkboxRow}
    >
      <Animated.View
        style={[styles.checkbox, checked && styles.checkboxChecked, { transform: [{ scale }] }]}
      >
        {checked ? <Text style={styles.checkGlyph}>✓</Text> : null}
      </Animated.View>
      <Text variant="metaSm" style={[styles.checkboxLabel, prominent && styles.checkboxLabelLarge]}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * A selectable bordered card — the "Full Weekend Pass" / "Day 1 Pass" rows. Selected state
 * is a 1.5px black border on creme; idle is a light border on white.
 */
export function SelectableCard({
  selected,
  onPress,
  children,
  radiusSize = 14,
  disabled = false,
}: {
  selected: boolean;
  onPress: () => void;
  children: ReactNode;
  radiusSize?: number;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.selectable,
        { borderRadius: radiusSize },
        selected ? styles.selectableOn : styles.selectableOff,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      {children}
    </Pressable>
  );
}

/** The −/count/+ pill from the quantity step. */
export function QuantityStepper({
  value,
  min = 1,
  max = 10,
  onChange,
}: {
  value: number;
  min?: number;
  max?: number;
  onChange: (next: number) => void;
}) {
  return (
    <View style={styles.stepper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Remove one ticket"
        disabled={value <= min}
        onPress={() => onChange(value - 1)}
        style={({ pressed }) => [styles.stepperButton, pressed && styles.pressed]}
      >
        <Text style={[styles.stepperMinus, value <= min && styles.stepperInert]}>−</Text>
      </Pressable>
      <Text style={styles.stepperValue}>{value}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add one ticket"
        disabled={value >= max}
        onPress={() => onChange(value + 1)}
        style={({ pressed }) => [styles.stepperButton, pressed && styles.pressed]}
      >
        <Text style={[styles.stepperPlus, value >= max && styles.stepperInert]}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  radio: {
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkCircle: {
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkGlyph: {
    color: colors.creme,
    fontSize: 13,
    lineHeight: 16,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.black,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkboxChecked: {
    backgroundColor: colors.black,
  },
  checkboxLabel: {
    flex: 1,
    fontSize: fontSize.bodySm,
    lineHeight: fontSize.bodySm * lineHeightRatio.normal,
  },
  checkboxLabelLarge: {
    fontSize: fontSize.bodyMd,
    lineHeight: fontSize.bodyMd * lineHeightRatio.normal,
  },
  selectable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderWidth: 1.5,
  },
  selectableOn: {
    borderColor: colors.black,
    backgroundColor: colors.creme,
  },
  selectableOff: {
    borderColor: colors.borderDefault,
    backgroundColor: colors.bgSurface,
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.5,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  stepperButton: {
    width: 52,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperMinus: {
    fontSize: 24,
    color: colors.textPrimary,
  },
  stepperPlus: {
    fontSize: 22,
    color: colors.textPrimary,
  },
  stepperInert: {
    opacity: 0.3,
  },
  stepperValue: {
    minWidth: 44,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
  },
});
