import { type ReactNode, type Ref } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  type TextInputProps,
  View,
  type ViewStyle,
} from 'react-native';
import { colors, fontFamily } from '../../theme/tokens';
import { KEYBOARD_DONE_ID, KeyboardDoneAccessory, needsDoneAccessory } from './KeyboardDone';
import { Text } from './Text';

/**
 * The bordered input box used across onboarding, checkout and payment:
 * 1.5px border-strong, 12px radius, 14/16 padding, white surface, with an 11px uppercase
 * label above.
 */

export function FieldLabel({ children }: { children: string }) {
  return <Text variant="fieldLabel">{children}</Text>;
}

/**
 * The line under a field with a problem: a small rose300 disc with "!" ahead of the rose700
 * sentence, so it reads as an error at a glance (owner's call 2026-10-10, as on the website).
 * The disc is hidden from screen readers, so the field is described by the sentence alone.
 */
export function FieldError({ message }: { message: string }) {
  return (
    <View style={styles.error}>
      <View
        style={styles.errorMark}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Text variant="metaSm" color={colors.white} style={styles.errorMarkText}>
          !
        </Text>
      </View>
      <Text variant="metaSm" color={colors.rose700} style={styles.errorText}>
        {message}
      </Text>
    </View>
  );
}

export function FieldBox({
  children,
  invalid = false,
  style,
}: {
  children: ReactNode;
  invalid?: boolean;
  style?: ViewStyle;
}) {
  return <View style={[styles.box, invalid && styles.boxInvalid, style]}>{children}</View>;
}

export interface TextFieldProps extends TextInputProps {
  label?: string;
  error?: string | null;
  /** Rendered inside the box, before the input — the `🇪🇬 +20` prefix on the phone screen. */
  prefix?: ReactNode;
  containerStyle?: ViewStyle;
  /** The input itself, so a form can focus the field that needs fixing. */
  ref?: Ref<TextInput>;
}

export function TextField({
  label,
  error,
  prefix,
  containerStyle,
  style,
  ref,
  ...rest
}: TextFieldProps) {
  // A numeric keyboard has no return key to dismiss it with, so those fields get a Done bar.
  const done = needsDoneAccessory(rest.keyboardType);

  return (
    <View style={[styles.field, containerStyle]}>
      {label ? <FieldLabel>{label}</FieldLabel> : null}
      <FieldBox invalid={Boolean(error)}>
        {prefix}
        <TextInput
          ref={ref}
          placeholderTextColor={colors.textMuted}
          style={[styles.input, style]}
          {...rest}
          inputAccessoryViewID={done ? KEYBOARD_DONE_ID : rest.inputAccessoryViewID}
        />
        {done ? <KeyboardDoneAccessory /> : null}
      </FieldBox>
      {error ? <FieldError message={error} /> : null}
    </View>
  );
}

/**
 * A field that opens a picker rather than a keyboard (gender, area, date of birth). Renders
 * identically to a `TextField` so the form reads as one thing.
 */
export function PickerField({
  label,
  value,
  placeholder,
  onPress,
  error,
  containerStyle,
}: {
  label: string;
  value: string | null;
  placeholder: string;
  onPress: () => void;
  error?: string | null;
  containerStyle?: ViewStyle;
}) {
  return (
    <View style={[styles.field, containerStyle]}>
      <FieldLabel>{label}</FieldLabel>
      <Pressable accessibilityRole="button" onPress={onPress}>
        <FieldBox invalid={Boolean(error)}>
          <Text
            variant="bodyValue"
            color={value ? colors.textPrimary : colors.textMuted}
            style={styles.pickerValue}
            numberOfLines={1}
          >
            {value ?? placeholder}
          </Text>
        </FieldBox>
      </Pressable>
      {error ? <FieldError message={error} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'column',
    gap: 7,
  },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: colors.bgSurface,
  },
  // Thickened to 2.5px so it stands out, with 1px less padding so the box keeps its size.
  boxInvalid: {
    borderColor: colors.borderInvalid,
    borderWidth: 2.5,
    paddingVertical: 13,
    paddingHorizontal: 15,
  },
  error: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  // 14px, centred on the 12px message's first line.
  errorMark: {
    width: 14,
    height: 14,
    marginTop: 1,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.borderInvalid,
  },
  errorMarkText: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: 10,
    lineHeight: 12,
  },
  errorText: {
    flex: 1,
  },
  input: {
    flex: 1,
    fontFamily: fontFamily.body,
    fontSize: 15,
    color: colors.textPrimary,
    padding: 0,
  },
  pickerValue: {
    flex: 1,
  },
});
