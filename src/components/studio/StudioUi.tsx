import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  type ColorValue,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';
import { Text } from '../ui';
import { RadioDot } from '../ui/Selection';
import { colors, fontFamily, radius } from '../../theme/tokens';

/**
 * The Studio screens' building blocks, ported from the final app design
 * (`reports/app-design-p3-p7/lib.mjs` + `styles.css`, "Sukun app, final design"). The design's own
 * values are used where the token file has no name for them; each is noted where it appears.
 */

/* ---------------------------------------------------------------- icons (24px stroke) */

const ICONS = {
  lotus:
    '<path d="M12 20c-4 0-8-2-9-6 3 0 6 1 9 4 3-3 6-4 9-4-1 4-5 6-9 6z"/><path d="M12 18c-2-2-3-5-3-8 1 0 2.2.6 3 1.6.8-1 2-1.6 3-1.6 0 3-1 6-3 8z"/><path d="M12 11.6V5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  pin: '<path d="M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>',
  share: '<path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 13v7h14v-7"/>',
  scan: '<path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4"/><path d="M4 12h16"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  phone:
    '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z"/>',
  package: '<path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  ticket:
    '<path d="M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4z"/><path d="M10 7v10" stroke-dasharray="2 2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
} as const;

export type StudioIconName = keyof typeof ICONS;

export function StudioIcon({
  name,
  size = 20,
  color = colors.textPrimary,
  filled = false,
}: {
  name: StudioIconName;
  size?: number;
  color?: ColorValue;
  filled?: boolean;
}) {
  const stroke = String(color);
  const xml = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${filled ? stroke : 'none'}" stroke="${stroke}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
  return <SvgXml xml={xml} width={size} height={size} />;
}

/* ---------------------------------------------------------------- tags */

/** The design's `.t-*` pills. `amber` and `green` are the design's own tints. */
export type StudioTagTone =
  'sage' | 'amber' | 'line' | 'green' | 'sky' | 'dark' | 'gold' | 'cancel';

const TAG_TONES: Record<StudioTagTone, { bg: string; fg: string; border?: string }> = {
  sage: { bg: colors.sage500, fg: colors.creme },
  amber: { bg: colors.gold100, fg: colors.rose700 },
  line: { bg: 'transparent', fg: colors.textMuted, border: colors.borderDefault },
  green: { bg: '#DCE6D2', fg: colors.sage500 },
  sky: { bg: colors.sky500, fg: colors.creme },
  dark: { bg: colors.black, fg: colors.creme },
  gold: { bg: colors.gold300, fg: colors.black },
  cancel: { bg: '#E4DCCB', fg: colors.rose700 },
};

export function StudioTag({ label, tone = 'sage' }: { label: string; tone?: StudioTagTone }) {
  const t = TAG_TONES[tone];
  return (
    <View
      style={[
        styles.tag,
        { backgroundColor: t.bg },
        t.border ? { borderWidth: 1, borderColor: t.border } : null,
      ]}
    >
      <Text style={[styles.tagLabel, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

/* ---------------------------------------------------------------- notes */

const NOTE_TONES = {
  gold: { bg: '#F8EBC4', fg: colors.rose700 },
  sage: { bg: '#DCE6D2', fg: colors.sage500 },
  sky: { bg: '#DCEEF1', fg: colors.sky500 },
  rose: { bg: '#F6DCD3', fg: colors.rose700 },
} as const;

export function StudioNote({
  tone = 'gold',
  children,
  style,
}: {
  tone?: keyof typeof NOTE_TONES;
  children: ReactNode;
  style?: ViewStyle;
}) {
  const t = NOTE_TONES[tone];
  return (
    <View style={[styles.note, { backgroundColor: t.bg }, style]} accessibilityRole="text">
      <StudioIcon name="info" size={17} color={t.fg} />
      <Text style={[styles.noteText, { color: t.fg }]}>{children}</Text>
    </View>
  );
}

/* ---------------------------------------------------------------- headings */

export function Kicker({ children, color }: { children: ReactNode; color?: string }) {
  return <Text style={[styles.kicker, color ? { color } : null]}>{children}</Text>;
}

/** The design's `.lbl`: an uppercase section label with an optional right-hand action. */
export function SectionLabel({
  label,
  right,
  onRight,
}: {
  label: string;
  right?: string;
  onRight?: () => void;
}) {
  return (
    <View style={styles.label}>
      <Text style={styles.labelText}>{label}</Text>
      {right ? (
        <Pressable accessibilityRole="button" onPress={onRight} hitSlop={8}>
          <Text style={[styles.labelText, styles.labelAction]}>{right}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/* ---------------------------------------------------------------- pills */

/** The design's small buttons (`.btn.sm`, `.btn.xs`) in its variants. */
export function PillButton({
  label,
  onPress,
  variant = 'dark',
  size = 'xs',
  icon,
  disabled,
  loading,
  accessibilityLabel,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: 'dark' | 'line' | 'sky' | 'rose';
  size?: 'xs' | 'sm';
  icon?: StudioIconName;
  disabled?: boolean;
  loading?: boolean;
  accessibilityLabel?: string;
  style?: ViewStyle;
}) {
  const fg = variant === 'line' ? colors.textPrimary : colors.creme;
  const bg =
    variant === 'dark'
      ? colors.black
      : variant === 'sky'
        ? colors.sky500
        : variant === 'rose'
          ? colors.rose700
          : 'transparent';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: Boolean(disabled || loading), busy: Boolean(loading) }}
      disabled={disabled || loading}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.pill,
        size === 'sm' ? styles.pillSm : styles.pillXs,
        { backgroundColor: disabled ? '#CFC7B4' : bg },
        variant === 'line' && styles.pillLine,
        pressed && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={fg} />
      ) : (
        <>
          {icon ? <StudioIcon name={icon} size={14} color={fg} /> : null}
          <Text style={[styles.pillLabel, size === 'sm' && styles.pillLabelSm, { color: fg }]}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

/** Underlined text action (`.btn.ghost`). */
export function TextAction({
  label,
  onPress,
  color = colors.textPrimary,
  disabled,
}: {
  label: string;
  onPress: () => void;
  color?: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      style={({ pressed }) => [styles.textAction, (pressed || disabled) && styles.pressed]}
    >
      <Text style={[styles.textActionLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

/* ---------------------------------------------------------------- branch */

/** `"Sun Room · Sukun Studios East"` in the branch colour, under a class title. */
export function BranchLine({ text, color }: { text: string; color: string }) {
  return (
    <View style={styles.branchLine}>
      <View style={[styles.branchDot, { backgroundColor: color }]} />
      <Text style={[styles.branchText, { color }]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

/** The home studio bar: filled in the branch colour, "Your studio", the name, "Change". */
export function StudioBar({
  name,
  color,
  onChange,
}: {
  name: string;
  color: string;
  onChange?: () => void;
}) {
  return (
    <View style={[styles.studioBar, { backgroundColor: color }]}>
      <StudioIcon name="pin" size={18} color={colors.creme} />
      <View style={styles.flex}>
        <Text style={styles.studioBarKicker}>Your studio</Text>
        <Text style={styles.studioBarName} numberOfLines={1}>
          {name}
        </Text>
      </View>
      {onChange ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Change your studio"
          onPress={onChange}
          hitSlop={10}
        >
          <Text style={styles.studioBarAction}>Change</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/* ---------------------------------------------------------------- class card */

/** The design's `.ccard`: time and length, a rail in the branch colour, name, sub, and a right-hand element. */
export function ClassCard({
  time,
  duration,
  railColor,
  title,
  sub,
  right,
  onPress,
  muted = false,
  highlight,
  accessibilityLabel,
}: {
  time: string;
  duration?: string;
  railColor: string;
  title: string;
  sub?: string;
  right?: ReactNode;
  onPress?: () => void;
  muted?: boolean;
  highlight?: string;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.classCard,
        highlight ? { borderColor: highlight, borderWidth: 1.5 } : null,
        muted && styles.muted,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.classTime}>
        <Text style={styles.classTimeText}>{time}</Text>
        {duration ? <Text style={styles.classDuration}>{duration}</Text> : null}
      </View>
      <View style={[styles.rail, { backgroundColor: railColor }]} />
      <View style={styles.flex}>
        <Text style={styles.classTitle} numberOfLines={2}>
          {title}
        </Text>
        {sub ? (
          <Text style={styles.classSub} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      {right}
    </Pressable>
  );
}

/* ---------------------------------------------------------------- radio card */

export function RadioCard({
  selected,
  onPress,
  title,
  sub,
  right,
  tag,
  barColor,
  disabled,
}: {
  selected: boolean;
  onPress: () => void;
  title: string;
  sub?: string;
  right?: string;
  tag?: ReactNode;
  barColor?: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.radioCard,
        selected && styles.radioCardOn,
        disabled && styles.muted,
        pressed && styles.pressed,
      ]}
    >
      <RadioDot selected={selected} size={19} />
      {barColor ? <View style={[styles.radioBar, { backgroundColor: barColor }]} /> : null}
      <View style={styles.flex}>
        <View style={styles.radioTitleRow}>
          <Text style={styles.radioTitle}>{title}</Text>
          {tag}
        </View>
        {sub ? <Text style={styles.radioSub}>{sub}</Text> : null}
      </View>
      {right ? <Text style={styles.radioRight}>{right}</Text> : null}
    </Pressable>
  );
}

/* ---------------------------------------------------------------- misc */

export function ProgressBar({ value }: { value: number }) {
  return (
    <View
      style={styles.bar}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
    >
      <View style={[styles.barFill, { width: `${Math.round(value * 100)}%` }]} />
    </View>
  );
}

export function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.kv}>
      <Text style={styles.kvLabel}>{label}</Text>
      <Text style={styles.kvValue}>{value}</Text>
    </View>
  );
}

/** The success mark on "You're booked", "Paid and booked", "You're checked in". */
export function Burst() {
  return (
    <View style={styles.burst}>
      <View style={styles.burstInner}>
        <StudioIcon name="check" size={30} color={colors.creme} />
      </View>
    </View>
  );
}

export function Stars({
  value,
  onChange,
  size = 32,
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  size?: number;
  label: string;
}) {
  return (
    <View
      style={styles.stars}
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 5, now: value }}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable
          key={n}
          accessibilityRole="button"
          accessibilityLabel={`${n} star${n === 1 ? '' : 's'}`}
          onPress={() => onChange(n)}
          hitSlop={4}
        >
          <StudioIcon name="star" size={size} color={colors.gold500} filled={n <= value} />
        </Pressable>
      ))}
    </View>
  );
}

export function MetaRow({ icon, text }: { icon: StudioIconName; text: string }) {
  return (
    <View style={styles.metaRow}>
      <StudioIcon name={icon} size={18} color={colors.textMuted} />
      <Text style={styles.metaText}>{text}</Text>
    </View>
  );
}

/* ---------------------------------------------------------------- sheet */

/** The design's bottom sheet: creme, 22pt top corners, a grabber. Taps on the scrim close it. */
export function StudioSheet({
  visible,
  onClose,
  children,
  dismissable = true,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  dismissable?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable
          style={styles.scrim}
          onPress={dismissable ? onClose : undefined}
          accessibilityLabel="Close"
        />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.grabber} />
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function SheetTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.sheetTitle}>{children}</Text>;
}

export function SheetSub({ children }: { children: ReactNode }) {
  return <Text style={styles.sheetSub}>{children}</Text>;
}

/** The design's hero art for a class: its image, or a wash of the branch colour. */
export function ClassHero({
  color,
  onBack,
  onShare,
}: {
  color: string;
  onBack: () => void;
  onShare?: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.hero, { backgroundColor: color, paddingTop: insets.top + 8 }]}>
      <View style={styles.heroWash} />
      <View style={styles.heroBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={onBack}
          style={styles.heroButton}
          hitSlop={8}
        >
          <StudioIcon name="back" size={20} />
        </Pressable>
        {onShare ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Share this class"
            onPress={onShare}
            style={styles.heroButton}
            hitSlop={8}
          >
            <StudioIcon name="share" size={19} />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.heroMark}>
        <StudioIcon name="lotus" size={64} color="rgba(247,240,224,0.55)" />
      </View>
    </View>
  );
}

export const studioStyles = StyleSheet.create({
  title: {
    fontFamily: fontFamily.displayItalic,
    fontSize: 29,
    lineHeight: 32,
    color: colors.textPrimary,
  },
  body: { fontSize: 14, lineHeight: 21, color: colors.textPrimary },
  muted: { fontSize: 12.5, lineHeight: 18, color: colors.textMuted },
  card: {
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: 8,
    padding: 14,
  },
  divider: { height: 1, backgroundColor: colors.borderDefault, marginVertical: 10 },
  stack: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  center: { alignItems: 'center' },
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  muted: { opacity: 0.55 },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  tagLabel: {
    fontSize: 9.5,
    letterSpacing: 9.5 * 0.1,
    textTransform: 'uppercase',
    fontFamily: fontFamily.bodyMedium,
  },
  note: {
    flexDirection: 'row',
    gap: 9,
    alignItems: 'flex-start',
    borderRadius: 8,
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  noteText: { flex: 1, fontSize: 12.5, lineHeight: 18 },
  kicker: {
    fontSize: 10.5,
    letterSpacing: 10.5 * 0.14,
    textTransform: 'uppercase',
    color: colors.textMuted,
    marginBottom: 6,
  },
  label: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 18,
    marginBottom: 8,
  },
  labelText: {
    fontSize: 10.5,
    letterSpacing: 10.5 * 0.12,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  labelAction: { color: colors.textPrimary, textDecorationLine: 'underline' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: radius.pill,
  },
  pillXs: { height: 32, paddingHorizontal: 14 },
  pillSm: { height: 40, paddingHorizontal: 18 },
  pillLine: { borderWidth: 1, borderColor: colors.black },
  pillLabel: {
    fontSize: 10.5,
    letterSpacing: 10.5 * 0.1,
    textTransform: 'uppercase',
    fontFamily: fontFamily.bodyMedium,
  },
  pillLabelSm: { fontSize: 11.5, letterSpacing: 11.5 * 0.1 },
  textAction: { alignSelf: 'center', paddingVertical: 8 },
  textActionLabel: { fontSize: 13.5, textDecorationLine: 'underline' },
  branchLine: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 6 },
  branchDot: { width: 8, height: 8, borderRadius: 4 },
  branchText: { fontSize: 13, fontFamily: fontFamily.bodyMedium, flexShrink: 1 },
  studioBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  studioBarKicker: {
    fontSize: 10,
    letterSpacing: 10 * 0.12,
    textTransform: 'uppercase',
    color: colors.creme,
    opacity: 0.8,
  },
  studioBarName: { fontSize: 15, fontFamily: fontFamily.bodyMedium, color: colors.creme },
  studioBarAction: { fontSize: 12.5, color: colors.creme, textDecorationLine: 'underline' },
  classCard: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  classTime: { width: 46 },
  classTimeText: { fontSize: 15, fontFamily: fontFamily.bodyMedium, lineHeight: 17 },
  classDuration: { fontSize: 10.5, color: colors.textMuted, marginTop: 3 },
  rail: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  classTitle: { fontSize: 14, fontFamily: fontFamily.bodyMedium, lineHeight: 18 },
  classSub: { fontSize: 11.5, color: colors.textMuted, marginTop: 2 },
  radioCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: 8,
    padding: 14,
    marginBottom: 8,
  },
  radioCardOn: { borderColor: colors.black, borderWidth: 1.6 },
  radioBar: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  radioTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  radioTitle: { fontSize: 14, fontFamily: fontFamily.bodyMedium },
  radioSub: { fontSize: 12, color: colors.textMuted, marginTop: 3 },
  radioRight: { fontSize: 13.5, fontFamily: fontFamily.bodyMedium },
  bar: { height: 6, borderRadius: 3, backgroundColor: '#E8E0CE', overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: colors.sage500, borderRadius: 3 },
  kv: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingVertical: 7 },
  kvLabel: { fontSize: 13, color: colors.textMuted },
  kvValue: { fontSize: 13, fontFamily: fontFamily.bodyMedium, flexShrink: 1, textAlign: 'right' },
  burst: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.sage100,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  burstInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.sage500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stars: { flexDirection: 'row', gap: 8 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  metaText: { fontSize: 14, flex: 1 },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: colors.overlayScrim },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '88%',
    backgroundColor: colors.bgPage,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 10,
    paddingHorizontal: 20,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CFC7B4',
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetTitle: {
    fontFamily: fontFamily.displayItalic,
    fontSize: 25,
    lineHeight: 28,
    color: colors.textPrimary,
  },
  sheetSub: { fontSize: 13.5, lineHeight: 19, color: colors.textMuted, marginTop: 6 },
  hero: { height: 230, justifyContent: 'space-between', overflow: 'hidden' },
  heroWash: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(29,29,29,0.12)' },
  heroBar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16 },
  heroButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.creme,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroMark: { alignItems: 'center', paddingBottom: 40 },
});
