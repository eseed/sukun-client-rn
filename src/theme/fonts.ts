import { Platform } from 'react-native';

/**
 * The brand `.otf` files are licensed assets held in the Claude Design project
 * (`_ds/.../assets/fonts/`), committed under `assets/fonts/` and registered via `useFonts`
 * in `app/_layout.tsx` — see `assets/fonts/README.md`.
 */
export const BRAND_FONTS_AVAILABLE = true;

export const brandFontFiles = {
  SeriouslyNostalgic: 'SeriouslyNostalgicFine-Regular.otf',
  SeriouslyNostalgicItalic: 'SeriouslyNostalgic-RegularItalic.otf',
  BananaGrotesk: 'BananaGrotesk-Regular.otf',
  BananaGroteskLight: 'BananaGrotesk-Light.otf',
  BananaGroteskMedium: 'BananaGrotesk-Medium.otf',
  BananaGroteskThin: 'BananaGrotesk-Thin.otf',
  MinionPro: 'MinionPro-Regular.otf',
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
