import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryProvider } from '../src/providers/QueryProvider';
import { useAuthStore } from '../src/stores/auth';
import { colors } from '../src/theme/tokens';

export const unstable_settings = {
  initialRouteName: 'index',
};

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const restore = useAuthStore((s) => s.restore);
  const [fontsLoaded, fontError] = useFonts({
    SeriouslyNostalgic: require('../assets/fonts/SeriouslyNostalgicFine-Regular.otf'),
    SeriouslyNostalgicItalic: require('../assets/fonts/SeriouslyNostalgic-RegularItalic.otf'),
    BananaGrotesk: require('../assets/fonts/BananaGrotesk-Regular.otf'),
    BananaGroteskLight: require('../assets/fonts/BananaGrotesk-Light.otf'),
    BananaGroteskMedium: require('../assets/fonts/BananaGrotesk-Medium.otf'),
    BananaGroteskThin: require('../assets/fonts/BananaGrotesk-Thin.otf'),
    MinionPro: require('../assets/fonts/MinionPro-Regular.otf'),
  });

  useEffect(() => {
    void restore();
  }, [restore]);

  useEffect(() => {
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

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
            <Stack.Screen name="account/delete" />
            <Stack.Screen name="legal" />
          </Stack>
        </QueryProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
