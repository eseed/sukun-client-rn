import { type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { colors, radius, space } from '../../theme/tokens';
import { Text } from './Text';

export type ResourceStatus = 'loading' | 'error' | 'empty' | 'success';

export interface ResourceStateProps {
  status: ResourceStatus;
  children?: ReactNode;
  loadingLabel?: string;
  errorTitle?: string;
  errorMessage?: string;
  emptyTitle?: string;
  emptyMessage?: string;
  retryLabel?: string;
  onRetry?: () => void;
  style?: ViewStyle;
}

/** The shared presentation for async content before it is ready to render. */
export function ResourceState({
  status,
  children,
  loadingLabel = 'Loading...',
  errorTitle = 'Something went wrong',
  errorMessage = "We couldn't load this right now.",
  emptyTitle = 'Nothing here yet',
  emptyMessage = 'There is nothing to show right now.',
  retryLabel = 'Try again',
  onRetry,
  style,
}: ResourceStateProps) {
  if (status === 'success') return <>{children}</>;

  if (status === 'loading') {
    return (
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={loadingLabel}
        style={[styles.state, style]}
      >
        <ActivityIndicator color={colors.accentGold} />
        <Text variant="bodyMuted" style={styles.message}>
          {loadingLabel}
        </Text>
      </View>
    );
  }

  const title = status === 'error' ? errorTitle : emptyTitle;
  const message = status === 'error' ? errorMessage : emptyMessage;

  return (
    <View style={[styles.state, style]}>
      <View accessible={status === 'error'} accessibilityRole={status === 'error' ? 'alert' : undefined}>
        <Text variant="titleSm" style={styles.title}>
          {title}
        </Text>
        <Text variant="bodyMuted" style={styles.message}>
          {message}
        </Text>
      </View>
      {status === 'error' && onRetry ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={retryLabel}
          onPress={onRetry}
          style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
        >
          <Text variant="buttonLabel" color={colors.textPrimary}>
            {retryLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  state: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.s7,
    paddingHorizontal: space.s5,
  },
  title: {
    textAlign: 'center',
  },
  message: {
    marginTop: space.s2,
    textAlign: 'center',
    maxWidth: 280,
  },
  retry: {
    marginTop: space.s4,
    paddingVertical: space.s3,
    paddingHorizontal: space.s4,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
  },
  pressed: {
    opacity: 0.75,
  },
});
