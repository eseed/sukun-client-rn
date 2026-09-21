import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AnalyticsConsentScreen } from '../src/components/AnalyticsConsentScreen';
import { QueryProvider } from '../src/providers/QueryProvider';
import { useAuthStore } from '../src/stores/auth';
import { useConsentStore } from '../src/stores/consent';
import { useFlagsStore } from '../src/stores/flags';
import { colors } from '../src/theme/tokens';

export const unstable_settings = {
  initialRouteName: 'index',
};

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const restore = useAuthStore((s) => s.restore);
  // The answer lives in a store rather than here, so the settings screen can change it later.
  // See `src/stores/consent.ts`.
  const consentStatus = useConsentStore((s) => s.status);
  const loadConsent = useConsentStore((s) => s.load);
  const answerConsent = useConsentStore((s) => s.answer);
  // Whether the guest path is offered is a backend answer now, and it decides what the very
  // first screen looks like, so it is resolved here rather than inside the screen that reads
  // it. The store guarantees this settles quickly even offline. See `src/stores/flags.ts`.
  const flagsStatus = useFlagsStore((s) => s.status);
  const loadFlags = useFlagsStore((s) => s.load);
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
    void loadConsent();
  }, [loadConsent]);

  useEffect(() => {
    void loadFlags();
  }, [loadFlags]);

  useEffect(() => {
    // Every gate below returns null until it resolves, so hiding the splash on fonts alone
    // would trade the splash for a blank screen. Wait for all three.
    const ready = (fontsLoaded || fontError) && consentStatus !== 'loading' && flagsStatus !== 'loading';
    if (ready) void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError, consentStatus, flagsStatus]);

  const onConsentAnswer = (granted: boolean) => {
    void answerConsent(granted);
  };

  if (!fontsLoaded && !fontError) return null;
  if (consentStatus === 'loading') return null;
  if (flagsStatus === 'loading') return null;

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
            <Stack.Screen name="account/selfie" />
            <Stack.Screen name="account/analytics" />
            <Stack.Screen name="account/delete" />
            <Stack.Screen name="legal/terms" />
          </Stack>
        </QueryProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
