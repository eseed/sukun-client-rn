/**
 * Design tokens — ported verbatim from the Claude Design project
 * `_ds/sukun-design-system-28d07fa6-f2f5-41b3-b2c3-e263ce1ad965/tokens/*.css`.
 *
 * These are the source of truth for the theme. Do not invent values here; if the design
 * gains a token, copy it across with the same name.
 */

import { resolveFamily } from './fonts';

/** tokens/colors.css */
export const palette = {
  creme: '#F7F0E0',
  black: '#1D1D1D',
  white: '#FFFFFF',

  rose100: '#EEC6B5',
  rose300: '#EB7066',
  rose500: '#BA4A82',
  rose700: '#6E290F',

  gold100: '#F2DE9C',
  gold300: '#DDBE01',
  gold500: '#E08038',
  gold700: '#C45429',

  sky100: '#B8E7ED',
  sky300: '#59879C',
  sky500: '#055270',
  sky700: '#124BA4',

  sage100: '#A8BFA6',
  sage300: '#6BC785',
  sage500: '#495C2F',
  sage700: '#6B593D',
} as const;

export const colors = {
  ...palette,

  bgPage: palette.creme,
  bgSurface: palette.white,
  bgInverse: palette.black,

  textPrimary: palette.black,
  textInverse: palette.creme,
  textMuted: '#6B6559',

  borderDefault: '#D8D0BE',
  borderStrong: palette.black,

  /*
   * The dark entry pass (design screen 21 · Entry pass / QR) draws its rules and its secondary
   * type as creme at low opacity on black. The design system names no token for either, so they
   * are recorded here rather than open-coded in the screen.
   */
  borderInverse: 'rgba(247,240,224,0.18)',
  textInverseMuted: 'rgba(247,240,224,0.62)',

  accentRose: palette.rose300,
  accentGold: palette.gold300,
  accentSky: palette.sky500,
  accentSage: palette.sage300,

  focusRing: palette.sky500,
  overlayScrim: 'rgba(29,29,29,0.45)',
} as const;

/** tokens/spacing.css */
export const space = {
  s1: 4,
  s2: 8,
  s3: 12,
  s4: 16,
  s5: 24,
  s6: 36,
  s7: 48,
  s8: 64,
  s9: 96,
} as const;

export const radius = {
  sm: 2,
  md: 4,
  pill: 999,
  circle: 9999,
} as const;

export const borderWidth = 1;

/**
 * tokens/spacing.css shadows, expressed for React Native.
 * `--shadow-card:0 1px 2px rgba(29,29,29,.06), 0 4px 12px rgba(29,29,29,.08)`
 * `--shadow-raised:0 8px 24px rgba(29,29,29,.12)`
 */
export const shadow = {
  card: {
    shadowColor: palette.black,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  raised: {
    shadowColor: palette.black,
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
} as const;

/**
 * tokens/typography.css — font families.
 * `--font-display:"Seriously Nostalgic"`, `--font-body:"Banana Grotesk"`,
 * `--font-serif-accent:"Minion Pro"`. Resolved through `resolveFamily` so the app degrades
 * to platform faces until the licensed `.otf` files are dropped in.
 */
export const fontFamily = {
  display: resolveFamily('SeriouslyNostalgic'),
  displayItalic: resolveFamily('SeriouslyNostalgicItalic'),
  body: resolveFamily('BananaGrotesk'),
  bodyLight: resolveFamily('BananaGroteskLight'),
  bodyMedium: resolveFamily('BananaGroteskMedium'),
  bodyThin: resolveFamily('BananaGroteskThin'),
} as const;

/**
 * tokens/typography.css — sizes. The two `clamp()` display sizes resolve to their mobile
 * (minimum) end, since the app is phone-only.
 */
export const fontSize = {
  displayXl: 48,
  displayLg: 36,
  displayMd: 28,
  headingLg: 22,
  headingMd: 18,
  bodyLg: 17,
  bodyMd: 15,
  bodySm: 13,
  label: 12,
} as const;

export const lineHeightRatio = {
  tight: 1.05,
  snug: 1.25,
  normal: 1.5,
} as const;

/**
 * `--tracking-wide:0.08em`. React Native letterSpacing is in points, so the em value must be
 * multiplied by the font size at each use site — `tracking.wide(13)`.
 */
export const tracking = {
  wide: (size: number) => size * 0.08,
  normal: 0,
  /** Screens use a few tighter/looser one-offs that the design sets inline. */
  em: (em: number, size: number) => em * size,
} as const;
