import type {
  EventContentBlock,
  EventContentBlockType,
  EventContentSponsorItem,
} from '../api/types';

/**
 * The event page's content blocks (owner's calls, 2026-10-17, placement A): each kind sits where
 * it fits on `app/event/[slug].tsx`, in the admin's order within its kind, and a kind with nothing
 * to show is left out entirely.
 */

/** The heading a block shows when the admin typed none. */
export const CONTENT_BLOCK_HEADING: Record<EventContentBlockType, string> = {
  inclusions: "What's included",
  logistics: 'Getting there',
  accessibility: 'Accessibility',
  faq: 'Questions',
  sponsors: 'Partners',
};

export type ContentBlockOf<K extends EventContentBlockType> = Extract<
  EventContentBlock,
  { type: K }
>;

function hasText(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Whether a block has anything to draw. An empty block would be a heading over nothing. */
export function hasContent(block: EventContentBlock): boolean {
  switch (block.type) {
    case 'faq':
    case 'inclusions':
    case 'sponsors':
      return block.items.length > 0 || hasText(block.body);
    // The backend requires a body on both; the add-on alone is not a block.
    case 'logistics':
    case 'accessibility':
      return hasText(block.body);
    default:
      return false;
  }
}

/** One kind's blocks with something to show, in the order the admin set. Missing reads as none. */
export function contentBlocksOfKind<K extends EventContentBlockType>(
  blocks: readonly EventContentBlock[] | null | undefined,
  kind: K,
): ContentBlockOf<K>[] {
  return (blocks ?? []).filter(
    (block): block is ContentBlockOf<K> => block.type === kind && hasContent(block),
  );
}

/** The admin's own heading for a block when there is one, else its kind's. */
export function contentBlockHeading(block: EventContentBlock): string {
  const title = block.title?.trim();
  return title ? title : CONTENT_BLOCK_HEADING[block.type];
}

export interface SponsorGroup {
  /** The tier as the admin typed it, null for sponsors given none. */
  tier: string | null;
  items: EventContentSponsorItem[];
}

/**
 * Sponsors by tier, in the admin's order (a tier is placed where its first sponsor is). The tier
 * is free text, so the lead is the first tier the admin listed, shown larger, and only when there
 * is something else to stand out from: a single tier, or sponsors with no tier at all, are all
 * shown alike in the grid.
 */
export function groupSponsors(items: readonly EventContentSponsorItem[]): {
  lead: SponsorGroup | null;
  rest: SponsorGroup[];
} {
  const groups: SponsorGroup[] = [];
  for (const item of items) {
    const tier = item.tier?.trim() || null;
    const key = tier?.toLowerCase() ?? null;
    const group = groups.find((candidate) => (candidate.tier?.toLowerCase() ?? null) === key);
    if (group) group.items.push(item);
    else groups.push({ tier, items: [item] });
  }
  const [first, ...others] = groups;
  if (first && first.tier !== null && others.length > 0) return { lead: first, rest: others };
  return { lead: null, rest: groups };
}
