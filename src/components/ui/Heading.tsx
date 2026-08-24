import { Pressable, StyleSheet, View } from 'react-native';
import { colors } from '../../theme/tokens';
import { Text } from './Text';

/**
 * The ring-and-title lockup every screen opens with: a small outlined circle beside a
 * display-italic title.
 */
export function BulletHeading({
  title,
  size = 'md',
  tone = 'default',
}: {
  title: string;
  /** `lg` = 31px onboarding titles, `md` = 29px tab/checkout titles, `sm` = 27px. */
  size?: 'lg' | 'md' | 'sm';
  tone?: 'default' | 'inverse';
}) {
  const dot = size === 'lg' ? 14 : 13;
  const color = tone === 'inverse' ? colors.creme : colors.textPrimary;
  const variant = size === 'lg' ? 'titleLg' : size === 'md' ? 'titleMd' : 'titleSm';

  return (
    <View style={styles.row}>
      <View
        style={[styles.dot, { width: dot, height: dot, borderRadius: dot / 2, borderColor: color }]}
      />
      <Text variant={variant} color={color} style={styles.title}>
        {title}
      </Text>
    </View>
  );
}

/** The `←` control, 40×40 at 24px, as drawn on every pushed screen. */
export function BackButton({
  onPress,
  tone = 'default',
  style,
}: {
  onPress: () => void;
  tone?: 'default' | 'inverse' | 'floating';
  style?: object;
}) {
  if (tone === 'floating') {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go back"
        onPress={onPress}
        style={[styles.floating, style]}
      >
        <Text style={styles.floatingGlyph}>←</Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Go back"
      onPress={onPress}
      style={[styles.back, style]}
      hitSlop={8}
    >
      <Text
        style={[
          styles.backGlyph,
          { color: tone === 'inverse' ? colors.creme : colors.textPrimary },
        ]}
      >
        ←
      </Text>
    </Pressable>
  );
}

/** "Step 1 of 3" / "Checkout · step 2 of 3". */
export function StepLabel({ children }: { children: string }) {
  return <Text variant="stepLabel">{children}</Text>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dot: {
    borderWidth: 2,
    flexShrink: 0,
  },
  title: {
    flexShrink: 1,
  },
  back: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  backGlyph: {
    fontSize: 24,
  },
  floating: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingGlyph: {
    fontSize: 19,
    color: colors.textPrimary,
  },
});
