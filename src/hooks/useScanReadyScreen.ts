import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import * as Brightness from 'expo-brightness';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

const KEEP_AWAKE_TAG = 'entry-pass-qr';

/**
 * While an entry QR is on screen: full brightness, so the gate camera reads it through glare,
 * and no auto-lock while the holder waits in line. Both are undone as soon as the code leaves
 * the screen or the app goes to the background. iOS changes the device brightness itself, so
 * the holder's own level is put back; Android only brightens this window and hands it back.
 */
export function useScanReadyScreen(active: boolean) {
  useEffect(() => {
    if (!active) return;

    let saved: number | null = null;
    let boosted = false;
    let cancelled = false;

    const boost = async () => {
      if (boosted) return;
      boosted = true;
      void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => undefined);
      try {
        if (Platform.OS === 'ios' && saved === null) saved = await Brightness.getBrightnessAsync();
        if (!cancelled && boosted) await Brightness.setBrightnessAsync(1);
      } catch {
        // Brightness is a nicety; the QR still shows without it.
      }
    };
    const restore = async () => {
      if (!boosted) return;
      boosted = false;
      deactivateKeepAwake(KEEP_AWAKE_TAG);
      try {
        if (Platform.OS === 'ios') {
          if (saved !== null) await Brightness.setBrightnessAsync(saved);
        } else {
          await Brightness.restoreSystemBrightnessAsync();
        }
      } catch {
        // Nothing to put back.
      }
    };

    if (AppState.currentState === 'active') void boost();
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void boost();
      else void restore();
    });

    return () => {
      cancelled = true;
      appState.remove();
      void restore();
    };
  }, [active]);
}
