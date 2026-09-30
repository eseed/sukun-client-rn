import { Image, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { openStoreListing } from '../lib/force-update';
import { designAsset } from '../theme/assets';
import { colors, fontFamily, fontSize, lineHeightRatio } from '../theme/tokens';
import { Button, Text } from './ui';

/**
 * Shown instead of the whole app when an admin has switched on force update for this platform
 * and this build is below the minimum version (`src/lib/force-update.ts`). There is no way past
 * it but the store: no close, no "later", and the layout returns it ahead of the navigator, so
 * no route is reachable behind it.
 *
 * It renders outside the router and above the consent gate (`app/_layout.tsx`), so it takes
 * nothing from either: it only needs the store to open.
 */
export function ForceUpdateScreen() {
  const insets = useSafeAreaInsets();
  const logo = designAsset('logoBlack');

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom + 40 }]}>
      <View style={styles.body}>
        <Image
          source={logo}
          style={styles.logo}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
        <Text style={styles.message} accessibilityRole="header">
          We cooked something tasty on the new app release.
        </Text>
      </View>
      <Button
        label="Update now"
        variant="accent"
        accessibilityHint="Opens the store so you can update Sukun"
        onPress={() => {
          void openStoreListing();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bgPage,
    paddingHorizontal: 32,
    justifyContent: 'space-between',
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  logo: {
    width: 207,
    height: 69,
  },
  message: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: fontSize.displayMd,
    lineHeight: fontSize.displayMd * lineHeightRatio.snug,
    letterSpacing: -0.28,
    color: colors.textPrimary,
    textAlign: 'center',
  },
});
