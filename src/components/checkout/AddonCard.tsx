import { Pressable, StyleSheet, View } from 'react-native';
import type { AddonSummary, AddonType } from '../../api/types';
import { formatEgp } from '../../lib/format';
import { colors, fontSize, space } from '../../theme/tokens';
import { Badge, type BadgeTone, ImageSlot, Text } from '../ui';

/**
 * One extra on the browse list (design screens 10, 15 and 22).
 *
 * The design lays the card out as a 62px thumbnail beside three rows: the type badge, the name,
 * and a price row whose right-hand side carries the price window and the remaining count as one
 * muted line ("Early bird", "Regular · 3 left", "12 left", "Sold out"). The louder
 * "Early bird selling fast" badge in the design belongs to the event detail screen, not here,
 * and the "Early bird pricing until 1 Sep, then Regular." sentence belongs to the add-on detail
 * screen, which has the option that sentence is built from.
 *
 * Everything shown here is a server figure or nothing at all. `availableQuantity` is null when
 * the event has decided the remaining count is not public yet, and null means "say nothing",
 * never "none left": sold out arrives as an explicit zero alongside `availability`. No figure on
 * this card is computed, compared or combined (CLAUDE.md rule 7).
 */

/**
 * The design's per-type wording: Accommodation, Meals, Transport. It reads twice on screen 10,
 * once as the section header and once as the badge on each card, so it is exported rather than
 * written out again on the browse screen where the two copies could drift apart.
 */
export const ADDON_TYPE_LABEL: Record<AddonType, string> = {
  accommodation: 'Accommodation',
  meal: 'Meals',
  transport: 'Transport',
  other: 'More',
};

/**
 * Badge tones as the design colours them: accommodation sky, meals gold, transport sage. The
 * design has no artboard for the "other" type, so it takes the one remaining tone rather than a
 * new colour.
 */
const TYPE_TONE: Record<AddonType, BadgeTone> = {
  accommodation: 'sky',
  meal: 'gold',
  transport: 'sage',
  other: 'rose',
};

/** The tint behind a thumbnail the event has not given an image for. */
const TYPE_TINT: Record<AddonType, string> = {
  accommodation: colors.sky100,
  meal: colors.gold100,
  transport: colors.sage100,
  other: colors.rose100,
};

export function AddonCard({
  addon,
  picked,
  onPress,
}: {
  addon: AddonSummary;
  picked: boolean;
  onPress: () => void;
}) {
  const soldOut = addon.availability === 'unavailable';
  const remaining = addon.availableQuantity;
  const showRemaining = !soldOut && remaining !== null && remaining > 0;

  const priceLabel = addon.fromPriceEgpNow
    ? // "From" only when there is more than one option to choose between.
      addon.optionCount > 1
      ? `From ${formatEgp(addon.fromPriceEgpNow)}`
      : formatEgp(addon.fromPriceEgpNow)
    : 'Not on sale right now';

  // The right-hand meta line, exactly as the design writes it. A withheld count contributes
  // nothing, so a card with no window and no published count simply has no meta line.
  const windowAndStock = [addon.priceWindowName, showRemaining ? `${remaining} left` : null].filter(
    (part): part is string => Boolean(part),
  );
  const meta = soldOut ? 'Sold out' : windowAndStock.join(' · ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[ADDON_TYPE_LABEL[addon.type], addon.name, priceLabel, meta]
        .filter(Boolean)
        .join(', ')}
      accessibilityState={{ disabled: soldOut, selected: picked }}
      disabled={soldOut}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        picked && styles.picked,
        soldOut && styles.soldOut,
        pressed && styles.pressed,
      ]}
    >
      <ImageSlot
        source={addon.featuredImageUrl ? { uri: addon.featuredImageUrl } : null}
        height={62}
        tint={TYPE_TINT[addon.type]}
        style={styles.thumb}
      />

      <View style={styles.body}>
        <View style={styles.badges}>
          <Badge label={ADDON_TYPE_LABEL[addon.type]} tone={TYPE_TONE[addon.type]} />
          {picked ? <Badge label="Added" tone="sage" /> : null}
        </View>

        <Text style={styles.name}>{addon.name}</Text>

        <View style={styles.priceRow}>
          <Text style={styles.price}>{priceLabel}</Text>
          {meta ? (
            <Text variant="metaSm" color={colors.textMuted} style={styles.meta}>
              {meta}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s3,
    backgroundColor: colors.bgSurface,
    borderColor: colors.borderDefault,
    // 14px card / 10px thumbnail corners, as the design draws them. `radius` tops out at 4, so
    // these two are the design's own values until a card radius token exists to hold them.
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: space.s2,
    padding: space.s3,
  },
  picked: { borderColor: colors.borderStrong, borderWidth: 2 },
  soldOut: { opacity: 0.55 },
  pressed: { opacity: 0.8 },
  thumb: { width: 62, borderRadius: 10, flexGrow: 0, flexShrink: 0 },
  body: { flex: 1, gap: space.s1 },
  badges: { flexDirection: 'row', gap: space.s1, flexWrap: 'wrap' },
  name: { fontSize: fontSize.bodyMd, fontWeight: '600', color: colors.textPrimary },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: space.s2,
  },
  price: { fontSize: fontSize.bodySm, fontWeight: '500', color: colors.textPrimary, flexShrink: 1 },
  meta: { textAlign: 'right', flexShrink: 1 },
});
