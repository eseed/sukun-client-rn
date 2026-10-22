import { createContext, useContext, type RefObject } from 'react';
import type { Animated, ScrollView } from 'react-native';

/**
 * A `scroll` Screen's vertical position, for content that pins itself while the page scrolls
 * past it (the schedule calendar's stage names). Only a Screen with `trackScroll` provides it;
 * elsewhere it is null and nothing pins.
 */
export interface PageScroll {
  /** The page's vertical offset, driven natively. */
  scrollY: Animated.Value;
  /** The page's scroll view, to measure where the pinned content sits inside it. */
  scrollRef: RefObject<ScrollView | null>;
  /** How far down the screen the page's content starts: the status bar's height. */
  topInset: number;
}

export const PageScrollContext = createContext<PageScroll | null>(null);

export function usePageScroll(): PageScroll | null {
  return useContext(PageScrollContext);
}
