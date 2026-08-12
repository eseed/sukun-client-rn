import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../theme/tokens';
import { RadioDot } from './Selection';
import { Text } from './Text';

export interface SheetOption {
  value: string;
  label: string;
}

/**
 * The bottom sheet behind every picker field (gender, living area). Uses the same surface
 * language as the cards: white, border-default, 16px radius on the top corners.
 */
export function OptionSheet({
  visible,
  title,
  options,
  selectedValue,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: SheetOption[];
  selectedValue: string | null;
  onSelect: (value: string) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.grabber} />
        <Text variant="eyebrow" style={styles.title}>
          {title}
        </Text>
        <FlatList
          data={options}
          keyExtractor={(item) => item.value}
          style={styles.list}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ selected: item.value === selectedValue }}
              onPress={() => {
                onSelect(item.value);
                onClose();
              }}
              style={({ pressed }) => [styles.option, pressed && styles.pressed]}
            >
              <RadioDot selected={item.value === selectedValue} size={20} />
              <Text variant="bodyValue">{item.label}</Text>
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
    maxHeight: '70%',
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
  list: {
    flexGrow: 0,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderDefault,
  },
  pressed: {
    opacity: 0.7,
  },
});
