import type { ImageSourcePropType } from 'react-native';

/**
 * Every design image the app uses, in one place.
 *
 * The source files live in the Claude Design project and are **not bundled yet** — see
 * `assets/design/README.md` for the one-step drop-in. Until then each entry is `null` and
 * the components fall back to `ImageSlot`'s token-coloured wash, so every layout, aspect
 * ratio and overlay is already correct.
 *
 * To enable an image: drop the file into `assets/design/` under the filename in the comment
 * and replace `null` with the `require(...)` on the line below it.
 */
export const designAssets: Record<DesignAssetKey, ImageSourcePropType | null> = {
  // deco-welcome-dancers.png — full-bleed welcome background
  welcomeDancers: null, // require('../../assets/design/deco-welcome-dancers.png')

  // sukun-logo-black.png — wordmark on the welcome screen (276px wide)
  logoBlack: null, // require('../../assets/design/sukun-logo-black.png')

  // sukun-logo-white.png
  logoWhite: null, // require('../../assets/design/sukun-logo-white.png')

  // deco-swirl.png — cropped decorative swirl on the phone screen
  decoSwirl: null, // require('../../assets/design/deco-swirl.png')

  // deco-flower.png — cropped corner flower on the profile/checkout screens
  decoFlower: null, // require('../../assets/design/deco-flower.png')

  // deco-youre-in.png — full-bleed confirmation background
  decoYoureIn: null, // require('../../assets/design/deco-youre-in.png')

  // bg-profile-dots.png — full-bleed profile tab background
  bgProfileDots: null, // require('../../assets/design/bg-profile-dots.png')

  // card-sukun-orange.png — the card artwork on the payment screen
  cardSukunOrange: null, // require('../../assets/design/card-sukun-orange.png')

  // slot-feat-tulua.webp — featured card image on Discover
  featuredTulua: null, // require('../../assets/design/slot-feat-tulua.webp')

  // slot-event-hero.webp — event detail hero + ticket card image
  eventHero: null, // require('../../assets/design/slot-event-hero.webp')

  // slot-ev-slot-1.webp — list thumbnail
  eventThumb1: null, // require('../../assets/design/slot-ev-slot-1.webp')

  // slot-ev-slot-2.webp
  eventThumb2: null, // require('../../assets/design/slot-ev-slot-2.webp')

  // slot-ev-slot-3.webp
  eventThumb3: null, // require('../../assets/design/slot-ev-slot-3.webp')

  // slot-profile-avatar.webp — profile tab avatar
  profileAvatar: null, // require('../../assets/design/slot-profile-avatar.webp')
};

export type DesignAssetKey =
  | 'welcomeDancers'
  | 'logoBlack'
  | 'logoWhite'
  | 'decoSwirl'
  | 'decoFlower'
  | 'decoYoureIn'
  | 'bgProfileDots'
  | 'cardSukunOrange'
  | 'featuredTulua'
  | 'eventHero'
  | 'eventThumb1'
  | 'eventThumb2'
  | 'eventThumb3'
  | 'profileAvatar';

export function designAsset(key: DesignAssetKey): ImageSourcePropType | null {
  return designAssets[key];
}
