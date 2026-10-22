import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from '../../theme/tokens';
import type { IconProps } from '../ui/icons';

/** The pill the mark sits in: wider than tall, inside the tab bar's 28pt icon box. */
const PILL_WIDTH = 46;
const PILL_HEIGHT = 28;
const PULSE_MS = 1600;

/**
 * Live mode's tab (owner's call, 2026-10-22): a white broadcast mark on a solid green pill, with a
 * green glow pulsing out from it, so it reads as "the event is on, tap to go back to it" from any
 * screen. It is always lit, selected or not, so it takes no colour; with reduce motion on, the
 * glow stays still rather than pulsing.
 */
export function LiveTabIcon({ size = 18 }: Pick<IconProps, 'size'>) {
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
                opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
                transform: [
                  { scaleX: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] }) },
                  { scaleY: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] }) },
                ],
              },
        ]}
      />
      <View style={styles.pill}>
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Circle cx="12" cy="12" r="3.2" fill={colors.white} />
          <Path
            d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14"
            stroke={colors.white}
            strokeWidth={2}
            strokeLinecap="round"
          />
        </Svg>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  halo: {
    position: 'absolute',
    width: PILL_WIDTH,
    height: PILL_HEIGHT,
    borderRadius: PILL_HEIGHT / 2,
    backgroundColor: colors.tabLive,
  },
  pill: {
    width: PILL_WIDTH,
    height: PILL_HEIGHT,
    borderRadius: PILL_HEIGHT / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tabLive,
  },
  haloStill: { opacity: 0.3 },
});
