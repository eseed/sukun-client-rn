import { useRouter } from 'expo-router';
import { Image, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, ImageSlot, Text } from '../../src/components/ui';
import { track } from '../../src/lib/analytics';
import { designAsset } from '../../src/theme/assets';
import { colors, fontFamily } from '../../src/theme/tokens';

/** Design screen 01 · Welcome. */
export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dancers = designAsset('welcomeDancers');
  const logo = designAsset('logoBlack');

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
        <Button
          label="Restore account"
          variant="secondary"
          onPress={() => router.push('/account/restore-phone')}
        />
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
  terms: {
    fontFamily: fontFamily.body,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    color: colors.textPrimary,
    opacity: 0.6,
  },
});
