import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import {
  BackButton,
  BulletHeading,
  Card,
  Checkbox,
  Screen,
  StepLabel,
  Text,
} from '../../src/components/ui';
import { useConsentStore } from '../../src/stores/consent';
import { colors } from '../../src/theme/tokens';

/**
 * Turning analytics, session replay, and install attribution off, and back on.
 *
 * Guideline 5.1.1(ii): "Apps must also provide the customer with an easily accessible and
 * understandable way to withdraw consent." The answer was previously taken once, at first
 * launch, by `AnalyticsConsentScreen`, and there was no way to revisit it. Nothing about that
 * requirement is regional, so this screen exists for everyone, including the users
 * `requiresPrivacyConsentGate` never prompts and who are therefore opted in by default.
 *
 * Reached from the Profile tab, signed in or not: a visitor with no account is recorded by
 * every consented SDK exactly as a signed-in user is, so they need the same control.
 *
 * The change takes effect on the tap. It pauses Clarity and Kochava, and resets Mixpanel's local
 * identity and queue, so nothing collected before the change is still waiting to go out.
 */
export default function AnalyticsChoicesScreen() {
  const router = useRouter();
  const status = useConsentStore((s) => s.status);
  const answer = useConsentStore((s) => s.answer);

  // 'unknown' cannot be reached from here: the root layout holds the first-run question in
  // front of everything until it is answered, so by the time this screen can be opened the
  // status is settled either way.
  const granted = status === 'granted';

  return (
    <Screen scroll contentStyle={styles.content}>
      <BackButton onPress={() => router.back()} style={styles.back} />

      <StepLabel>Account</StepLabel>
      <View style={styles.heading}>
        <BulletHeading title="Analytics" size="md" />
      </View>

      <Text variant="bodyMuted" style={styles.blurb}>
        We use Mixpanel to count how features are used and Microsoft Clarity to record replays of
        the screens you visit. Kochava measures which Sukun install links lead to an install. If you
        allow it, the app sends Kochava&apos;s attribution result and an opaque Sukun installation
        ID to our backend, where it can be linked to your account after phone verification. Your
        name, email, and phone number are not sent to Kochava. This integration does not request
        IDFA, Google Advertising ID, or Apple&apos;s tracking permission.
      </Text>

      <Card radiusSize={14} style={styles.card}>
        <Checkbox
          checked={granted}
          onToggle={() => void answer(!granted)}
          label="Allow analytics, session replay and attribution"
        />
      </Card>

      <Text variant="bodyMuted" style={styles.note}>
        {granted
          ? 'Turning this off stops analytics, session replay and Kochava attribution on this device. Unsent analytics data is cleared. You can turn them back on here at any time.'
          : 'Analytics, session replay and Kochava attribution are off on this device. You can turn them back on here at any time.'}
      </Text>

      <Text variant="metaSm" color={colors.textMuted} style={styles.note}>
        This choice does not affect your tickets, your orders, or anything we need to get you
        through the gate.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 24,
    flexGrow: 1,
  },
  back: {
    marginBottom: 18,
  },
  heading: {
    marginTop: 6,
    marginBottom: 14,
  },
  blurb: {
    marginBottom: 20,
  },
  card: {
    gap: 10,
    marginBottom: 20,
  },
  note: {
    marginBottom: 14,
  },
});
