import { Image, StyleSheet, View } from 'react-native';
import { designAsset } from '../../theme/assets';

/**
 * The cropped corner flower that sits behind the heading on screens 04, 08 and 10 — a 60×60
 * window onto a much larger PNG, positioned exactly as the design crops it.
 */
export function FlowerCorner({ top = 52 }: { top?: number }) {
  const flower = designAsset('decoFlower');
  if (!flower) return null;

  return (
    <View style={[styles.crop, { top }]} pointerEvents="none">
      <Image source={flower} style={styles.image} />
    </View>
  );
}

const styles = StyleSheet.create({
  crop: {
    position: 'absolute',
    right: -6,
    width: 60,
    height: 60,
    overflow: 'hidden',
  },
  image: {
    position: 'absolute',
    width: 209,
    height: 455,
    left: -141,
    top: -9,
  },
});
