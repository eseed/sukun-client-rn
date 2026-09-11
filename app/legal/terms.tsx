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
    /**
     * eSEED builds and maintains the app; it does not run the service. Sukun is operated by
     * Sukun, and Sukun is therefore the one deciding what is collected here and why. This used
     * to name eSEED as the operator, which was both wrong and the only place in either policy
     * that said so: the hosted policy App Store Connect links to already names Sukun as the
     * controller and does not mention eSEED at all. Guideline 5.1.1(i) turns on identifying
     * who collects the data, so the two have to agree.
     */
    body: `The Sukun app is built and maintained by eSEED in Egypt. Sukun is operated by Sukun, which decides what personal data is collected here and how it is used. For any privacy question, or to ask for a copy of your data, reach us at ${CONTACT}.`,
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
    body: 'We use Mixpanel to count how features are used and Microsoft Clarity to record anonymised replays of screens, so we can find what is broken or confusing. Both identify you only by an internal Sukun account id. We never put your name, email, or phone number into an analytics event. If you are in the EU, the UK, Switzerland, or California, the app asks your permission before either one starts, and answering no stops both the events and the replays. Wherever you are, and whether or not you were asked, you can turn both off at any time under Analytics & session replay on the Profile tab. Turning them off takes effect immediately and clears anything collected on the device that has not been sent.',
  },
  {
    /**
     * Guideline 5.1.1(i) requires the policy to "Confirm that any third party with whom an app
     * shares user data ... will provide the same or equal protection of user data as stated in
     * the app's privacy policy". That confirmation was missing entirely, and it is a named,
     * mandatory element rather than a nicety, so it gets a section of its own that covers every
     * processor at once instead of a clause buried in one of them.
     */
    title: 'Who else sees your data',
    body: 'We share only what each of these needs to do its job: Paymob to take a payment, our messaging provider to deliver your one time code and ticket messages on WhatsApp, our email provider to send receipts, Mixpanel and Microsoft Clarity for the analytics described above, and our hosting and file storage providers in the European Union. Each of them is required to protect your data to the same standard this policy sets out, to use it only for the work we ask of them, and not to use it for anything of their own. We do not sell your data, and we do not share it for advertising.',
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
    /**
     * The app's floor is 18, enforced by `MINIMUM_AGE` on both the profile form and the
     * backend validator. This used to say 13, which contradicted every one of them, and it
     * promised a per-event minimum age "shown on the event itself" that no event has ever
     * carried: there is no such field in the domain types, the mock, or the backend.
     *
     * Sukun the company does run events children attend. What is 18-only is the account, so
     * the distinction is drawn here rather than implying no Sukun event admits a child.
     */
    body: 'The Sukun app is for adults: you must be 18 or over to create an account, and we ask for your date of birth to check. Some Sukun events welcome children, and an adult books through the app on their behalf. Anything a child needs for an event is arranged with the event itself. We do not knowingly collect data from anyone under 18 through the app. If you believe we have, contact us and we will remove it.',
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
