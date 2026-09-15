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
 *
 * The copy has to name what "Allow" actually starts, and for a while it did not: it asked for
 * "anonymous usage data" while the yes answer began Microsoft Clarity screen recording
 * (`src/lib/analytics.ts`). Every other surface in the app already says so, the Profile row is
 * literally labelled "Analytics & session replay" and `app/legal/terms.tsx` names both
 * processors, so the consent moment was the one place understating it. It is also the place
 * that matters, since it is the only one seen before the answer is given.
 *
 * There is no link to the policy here on purpose. This screen renders outside the router
 * (`app/_layout.tsx` returns it ahead of the `Stack`), so there is no navigator to push with;
 * the withdrawal route is named in words instead, which is what 5.1.1(ii) asks for.
 */
export function AnalyticsConsentScreen({ onAnswer }: AnalyticsConsentScreenProps) {
  return (
    <Screen scroll tone="page" contentStyle={styles.content}>
      <View style={styles.body}>
        <Text style={styles.title}>Help us improve Sukun</Text>
        <Text style={styles.copy}>
          We&apos;d like to collect anonymous usage data, like which screens you visit and where you
          drop off, and to record replays of your screen activity, so we can see what is broken or
          confusing. This is processed for us by Mixpanel and Microsoft Clarity, and never includes
          your name, email, or phone number. You can turn it off at any time under Analytics &amp;
          session replay on the Profile tab.
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
  /*
    `flexGrow` rather than `flex`, because this is a scroll container's content: `flex: 1` sets
    `flexBasis: 0` and `flexShrink: 1` as well, which pins the content to the viewport height and
    stops it scrolling at exactly the sizes it needs to. Growing keeps `space-between` doing its
    job on a tall screen, where the buttons still sit on the bottom edge, and lets the content
    run past the fold on a short one.

    Scrolling matters here more than on most screens: this is a gate, so a body that overflows
    is a body whose buttons cannot be reached, and there is nothing else on screen to reach. A
    small device at an accessibility text size is the case that overflows.
  */
  content: {
    flexGrow: 1,
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
