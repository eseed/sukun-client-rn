import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { BackHandler } from 'react-native';
import { codeForError } from '../../lib/errors';

/**
 * Takes over Android's hardware back while the screen is focused, so a screen past the point of
 * no return (an order placed, a payment made) can send people somewhere real instead of popping
 * into a checkout step the store no longer holds. Pass `null` to leave back alone.
 *
 * Focus-scoped on purpose: confirmation stays mounted under the screens it pushes, and a plain
 * listener there would swallow their back too. iOS has no hardware back; the swipe is switched
 * off with `gestureEnabled` on the screen itself.
 */
export function useHardwareBack(onBack: (() => void) | null) {
  const handler = useRef(onBack);
  useEffect(() => {
    handler.current = onBack;
  });
  const active = onBack !== null;

  useFocusEffect(
    useCallback(() => {
      if (!active) return undefined;
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        handler.current?.();
        return true;
      });
      return () => subscription.remove();
    }, [active]),
  );
}

/**
 * The server answered, and the thing asked for is not there. Anything else (no connection, a
 * timeout, a 500) is a failure to ask, which gets a retry, never "this checkout has expired".
 */
export function isNotFoundError(error: unknown): boolean {
  if (typeof error === 'object' && error !== null && 'status' in error && error.status === 404) {
    return true;
  }
  return (codeForError(error) ?? '').endsWith('_NOT_FOUND');
}
