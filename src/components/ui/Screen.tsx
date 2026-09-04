import { type ReactNode } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableWithoutFeedback,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../theme/tokens';

export interface ScreenProps {
  children: ReactNode;
  /** `page` is the creme app background; `inverse` is the black entry-pass screen. */
  tone?: 'page' | 'inverse';
  /** Screens with a fixed CTA at the bottom keep their own padding. */
  padded?: boolean;
  scroll?: boolean;
  /** Bottom inset is skipped on tab screens, where the tab bar owns it. */
  edges?: { top?: boolean; bottom?: boolean };
  style?: ViewStyle;
  contentStyle?: ViewStyle;
  /** Called once the scroll position reaches the bottom threshold. */
  onEndReached?: () => void;
  onEndReachedThreshold?: number;
}

/** Only numeric padding participates in the inset maths; percentages fall back to the default. */
function toPadding(value: ViewStyle['paddingTop'], fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}

/**
 * Tapping the page dismisses the keyboard. Numeric keyboards (`phone-pad` on the phone screen,
 * `number-pad` for the code) have no return key, so without this there is no way off them but
 * the field's own accessory bar. `accessible={false}` keeps the wrapper out of the a11y tree,
 * and taps that a child handles never reach it.
 */
function Dismissable({ children, style }: { children: ReactNode; style: ViewStyle | ViewStyle[] }) {
  return (
    <TouchableWithoutFeedback accessible={false} onPress={Keyboard.dismiss}>
      <View style={style}>{children}</View>
    </TouchableWithoutFeedback>
  );
}

/**
 * The screen frame. The design's phone frame is 402×874 with 26–28px horizontal padding and
 * a 26px top / 32px bottom rhythm; safe-area insets are added on top of that.
 */
export function Screen({
  children,
  tone = 'page',
  padded = true,
  scroll = false,
  edges,
  style,
  contentStyle,
  onEndReached,
  onEndReachedThreshold = 160,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const top = edges?.top === false ? 0 : insets.top;
  const bottom = edges?.bottom === false ? 0 : insets.bottom;

  const background = tone === 'inverse' ? colors.black : colors.bgPage;

  // `contentStyle` is merged here rather than layered after `inner`, because a screen that sets
  // its own `paddingTop` would otherwise replace the safe-area inset outright and render under
  // the status bar (as the Discover header did on iOS, where insets are non-zero — on web they
  // are 0, which hid it). Insets are *added to* the screen's padding, per this component's
  // contract above.
  const content = (StyleSheet.flatten(contentStyle) ?? {}) as ViewStyle;
  const {
    paddingTop: contentTop,
    paddingBottom: contentBottom,
    paddingHorizontal: contentHorizontal,
    ...restContent
  } = content;

  const inner: ViewStyle = {
    ...restContent,
    paddingTop: top + toPadding(contentTop, padded ? 26 : 0),
    paddingBottom: bottom + toPadding(contentBottom, padded ? 32 : 0),
    paddingHorizontal: toPadding(contentHorizontal, padded ? 24 : 0),
  };

  const body = scroll ? (
    <ScrollView
      style={styles.flex}
      // `flexGrow` rather than a plain height, so a screen whose spacer pins a CTA to the
      // bottom still fills a tall screen, and still scrolls once the keyboard shrinks it.
      contentContainerStyle={[inner, styles.grow]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      onScroll={
        onEndReached
          ? (event) => {
              const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
              if (
                contentOffset.y + layoutMeasurement.height >=
                contentSize.height - onEndReachedThreshold
              ) {
                onEndReached();
              }
            }
          : undefined
      }
      scrollEventThrottle={100}
      showsVerticalScrollIndicator={false}
    >
      <Dismissable style={styles.grow}>{children}</Dismissable>
    </ScrollView>
  ) : (
    <Dismissable style={[styles.flex, inner]}>{children}</Dismissable>
  );

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: background }, style]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {body}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  grow: { flexGrow: 1 },
});
