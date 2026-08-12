import type { ColorValue } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { colors } from '../../theme/tokens';

/**
 * Icons transcribed path-for-path from `Sukun App - All Screens.dc.html` so the drawn shapes
 * match the design exactly rather than approximating with an icon font.
 */

export interface IconProps {
  size?: number;
  /** `ColorValue` rather than `string` so navigator-supplied tint colours pass straight in. */
  color?: ColorValue;
}

export function DiscoverIcon({ size = 20, color = colors.textPrimary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="8.5" stroke={color} strokeWidth={1.6} />
      <Path
        d="M15.2 8.8 10.9 10.9 8.8 15.2 13.1 13.1z"
        stroke={color}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function TicketsIcon({ size = 20, color = colors.textPrimary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 8.5A1.5 1.5 0 0 1 5.5 7h13A1.5 1.5 0 0 1 20 8.5v2a1.9 1.9 0 0 0 0 3.8v2A1.5 1.5 0 0 1 18.5 18h-13A1.5 1.5 0 0 1 4 16.5v-2a1.9 1.9 0 0 0 0-3.8z"
        stroke={color}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      <Path d="M13.6 7.6v9" stroke={color} strokeWidth={1.6} strokeDasharray="2 2.4" />
    </Svg>
  );
}

export function ProfileIcon({ size = 20, color = colors.textPrimary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="8.6" r="3.6" stroke={color} strokeWidth={1.6} />
      <Path
        d="M5.4 19.2a6.9 6.9 0 0 1 13.2 0"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function SearchIcon({ size = 18, color = colors.textMuted }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="11" cy="11" r="7" stroke={color} strokeWidth={1.8} />
      <Line
        x1="16.5"
        y1="16.5"
        x2="21"
        y2="21"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function CameraIcon({ size = 46, color = colors.textMuted }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 8a2 2 0 0 1 2-2h1.3l.9-1.5A1 1 0 0 1 9 4h6a1 1 0 0 1 .8.5l.9 1.5H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8z"
        stroke={color}
        strokeWidth={1.5}
      />
      <Circle cx="12" cy="12.5" r="3.4" stroke={color} strokeWidth={1.5} />
    </Svg>
  );
}

export function PinIcon({ size = 22, color = colors.sage500 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10z" stroke={color} strokeWidth={1.6} />
      <Circle cx="12" cy="11" r="2.2" stroke={color} strokeWidth={1.6} />
    </Svg>
  );
}
