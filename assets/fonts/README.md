# Brand fonts

The Sukun brand faces are licensed `.otf` files that live in the Claude Design project, at
`_ds/sukun-design-system-28d07fa6-f2f5-41b3-b2c3-e263ce1ad965/assets/fonts/`. All seven are
committed here and registered:

- `SeriouslyNostalgicFine-Regular.otf` — display
- `SeriouslyNostalgic-RegularItalic.otf` — display italic (used by every screen title)
- `BananaGrotesk-Thin.otf`, `-Light.otf`, `-Regular.otf`, `-Medium.otf` — body
- `MinionPro-Regular.otf` — serif accent (a ~330 KB OTF with a large CFF glyph set — too big
  for the `DesignSync` tool's 256 KB `get_file` cap, added by hand)

`BRAND_FONTS_AVAILABLE` in `src/theme/fonts.ts` is `true`, and `app/_layout.tsx` loads all
seven with `expo-font`'s `useFonts`, holding the splash screen until they're ready (or a load
error) before rendering the tree. Every size, weight, colour and spacing token was already
correct — this only swaps which face renders.
