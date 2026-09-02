import { StyleSheet, View } from 'react-native';
import { Button, Screen, Text } from './ui';
import { fontFamily } from '../theme/tokens';

export interface AnalyticsConsentScreenProps {
  onAnswer: (granted: boolean) => void;
}

/**
 * Shown once, before any other screen, to users `requiresPrivacyConsentGate` places in the
 * EU/EEA/UK/Switzerland or California. Everyone else is not asked, so the launch market sees
 * no extra step. The answer gates every analytics SDK at once — events and session replay
 * alike — through `enableAnalytics`/`disableAnalytics`.
 */
export function AnalyticsConsentScreen({ onAnswer }: AnalyticsConsentScreenProps) {
  return (
    <Screen tone="page" contentStyle={styles.content}>
      <View style={styles.body}>
        <Text style={styles.title}>Help us improve Sukun</Text>
        <Text style={styles.copy}>
          We&apos;d like to collect anonymous usage data, like which screens you visit and where you
          drop off, to make the app better. This never includes your name, email, or phone number.
        </Text>
      </View>
      <View style={styles.footer}>
        <Button label="Allow" variant="accent" onPress={() => onAnswer(true)} />
        <Button label="Don't allow" variant="secondary" onPress={() => onAnswer(false)} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    justifyContent: 'space-between',
  },
  body: {
    marginTop: 96,
    gap: 16,
  },
  title: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: 28,
    letterSpacing: -0.28,
  },
  copy: {
    fontFamily: fontFamily.body,
    fontSize: 16,
    lineHeight: 24,
    opacity: 0.8,
  },
  footer: {
    gap: 16,
    paddingBottom: 8,
  },
});
