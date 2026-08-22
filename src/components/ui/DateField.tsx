import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../theme/tokens';
import { PickerField } from './Field';
import { Text } from './Text';

/**
 * A date field backed by the platform's own picker — the iOS wheel inside our sheet, the
 * Android dialog as the OS draws it.
 *
 * With nothing chosen yet the picker opens on today rather than on some arbitrary birth year.
 * `maximumDate` only rules out the future; the age rule lives in the form schema so an
 * under-age date is answered with a sentence rather than a wheel that refuses to turn.
 *
 * On iOS the wheel edits a draft and only "Done" commits it. The wheel emits nothing until it
 * is actually turned, so a sheet opened and confirmed without a spin used to leave the field
 * empty — the value the reader was looking at was never the value the form held. Dismissing by
 * the scrim still discards, as an iOS sheet should.
 */
export function DateField({
  label,
  value,
  onChange,
  placeholder,
  error,
  containerStyle,
  format,
}: {
  label: string;
  /** `YYYY-MM-DD`, or empty when unset. */
  value: string;
  onChange: (isoDate: string) => void;
  placeholder: string;
  error?: string | null;
  containerStyle?: React.ComponentProps<typeof PickerField>['containerStyle'];
  /** Renders the chosen date for display. */
  format: (isoDate: string) => string;
}) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const today = new Date();
  const selected = toDate(value) ?? today;
  /** What the iOS wheel is showing. Only "Done" promotes it to the form. */
  const [draft, setDraft] = useState<Date>(selected);

  function commit(next: Date) {
    onChange(toIsoDate(next));
  }

  function openSheet() {
    setDraft(toDate(value) ?? today);
    setOpen(true);
  }

  const picker = (
    <DateTimePicker
      value={Platform.OS === 'ios' ? draft : selected}
      mode="date"
      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
      maximumDate={today}
      onChange={(event, date) => {
        // Android's dialog is one-shot: it reports the result and is gone, so it commits here.
        // iOS keeps the wheel on screen and only moves the draft.
        if (Platform.OS !== 'ios') {
          setOpen(false);
          if (event.type === 'set' && date) commit(date);
          return;
        }
        if (date) setDraft(date);
      }}
    />
  );

  return (
    <>
      <PickerField
        label={label}
        value={value ? format(value) : null}
        placeholder={placeholder}
        onPress={openSheet}
        error={error}
        containerStyle={containerStyle}
      />

      {open && Platform.OS !== 'ios' ? picker : null}

      {Platform.OS === 'ios' ? (
        <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
          <Pressable
            style={styles.scrim}
            onPress={() => setOpen(false)}
            accessibilityLabel="Close"
          />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
            <View style={styles.grabber} />
            <View style={styles.header}>
              <Text variant="eyebrow">{label}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  commit(draft);
                  setOpen(false);
                }}
              >
                <Text variant="bodyValue" color={colors.accentSky}>
                  Done
                </Text>
              </Pressable>
            </View>
            {open ? picker : null}
          </View>
        </Modal>
      ) : null}
    </>
  );
}

/** `"1994-03-12"` → a local `Date`, or `null` when unset or malformed. */
function toDate(isoDate: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const parsed = new Date(`${isoDate}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** A local `Date` → `"1994-03-12"`, read in local time so the day never slips a timezone. */
function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

const styles = StyleSheet.create({
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
