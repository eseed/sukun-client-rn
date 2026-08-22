import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * Whether the software keyboard is on screen.
 *
 * `Screen` avoids the keyboard by shrinking its content, so whatever holds the slack — usually
 * a decorative filler — gets squeezed onto the fields above it. Screens use this to drop that
 * filler for as long as the keyboard is up.
 */
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // iOS gets the `will` events so the deco leaves with the keyboard's own animation rather
    // than a frame after it; Android only fires the `did` pair.
    const isIos = Platform.OS === 'ios';
    const show = Keyboard.addListener(isIos ? 'keyboardWillShow' : 'keyboardDidShow', () =>
      setVisible(true),
    );
    const hide = Keyboard.addListener(isIos ? 'keyboardWillHide' : 'keyboardDidHide', () =>
      setVisible(false),
    );

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return visible;
}
