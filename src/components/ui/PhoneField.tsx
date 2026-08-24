import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import type { CountryCode } from 'libphonenumber-js/mobile';
import { colors } from '../../theme/tokens';
import {
  dialCodeFor,
  flagFor,
  formatNationalInput,
  placeholderFor,
  sanitizeNationalInput,
} from '../../lib/phone';
import { CountrySheet } from './CountrySheet';
import { TextField } from './Field';
import { Text } from './Text';

/** The `🇪🇬 +20` prefix inside a phone input. Tapping it opens the country picker. */
export function CountryPrefix({
  country,
  onPress,
  compact = false,
}: {
  country: CountryCode;
  onPress: () => void;
  /** Matches the smaller type of the inline guest row rather than a full field. */
  compact?: boolean;
}) {
  const style = compact ? styles.prefixCompact : undefined;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Country: +${dialCodeFor(country)}. Change`}
      onPress={onPress}
      style={({ pressed }) => [styles.prefix, style, pressed && styles.pressed]}
    >
      <Text
        variant="bodyValue"
        color={colors.textMuted}
        style={compact ? styles.prefixTextCompact : styles.prefixText}
      >
        {flagFor(country)} +{dialCodeFor(country)} ▾
      </Text>
    </Pressable>
  );
}

export interface PhoneFieldProps {
  label?: string;
  country: CountryCode;
  onCountryChange: (country: CountryCode) => void;
  /** National digits only — no trunk prefix, no calling code. */
  national: string;
  onNationalChange: (national: string) => void;
  error?: string | null;
  placeholder?: string;
  onBlur?: () => void;
}

/**
 * A phone number entered as a country plus a national number, which is the only shape that
 * stays unambiguous once more than one country is in play: `01012345678` means different
 * numbers in different places, `+20 10 12345678` means one.
 */
export function PhoneField({
  label = 'Mobile number',
  country,
  onCountryChange,
  national,
  onNationalChange,
  error,
  placeholder,
  onBlur,
}: PhoneFieldProps) {
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <>
      <TextField
        label={label}
        value={formatNationalInput(national, country)}
        onChangeText={(value) => onNationalChange(sanitizeNationalInput(value, country))}
        onBlur={onBlur}
        placeholder={placeholder ?? placeholderFor(country)}
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoComplete="tel"
        error={error}
        accessibilityLabel={label}
        prefix={<CountryPrefix country={country} onPress={() => setSheetOpen(true)} />}
      />
      <CountrySheet
        visible={sheetOpen}
        selectedCode={country}
        onSelect={(code) => {
          // The digits that were typed belong to the old country's plan, so they are cleared
          // rather than silently reinterpreted under a different calling code.
          if (code !== country) onNationalChange('');
          onCountryChange(code as CountryCode);
        }}
        onClose={() => setSheetOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  prefix: {
    borderRightWidth: 1,
    borderRightColor: colors.borderDefault,
    paddingRight: 10,
  },
  prefixText: {
    fontSize: 16,
  },
  prefixCompact: {
    paddingRight: 8,
  },
  prefixTextCompact: {
    fontSize: 14,
  },
  pressed: {
    opacity: 0.6,
  },
});
