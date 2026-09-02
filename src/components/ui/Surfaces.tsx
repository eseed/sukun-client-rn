import { type ReactNode } from 'react';
import { Image, type ImageSourcePropType, StyleSheet, View, type ViewStyle } from 'react-native';
import { colors, fontFamily, shadow } from '../../theme/tokens';
import { Text } from './Text';

/**
 * Card surfaces from the design: a 1px border-default box on white, with `--shadow-card`
 * where the design applies it.
 */
export function Card({
  children,
  radiusSize = 14,
  elevated = false,
  padded = true,
  style,
}: {
  children: ReactNode;
  radiusSize?: number;
  elevated?: boolean;
  padded?: boolean;
  style?: ViewStyle;
}) {
  return (
    <View
      style={[
        styles.card,
        { borderRadius: radiusSize },
        padded && styles.cardPadded,
        elevated && shadow.card,
        style,
      ]}
    >
      {children}
    </View>
  );
}

/**
 * A placeholder for design imagery that is not bundled yet. Renders a token-coloured wash
 * with the brand ring, so composition and spacing read correctly without the real asset.
 * See `assets/README.md`.
 */
export function ImageSlot({
  source,
  height,
  tint = colors.sage100,
  label,
  style,
  children,
}: {
  source?: ImageSourcePropType | null;
  height?: number;
  tint?: string;
  label?: string;
  style?: ViewStyle;
  children?: ReactNode;
}) {
  if (source) {
    return (
      <View style={[{ height }, styles.slot, style]}>
        <Image source={source} style={styles.slotImage} resizeMode="cover" />
        {children}
      </View>
    );
  }

  return (
    <View style={[{ height, backgroundColor: tint }, styles.slot, styles.slotEmpty, style]}>
      {label ? (
        <Text variant="eyebrow" color={colors.textMuted} style={styles.slotLabel}>
          {label}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

/** A key/value line in the review summary and the entry-pass detail list. */
export function SummaryRow({
  label,
  value,
  tone = 'default',
  emphasis = false,
}: {
  label: string;
  value: string;
  tone?: 'default' | 'muted' | 'positive';
  emphasis?: boolean;
}) {
  const color =
    tone === 'muted' ? colors.textMuted : tone === 'positive' ? colors.sage500 : colors.textPrimary;

  return (
    <View style={styles.summaryRow}>
      <Text
        style={[styles.summaryText, styles.summaryLabelText, emphasis && styles.summaryTotal, { color }]}
      >
        {label}
      </Text>
      <Text
        style={[
          styles.summaryText,
          styles.summaryValueText,
          emphasis && styles.summaryTotal,
          !emphasis && styles.summaryValue,
          { color },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

/** The chevron rows in the profile Account list. */
export function ListRow({
  label,
  onPress,
  tone = 'default',
}: {
  label: string;
  onPress?: () => void;
  tone?: 'default' | 'danger';
}) {
  const color = tone === 'danger' ? colors.rose700 : colors.textPrimary;
  return (
    <View style={styles.listRow}>
      <Text style={[styles.listLabel, { color }]}>{label}</Text>
      <Text style={[styles.chevron, { color: tone === 'danger' ? color : colors.textMuted }]}>
        ›
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderDefault,
  },
  cardPadded: {
    padding: 18,
  },
  slot: {
    width: '100%',
    overflow: 'hidden',
  },
  slotImage: {
    width: '100%',
    height: '100%',
  },
  slotEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotLabel: {
    opacity: 0.75,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  summaryText: {
    fontSize: 14,
  },
  summaryLabelText: {
    flexShrink: 1,
  },
  summaryValueText: {
    flexShrink: 0,
    textAlign: 'right',
  },
  summaryValue: {
    fontFamily: fontFamily.bodyMedium,
  },
  summaryTotal: {
    fontSize: 19,
    fontFamily: fontFamily.bodyMedium,
  },
  listRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 15,
    paddingHorizontal: 16,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: 12,
  },
  listLabel: {
    flexShrink: 1,
    fontSize: 14,
  },
  chevron: {
    flexShrink: 0,
    fontSize: 19,
  },
});
