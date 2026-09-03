import { Pressable, StyleSheet, View } from 'react-native';
import { colors } from '../../theme/tokens';
import { text } from '../../theme/typography';
import { BackIcon } from './icons';
import { Text } from './Text';

/**
 * Seriously Nostalgic Italic leans past its advance widths: the worst glyph ('f') overhangs by
 * 0.242em and '?' by 0.192em. Android measures a text box from advances alone and clips to it,
 * so a title ending in one of those loses part of its last glyph, which is how
 * "What's your number?" kept arriving with half a question mark. Reserve the worst case,
 * scaled to the size, inside the box where the lean has somewhere to land.
 */
const ITALIC_OVERHANG_EM = 0.242;
const overhangFor = (fontSize: number) => Math.ceil(fontSize * ITALIC_OVERHANG_EM) + 2;

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
      <Text
        variant={variant}
        color={color}
        style={[styles.title, { paddingRight: overhangFor(text[variant].fontSize) }]}
      >
        {title}
      </Text>
    </View>
  );
}

/**
 * The back control. A 48×48 target (the Material minimum, and what a thumb actually expects)
 * around a solid triangle on a faint circular surface, so it reads as a button rather than as
 * the hairline `←` glyph it used to draw.
 */
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
        hitSlop={10}
        style={[styles.floating, style]}
      >
        <BackIcon size={22} color={colors.textPrimary} />
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Go back"
      onPress={onPress}
      style={[styles.back, tone === 'inverse' ? styles.backInverse : null, style]}
      hitSlop={10}
    >
      <BackIcon size={22} color={tone === 'inverse' ? colors.creme : colors.textPrimary} />
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
    // `flex` rather than `flexShrink`, so the box spans the space left in the row and the
    // padding above has room to hold the lean. `minWidth: 0` lets it wrap instead of forcing
    // the row wider than the screen.
    flex: 1,
    minWidth: 0,
  },
  back: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginLeft: -12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  backInverse: {
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  floating: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
