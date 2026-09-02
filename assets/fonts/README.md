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
without trouble, but Android's typeface loader cannot parse them: it silently returns the
default system face, so every screen rendered in Roboto on Android with no error anywhere.
`scripts/otf-to-ttf.py` converts the cubic outlines to TrueType quadratics, and
`app/_layout.tsx` registers the resulting `.ttf` files.

After dropping fresh masters in from the design project, regenerate and commit both sets:

```
pip install "fonttools[ufo]"
python scripts/otf-to-ttf.py assets/fonts
```

## Weights

Banana Grotesk ships Thin / Light / Regular / Medium and nothing heavier. Never reach for a
numeric `fontWeight` to get emphasis: Android cannot synthesise one and drops the brand face
entirely. Select the face instead, via `fontFamily.bodyMedium` and friends in
`src/theme/tokens.ts`.

`BRAND_FONTS_AVAILABLE` in `src/theme/fonts.ts` is `true`, and `app/_layout.tsx` loads all
seven with `expo-font`'s `useFonts`, holding the splash screen until they're ready (or a load
error) before rendering the tree.
