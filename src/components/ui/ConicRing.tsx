import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { colors } from '../../theme/tokens';

/**
 * The multi-hue ring around the selfie target on design screen 05:
 * `conic-gradient(from 210deg, rose-300, gold-300, sky-300, sage-300, rose-300)`.
 *
 * React Native has no conic gradient, so this draws four 90° arcs, each with a linear
 * gradient running between the two adjacent stop colours — visually equivalent at this size.
 */
const STOPS = [colors.rose300, colors.gold300, colors.sky300, colors.sage300, colors.rose300];
const START_ANGLE = 210;

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, from: number, to: number): string {
  const start = polar(cx, cy, r, from);
  const end = polar(cx, cy, r, to);
  const largeArc = to - from > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

export function ConicRing({
  size,
  thickness = 5,
  children,
}: {
  size: number;
  thickness?: number;
  children?: ReactNode;
}) {
  const radius = (size - thickness) / 2;
  const centre = size / 2;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Defs>
          {STOPS.slice(0, 4).map((stop, index) => {
            const from = START_ANGLE + index * 90;
            const a = polar(centre, centre, radius, from);
            const b = polar(centre, centre, radius, from + 90);
            return (
              <LinearGradient
                key={index}
                id={`seg${index}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                gradientUnits="userSpaceOnUse"
              >
                <Stop offset="0" stopColor={stop} />
                <Stop offset="1" stopColor={STOPS[index + 1] ?? stop} />
              </LinearGradient>
            );
          })}
        </Defs>
        {[0, 1, 2, 3].map((index) => (
          <Path
            key={index}
            d={arcPath(
              centre,
              centre,
              radius,
              START_ANGLE + index * 90,
              START_ANGLE + index * 90 + 90.5,
            )}
            stroke={`url(#seg${index})`}
            strokeWidth={thickness}
            fill="none"
            strokeLinecap="butt"
          />
        ))}
      </Svg>
      <View style={[styles.inner, { margin: thickness }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  inner: {
    flex: 1,
  },
});
