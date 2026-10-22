import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from '../../theme/tokens';
import type { IconProps } from '../ui/icons';

const HALO_SIZE = 30;
const PULSE_MS = 1600;

/**
 * Live mode's tab (owner's call, 2026-10-22): a green broadcast mark that pulses, so it reads as
 * "the event is on, tap to go back to it" from any screen. Drawn in the tab icons' 1.6 stroke. It
 * is always green, selected or not, so it takes no colour; with reduce motion on, the halo stays
 * lit rather than pulsing.
 */
export function LiveTabIcon({ size = 20 }: Pick<IconProps, 'size'>) {
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
    if (reduceMotion) {
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
  }, [pulse, reduceMotion]);

  return (
    <View style={styles.wrap}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.halo,
          reduceMotion
            ? styles.haloStill
            : {
                opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
                transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.3] }) }],
              },
        ]}
      />
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Circle cx="12" cy="12" r="3.2" fill={colors.tabLive} />
        <Path
          d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14"
          stroke={colors.tabLive}
          strokeWidth={1.8}
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  halo: {
    position: 'absolute',
    width: HALO_SIZE,
    height: HALO_SIZE,
    borderRadius: HALO_SIZE / 2,
    backgroundColor: colors.tabLive,
  },
  haloStill: { opacity: 0.3 },
});
