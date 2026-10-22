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
      {/* The order is placed: back must not reopen an editable step (payment.tsx owns Back). */}
      <Stack.Screen name="payment" options={{ gestureEnabled: false }} />
      <Stack.Screen name="confirmation" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
