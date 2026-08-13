import { type ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { colors, space } from '../../theme/tokens';
import { BackButton } from './Heading';
import { Text } from './Text';

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: ReactNode;
  style?: ViewStyle;
}

/** A consistent title row for pushed pages, with optional supporting copy and action. */
export function PageHeader({ title, subtitle, onBack, right, style }: PageHeaderProps) {
  return (
    <View style={[styles.container, style]}>
      <View style={styles.row}>
        {onBack ? <BackButton onPress={onBack} /> : null}
        <Text variant="titleMd" accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        {right}
      </View>
      {subtitle ? (
        <Text variant="bodyMuted" style={[styles.subtitle, onBack && styles.subtitleWithBack]}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: space.s5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 40,
  },
  title: {
    flex: 1,
    minWidth: 0,
    color: colors.textPrimary,
  },
  subtitle: {
    marginTop: space.s2,
  },
  subtitleWithBack: {
    marginLeft: 40 + space.s2,
  },
});
