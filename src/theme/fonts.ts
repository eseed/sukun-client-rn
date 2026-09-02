import { Platform } from 'react-native';

/**
 * The brand faces are licensed assets held in the Claude Design project
 * (`_ds/.../assets/fonts/`), committed under `assets/fonts/` and registered via `useFonts`
 * in `app/_layout.tsx`. The registered files are the `.ttf` conversions, not the `.otf`
 * masters, because Android cannot parse PostScript outlines — see `assets/fonts/README.md`.
 */
export const BRAND_FONTS_AVAILABLE = true;

export const brandFontFiles = {
  SeriouslyNostalgic: 'SeriouslyNostalgicFine-Regular.ttf',
  SeriouslyNostalgicItalic: 'SeriouslyNostalgic-RegularItalic.ttf',
  BananaGrotesk: 'BananaGrotesk-Regular.ttf',
  BananaGroteskLight: 'BananaGrotesk-Light.ttf',
  BananaGroteskMedium: 'BananaGrotesk-Medium.ttf',
  BananaGroteskThin: 'BananaGrotesk-Thin.ttf',
  MinionPro: 'MinionPro-Regular.ttf',
} as const;

export type BrandFamily = keyof typeof brandFontFiles;

const fallback = Platform.select({
  ios: { serif: 'Georgia', sans: undefined as string | undefined },
  android: { serif: 'serif', sans: undefined as string | undefined },
  default: { serif: 'Georgia', sans: undefined as string | undefined },
});

/**
 * Maps a logical family to the name React Native should render with. Returns `undefined`
 * for the body face on fallback, which means "the platform default UI font" — the closest
 * neutral grotesk available without shipping the licensed file.
 */
export function resolveFamily(name: BrandFamily): string | undefined {
  if (BRAND_FONTS_AVAILABLE) return name;
  switch (name) {
    case 'SeriouslyNostalgic':
    case 'SeriouslyNostalgicItalic':
    case 'MinionPro':
      return fallback.serif;
    default:
      return fallback.sans;
  }
}
