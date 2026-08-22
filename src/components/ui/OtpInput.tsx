import { useRef } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { colors } from '../../theme/tokens';
import { Text } from './Text';

/**
 * The four-box code entry from design screen 03. A single hidden input backs all four boxes
 * so paste and the keyboard's one-time-code suggestion work; the boxes are presentation.
 *
 * The code arrives over WhatsApp, not SMS, so there is no SMS Retriever to hint at — Android
 * one-tap autofill would need the WhatsApp handshake with Meta, which we have not set up.
 */
export function OtpInput({
  value,
  onChange,
  length = 4,
  autoFocus = true,
}: {
  value: string;
  onChange: (next: string) => void;
  length?: number;
  autoFocus?: boolean;
}) {
  const inputRef = useRef<TextInput>(null);
  const digits = value.slice(0, length).split('');

  return (
    <Pressable
      accessibilityRole="none"
      onPress={() => inputRef.current?.focus()}
      style={styles.row}
    >
      {Array.from({ length }).map((_, index) => (
        <View key={index} style={styles.cell}>
          <Text style={styles.digit}>{digits[index] ?? ''}</Text>
        </View>
      ))}

      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(next) => onChange(next.replace(/\D/g, '').slice(0, length))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        autoFocus={autoFocus}
        maxLength={length}
        accessibilityLabel="Verification code"
        style={styles.hidden}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  cell: {
    flex: 1,
    height: 62,
    borderWidth: 1.5,
    borderColor: colors.black,
    borderRadius: 12,
    backgroundColor: colors.bgSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  digit: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  hidden: {
    position: 'absolute',
    opacity: 0,
    width: '100%',
    height: '100%',
  },
});
