import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { colors, fontFamily } from '../../theme/tokens';
import { initials } from '../../lib/format';
import { Text } from './Text';

/**
 * Monogram or photo avatar. The design uses a gold-100 monogram chip in the Discover header
 * and a photo circle on the Profile tab; contact rows use rose-500 / sky-500 monograms.
 *
 * Selfie URLs are signed and short-lived (the backend gives them five minutes), so a `uri`
 * held in the auth store goes stale between renders. A failed load falls back to the monogram
 * rather than leaving an empty circle.
 */
export function Avatar({
  name,
  uri,
  size = 38,
  background = colors.gold100,
  foreground = colors.textPrimary,
}: {
  name: string;
  uri?: string | null;
  size?: number;
  background?: string;
  foreground?: string;
}) {
  // Remembering *which* URL failed, rather than a bare boolean, means a re-signed selfie is
  // retried on its own — no effect needed to clear the flag when `uri` changes.
  const [failedUri, setFailedUri] = useState<string | null>(null);

  if (uri && uri !== failedUri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        onError={() => setFailedUri(uri)}
        accessibilityIgnoresInvertColors
      />
    );
  }

  return (
    <View
      style={[
        styles.monogram,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: background },
      ]}
    >
      <Text style={[styles.label, { color: foreground, fontSize: size * 0.34 }]}>
        {initials(name)}
      </Text>
    </View>
  );
}

/** Deterministic accent for a contact avatar, so the same person keeps the same colour. */
export function avatarColor(seed: string): string {
  const palette = [colors.rose500, colors.sky500, colors.sage500, colors.gold700];
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length] ?? colors.sky500;
}

const styles = StyleSheet.create({
  monogram: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  label: {
    fontFamily: fontFamily.bodyMedium,
  },
});
