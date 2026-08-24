import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fontFamily, space } from '../../theme/tokens';
import { dialCodeFor, flagFor, SUPPORTED_COUNTRIES } from '../../lib/phone';
import { Text } from './Text';

/**
 * Country picker for the phone field. Unlike `OptionSheet` this one searches: the list can run
 * to well over two hundred entries, which is past the point where scrolling to find one works.
 */
export function CountrySheet({
  visible,
  selectedCode,
  onSelect,
  onClose,
}: {
  visible: boolean;
  selectedCode: string;
  onSelect: (code: string) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length === 0) return SUPPORTED_COUNTRIES;

    // Matching the dial code with or without its `+` is what makes "+44" and "44" both work.
    const digits = needle.replace(/^\+/, '');
    return SUPPORTED_COUNTRIES.filter(
      (country) =>
        country.name.toLowerCase().includes(needle) ||
        country.code.toLowerCase() === needle ||
        (digits.length > 0 && country.dialCode.startsWith(digits)),
    );
  }, [query]);

  function close() {
    setQuery('');
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.scrim} onPress={close} accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + space.s3 }]}>
        <View style={styles.grabber} />
        <Text variant="eyebrow" style={styles.title}>
          Country
        </Text>
        <View style={styles.searchBox}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search country or code"
            placeholderTextColor={colors.textMuted}
            autoCorrect={false}
            autoCapitalize="none"
            style={styles.searchInput}
            accessibilityLabel="Search country"
          />
        </View>
        <FlatList
          data={results}
          keyExtractor={(item) => item.code}
          style={styles.list}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text variant="bodyMuted" style={styles.empty}>
              No country matches that.
            </Text>
          }
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ selected: item.code === selectedCode }}
              accessibilityLabel={`${item.name} +${item.dialCode}`}
              onPress={() => {
                onSelect(item.code);
                close();
              }}
              style={({ pressed }) => [styles.option, pressed && styles.pressed]}
            >
              <Text style={styles.flag}>{flagFor(item.code)}</Text>
              <Text variant="bodyValue" style={styles.name} numberOfLines={1}>
                {item.name}
              </Text>
              <Text variant="bodyMuted">+{dialCodeFor(item.code)}</Text>
            </Pressable>
          )}
        />
      </View>
    </Modal>
  );
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
    maxHeight: '80%',
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
  title: {
    marginBottom: 10,
  },
  searchBox: {
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: space.s3,
  },
  searchInput: {
    fontFamily: fontFamily.body,
    fontSize: 15,
    color: colors.textPrimary,
    padding: 0,
  },
  list: {
    flexGrow: 0,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderDefault,
  },
  pressed: {
    opacity: 0.7,
  },
  flag: {
    fontSize: 22,
  },
  name: {
    flex: 1,
  },
  empty: {
    paddingVertical: space.s5,
    textAlign: 'center',
  },
});
