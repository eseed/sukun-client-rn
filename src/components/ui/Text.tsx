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
export function Text({ variant = 'bodyValue', color, style, ...rest }: TextProps) {
  return <RNText {...rest} style={[text[variant], color ? { color } : null, style]} />;
}

export const textStyles = StyleSheet.create({ base: {} });
