import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, ImageSlot, Text } from '../../src/components/ui';
import { track } from '../../src/lib/analytics';
import { ALLOW_GUEST_BROWSING } from '../../src/lib/flags';
import { designAsset } from '../../src/theme/assets';
import { colors, fontFamily } from '../../src/theme/tokens';

/** Design screen 01 · Welcome. */
export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dancers = designAsset('welcomeDancers');
  const logo = designAsset('logoBlack');

  /**
   * Whether this screen is standing in front of something the visitor was already doing, rather
   * than opening the app. The purchase gate pushes here (`app/event/[slug].tsx`), so a guest who
   * taps "Get tickets" meets a full-screen lockup with a tagline: read cold, that is the
   * registration wall App Review rejected twice under 5.1.1(v), even though the gate itself is
   * legitimate because checkout is an account based feature.
   *
   * The link's treatment does not change, only what it says. "Skip login" answers the launch
   * screen's question; in front of an event it answers nothing, because nobody arriving there
   * was trying to log in. `Not now, browse events` is the phrase the profile and selfie steps
   * already use for the same escape, so the way out of every gate in the app now reads the same.
   */
  const gated = useLocalSearchParams<{ gate?: string }>().gate === '1';
  const skipLabel = gated ? 'Not now, browse events' : 'Skip login';

  /**
   * Into the app without an account. This screen is pushed by the purchase gate as well as
   * shown at launch, so going back where there is somewhere to go returns the visitor to the
   * event they were reading rather than dropping them on Discover having lost their place.
   * The same idiom as `phone.tsx`: a `Redirect` leaves nothing to pop.
   */
  function onSkipLogin() {
    track('guest_browsing_started');
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/discover');
  }

  return (
    <View style={styles.root}>
      <ImageSlot source={dancers} tint={colors.rose100} style={styles.background} />

      <View style={styles.lockup} pointerEvents="none">
        <Image source={logo} style={styles.logo} resizeMode="contain" />
        <Text style={styles.tagline}>Everything wellness.</Text>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 40 }]}>
        <Button
          label="Let's move!"
          variant="accent"
          onPress={() => {
            track('onboarding_started');
            router.push('/(onboarding)/phone');
          }}
        />
        {ALLOW_GUEST_BROWSING ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              gated ? 'Go back to browsing events without an account' : 'Skip login and browse events'
            }
            onPress={onSkipLogin}
            // The link is deliberately quiet, but it is the only way past this screen without
            // an account, so it has to be reachable by thumb: its 12pt line box is well under
            // the 44pt minimum, and a reviewer who taps and misses concludes there is no way
            // through. The slop buys the target without changing the layout.
            hitSlop={{ top: 13, bottom: 13, left: 24, right: 24 }}
            style={({ pressed }) => [styles.skipWrap, pressed && styles.skipPressed]}
          >
            <Text style={styles.skip}>{skipLabel}</Text>
          </Pressable>
        ) : null}

        <Text style={styles.terms}>By continuing you agree to our terms &amp; privacy policy</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bgPage,
  },
  background: {
    ...StyleSheet.absoluteFill,
    height: undefined,
  },
  lockup: {
    position: 'absolute',
    top: '44%',
    left: 0,
    right: 0,
    transform: [{ translateY: -60 }],
    alignItems: 'center',
    gap: 2,
  },
  logo: {
    width: 276,
    height: 92,
  },
  tagline: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: 28,
    letterSpacing: -0.28,
    color: colors.textPrimary,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 32,
    gap: 16,
  },
  skipWrap: {
    alignSelf: 'center',
  },
  /**
   * The size the terms line uses, at the product's request: the guest path is offered, not
   * advertised. What separates it from the legal copy underneath is treatment rather than
   * scale — the medium face, full opacity against the terms' 0.6, and an underline — so it
   * reads as a control instead of another line of small print.
   */
  skip: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    color: colors.textPrimary,
    textDecorationLine: 'underline',
  },
  skipPressed: {
    opacity: 0.6,
  },
  terms: {
    fontFamily: fontFamily.body,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    color: colors.textPrimary,
    opacity: 0.6,
  },
});
