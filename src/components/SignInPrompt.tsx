import { StyleSheet, View } from 'react-native';
import { colors, space } from '../theme/tokens';
import { Button, Text } from './ui';

export interface SignInPromptProps {
  title: string;
  message: string;
  actionLabel: string;
  onAction: () => void;
}

/**
 * The stand-in a guest sees where their own account data would be, on the Tickets and Profile
 * tabs.
 *
 * These two tabs are the account-based half of the app, so a visitor reaching them is the one
 * moment the app may legitimately ask for a number (guideline 5.1.1(v)). It states what
 * signing in would give them rather than reporting an empty account: a guest shown "No tickets
 * yet" reads it as a bug, and the copy has to be true of someone who has no account at all.
 */
export function SignInPrompt({ title, message, actionLabel, onAction }: SignInPromptProps) {
  return (
    <View style={styles.root}>
      <Text variant="titleSm" style={styles.title}>
        {title}
      </Text>
      <Text variant="bodyMuted" style={styles.message}>
        {message}
      </Text>
      <View style={styles.action}>
        <Button label={actionLabel} variant="accent" onPress={onAction} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.s7,
    paddingHorizontal: space.s5,
  },
  title: {
    textAlign: 'center',
    color: colors.textPrimary,
  },
  message: {
    marginTop: space.s2,
    textAlign: 'center',
    maxWidth: 280,
  },
  action: {
    marginTop: space.s5,
    alignSelf: 'stretch',
  },
});
