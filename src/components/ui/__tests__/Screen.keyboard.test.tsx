import { render, fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../test-utils';
import { Keyboard, Text as RNText, View } from 'react-native';
import { Screen } from '../Screen';
import { TextField } from '../Field';
import { KEYBOARD_DONE_ID } from '../KeyboardDone';

/**
 * App Review rejected build 11 (submission 38b5d3a2) because the phone screen's keyboard could
 * not be dismissed and the CTA was clipped behind it on an iPad running the app in iPhone
 * compatibility mode. These two guard the escapes that fix it.
 */
describe('keyboard escapes', () => {
  it('dismisses the keyboard when the page behind the field is tapped', () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});

    const { getByTestId } = renderWithProviders(
      <Screen>
        <View testID="body">
          <RNText>Hello</RNText>
        </View>
      </Screen>,
    );

    fireEvent.press(getByTestId('body').parent!);
    expect(dismiss).toHaveBeenCalled();
    dismiss.mockRestore();
  });

  it('gives a numeric field a Done accessory, since it has no return key', () => {
    const { getByLabelText } = render(
      <TextField label="Mobile number" keyboardType="phone-pad" accessibilityLabel="Mobile number" />,
    );

    expect(getByLabelText('Mobile number').props.inputAccessoryViewID).toBe(KEYBOARD_DONE_ID);
  });

  it('leaves a text field alone, since its keyboard has a return key', () => {
    const { getByLabelText } = render(<TextField label="Email" accessibilityLabel="Email" />);

    expect(getByLabelText('Email').props.inputAccessoryViewID).toBeUndefined();
  });
});
