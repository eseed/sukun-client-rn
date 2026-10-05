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
