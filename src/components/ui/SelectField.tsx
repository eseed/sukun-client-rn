import { Picker } from '@react-native-picker/picker';
import { useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../theme/tokens';
import { PickerField } from './Field';
import { Text } from './Text';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

/**
 * A field backed by the platform's own select control — Android's dropdown spinner, and on iOS
 * the system wheel in a sheet, since an inline iOS wheel is far too tall to sit in a half-width
 * field.
 *
 * On iOS the wheel edits a draft and only "Done" commits it. The wheel emits nothing until it is
 * actually turned, so opening the sheet and confirming without a spin used to leave the field
 * empty — the option the reader was looking at was never the one the form held. The scrim still
 * discards, as an iOS sheet should.
 *
 * On Android the Picker stays mounted and hidden over the field, and the field opens it with
 * `focus()`. Mounting it on press only rendered a second control that had to be tapped again;
 * the dropdown anchors to this view, so it can be invisible but not unmounted or zero-sized.
 */
export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  placeholder,
  error,
  containerStyle,
}: {
  label: string;
  value: T | null;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  placeholder: string;
  error?: string | null;
  containerStyle?: React.ComponentProps<typeof PickerField>['containerStyle'];
}) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  /** What the iOS wheel is showing. Only "Done" promotes it to the form. */
  const [draft, setDraft] = useState<T | null>(value);
  const androidPicker = useRef<Picker<string | T>>(null);
  const selectedLabel = options.find((option) => option.value === value)?.label ?? null;

  /** The placeholder row exists only while nothing is chosen, so it cannot be re-selected. */
  const items = (current: T | null) => (
    <>
      {current === null ? (
        <Picker.Item label={placeholder} value="" color={colors.textMuted} />
      ) : null}
      {options.map((option) => (
        <Picker.Item key={option.value} label={option.label} value={option.value} />
      ))}
    </>
  );

  if (Platform.OS !== 'ios') {
    return (
      <View style={containerStyle}>
        <PickerField
          label={label}
          value={selectedLabel}
          placeholder={placeholder}
          onPress={() => androidPicker.current?.focus()}
          error={error}
        />
        <View style={styles.androidAnchor} pointerEvents="none">
          <Picker
            ref={androidPicker}
            selectedValue={value ?? ''}
            onValueChange={(next) => {
              // Android's spinner offers the placeholder row too; only real options are choices.
              if (next) onChange(next as T);
            }}
            mode="dropdown"
            accessibilityLabel={label}
          >
            {items(value)}
          </Picker>
        </View>
      </View>
    );
  }

  return (
    <>
      <PickerField
        label={label}
        value={selectedLabel}
        placeholder={placeholder}
        onPress={() => {
          setDraft(value);
          setOpen(true);
        }}
        error={error}
        containerStyle={containerStyle}
      />
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.scrim} onPress={() => setOpen(false)} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.grabber} />
          <View style={styles.header}>
            <Text variant="eyebrow">{label}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                if (draft) onChange(draft);
                setOpen(false);
              }}
            >
              <Text variant="bodyValue" color={colors.accentSky}>
                Done
              </Text>
            </Pressable>
          </View>
          <Picker
            selectedValue={draft ?? ''}
            onValueChange={(next) => setDraft(next ? (next as T) : null)}
            accessibilityLabel={label}
          >
            {items(draft)}
          </Picker>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  androidAnchor: {
    ...StyleSheet.absoluteFill,
    opacity: 0,
  },
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.overlayScrim,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bgSurface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 10,
    paddingHorizontal: 20,
  },
  grabber: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderDefault,
    marginBottom: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
});
