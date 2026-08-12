import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { BackButton, BulletHeading, Screen, StepLabel, Text } from '../../src/components/ui';

/**
 * Privacy policy & terms, reached from the Profile tab.
 *
 * Not one of the fifteen design frames — the design links to it but does not draw it. The
 * copy below states the P0 rules the app actually enforces; final legal text is pending.
 */

const SECTIONS: { title: string; body: string }[] = [
  {
    title: 'Your phone number',
    body: 'Your mobile number is your Sukun identity. We use it to sign you in, to deliver tickets, and so friends can attach a ticket to you. We never publish it.',
  },
  {
    title: 'Your selfie',
    body: 'We ask for a selfie at sign-up and show it only to gate staff at admission, so a screenshotted ticket cannot let someone else in. It is not shared with anyone else and not used for anything else.',
  },
  {
    title: 'Tickets',
    body: 'Tickets are non-refundable and non-transferable. A ticket attached to a guest binds to that phone number when they verify it.',
  },
  {
    title: 'Payments',
    body: 'Payments are processed in EGP by Paymob. Card details are entered in Paymob’s secure sheet and never reach Sukun. An order is confirmed only once payment settles.',
  },
  {
    title: 'Deleting your account',
    body: 'You can delete your account from the Profile tab. Deletion removes your profile and selfie and voids any tickets you still hold, without refund.',
  },
];

export default function TermsScreen() {
  const router = useRouter();

  return (
    <Screen scroll contentStyle={styles.content}>
      <BackButton onPress={() => router.back()} style={styles.back} />

      <StepLabel>Account</StepLabel>
      <View style={styles.heading}>
        <BulletHeading title="Privacy & terms" size="md" />
      </View>

      {SECTIONS.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text variant="eyebrow" style={styles.sectionTitle}>
            {section.title}
          </Text>
          <Text variant="bodyMuted">{section.body}</Text>
        </View>
      ))}

      <Text variant="metaSm" style={styles.footnote}>
        Full legal text is pending. This summary describes what the app does today.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 24,
  },
  back: {
    marginBottom: 18,
  },
  heading: {
    marginTop: 6,
    marginBottom: 22,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    marginBottom: 6,
  },
  footnote: {
    marginTop: 8,
  },
});
