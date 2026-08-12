import { Pressable, StyleSheet, View } from 'react-native';
import { colors, radius } from '../../theme/tokens';
import { Text } from './Text';

/**
 * `Tag` and `Badge` from the Sukun design system
 * (`_ds_manifest.json` → `components/display/{Tag,Badge}.jsx`), rebuilt in React Native from
 * the tokens and their usage in `Sukun App - All Screens.dc.html`:
 * Tag is a 32px selectable pill filter; Badge is a 22–24px tonal status pill.
 */

export function Tag({
  label,
  selected = false,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tag,
        selected ? styles.tagSelected : styles.tagIdle,
        pressed && styles.pressed,
      ]}
    >
      <Text
        variant="meta"
        color={selected ? colors.creme : colors.textPrimary}
        style={styles.tagLabel}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export type BadgeTone = 'sky' | 'gold' | 'sage' | 'rose';

const TONES: Record<BadgeTone, { bg: string; fg: string }> = {
  sky: { bg: colors.sky100, fg: colors.sky500 },
  gold: { bg: colors.gold100, fg: colors.gold700 },
  sage: { bg: colors.sage100, fg: colors.sage500 },
  rose: { bg: colors.rose100, fg: colors.rose700 },
};

export function Badge({ label, tone = 'sky' }: { label: string; tone?: BadgeTone }) {
  const { bg, fg } = TONES[tone];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.badgeLabel, { color: fg }]}>{label}</Text>
    </View>
  );
}

/** The solid "On sale now" pill over the featured image. */
export function OverlayPill({ label }: { label: string }) {
  return (
    <View style={styles.overlayPill}>
      <Text style={styles.overlayPillLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    height: 32,
    paddingHorizontal: 15,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  tagIdle: {
    backgroundColor: colors.bgSurface,
    borderColor: colors.borderDefault,
  },
  tagSelected: {
    backgroundColor: colors.black,
    borderColor: colors.black,
  },
  tagLabel: {
    fontSize: 13,
  },
  pressed: {
    opacity: 0.85,
  },
  badge: {
    height: 24,
    paddingHorizontal: 11,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  badgeLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 10 * 0.1,
    textTransform: 'uppercase',
  },
  overlayPill: {
    backgroundColor: colors.rose300,
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  overlayPillLabel: {
    color: colors.creme,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 10 * 0.1,
    textTransform: 'uppercase',
  },
});
