import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AnalyticsConsentScreen } from '../src/components/AnalyticsConsentScreen';
import { decideConsent, disableAnalytics, enableAnalytics, track } from '../src/lib/analytics';
import { requiresPrivacyConsentGate } from '../src/lib/privacyRegion';
import { getSecureItem, setSecureItem, SECURE_KEYS } from '../src/lib/secure-storage';
import { QueryProvider } from '../src/providers/QueryProvider';
import { useAuthStore } from '../src/stores/auth';
import { colors } from '../src/theme/tokens';

export const unstable_settings = {
  initialRouteName: 'index',
};

void SplashScreen.preventAutoHideAsync();

type ConsentStatus = 'loading' | 'unknown' | 'granted' | 'denied';

export default function RootLayout() {
  const restore = useAuthStore((s) => s.restore);
  const [consentStatus, setConsentStatus] = useState<ConsentStatus>('loading');
  // TrueType, not the licensed OpenType masters beside them: Android's typeface loader does not
  // parse PostScript (CFF) outlines and falls back to the system face without raising, so the
  // .otf files rendered correctly on iOS and as Roboto on Android. See assets/fonts/README.md.
  const [fontsLoaded, fontError] = useFonts({
    SeriouslyNostalgic: require('../assets/fonts/SeriouslyNostalgicFine-Regular.ttf'),
    SeriouslyNostalgicItalic: require('../assets/fonts/SeriouslyNostalgic-RegularItalic.ttf'),
    BananaGrotesk: require('../assets/fonts/BananaGrotesk-Regular.ttf'),
    BananaGroteskLight: require('../assets/fonts/BananaGrotesk-Light.ttf'),
    BananaGroteskMedium: require('../assets/fonts/BananaGrotesk-Medium.ttf'),
    BananaGroteskThin: require('../assets/fonts/BananaGrotesk-Thin.ttf'),
  });

  useEffect(() => {
    void restore();
  }, [restore]);

  useEffect(() => {
    (async () => {
      // The region check is re-run every launch (cheap, offline) rather than cached, but it
      // only governs whether someone who has never answered is asked — a stored answer wins.
      const stored = await getSecureItem(SECURE_KEYS.analyticsConsent);
      const decision = decideConsent(stored, requiresPrivacyConsentGate());

      if (decision === 'granted') {
        enableAnalytics();
        setConsentStatus('granted');
      } else if (decision === 'denied') {
        disableAnalytics();
        setConsentStatus('denied');
      } else {
        setConsentStatus('unknown');
      }
    })();
  }, []);

  useEffect(() => {
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  const onConsentAnswer = (granted: boolean) => {
    void setSecureItem(SECURE_KEYS.analyticsConsent, granted ? 'granted' : 'denied');
    if (granted) {
      // Only the "granted" branch is trackable — declining means we can't record the decline.
      enableAnalytics();
      track('analytics_consent_answered', { consent_granted: true });
    } else {
      disableAnalytics();
    }
    setConsentStatus(granted ? 'granted' : 'denied');
  };

  if (!fontsLoaded && !fontError) return null;
  if (consentStatus === 'loading') return null;

  if (consentStatus === 'unknown') {
    return (
      <SafeAreaProvider>
        <AnalyticsConsentScreen onAnswer={onConsentAnswer} />
      </SafeAreaProvider>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryProvider>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.bgPage },
              animation: 'slide_from_right',
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="(onboarding)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="event/[slug]" />
            <Stack.Screen name="checkout" />
            <Stack.Screen name="ticket/[id]" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="orders/index" />
            <Stack.Screen name="orders/[id]" />
            <Stack.Screen name="account/profile" />
            <Stack.Screen name="account/delete" />
            <Stack.Screen name="legal/terms" />
          </Stack>
        </QueryProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
