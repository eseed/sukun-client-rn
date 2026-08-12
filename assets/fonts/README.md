# Brand fonts

The Sukun brand faces are licensed `.otf` files that live in the Claude Design project, at
`_ds/sukun-design-system-28d07fa6-f2f5-41b3-b2c3-e263ce1ad965/assets/fonts/`:

- `SeriouslyNostalgicFine-Regular.otf` — display
- `SeriouslyNostalgic-RegularItalic.otf` — display italic (used by every screen title)
- `BananaGrotesk-Thin.otf`, `-Light.otf`, `-Regular.otf`, `-Medium.otf` — body
- `MinionPro-Regular.otf` — serif accent

## To enable them

1. Copy the seven files into this directory, keeping the exact filenames above.
2. Set `BRAND_FONTS_AVAILABLE = true` in `src/theme/fonts.ts`.
3. Register them in `app/_layout.tsx` (`useFonts`) — the map is already there behind the
   same flag.

Until step 2 the app renders with platform fallbacks (serif for display, system sans for
body). Every size, weight, colour and spacing value is already correct, so this is a
drop-in swap with no layout change.
