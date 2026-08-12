import type { ImageSourcePropType } from 'react-native';

/** Every design image the app uses, in one place — see `assets/design/README.md`. */
export const designAssets: Record<DesignAssetKey, ImageSourcePropType> = {
  // deco-welcome-dancers.png — full-bleed welcome background
  welcomeDancers: require('../../assets/design/deco-welcome-dancers.png'),

  // sukun-logo-black.png — wordmark on the welcome screen (276px wide)
  logoBlack: require('../../assets/design/sukun-logo-black.png'),

  // sukun-logo-white.png
  logoWhite: require('../../assets/design/sukun-logo-white.png'),

  // deco-swirl.png — cropped decorative swirl on the phone screen
  decoSwirl: require('../../assets/design/deco-swirl.png'),

  // deco-flower.png — cropped corner flower on the profile/checkout screens
  decoFlower: require('../../assets/design/deco-flower.png'),

  // deco-youre-in.png — full-bleed confirmation background
  decoYoureIn: require('../../assets/design/deco-youre-in.png'),

  // bg-profile-dots.png — full-bleed profile tab background
  bgProfileDots: require('../../assets/design/bg-profile-dots.png'),

  // card-sukun-orange.png — the card artwork on the payment screen
  cardSukunOrange: require('../../assets/design/card-sukun-orange.png'),

  // slot-feat-tulua.webp — featured card image on Discover
  featuredTulua: require('../../assets/design/slot-feat-tulua.webp'),

  // slot-event-hero.webp — event detail hero + ticket card image
  eventHero: require('../../assets/design/slot-event-hero.webp'),

  // slot-ev-slot-1.webp — list thumbnail
  eventThumb1: require('../../assets/design/slot-ev-slot-1.webp'),

  // slot-ev-slot-2.webp
  eventThumb2: require('../../assets/design/slot-ev-slot-2.webp'),

  // slot-ev-slot-3.webp
  eventThumb3: require('../../assets/design/slot-ev-slot-3.webp'),

  // slot-profile-avatar.webp — profile tab avatar
  profileAvatar: require('../../assets/design/slot-profile-avatar.webp'),
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

export function designAsset(key: DesignAssetKey): ImageSourcePropType {
  return designAssets[key];
}
