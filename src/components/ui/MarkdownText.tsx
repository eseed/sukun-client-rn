import type { ReactNode } from 'react';
import {
  Linking,
  StyleSheet,
  Text as RNText,
  View,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import { colors, fontFamily, space } from '../../theme/tokens';
import { text, type TextVariant } from '../../theme/typography';

type MarkdownBlock =
  | { type: 'heading'; level: number; value: string }
  | { type: 'paragraph'; value: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'quote'; value: string };

function normalizeMarkdown(value: string): string {
  return decodeHtmlEntities(value).replace(/\r\n?/g, '\n').replace(/\\n/g, '\n').trim();
}

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(?:amp|gt|lt|quot|#39|nbsp);/gi, (entity) => {
    const entities: Record<string, string> = {
      '&amp;': '&',
      '&gt;': '>',
      '&lt;': '<',
      '&quot;': '"',
      '&#39;': "'",
      '&nbsp;': ' ',
    };
    return entities[entity.toLowerCase()] ?? entity;
  });
}

/** Converts the limited HTML returned by the public event API into our native block model. */
function htmlToMarkdown(value: string): string {
  if (!/<[a-z][\s\S]*>/i.test(value)) return value;

  return value
    .replace(/<\/?(?:script|style)\b[^>]*>[\s\S]*?<\/(?:script|style)>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<h([1-6])\b[^>]*>/gi, (_, level: string) => `\n${'#'.repeat(Number(level))} `)
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<(?:p|div)\b[^>]*>/gi, '')
    .replace(/<\/(?:p|div)>/gi, '\n\n')
    .replace(/<li\b[^>]*>/gi, '- ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/?(?:ul|ol)\b[^>]*>/gi, '\n')
    .replace(/<blockquote\b[^>]*>/gi, '\n> ')
    .replace(/<\/blockquote>/gi, '\n\n')
    .replace(/<(?:strong|b)\b[^>]*>/gi, '**')
    .replace(/<\/(?:strong|b)>/gi, '**')
    .replace(/<(?:em|i)\b[^>]*>/gi, '*')
    .replace(/<\/(?:em|i)>/gi, '*')
    .replace(/<(?:del|s)\b[^>]*>/gi, '~~')
    .replace(/<\/(?:del|s)>/gi, '~~')
    .replace(/<code\b[^>]*>/gi, '`')
    .replace(/<\/code>/gi, '`')
    .replace(/<a\b([^>]*?)>([\s\S]*?)<\/a>/gi, (_, attributes: string, content: string) => {
      const href = attributes.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const url = decodeHtmlEntities(href?.[1] ?? href?.[2] ?? href?.[3] ?? '').trim();
      return url ? `[${content}](${url})` : content;
    })
    .replace(/<[^>]+>/g, '');
}

function isSafeUrl(value: string): boolean {
  return /^https?:\/\/[^\s]+$/i.test(value.trim());
}

function parseBlocks(markdown: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const paragraph: string[] = [];
  let list: Extract<MarkdownBlock, { type: 'list' }> | null = null;

  function flushParagraph() {
    const value = paragraph.join(' ').trim();
    if (value) blocks.push({ type: 'paragraph', value });
    paragraph.length = 0;
  }

  function flushList() {
    if (list) blocks.push(list);
    list = null;
  }

  for (const line of normalizeMarkdown(markdown).split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+?)\s*#*$/);
    if (heading?.[1] && heading[2]) {
      flushParagraph();
      flushList();
      blocks.push({ type: 'heading', level: heading[1].length, value: heading[2] });
      continue;
    }

    const unordered = trimmed.match(/^[-*+]\s+(.+)$/);
    const ordered = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
      flushParagraph();
      const orderedList = Boolean(ordered);
      if (!list || list.ordered !== orderedList) {
        flushList();
        list = { type: 'list', ordered: orderedList, items: [] };
      }
      list.items.push((unordered ?? ordered)?.[1] ?? '');
      continue;
    }

    if (trimmed.startsWith('>')) {
      flushParagraph();
      flushList();
      blocks.push({ type: 'quote', value: trimmed.replace(/^>\s?/, '') });
      continue;
    }

    flushList();
    paragraph.push(trimmed);
  }

  flushParagraph();
  flushList();
  return blocks;
}

function inlineMarkdown(
  value: string,
  key: string,
  onLinkPress?: (url: string) => void,
): ReactNode[] {
  const tokens = value.split(
    /(\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|`[^`]+`|\*[^*]+\*|_[^_]+_|\[[^\]]+\]\([^\)]+\))/g,
  );
  return tokens.map((token, index) => {
    const tokenKey = `${key}-${index}`;
    if (!token) return null;
    if (/^\*\*.*\*\*$|^__.*__$/.test(token)) {
      return (
        <RNText key={tokenKey} style={styles.bold}>
          {token.slice(2, -2)}
        </RNText>
      );
    }
    if (/^~~.*~~$/.test(token)) {
      return (
        <RNText key={tokenKey} style={styles.strikethrough}>
          {token.slice(2, -2)}
        </RNText>
      );
    }
    if (/^`.*`$/.test(token)) {
      return (
        <RNText key={tokenKey} style={styles.code}>
          {token.slice(1, -1)}
        </RNText>
      );
    }
    if (/^\*.*\*$|^_.*_$/.test(token)) {
      return (
        <RNText key={tokenKey} style={styles.italic}>
          {token.slice(1, -1)}
        </RNText>
      );
    }
    const link = token.match(/^\[([^\]]+)\]\(([^\)]+)\)$/);
    if (link) {
      const url = link[2]?.trim() ?? '';
      const safe = isSafeUrl(url);
      return (
        <RNText
          key={tokenKey}
          accessibilityRole={safe ? 'link' : undefined}
          onPress={
            safe
              ? () => {
                  if (onLinkPress) {
                    onLinkPress(url);
                  } else {
                    void Linking.openURL(url).catch(() => undefined);
                  }
                }
              : undefined
          }
          style={styles.link}
        >
          {link[1]}
        </RNText>
      );
    }
    return token;
  });
}

function headingStyle(level: number): TextStyle {
  if (level === 1) return text.titleLg;
  if (level === 2) return text.titleSm;
  if (level === 3) {
    return {
      ...text.bodyLead,
      fontFamily: fontFamily.bodyMedium,
      fontSize: 18,
      lineHeight: 18 * 1.3,
    };
  }
  return {
    ...text.bodyLead,
    fontFamily: fontFamily.bodyMedium,
    fontSize: Math.max(15, 20 - level),
    lineHeight: Math.max(15, 20 - level) * 1.35,
  };
}

export interface MarkdownTextProps {
  markdown: string;
  variant?: TextVariant;
  style?: StyleProp<TextStyle>;
  onLinkPress?: (url: string) => void;
}

/** Renders the event description Markdown as native, semantically grouped blocks. */
export function MarkdownText({
  markdown,
  variant = 'bodyValue',
  style,
  onLinkPress,
}: MarkdownTextProps) {
  const baseStyle = StyleSheet.flatten([text[variant], style]) as TextStyle;
  const blocks = parseBlocks(htmlToMarkdown(markdown));

  return (
    <View>
      {blocks.map((block, index) => {
        const key = `block-${index}`;
        if (block.type === 'heading') {
          return (
            <View key={key} style={styles.heading}>
              <RNText accessibilityRole="header" style={headingStyle(block.level)}>
                {inlineMarkdown(block.value, key, onLinkPress)}
              </RNText>
            </View>
          );
        }
        if (block.type === 'list') {
          return (
            <View key={key} style={styles.list}>
              {block.items.map((item, itemIndex) => (
                <View key={`${key}-${itemIndex}`} style={styles.listItem}>
                  <RNText style={[baseStyle, styles.marker]}>
                    {block.ordered ? `${itemIndex + 1}.` : '\u2022'}
                  </RNText>
                  <RNText style={baseStyle}>
                    {inlineMarkdown(item, `${key}-${itemIndex}`, onLinkPress)}
                  </RNText>
                </View>
              ))}
            </View>
          );
        }
        return (
          <View key={key} style={block.type === 'quote' ? styles.quote : styles.paragraph}>
            <RNText style={[baseStyle, block.type === 'quote' && styles.quoteText]}>
              {inlineMarkdown(block.value, key, onLinkPress)}
            </RNText>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  paragraph: {
    marginBottom: space.s4,
  },
  heading: {
    marginTop: space.s2,
    marginBottom: space.s3,
  },
  list: {
    marginBottom: space.s4,
    gap: space.s2,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.s2,
  },
  marker: {
    minWidth: space.s3,
  },
  quote: {
    borderLeftWidth: 3,
    borderLeftColor: colors.accentSage,
    paddingLeft: space.s3,
    marginBottom: space.s4,
  },
  quoteText: {
    color: colors.textMuted,
  },
  bold: {
    fontFamily: fontFamily.bodyMedium,
  },
  italic: {
    fontStyle: 'italic',
  },
  strikethrough: {
    textDecorationLine: 'line-through',
  },
  code: {
    fontFamily: fontFamily.bodyMedium,
    backgroundColor: colors.bgSurface,
  },
  link: {
    color: colors.accentSky,
    textDecorationLine: 'underline',
  },
});
