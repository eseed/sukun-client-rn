import type { ColorValue } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
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

/**
 * Bottom-bar home, drawn in the same 1.6-stroke outline language. Leads the attendee back
 * to Event Home while their LIVE event is active.
 */
export function HomeIcon({ size = 20, color = colors.textPrimary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 11.5 12 4l8 7.5"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M6.5 10v9.5h11V10"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * Session-group mark on the calendar timeline (reference pack screen 03): two attendees.
 */
export function PeopleIcon({ size = 30, color = colors.textPrimary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="9" cy="8.5" r="3" stroke={color} strokeWidth={1.6} />
      <Path
        d="M3.5 18a5.5 5.5 0 0 1 11 0"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
      <Circle cx="16.5" cy="9.5" r="2.5" stroke={color} strokeWidth={1.6} />
      <Path
        d="M15.8 13.6a4.5 4.5 0 0 1 4.9 4.1"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/**
 * Session-detail save icons (reference pack screen 04): plus, check, and a heart that fills
 * once the session is in My Schedule.
 */
export function PlusIcon({ size = 22, color = colors.textPrimary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 5v14M5 12h14"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function CheckIcon({ size = 22, color = colors.textPrimary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 12.5l4.5 4.5L19 7.5"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function HeartIcon({ size = 26, color = colors.textPrimary, filled = false }: IconProps & { filled?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? color : 'none'}>
      <Path
        d="M12 20s-7-4.3-9-9c-1.2-2.8.5-6 3.5-6 2 0 3.5 1.2 4.5 2.7C12 6.2 13.5 5 15.5 5c3 0 4.7 3.2 3.5 6-2 4.7-7 9-7 9z"
        stroke={color}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function DiscoverIcon({ size = 20, color = colors.textPrimary }: IconProps) {  return (
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

/**
 * The back control's glyph. A solid triangle rather than a hairline arrow: at the size a
 * thumb expects, the old `\u2190` text glyph read as decoration instead of a button.
 */
export function BackIcon({ size = 22, color = colors.textPrimary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M15.5 4.2 6.9 11a1.3 1.3 0 0 0 0 2l8.6 6.8c.8.7 2.1.1 2.1-.9V5.1c0-1-1.3-1.6-2.1-.9z"
        fill={color}
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
      <Path
        d="M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10z"
        stroke={color}
        strokeWidth={1.6}
      />
      <Circle cx="12" cy="11" r="2.2" stroke={color} strokeWidth={1.6} />
    </Svg>
  );
}

/**
 * Arrow leaving a bracket: the conventional "this opens somewhere else" mark. Used on the
 * venue card, which hands off to Google Maps rather than navigating inside the app.
 */
export function ExternalLinkIcon({ size = 16, color = colors.sage500 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M14 4h6v6"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Line x1="20" y1="4" x2="11" y2="13" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Path
        d="M18 14.5V19a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 19V8a1.5 1.5 0 0 1 1.5-1.5H10"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * Notification bell, drawn in the same 1.6-stroke outline language. Used by the LIVE Event
 * home app bar and hero (reference pack screen 01).
 */
export function BellIcon({ size = 22, color = colors.textPrimary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6.2 9.6a5.8 5.8 0 0 1 11.6 0c0 3.8 1.4 5.2 1.4 5.2H4.8s1.4-1.4 1.4-5.2"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M10.1 18.4a2.1 2.1 0 0 0 3.8 0"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/**
 * Entry-pass glyph for the LIVE home CTA (reference pack screen 01): three finder squares
 * with the alignment dots, in the same stroke language as the other icons.
 */
export function QrIcon({ size = 20, color = colors.textPrimary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Path d="M14 14h2.6v2.6H14zM18 18h2v2h-2zM14 18.4h1.2v1.2H14z" fill={color} />
    </Svg>
  );
}

/**
 * Schedule cells on the LIVE home grid (reference pack screen 02): wall calendar with a
 * day dot, in the same stroke language.
 */
export function CalendarIcon({ size = 30, color = colors.textPrimary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="4" y="5.5" width="16" height="15" rx="2.5" stroke={color} strokeWidth={1.6} />
      <Path d="M4 10h16" stroke={color} strokeWidth={1.6} />
      <Path
        d="M8.5 3.5v4M15.5 3.5v4"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
      <Circle cx="12" cy="14.8" r="1.3" fill={color} />
    </Svg>
  );
}

/**
 * Event Info cell (reference pack screen 02): circled lowercase i.
 */
export function InfoIcon({ size = 30, color = colors.textPrimary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="8.5" stroke={color} strokeWidth={1.6} />
      <Path
        d="M12 11v5"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      <Circle cx="12" cy="7.8" r="1.2" fill={color} />
    </Svg>
  );
}

/**
 * Support row (reference pack screen 02): speech bubble asking the question.
 */
export function HelpIcon({ size = 30, color = colors.textPrimary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3.5c-4.7 0-8 3-8 6.8 0 2.2 1.1 4.1 2.9 5.3l-1 3.4 3.9-1.7c.7.2 1.4.2 2.2.2 4.7 0 8-3 8-6.8S16.7 3.5 12 3.5z"
        stroke={color}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      <Path
        d="M10.3 9.6c.1-1 .9-1.7 1.8-1.7 1 0 1.8.7 1.8 1.7 0 1.3-1.9 1.4-1.9 2.7"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
      <Circle cx="12" cy="14.6" r="1" fill={color} />
    </Svg>
  );
}

/**
 * My Extras cell (reference pack screen 02): folded tee for accommodation and merch extras.
 */
export function ShirtIcon({ size = 30, color = colors.textPrimary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 4 4.5 6.5 3 10.5l3 1.5 1-2v9h10v-9l1 2 3-1.5-1.5-4L15 4a3 3 0 0 1-6 0z"
        stroke={color}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
    </Svg>
  );
}
