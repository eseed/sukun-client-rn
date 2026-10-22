import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import type {
  EventTierGroupPrice,
  GroupDiscountBreakdown,
  GroupDiscountTier,
  GroupQuote,
} from '../../api/types';
import { formatEgp } from '../../lib/format';
import {
  formatPercent,
  groupDiscountNudge,
  groupDiscountOffer,
  groupDiscountTeaser,
  type GroupDiscountOffer as Offer,
} from '../../lib/groupDiscount';
import { colors, radius, space } from '../../theme/tokens';
import { Button, CheckIcon, PeopleIcon, Text } from '../ui';

/*
 * Group discounts, as the website shows them (`sukun-client-web/src/components/checkout/
 * GroupDiscount.tsx`). Every figure is the server's: the steps' percentages, the passes' group
 * prices, a mixed group's quote and the cart's breakdown (CLAUDE.md rule 7).
 */

/** The offer's warm wash: gold100 into rose100, corner to corner. */
function Wash({ id }: { id: string }) {
  return (
    <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={colors.groupOfferFrom} />
          <Stop offset="1" stopColor={colors.groupOfferTo} />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

/** The ladder: one dot per step, filled up to the step reached, the next one ringed. */
function StepLadder({ offer }: { offer: Offer }) {
  const reachedIndex = offer.reached ? offer.steps.indexOf(offer.reached) : -1;
  const filled =
    reachedIndex < 0 ? 0 : offer.steps.length > 1 ? reachedIndex / (offer.steps.length - 1) : 1;
  return (
    <View accessibilityLabel="Group discounts" style={styles.ladder}>
      {offer.steps.length > 1 ? (
        <View style={styles.track}>
          <View style={[styles.trackFill, { width: `${filled * 100}%` }]} />
        </View>
      ) : null}
      <View style={styles.steps}>
        {offer.steps.map((step, index) => {
          const state = index <= reachedIndex ? 'reached' : step === offer.next ? 'next' : 'ahead';
          return (
            <View key={step.minTickets} style={styles.step} testID={`group-step-${state}`}>
              <View
                style={[
                  styles.node,
                  state === 'reached' && styles.nodeReached,
                  state === 'next' && styles.nodeNext,
                ]}
              >
                {state === 'reached' ? (
                  <CheckIcon size={14} color={colors.creme} />
                ) : (
                  <Text
                    variant="metaSm"
                    color={state === 'next' ? colors.rose500 : colors.groupOfferInk}
                  >
                    {String(step.minTickets)}
                  </Text>
                )}
              </View>
              <Text variant="metaSm" color={colors.textPrimary}>
                {`${formatPercent(step.percent)} off`}
              </Text>
              <Text variant="metaSm" color={colors.groupOfferInk}>
                {`${step.minTickets} tickets`}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** A group size's server price: the tickets struck through, with the discount, and the saving. */
function GroupPriceLine({
  price,
  highlight = false,
}: {
  price: EventTierGroupPrice;
  highlight?: boolean;
}) {
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.priceLine, highlight ? styles.priceLineHighlight : styles.priceLineDashed]}
    >
      <View style={styles.priceTop}>
        <Text variant="bodyValue">{`${price.quantity} tickets`}</Text>
        <View style={styles.priceFigures}>
          <Text variant="metaSm" color={colors.textMuted} style={styles.struck}>
            {formatEgp(price.subtotalEgp)}
          </Text>
          <Text variant="bodyLead">{formatEgp(price.ticketsTotalEgp)}</Text>
        </View>
      </View>
      <View style={styles.saving}>
        <Text variant="metaSm" color={colors.creme}>
          {`You save ${formatEgp(price.discountEgp)}`}
        </Text>
      </View>
    </View>
  );
}

/**
 * The pass step's offer: what the chosen number of tickets gets, the steps as a ladder, and a
 * button that adds the friends the next step needs (`onReachNext` with that step's ticket count).
 */
export function GroupDiscountOfferCard({
  tiers,
  quantity,
  buyerTakesTicket,
  maxTickets,
  groupPrices,
  quote,
  onReachNext,
  style,
}: {
  tiers: readonly GroupDiscountTier[] | null | undefined;
  quantity: number;
  buyerTakesTicket: boolean;
  maxTickets: number;
  /** The chosen pass's server prices at each group size (`EventTier.groupPrices`). */
  groupPrices?: readonly EventTierGroupPrice[];
  /**
   * A group mixing passes, priced by the server as a whole (`group-quote`): stands in for
   * `groupPrices`. What the next step would save depends on which pass is added, so it is not said.
   */
  quote?: GroupQuote | null;
  onReachNext?: (quantity: number) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const offer = groupDiscountOffer({ tiers, quantity, buyerTakesTicket, maxTickets });
  if (!offer) return null;
  const next = offer.next;
  const needed = next ? next.minTickets - quantity : 0;
  const current =
    quote !== undefined
      ? quote?.percent
        ? {
            quantity: quote.ticketCount,
            percent: quote.percent,
            subtotalEgp: quote.subtotalEgp,
            discountEgp: quote.discountEgp,
            ticketsTotalEgp: quote.ticketsTotalEgp,
          }
        : null
      : (groupPrices?.find((price) => price.quantity === quantity) ?? null);
  const upcoming =
    quote === undefined && next
      ? (groupPrices?.find((price) => price.quantity === next.minTickets) ?? null)
      : null;
  return (
    <View style={[styles.offer, style]} testID="group-offer">
      <Wash id="group-offer-wash" />
      <View style={styles.eyebrow}>
        <PeopleIcon size={14} color={colors.groupOfferInk} />
        <Text variant="eyebrow" color={colors.groupOfferInk}>
          Group discount
        </Text>
      </View>
      <View accessibilityLiveRegion="polite">
        <Text variant="titleCard" accessibilityRole="header">
          {offer.headline}
        </Text>
        {offer.detail ? (
          <Text variant="metaSm" color={colors.groupOfferInk} style={styles.detail}>
            {offer.detail}
          </Text>
        ) : null}
      </View>

      {current ? (
        <GroupPriceLine price={current} highlight />
      ) : upcoming ? (
        <GroupPriceLine price={upcoming} />
      ) : null}
      {current && upcoming ? (
        <Text variant="metaSm" color={colors.groupOfferInk}>
          {`With ${upcoming.quantity} tickets you'd save ${formatEgp(upcoming.discountEgp)}`}
        </Text>
      ) : null}

      <StepLadder offer={offer} />

      {next && onReachNext ? (
        <Button
          label={needed === 1 ? 'Add a friend' : `Add ${needed} friends`}
          variant="secondary"
          size="inline"
          onPress={() => onReachNext(next.minTickets)}
          style={styles.addButton}
        />
      ) : null}
    </View>
  );
}

/** The event page's invitation: "For a limited time, bring a friend and get 15% off". */
export function GroupDiscountTeaser({
  tiers,
  maxTickets,
  compact = false,
  style,
}: {
  tiers: readonly GroupDiscountTier[] | null | undefined;
  maxTickets?: number;
  /** One line, for the ticket bar. */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const teaser = groupDiscountTeaser(tiers, maxTickets);
  if (!teaser) return null;
  return (
    <View
      style={[styles.teaser, compact ? styles.teaserCompact : null, style]}
      testID="group-teaser"
    >
      <Wash id={compact ? 'group-teaser-compact' : 'group-teaser'} />
      <PeopleIcon size={compact ? 14 : 16} color={colors.groupOfferInk} />
      <View style={styles.teaserText}>
        <Text variant="metaSm" color={colors.textPrimary} numberOfLines={compact ? 1 : undefined}>
          {teaser.headline}
        </Text>
        {teaser.detail && !compact ? (
          <Text variant="metaSm" color={colors.groupOfferInk}>
            {teaser.detail}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** A round icon beside the review's and "Who's coming?"'s group notes. */
function NoteIcon() {
  return (
    <View style={styles.noteIcon}>
      <PeopleIcon size={18} color={colors.creme} />
    </View>
  );
}

/**
 * The review's note once the cart takes a group discount: what it takes off, the next step when
 * there is one, and why there is no promo field.
 */
export function GroupDiscountApplied({
  groupDiscount,
  style,
}: {
  groupDiscount: GroupDiscountBreakdown;
  style?: StyleProp<ViewStyle>;
}) {
  const next = groupDiscount.nextTier;
  const needed = next ? next.minTickets - groupDiscount.ticketCount : 0;
  return (
    <View style={[styles.note, style]} testID="group-discount-applied">
      <Wash id="group-applied" />
      <NoteIcon />
      <View style={styles.noteText}>
        <Text variant="bodyValue">
          {`${formatPercent(groupDiscount.percent)} group discount applied`}
        </Text>
        <Text variant="metaSm" color={colors.groupOfferInk}>
          {`${next && needed > 0 ? `${groupDiscountNudge(needed, next.percent, false)}. ` : ''}Promo codes can't be added on top.`}
        </Text>
      </View>
    </View>
  );
}

/**
 * One line on "Who's coming?": what this group size saves, in the server's figures, and what one
 * more friend would. Nothing without steps or prices.
 */
export function GroupSavingNote({
  tiers,
  groupPrices,
  quantity,
  maxTickets,
  quote,
  style,
}: {
  tiers: readonly GroupDiscountTier[] | null | undefined;
  groupPrices: readonly EventTierGroupPrice[] | undefined;
  quantity: number;
  maxTickets: number;
  /** A group mixing passes, priced by the server as a whole: stands in for `groupPrices`. */
  quote?: GroupQuote | null;
  style?: StyleProp<ViewStyle>;
}) {
  const offer = groupDiscountOffer({ tiers, quantity, buyerTakesTicket: false, maxTickets });
  if (!offer) return null;
  const next = offer.next;
  const current =
    quote !== undefined
      ? quote?.percent
        ? { percent: quote.percent, discountEgp: quote.discountEgp }
        : null
      : (groupPrices?.find((price) => price.quantity === quantity) ?? null);
  const upcoming =
    quote === undefined && next
      ? (groupPrices?.find((price) => price.quantity === next.minTickets) ?? null)
      : null;
  if (!current && !upcoming) return null;
  const nudge = next
    ? upcoming
      ? `${groupDiscountNudge(next.minTickets - quantity, next.percent, false)} (save ${formatEgp(upcoming.discountEgp)} on ${upcoming.quantity} tickets)`
      : quote !== undefined
        ? groupDiscountNudge(next.minTickets - quantity, next.percent, false)
        : null
    : null;
  return (
    <View style={[styles.note, style]} accessibilityLiveRegion="polite" testID="group-saving">
      <Wash id="group-saving" />
      <NoteIcon />
      <View style={styles.noteText}>
        {current ? (
          <Text variant="bodyValue">
            {`${formatPercent(current.percent)} group discount: you save ${formatEgp(current.discountEgp)}`}
          </Text>
        ) : null}
        {nudge ? (
          <Text
            variant={current ? 'metaSm' : 'bodyValue'}
            color={current ? colors.groupOfferInk : colors.textPrimary}
          >
            {nudge}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const NODE = 28;

const styles = StyleSheet.create({
  offer: {
    overflow: 'hidden',
    borderRadius: radius.card,
    padding: space.s4,
    gap: space.s3,
  },
  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: space.s1 + 2 },
  detail: { marginTop: space.s1 },
  priceLine: {
    borderRadius: radius.field,
    paddingVertical: space.s3,
    paddingHorizontal: space.s4,
    gap: space.s2,
  },
  priceLineHighlight: { backgroundColor: colors.creme },
  priceLineDashed: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.groupOfferInk,
  },
  // Both wrap: a large group's figures beside "N tickets" ran past a 375pt screen's edge.
  priceTop: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    columnGap: space.s2,
  },
  priceFigures: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: space.s2 },
  struck: { textDecorationLine: 'line-through' },
  saving: {
    alignSelf: 'flex-start',
    backgroundColor: colors.sage500,
    borderRadius: radius.pill,
    paddingHorizontal: space.s2,
    paddingVertical: 2,
  },
  ladder: { paddingTop: space.s1 },
  track: {
    position: 'absolute',
    top: space.s1 + NODE / 2 - 1.5,
    left: NODE / 2,
    right: NODE / 2,
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.groupStepTrack,
    overflow: 'hidden',
  },
  trackFill: { height: '100%', backgroundColor: colors.textPrimary },
  steps: { flexDirection: 'row', justifyContent: 'space-between' },
  step: { alignItems: 'center', gap: 2, minWidth: NODE },
  node: {
    width: NODE,
    height: NODE,
    borderRadius: radius.circle,
    borderWidth: 1.5,
    borderColor: colors.groupOfferInk,
    backgroundColor: colors.creme,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeReached: { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary },
  nodeNext: { borderColor: colors.rose500 },
  addButton: { alignSelf: 'flex-start' },
  teaser: {
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s2,
    borderRadius: radius.field,
    paddingVertical: space.s2,
    paddingHorizontal: space.s3,
  },
  teaserCompact: { borderRadius: radius.pill, paddingVertical: space.s1 + 2 },
  teaserText: { flex: 1 },
  note: {
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s3,
    borderRadius: radius.field,
    padding: space.s3,
  },
  noteIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.circle,
    backgroundColor: colors.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteText: { flex: 1, gap: 2 },
});
