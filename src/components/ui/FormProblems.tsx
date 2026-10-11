import { Fragment, useCallback, useRef } from 'react';
import { type ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { colors, fontFamily, radius, space } from '../../theme/tokens';
import { Text } from './Text';

/** A field a form will not send as it is. */
export interface FormProblem {
  /** The field's name in the form, which `useFieldTargets` finds it by. */
  name: string;
  /** What the field is called, as it reads mid-sentence ("full name", "living area"). */
  label: string;
}

export interface FormProblemsProps {
  problems: FormProblem[];
  /** Called with a field's name when it is tapped in the sentence. */
  onSelect: (name: string) => void;
  style?: ViewStyle;
}

/**
 * After a press the form refused, what is still missing or incomplete, said beside the button
 * that was pressed, each field a tap away (owner's call 2026-10-10, as on the website). The
 * fields keep their own messages; this names them in one sentence: "Your full name, email and
 * gender are missing or incomplete." In the error panel's colours (`InlineError`) with the
 * fields' own "!" disc (`FieldError`). Nothing renders while there is nothing to fix.
 */
export function FormProblems({ problems, onSelect, style }: FormProblemsProps) {
  if (problems.length === 0) return null;
  const last = problems.length - 1;
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[styles.container, style]}
    >
      <View
        style={styles.mark}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Text variant="metaSm" color={colors.white} style={styles.markText}>
          !
        </Text>
      </View>
      <Text variant="bodyMuted" color={colors.rose700} style={styles.message}>
        Your{' '}
        {problems.map((problem, index) => (
          <Fragment key={problem.name}>
            {/* A nested Text resets to its own variant, so it names the sentence's again. */}
            <Text
              variant="bodyMuted"
              color={colors.rose700}
              accessibilityRole="link"
              onPress={() => onSelect(problem.name)}
              style={styles.field}
            >
              {problem.label}
            </Text>
            {index < last - 1 ? ', ' : index === last - 1 ? ' and ' : null}
          </Fragment>
        ))}{' '}
        {last === 0 ? 'is' : 'are'} missing or incomplete.
      </Text>
    </View>
  );
}

/**
 * `ScrollView.getInnerViewRef` is React Native's own (ScrollView.js) but missing from its
 * TypeScript types. It is the content view, so a field measured against it has the same position
 * however far the page is already scrolled.
 */
type ScrollViewWithContent = ScrollView & { getInnerViewRef?: () => View | null };

/** Room left above a field brought into view, so its label shows too. */
const SCROLL_MARGIN = space.s6;

/**
 * Finds a form's fields on screen. A screen gives its `Screen` the `scrollRef` and wraps each
 * field in a view with `fieldRef(name)`; `show(name)` then scrolls that field near the top.
 * Focusing it, where it takes typing, is the form's own `setFocus`.
 */
export function useFieldTargets() {
  const scrollRef = useRef<ScrollView>(null);
  const views = useRef(new Map<string, View>());

  const fieldRef = useCallback(
    (name: string) => (view: View | null) => {
      if (view) views.current.set(name, view);
      else views.current.delete(name);
    },
    [],
  );

  const show = useCallback((name: string) => {
    const scroll = scrollRef.current;
    const view = views.current.get(name);
    const content = (scroll as ScrollViewWithContent | null)?.getInnerViewRef?.();
    if (!scroll || !view || !content) return;
    view.measureLayout(content, (_x, y) => {
      scroll.scrollTo({ y: Math.max(0, y - SCROLL_MARGIN), animated: true });
    });
  }, []);

  return { scrollRef, fieldRef, show };
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    padding: space.s3,
    backgroundColor: colors.rose100,
    borderRadius: radius.md,
  },
  // 16px, centred on the first line of the 14px / 1.55 sentence.
  mark: {
    width: 16,
    height: 16,
    marginTop: 3,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.borderInvalid,
  },
  markText: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: 11,
    lineHeight: 13,
  },
  message: {
    flex: 1,
  },
  field: {
    textDecorationLine: 'underline',
  },
});
