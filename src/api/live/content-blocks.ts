import type {
  EventContentBlock,
  EventContentFaqItem,
  EventContentInclusionItem,
  EventContentSponsorItem,
  EventDetail,
  LiveEventDetail,
} from '../types';

/**
 * `GET public/events/:identifier` as the app reads it: the wire DTO with its content blocks made
 * safe to render.
 *
 * A backend from before content blocks sends no `contentBlocks`, which reads as none. Anything a
 * newer backend adds that this build does not know (a new kind of block) is left out rather than
 * drawn wrong, and so is a block or an item missing what it needs to be shown.
 */
export function normalizeEventDetail(event: LiveEventDetail): EventDetail {
  return { ...event, contentBlocks: normalizeContentBlocks(event.contentBlocks) };
}

type Raw = Record<string, unknown>;

function isRecord(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function optionalText(value: unknown): string | undefined {
  return text(value) ?? undefined;
}

function list<T>(value: unknown, item: (raw: Raw) => T | null): T[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!isRecord(raw)) return [];
    const mapped = item(raw);
    return mapped === null ? [] : [mapped];
  });
}

function faqItem(raw: Raw): EventContentFaqItem | null {
  const question = text(raw.question);
  const answer = text(raw.answer);
  return question && answer ? { question, answer } : null;
}

function inclusionItem(raw: Raw): EventContentInclusionItem | null {
  const label = text(raw.label);
  if (!label) return null;
  const description = optionalText(raw.description);
  return description ? { label, description } : { label };
}

function sponsorItem(raw: Raw): EventContentSponsorItem | null {
  const name = text(raw.name);
  if (!name) return null;
  const logoUrl = optionalText(raw.logoUrl);
  const link = optionalText(raw.link);
  const tier = optionalText(raw.tier);
  return {
    name,
    ...(logoUrl ? { logoUrl } : {}),
    ...(link ? { link } : {}),
    ...(tier ? { tier } : {}),
  };
}

function contentBlock(raw: Raw): EventContentBlock | null {
  const id = text(raw.id);
  if (!id) return null;
  const title = text(raw.title);
  const body = text(raw.body);

  switch (raw.type) {
    case 'faq':
      return { id, type: 'faq', title, body, items: list(raw.items, faqItem) };
    case 'inclusions':
      return { id, type: 'inclusions', title, body, items: list(raw.items, inclusionItem) };
    case 'sponsors':
      return { id, type: 'sponsors', title, body, items: list(raw.items, sponsorItem) };
    case 'logistics':
      return { id, type: 'logistics', title, body: body ?? '', addonId: text(raw.addonId) };
    case 'accessibility':
      return { id, type: 'accessibility', title, body: body ?? '' };
    default:
      return null;
  }
}

/** The wire's `contentBlocks`, in the admin's order. Missing or malformed reads as none. */
export function normalizeContentBlocks(value: unknown): EventContentBlock[] {
  return list(value, contentBlock);
}
