import { useState, type ReactNode } from 'react';
import { Image, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import type {
  AddonSummary,
  EventContentAccessibilityBlock,
  EventContentBlock,
  EventContentBlockType,
  EventContentFaqBlock,
  EventContentInclusionsBlock,
  EventContentLogisticsBlock,
  EventContentSponsorItem,
  EventContentSponsorsBlock,
} from '../../api/types';
import {
  CONTENT_BLOCK_HEADING,
  contentBlockHeading,
  contentBlocksOfKind,
  groupSponsors,
  type SponsorGroup,
} from '../../lib/content-blocks';
import { colors, fontFamily, fontSize, radius, space } from '../../theme/tokens';
import { Button } from '../ui/Button';
import { CheckIcon, PlusIcon } from '../ui/icons';
import { MarkdownText } from '../ui/MarkdownText';
import { Card } from '../ui/Surfaces';
import { Text } from '../ui/Text';

/**
 * The admin's content blocks on the event page (approved design "Event page content blocks",
 * placement A, owner's calls 2026-10-17).
 *
 * One section per kind, placed by the page where that kind fits. A single block heads its
 * section with its own title, or the kind's heading when it has none. Several blocks of a kind
 * share the kind's heading and each carries its own title, in the admin's order, which is how
 * the design draws two logistics cards under "Getting there". A kind with nothing to show
 * renders nothing at all.
 *
 * Every body is the admin's Markdown, rendered and sanitised by the backend, and shown with
 * `MarkdownText`. Nothing here is priced: a linked add-on shows its name and a line about it,
 * never a figure.
 */
export interface EventContentSectionProps {
  kind: EventContentBlockType;
  blocks: readonly EventContentBlock[] | null | undefined;
  /** The event's add-on catalogue (`useAddons`), for logistics blocks linked to one. */
  addons?: readonly AddonSummary[];
  /** Logistics "Add". Without it, a linked add-on shows no button. */
  onAddAddon?: (addon: AddonSummary) => void;
  /** Whether "Add" can lead anywhere (a ticket held, or one on sale). */
  canAddAddon?: boolean;
  style?: ViewStyle;
}

export function EventContentSection({
  kind,
  blocks,
  addons = [],
  onAddAddon,
  canAddAddon = true,
  style,
}: EventContentSectionProps) {
  const ofKind = contentBlocksOfKind(blocks, kind);
  const [first] = ofKind;
  if (!first) return null;
  const grouped = ofKind.length > 1;
  const heading = grouped ? CONTENT_BLOCK_HEADING[kind] : contentBlockHeading(first);

  return (
    <View style={[styles.section, style]} testID={`content-section-${kind}`}>
      <Text variant="eyebrow" accessibilityRole="header" style={styles.heading}>
        {heading}
      </Text>
      <View style={styles.blocks}>
        {ofKind.map((block) => {
          const title = grouped ? block.title?.trim() || null : null;
          return (
            <View key={block.id} testID={`content-block-${block.id}`}>
              {renderBlock(block, title, { addons, onAddAddon, canAddAddon })}
            </View>
          );
        })}
      </View>
    </View>
  );
}

interface AddonActions {
  addons: readonly AddonSummary[];
  onAddAddon?: (addon: AddonSummary) => void;
  canAddAddon: boolean;
}

function renderBlock(block: EventContentBlock, title: string | null, actions: AddonActions) {
  switch (block.type) {
    case 'inclusions':
      return <InclusionsBlock block={block} title={title} />;
    case 'logistics':
      return <LogisticsBlock block={block} title={title} {...actions} />;
    case 'accessibility':
      return <AccessibilityBlock block={block} title={title} />;
    case 'faq':
      return <FaqBlock block={block} title={title} />;
    case 'sponsors':
      return <SponsorsBlock block={block} title={title} />;
    default:
      return null;
  }
}

function BlockTitle({ title }: { title: string | null }) {
  if (!title) return null;
  return (
    <Text accessibilityRole="header" style={styles.blockTitle}>
      {title}
    </Text>
  );
}

function Body({
  body,
  emphasis = false,
  last = false,
}: {
  body: string | null;
  emphasis?: boolean;
  /** The last thing in its card: the Markdown's own trailing space would double the padding. */
  last?: boolean;
}) {
  if (!body?.trim()) return null;
  return (
    <View style={last ? styles.bodyLast : undefined}>
      <MarkdownText
        markdown={body}
        variant="bodyMuted"
        style={emphasis ? styles.bodyEmphasis : undefined}
      />
    </View>
  );
}

/* ------------------------------------------------------------ what's included */

function InclusionsBlock({
  block,
  title,
}: {
  block: EventContentInclusionsBlock;
  title: string | null;
}) {
  return (
    <View>
      <BlockTitle title={title} />
      <Body body={block.body} />
      <View style={styles.inclusions}>
        {block.items.map((item, index) => (
          <View
            key={`${item.label}-${index}`}
            style={styles.inclusion}
            accessible
            accessibilityLabel={
              item.description ? `${item.label}. ${item.description}` : item.label
            }
          >
            <View style={styles.tick}>
              <CheckIcon size={12} color={colors.black} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.inclusionLabel}>{item.label}</Text>
              {item.description ? (
                <Text variant="meta" style={styles.inclusionDescription}>
                  {item.description}
                </Text>
              ) : null}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

/* --------------------------------------------------------------- getting there */

function LogisticsBlock({
  block,
  title,
  addons,
  onAddAddon,
  canAddAddon,
}: {
  block: EventContentLogisticsBlock;
  title: string | null;
} & AddonActions) {
  // Only an add-on the event still sells: one missing from the catalogue (switched off, or the
  // catalogue not loaded) leaves the block without the row rather than with a dead button.
  const addon = block.addonId ? addons.find((item) => item.id === block.addonId) : undefined;
  const soldOut = addon?.availability === 'unavailable';

  return (
    <Card style={styles.card}>
      <BlockTitle title={title} />
      <Body body={block.body} last={!addon} />
      {addon ? (
        <View style={styles.addonRow} testID={`content-addon-${addon.id}`}>
          <View style={styles.addonText}>
            <Text style={styles.addonName}>{addon.name}</Text>
            {addon.description ? (
              <Text variant="metaSm" numberOfLines={2}>
                {addon.description}
              </Text>
            ) : null}
          </View>
          {soldOut ? (
            <Text variant="metaSm" color={colors.rose700}>
              Sold out
            </Text>
          ) : onAddAddon ? (
            <Button
              label="Add"
              variant="secondary"
              size="inline"
              accessibilityLabel={`Add ${addon.name}`}
              disabled={!canAddAddon}
              onPress={() => onAddAddon(addon)}
              style={styles.addButton}
            />
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

/* --------------------------------------------------------------- accessibility */

function AccessibilityBlock({
  block,
  title,
}: {
  block: EventContentAccessibilityBlock;
  title: string | null;
}) {
  return (
    <Card style={styles.card}>
      <BlockTitle title={title} />
      <Body body={block.body} emphasis last />
    </Card>
  );
}

/* ------------------------------------------------------------------- questions */

function FaqBlock({ block, title }: { block: EventContentFaqBlock; title: string | null }) {
  // Every question starts closed (owner's call); each opens and closes on its own.
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set());

  function toggle(index: number) {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  return (
    <View>
      <BlockTitle title={title} />
      <Body body={block.body} />
      {block.items.length > 0 ? (
        <Card padded={false} style={styles.faq}>
          {block.items.map((item, index) => {
            const expanded = open.has(index);
            return (
              <View
                key={`${item.question}-${index}`}
                style={index > 0 ? styles.faqDivider : undefined}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded }}
                  accessibilityLabel={item.question}
                  accessibilityHint={expanded ? 'Hides the answer' : 'Shows the answer'}
                  onPress={() => toggle(index)}
                  style={({ pressed }) => [styles.faqQuestion, pressed && styles.pressed]}
                >
                  <Text style={styles.faqQuestionText}>{item.question}</Text>
                  <View style={expanded ? styles.faqIconOpen : undefined}>
                    <PlusIcon size={18} />
                  </View>
                </Pressable>
                {expanded ? (
                  <View style={styles.faqAnswer}>
                    <MarkdownText markdown={item.answer} variant="bodyMuted" />
                  </View>
                ) : null}
              </View>
            );
          })}
        </Card>
      ) : null}
    </View>
  );
}

/* -------------------------------------------------------------------- partners */

function SponsorsBlock({
  block,
  title,
}: {
  block: EventContentSponsorsBlock;
  title: string | null;
}) {
  const { lead, rest } = groupSponsors(block.items);
  return (
    <View>
      <BlockTitle title={title} />
      <Body body={block.body} />
      <View style={styles.sponsorGroups}>
        {lead ? <SponsorTier group={lead} columns={1} large /> : null}
        {rest.map((group, index) => (
          <SponsorTier key={`${group.tier ?? 'none'}-${index}`} group={group} columns={3} />
        ))}
      </View>
    </View>
  );
}

function SponsorTier({
  group,
  columns,
  large = false,
}: {
  group: SponsorGroup;
  columns: number;
  large?: boolean;
}) {
  const rows: EventContentSponsorItem[][] = [];
  for (let index = 0; index < group.items.length; index += columns) {
    rows.push(group.items.slice(index, index + columns));
  }
  return (
    <View style={styles.sponsorTier}>
      {group.tier ? (
        <Text variant="fieldLabel" style={styles.tierLabel}>
          {group.tier}
        </Text>
      ) : null}
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.sponsorRow}>
          {row.map((item, index) => (
            <SponsorTile
              key={`${item.name}-${index}`}
              item={item}
              tier={group.tier}
              large={large}
            />
          ))}
          {/* Empty cells keep a short last row on the grid's columns. */}
          {Array.from({ length: columns - row.length }, (_, index) => (
            <View key={`spacer-${index}`} style={styles.flex} />
          ))}
        </View>
      ))}
    </View>
  );
}

/** Logo, name and tier only. Not a link and not pressable (owner's call). */
function SponsorTile({
  item,
  tier,
  large,
}: {
  item: EventContentSponsorItem;
  tier: string | null;
  large: boolean;
}) {
  let content: ReactNode;
  if (item.logoUrl) {
    content = (
      <>
        <Image
          source={{ uri: item.logoUrl }}
          resizeMode="contain"
          style={large ? styles.logoLarge : styles.logo}
        />
        <Text variant="metaSm" numberOfLines={1} style={styles.sponsorCaption}>
          {item.name}
        </Text>
      </>
    );
  } else {
    content = (
      <Text numberOfLines={2} style={[styles.sponsorName, large && styles.sponsorNameLarge]}>
        {item.name}
      </Text>
    );
  }
  return (
    <View
      accessible
      accessibilityLabel={tier ? `${item.name}, ${tier}` : item.name}
      style={[styles.sponsorTile, large && styles.sponsorTileLarge]}
      testID="sponsor-tile"
    >
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  section: {},
  heading: { marginBottom: 10 },
  blocks: { gap: space.s3 },
  blockTitle: {
    fontSize: fontSize.bodyMd,
    fontFamily: fontFamily.bodyMedium,
    color: colors.textPrimary,
    marginBottom: space.s2,
  },
  bodyEmphasis: { color: colors.textPrimary },
  bodyLast: { marginBottom: -space.s4 },
  card: { gap: space.s1 },
  pressed: { opacity: 0.7 },

  inclusions: { gap: space.s2 },
  inclusion: { flexDirection: 'row', alignItems: 'flex-start', gap: space.s2 },
  /* The design's tick: a sage300 disc with a black check. */
  tick: {
    width: 18,
    height: 18,
    borderRadius: radius.circle,
    backgroundColor: colors.sage300,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  inclusionLabel: {
    fontSize: 14,
    lineHeight: 14 * 1.4,
    color: colors.textPrimary,
  },
  inclusionDescription: { marginTop: 2 },

  addonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.s3,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderTopColor: colors.borderDefault,
    paddingTop: 10,
  },
  addonText: { flex: 1, gap: 2 },
  addonName: {
    fontSize: fontSize.bodySm,
    fontFamily: fontFamily.bodyMedium,
    color: colors.textPrimary,
  },
  /* The design's small outlined "Add", not the bar's full-size pill. */
  addButton: { paddingVertical: space.s2, paddingHorizontal: space.s4 },

  faq: { overflow: 'hidden' },
  faqDivider: { borderTopWidth: 1, borderTopColor: colors.borderDefault },
  faqQuestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 13,
    paddingHorizontal: space.s4,
  },
  faqQuestionText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 14 * 1.4,
    fontFamily: fontFamily.bodyMedium,
    color: colors.textPrimary,
  },
  faqIconOpen: { transform: [{ rotate: '45deg' }] },
  faqAnswer: { paddingHorizontal: space.s4, paddingBottom: 2 },

  sponsorGroups: { gap: space.s3 },
  sponsorTier: { gap: space.s2 },
  tierLabel: { marginBottom: 2 },
  sponsorRow: { flexDirection: 'row', gap: space.s2 },
  sponsorTile: {
    flex: 1,
    height: 64,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: radius.field,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.s2,
  },
  sponsorTileLarge: { height: 84 },
  logo: { width: '100%', height: 30 },
  logoLarge: { width: '100%', height: 44 },
  sponsorCaption: { marginTop: 4, textAlign: 'center' },
  sponsorName: {
    fontFamily: fontFamily.display,
    fontSize: fontSize.bodyMd,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  sponsorNameLarge: { fontSize: fontSize.headingMd },
});
