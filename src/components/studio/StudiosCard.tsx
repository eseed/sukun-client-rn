import { Pressable, StyleSheet, View } from 'react-native';
import type { StudioBranch } from '../../api/studio-types';
import { branchShortName, sortBranches } from '../../lib/studio';
import { colors, fontFamily, radius } from '../../theme/tokens';
import { Text } from '../ui';
import { StudioIcon, StudioTag } from './StudioUi';

/**
 * Design `discover-tab` (INT-04): the Sukun Studios card on Discover. It opens the Studio tab;
 * the admin sets its place among the events and can hide it (sc-2-2).
 */
export function StudiosCard({
  branches,
  onPress,
}: {
  branches: StudioBranch[];
  onPress: () => void;
}) {
  const places = sortBranches(branches)
    .map((b) =>
      [branchShortName(b.name), b.locationName?.split(' · ')[0]].filter(Boolean).join(' · '),
    )
    .join(' · ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Sukun Studios, yoga, Pilates and more"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.art}>
        <View style={styles.tag}>
          <StudioTag label="Classes every day" tone="dark" />
        </View>
        <StudioIcon name="lotus" size={72} color="rgba(247,240,224,0.6)" />
      </View>
      <View style={styles.body}>
        <Text style={styles.kicker}>Sukun Studios</Text>
        <Text style={styles.title}>Yoga, Pilates & more</Text>
        {places ? <Text style={styles.places}>{places}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: radius.card,
    overflow: 'hidden',
    marginBottom: 20,
  },
  pressed: { opacity: 0.85 },
  art: {
    height: 150,
    backgroundColor: colors.sage500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tag: { position: 'absolute', top: 12, left: 12 },
  body: { padding: 16, gap: 4 },
  kicker: {
    fontSize: 11,
    letterSpacing: 11 * 0.14,
    textTransform: 'uppercase',
    color: colors.sage500,
  },
  title: {
    fontFamily: fontFamily.displayItalic,
    fontSize: 25,
    lineHeight: 28,
    color: colors.textPrimary,
  },
  places: { fontSize: 13, color: colors.textMuted },
});
