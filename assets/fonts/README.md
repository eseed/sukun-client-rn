# Brand fonts

The Sukun brand faces are licensed `.otf` files that live in the Claude Design project, at
`_ds/sukun-design-system-28d07fa6-f2f5-41b3-b2c3-e263ce1ad965/assets/fonts/`. All seven masters
are committed here, alongside a `.ttf` conversion of each:

- `SeriouslyNostalgicFine-Regular` — display
- `SeriouslyNostalgic-RegularItalic` — display italic (used by every screen title)
- `BananaGrotesk-Thin`, `-Light`, `-Regular`, `-Medium` — body
- `MinionPro-Regular` — serif accent (a large CFF glyph set, too big for the `DesignSync`
  tool's 256 KB `get_file` cap, added by hand)

## Why both formats

The masters are OpenType with PostScript (CFF) outlines. iOS renders those through CoreText
without trouble, but Android's typeface loader cannot parse them: `Typeface.createFromFile`
silently returns the default system face instead of raising, so every screen rendered in
Roboto on Android with no error anywhere. `scripts/otf-to-ttf.py` converts the cubic outlines
to TrueType quadratics, and `app/_layout.tsx` registers the resulting `.ttf` files.

Converting the outlines is only half of it. Android decides which outline format to look for
from the four-byte sfnt version at the head of the file, and fontTools carries that value over
from the source. The first pass of the conversion left all seven files tagged `OTTO` with a
`glyf` table and no `CFF ` — read as CFF fonts whose outlines were missing, which failed in
exactly the same silent way the masters had, so the `.ttf` switch appeared to change nothing.
The script now writes `0x00010000`. To check a file at a glance:

```
head -c 4 assets/fonts/BananaGrotesk-Regular.ttf | xxd -p   # want 00010000, not 4f54544f
```

After dropping fresh masters in from the design project, regenerate and commit both sets:

```
pip install "fonttools[ufo]"
python scripts/otf-to-ttf.py assets/fonts
```

## Select the face, never the style

Banana Grotesk ships Thin / Light / Regular / Medium and nothing heavier. Never reach for a
numeric `fontWeight` to get emphasis, and never for `fontStyle: 'italic'` to get a slant:
Android drops the brand face entirely for both. Select the face instead, via
`fontFamily.bodyMedium`, `fontFamily.displayItalic` and friends in `src/theme/tokens.ts`.

The reason is in how a runtime-loaded font is registered. `expo-font` calls
`ReactFontManager.setTypeface(name, Typeface.NORMAL, typeface)`, which fills one slot of that
family's style array. A request for any other slot misses it, falls through to a lookup for a
bundled `<family>_bold.ttf` / `<family>_italic.ttf` asset that this app does not ship, and
ends at `Typeface.create(family, style)` — a family name Android has never heard of, so it
answers with Roboto. Only fonts registered natively through `addCustomFont` reach the
synthesis path, and `useFonts` is not that path. iOS hides all of this, so a style that looks
right in the simulator can still be Roboto on a phone.

`src/components/ui/MarkdownText.tsx` is the single deliberate exception: markdown emphasis has
no italic body master to name, so it keeps `fontStyle` and accepts the system italic.

`BRAND_FONTS_AVAILABLE` in `src/theme/fonts.ts` is `true`, and `app/_layout.tsx` loads all
seven with `expo-font`'s `useFonts`, holding the splash screen until they're ready (or a load
error) before rendering the tree.
