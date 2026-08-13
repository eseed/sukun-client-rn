import { StyleSheet, View, type ViewStyle } from 'react-native';
import { colors, radius, space } from '../../theme/tokens';
import { Text } from './Text';

export interface InlineErrorProps {
  message: string;
  style?: ViewStyle;
}

/** A compact, accessible error message for fields and inline sections. */
export function InlineError({ message, style }: InlineErrorProps) {
  return (
    <View accessible accessibilityRole="alert" style={[styles.container, style]}>
      <Text variant="buttonLabel" color={colors.rose700} style={styles.mark}>
        !
      </Text>
      <Text variant="bodyMuted" color={colors.rose700} style={styles.message}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: space.s3,
    backgroundColor: colors.rose100,
    borderRadius: radius.md,
  },
  mark: {
    width: space.s4,
    textAlign: 'center',
  },
  message: {
    flex: 1,
    marginLeft: space.s2,
  },
});
