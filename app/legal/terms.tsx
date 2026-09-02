import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { BackButton, BulletHeading, Screen, StepLabel, Text } from '../../src/components/ui';

/**
 * Privacy policy & terms, reached from the Profile tab.
 *
 * Not one of the fifteen design frames, the design links to it but does not draw it.
 *
 * This is the text App Review reads, and it must stay truthful to what the binary does. Every
 * claim below is enforced somewhere in the app: the contact picker never bulk uploads
 * (`src/hooks/useContacts.ts`), card details never reach Sukun (`src/hooks/usePaymobSheet.ts`
 * hands the sheet a client secret and nothing else), and analytics carry an app user id rather
 * than a name, email, or phone number (`src/lib/analytics.ts`). If any of those change, change
 * this copy in the same commit, and mirror it in the hosted policy that App Store Connect
 * links to.
 */

const EFFECTIVE_DATE = '2 September 2026';
const CONTACT = 'sukunwellness.co/support';

const SECTIONS: { title: string; body: string }[] = [
  {
    title: 'Who we are',
    body: `Sukun is operated by eSEED in Egypt. We decide how the personal data described here is used. For any privacy question, or to ask for a copy of your data, reach us at ${CONTACT}.`,
  },
  {
    title: 'Your phone number',
    body: 'Your mobile number is your Sukun identity. We use it to sign you in, to deliver tickets, and so friends can attach a ticket to you. We send a one time code to it over WhatsApp each time you sign in. We never publish it, and we never tell anyone whether a given number is registered with Sukun.',
  },
  {
    title: 'What else we ask for',
    body: 'Before your first purchase we ask for your full name, email address, date of birth, and gender, and for a living area if your number is Egyptian. Name and email appear on your receipts. Date of birth and gender let us meet age limits and plan events. Your email is never required to be verified in order to use the app.',
  },
  {
    title: 'Your selfie',
    body: 'We ask for a selfie at sign up and show it only to gate staff at admission, so a screenshotted ticket cannot let someone else in. It is stored privately, it is not shared with anyone else, it is not used for anything else, and we do not run face recognition on it or match it against any other database.',
  },
  {
    title: 'Contacts',
    body: 'If you add a guest to a ticket, the app opens your phone’s own contact picker. Only the single number you choose is sent to Sukun, and only at the moment you choose it. We never read, upload, or store your contact list. You can type a number by hand instead, and the app works normally if you decline the contacts permission.',
  },
  {
    title: 'Guests and tickets',
    body: 'A ticket can be bought for a number that has no Sukun account yet. If someone attaches your number to a ticket, we may message you on WhatsApp to tell you a ticket is waiting, and the ticket binds to you when you verify that number. Tickets are non refundable and non transferable.',
  },
  {
    title: 'Payments',
    body: 'Payments are processed in EGP by Paymob. Card details are entered in Paymob’s own secure sheet and never reach Sukun, so we never see or store a card number. We keep the amount, the date, and the result of each payment so we can show your order history and issue receipts. An order is confirmed only once payment settles.',
  },
  {
    title: 'Analytics and session replay',
    body: 'We use Mixpanel to count how features are used and Microsoft Clarity to record anonymised replays of screens, so we can find what is broken or confusing. Both identify you only by an internal Sukun account id. We never put your name, email, or phone number into an analytics event. If you are in the EU, the UK, Switzerland, or California, the app asks your permission before either one starts, and answering no stops both the events and the replays.',
  },
  {
    title: 'Where your data is held',
    body: 'Sukun data is stored on servers in the European Union, and our analytics providers are configured to keep European data in Europe. We keep your account data for as long as your account exists, and order records for as long as Egyptian tax and accounting rules require.',
  },
  {
    title: 'Deleting your account',
    body: 'You can delete your account at any time from the Profile tab, without contacting us. Deletion removes your profile and your selfie and voids any tickets you still hold, without refund. Records we are legally required to keep, such as proof of a completed sale, are retained in a form that is no longer linked to your profile.',
  },
  {
    title: 'Children',
    body: 'Sukun is not intended for anyone under 13, and we do not knowingly collect data from them. Some events set a higher minimum age, which is shown on the event itself.',
  },
  {
    title: 'Changes',
    body: `We update this policy when the app changes. This version took effect on ${EFFECTIVE_DATE}, and the current text always lives here in the app.`,
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

      <Text variant="bodyMuted" style={styles.intro}>
        This explains what Sukun collects, why, and what you can do about it.
      </Text>

      {SECTIONS.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text variant="eyebrow" style={styles.sectionTitle}>
            {section.title}
          </Text>
          <Text variant="bodyMuted">{section.body}</Text>
        </View>
      ))}

      <Text variant="metaSm" style={styles.footnote}>
        Effective {EFFECTIVE_DATE}.
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
  intro: {
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
