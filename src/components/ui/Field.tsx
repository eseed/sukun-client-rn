import { type ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  type TextInputProps,
  View,
  type ViewStyle,
} from 'react-native';
import { colors, fontFamily } from '../../theme/tokens';
import { Text } from './Text';

/**
 * The bordered input box used across onboarding, checkout and payment:
 * 1.5px border-strong, 12px radius, 14/16 padding, white surface, with an 11px uppercase
 * label above.
 */

export function FieldLabel({ children }: { children: string }) {
  return <Text variant="fieldLabel">{children}</Text>;
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
  return (
    <View style={[styles.box, invalid && styles.boxInvalid, style]}>{children}</View>
  );
}

export interface TextFieldProps extends TextInputProps {
  label?: string;
  error?: string | null;
  /** Rendered inside the box, before the input — the `🇪🇬 +20` prefix on the phone screen. */
  prefix?: ReactNode;
  containerStyle?: ViewStyle;
}

export function TextField({
  label,
  error,
  prefix,
  containerStyle,
  style,
  ...rest
}: TextFieldProps) {
  return (
    <View style={[styles.field, containerStyle]}>
      {label ? <FieldLabel>{label}</FieldLabel> : null}
      <FieldBox invalid={Boolean(error)}>
        {prefix}
        <TextInput
          placeholderTextColor={colors.textMuted}
          style={[styles.input, style]}
          {...rest}
        />
      </FieldBox>
      {error ? (
        <Text variant="metaSm" color={colors.rose700}>
          {error}
        </Text>
      ) : null}
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
      {error ? (
        <Text variant="metaSm" color={colors.rose700}>
          {error}
        </Text>
      ) : null}
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
  boxInvalid: {
    borderColor: colors.rose700,
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
