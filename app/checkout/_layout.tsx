import { Stack } from 'expo-router';
import { colors } from '../../src/theme/tokens';

export default function CheckoutLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bgPage },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="pass" />
      <Stack.Screen name="guests" />
      <Stack.Screen name="review" />
      <Stack.Screen name="payment" />
      <Stack.Screen name="confirmation" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
