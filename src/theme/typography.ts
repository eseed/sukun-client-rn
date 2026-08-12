import { TextStyle } from 'react-native';
import { colors, fontFamily, tracking } from './tokens';

/**
 * Recurring text styles lifted from `Sukun App - All Screens.dc.html`. The design sets these
 * inline per screen; naming them here keeps every screen consistent and keeps the raw values
 * in one place.
 */
export const text = {
  /** Onboarding screen titles — display italic 31px. */
  titleLg: {
    fontFamily: fontFamily.displayItalic,
    fontStyle: 'italic',
    fontSize: 31,
    lineHeight: 31 * 1.1,
    color: colors.textPrimary,
  },
  /** Tab + checkout screen titles — display italic 29px. */
  titleMd: {
    fontFamily: fontFamily.displayItalic,
    fontStyle: 'italic',
    fontSize: 29,
    lineHeight: 29 * 1.1,
    color: colors.textPrimary,
  },
  /** Entry-pass title — display italic 27px on the dark screen. */
  titleSm: {
    fontFamily: fontFamily.displayItalic,
    fontStyle: 'italic',
    fontSize: 27,
    lineHeight: 27 * 1.1,
    color: colors.textPrimary,
  },
  /** Event hero title — display italic 40px. */
  titleHero: {
    fontFamily: fontFamily.displayItalic,
    fontStyle: 'italic',
    fontSize: 40,
    lineHeight: 40,
    color: colors.textInverse,
  },
  /** Featured card title — display italic 25px. */
  titleCard: {
    fontFamily: fontFamily.displayItalic,
    fontStyle: 'italic',
    fontSize: 25,
    lineHeight: 25 * 1.1,
    color: colors.textPrimary,
  },

  /** "Step 1 of 3" — 11px / .16em / uppercase / muted. */
  stepLabel: {
    fontFamily: fontFamily.body,
    fontSize: 11,
    letterSpacing: 11 * 0.16,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  /** Field labels + section eyebrows — 11px / .1em / uppercase / muted. */
  fieldLabel: {
    fontFamily: fontFamily.body,
    fontSize: 11,
    letterSpacing: 11 * 0.1,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  /** Section eyebrows — 11px / .14em / uppercase / muted. */
  eyebrow: {
    fontFamily: fontFamily.body,
    fontSize: 11,
    letterSpacing: 11 * 0.14,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },

  /** Explanatory paragraphs under a title — 14px, muted, 1.55. */
  bodyMuted: {
    fontFamily: fontFamily.body,
    fontSize: 14,
    lineHeight: 14 * 1.55,
    color: colors.textMuted,
  },
  /** Event detail body copy — 15px, 1.6, primary. */
  bodyLead: {
    fontFamily: fontFamily.body,
    fontSize: 15,
    lineHeight: 15 * 1.6,
    color: colors.textPrimary,
  },
  /** Values inside inputs and rows — 15px primary. */
  bodyValue: {
    fontFamily: fontFamily.body,
    fontSize: 15,
    color: colors.textPrimary,
  },
  /** Small meta lines — 12.5–13px muted. */
  meta: {
    fontFamily: fontFamily.body,
    fontSize: 13,
    color: colors.textMuted,
  },
  metaSm: {
    fontFamily: fontFamily.body,
    fontSize: 12,
    color: colors.textMuted,
  },

  /** Pill button labels — 14px / 600 / .08em / uppercase. */
  buttonLabel: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: tracking.wide(14),
    textTransform: 'uppercase',
  },
  /** Tab bar labels — 10px / .08em / uppercase. */
  tabLabel: {
    fontFamily: fontFamily.body,
    fontSize: 10,
    letterSpacing: 10 * 0.08,
    textTransform: 'uppercase',
  },
} satisfies Record<string, TextStyle>;

export type TextVariant = keyof typeof text;
