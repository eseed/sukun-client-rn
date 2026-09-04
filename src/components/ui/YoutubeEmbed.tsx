import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import {
  youtubeEmbedUrl,
  youtubeThumbnailUrl,
  youtubeWatchUrl,
} from '../../lib/youtube';
import { colors, fontFamily, radius, space } from '../../theme/tokens';
import { Text } from './Text';

/**
 * An inline YouTube player.
 *
 * The video starts as its poster frame and only becomes a `WebView` once tapped. A description
 * can carry several videos, and mounting a browser per video on screen entry costs a lot of
 * memory on Android in particular, where every `WebView` is a full Chromium view. The tap is
 * also the user gesture both platforms demand before a video may start with sound, which is
 * why `autoplay` on the embed URL actually works here.
 *
 * The embed is loaded as the top-level document rather than inside an HTML string: YouTube
 * refuses playback (error 153) for an iframe whose origin is `about:blank`, which is what an
 * injected-HTML `WebView` gives it on Android.
 */
export function YoutubeEmbed({ videoId, title }: { videoId: string; title?: string | null }) {
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const label = title?.trim() ? title.trim() : 'the event video';
  const embedUrl = youtubeEmbedUrl(videoId, true);

  /**
   * Only the embed document failing counts as the video failing. Both platforms report errors
   * for loads we deliberately refused above, and Android reports them for subresources the
   * player pulls in, so keying on the URL keeps a working video from being replaced by the
   * fallback over a failed thumbnail or an aborted outbound tap.
   */
  function onLoadFailed(event: { nativeEvent: { url?: string } }) {
    if (event.nativeEvent?.url === embedUrl) setFailed(true);
  }

  /**
   * The player's own chrome links out: the video title, the channel avatar, "Watch on YouTube",
   * "Share". None of those should turn this frame into a browser, so the embed itself is the
   * only document allowed to load here and everything else is handed to the OS.
   */
  function onShouldStartLoadWithRequest(request: WebViewNavigation): boolean {
    if (request.url.startsWith('https://www.youtube-nocookie.com/embed/')) return true;
    if (request.url === 'about:blank') return true;
    if (/^https?:/i.test(request.url)) {
      void Linking.openURL(request.url).catch(() => undefined);
    }
    return false;
  }

  if (failed) {
    return (
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Open ${label} on YouTube`}
        accessibilityHint="Opens YouTube outside the app"
        onPress={() => {
          void Linking.openURL(youtubeWatchUrl(videoId)).catch(() => undefined);
        }}
        style={({ pressed }) => [styles.frame, styles.fallback, pressed && styles.pressed]}
      >
        <Text variant="bodyMuted" style={styles.fallbackText}>
          This video could not play here.
        </Text>
        <Text style={styles.fallbackLink}>Watch it on YouTube</Text>
      </Pressable>
    );
  }

  if (!playing) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Play ${label}`}
        onPress={() => setPlaying(true)}
        style={({ pressed }) => [styles.frame, pressed && styles.pressed]}
      >
        <Image
          source={{ uri: youtubeThumbnailUrl(videoId) }}
          resizeMode="cover"
          style={StyleSheet.absoluteFill}
          accessibilityIgnoresInvertColors
        />
        <View style={styles.posterScrim} pointerEvents="none" />
        <View style={styles.playButton} pointerEvents="none">
          <View style={styles.playTriangle} />
        </View>
      </Pressable>
    );
  }

  return (
    <View style={styles.frame}>
      <WebView
        source={{ uri: embedUrl }}
        style={styles.web}
        // Both are painted black: an unstyled WebView is white until first paint, which flashes
        // against the poster the tap just replaced.
        containerStyle={styles.webContainer}
        javaScriptEnabled
        domStorageEnabled
        // Without this the tap that mounted this view does not carry over and `autoplay=1` is
        // ignored, leaving a black frame the user has to tap a second time.
        mediaPlaybackRequiresUserAction={false}
        // iOS: keeps the video in this frame instead of the OS fullscreen player.
        allowsInlineMediaPlayback
        allowsFullscreenVideo
        // Android: video needs a hardware-backed layer to composite, and the player's popups
        // must not open a second window that ends up blank.
        androidLayerType="hardware"
        setSupportMultipleWindows={false}
        // The frame sits inside the event `ScrollView`; its own scrolling would fight that.
        scrollEnabled={false}
        nestedScrollEnabled
        bounces={false}
        onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
        onError={onLoadFailed}
        onHttpError={onLoadFailed}
        renderLoading={() => (
          <View style={[StyleSheet.absoluteFill, styles.loading]}>
            <ActivityIndicator color={colors.creme} />
          </View>
        )}
        startInLoadingState
        allowsAirPlayForMediaPlayback
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.black,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.85,
  },
  web: {
    flex: 1,
    backgroundColor: colors.black,
  },
  webContainer: {
    flex: 1,
    backgroundColor: colors.black,
  },
  loading: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.black,
  },
  posterScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(29,29,29,0.2)',
  },
  playButton: {
    width: 62,
    height: 62,
    borderRadius: radius.circle,
    backgroundColor: 'rgba(247,240,224,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playTriangle: {
    width: 0,
    height: 0,
    marginLeft: 5,
    borderTopWidth: 12,
    borderBottomWidth: 12,
    borderLeftWidth: 20,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: colors.black,
    borderRightWidth: 0,
  },
  fallback: {
    gap: space.s2,
    paddingHorizontal: space.s5,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderDefault,
  },
  fallbackText: {
    textAlign: 'center',
  },
  fallbackLink: {
    fontSize: 13,
    fontFamily: fontFamily.bodyMedium,
    color: colors.accentSky,
    textDecorationLine: 'underline',
  },
});
