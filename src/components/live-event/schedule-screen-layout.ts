import type { ViewStyle } from 'react-native';
import { space } from '../../theme/tokens';

/** Keep schedule routes phone-width in browser previews while filling native screens. */
export const scheduleScreenContent: ViewStyle = {
  paddingHorizontal: space.s5,
  paddingTop: space.s5,
  gap: space.s5,
  width: '100%',
  maxWidth: 520,
  alignSelf: 'center',
};

/**
 * The same frame at the LIVE home's s4 page rhythm, so the attendee pages share one
 * padding. The public schedule keeps `scheduleScreenContent` untouched.
 */
export const liveScheduleContent: ViewStyle = {
  ...scheduleScreenContent,
  paddingHorizontal: space.s4,
  paddingTop: space.s4,
};
