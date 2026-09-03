import { readFileSync } from 'fs';
import { join } from 'path';
import { brandFontFiles } from '../fonts';
import { text } from '../typography';

const FONT_DIR = join(__dirname, '../../../assets/fonts');

/**
 * Both ways a brand face can be lost on Android fail silently: the typeface loader returns
 * Roboto instead of raising, and iOS renders correctly either way, so neither shows up until
 * someone looks at a phone. These assert the two rules that keep the faces on screen.
 */
describe('android font loading', () => {
  describe.each(Object.entries(brandFontFiles))('%s (%s)', (_family, file) => {
    const bytes = readFileSync(join(FONT_DIR, file));

    /**
     * Android picks the outline parser from the sfnt version alone. `OTTO` sends it looking
     * for a `CFF ` table, and a converted file that still carries that tag has none, so it
     * loads nothing and falls back. TrueType outlines have to say `0x00010000`.
     */
    it('is tagged as TrueType, not OpenType/CFF', () => {
      expect(bytes.readUInt32BE(0)).toBe(0x00010000);
    });

    it('carries TrueType outlines and no CFF table', () => {
      const tags = new Set<string>();
      const numTables = bytes.readUInt16BE(4);
      for (let i = 0; i < numTables; i++) {
        tags.add(bytes.toString('latin1', 12 + i * 16, 16 + i * 16));
      }
      expect(tags).toContain('glyf');
      expect(tags).toContain('loca');
      expect(tags).not.toContain('CFF ');
    });
  });

  /**
   * `useFonts` registers each face in the NORMAL slot only. Asking for a bold or italic slot
   * misses it and lands on `Typeface.create(family, style)`, which answers with Roboto — so a
   * style must name the face it wants rather than asking for a variation of another one.
   * `MarkdownText`'s emphasis is the one exception, and has no brand face to name.
   */
  it.each(Object.entries(text))('text.%s selects a face rather than a style', (_name, style) => {
    expect(style).not.toHaveProperty('fontStyle');
    expect(style).not.toHaveProperty('fontWeight');
  });
});
