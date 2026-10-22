import { Text as RNText, type TextProps as RNTextProps, StyleSheet } from 'react-native';
import { text, type TextVariant } from '../../theme/typography';

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  color?: string;
}

/**
 * Every string in the app goes through here so type comes from `src/theme/typography.ts`
 * rather than ad-hoc inline styles.
 */
/**
 * The largest the system text size may scale our type. Uncapped, the accessibility sizes grow
 * it past three times and break fixed layouts (tickets, tab labels, buttons) into clipped or
 * overlapping text; 1.3 still honours a larger setting. An explicit `maxFontSizeMultiplier`
 * wins, and inputs use the same cap (`TextField`, `OtpInput`).
 */
export const MAX_FONT_SCALE = 1.3;

export function Text({
  variant = 'bodyValue',
  color,
  style,
  maxFontSizeMultiplier = MAX_FONT_SCALE,
  ...rest
}: TextProps) {
  return (
    <RNText
      {...rest}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      style={[text[variant], color ? { color } : null, style]}
    />
  );
}

export const textStyles = StyleSheet.create({ base: {} });
