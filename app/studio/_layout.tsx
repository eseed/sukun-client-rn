import { Stack } from 'expo-router';
import { colors } from '../../src/theme/tokens';

/** Studio's pushed screens: schedule, info, packages, terms, checkout, check-in, ratings. */
// Per-screen options (no swipe back from payment or the success screens, the scanner sliding
// up) live in those screens: a screen listed here first becomes the stack's initial route, and a
// reload opened payment.
export default function StudioLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bgPage },
      }}
    />
  );
}
