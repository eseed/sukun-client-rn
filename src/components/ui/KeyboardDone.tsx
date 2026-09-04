import { Keyboard, InputAccessoryView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { colors } from '../../theme/tokens';
import { Text } from './Text';

/**
 * iOS numeric keyboards (`phone-pad`, `number-pad`, `numeric`) have no return key, so a field
 * using one needs its own way out. On an iPad running the app in iPhone compatibility mode the
 * page is a small window in the middle of the screen and the keyboard covers most of it, so
 * "tap outside the field" is not an escape either: the space around the window belongs to the
 * system, not to us. This bar is the one dismissal that always works.
 */
export const KEYBOARD_DONE_ID = 'sukun-keyboard-done';

const NUMERIC_KEYBOARDS = ['phone-pad', 'number-pad', 'numeric', 'decimal-pad'];

/** The accessory only exists on iOS; Android's numeric keyboards carry a system back gesture. */
export function needsDoneAccessory(keyboardType?: string | null): boolean {
  return Platform.OS === 'ios' && NUMERIC_KEYBOARDS.includes(keyboardType ?? '');
}

export function KeyboardDoneAccessory() {
  if (Platform.OS !== 'ios') return null;

  return (
    <InputAccessoryView nativeID={KEYBOARD_DONE_ID}>
      <View style={styles.bar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Hide keyboard"
          onPress={() => Keyboard.dismiss()}
          hitSlop={12}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        >
          <Text variant="bodyValue" color={colors.accentSky}>
            Done
          </Text>
        </Pressable>
      </View>
    </InputAccessoryView>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    backgroundColor: colors.bgSurface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderDefault,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  button: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pressed: {
    opacity: 0.6,
  },
});
