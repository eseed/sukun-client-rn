import { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  StyleSheet,
  View,
  type ColorValue,
} from 'react-native';
import { TicketsIcon } from '../ui/icons';
import { colors } from '../../theme/tokens';

const HALO_SIZE = 34;
const PULSE_MS = 1200;

/**
 * The Tickets tab's icon, which pulses while an invitation waits for its holder to claim or
 * decline it. Both bars draw it: the tab bar, and `BottomNav` on the screens outside the tabs.
 *
 * Gold is the tone the app already spends on "this ticket needs you" (the Ready to claim badge).
 * With reduce motion on, the halo stays lit rather than pulsing, so it still says so.
 */
export function TicketsTabIcon({ color, waiting }: { color: ColorValue; waiting: boolean }) {
  const [pulse] = useState(() => new Animated.Value(0));
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!waiting || reduceMotion) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: PULSE_MS,
        easing: Easing.out(Easing.ease),
        useNativeDriver: Platform.OS !== 'web',
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduceMotion, waiting]);

  return (
    <View style={styles.wrap}>
      {waiting ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.halo,
            reduceMotion
              ? styles.haloStill
              : {
                  opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }),
                  transform: [
                    { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.3] }) },
                  ],
                },
          ]}
        />
      ) : null}
      <TicketsIcon color={color} />
      {waiting ? <View style={styles.dot} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    width: HALO_SIZE,
    height: HALO_SIZE,
    borderRadius: HALO_SIZE / 2,
    backgroundColor: colors.accentGold,
  },
  haloStill: {
    opacity: 0.45,
  },
  dot: {
    position: 'absolute',
    top: -2,
    right: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accentGold,
    borderWidth: 1,
    borderColor: colors.bgPage,
  },
});
