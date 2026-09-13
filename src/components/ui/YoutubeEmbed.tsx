import { useEffect, useRef, useState } from 'react';
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
  PLAYER_ORIGIN,
  youtubePlayerHtml,
  youtubeThumbnailUrl,
  youtubeWatchUrl,
} from '../../lib/youtube';
import { colors, fontFamily, radius, space } from '../../theme/tokens';
import { Text } from './Text';

/** How long the player gets to say it is ready before the frame gives up and offers the link. */
const READY_TIMEOUT_MS = 20000;

/**
 * An inline YouTube player.
 *
 * The video starts as its poster frame and only becomes a `WebView` once tapped. A description
 * can carry several videos, and mounting a browser per video on screen entry costs a lot of
 * memory on Android in particular, where every `WebView` is a full Chromium view. The tap is
 * also the user gesture both platforms demand before a video may start with sound, which is
 * why `autoplay` on the embed URL actually works here.
 *
 * The embed runs inside our own one-iframe document, served under `PLAYER_ORIGIN`, because
 * YouTube refuses to play (error 153) for an embed with no parent origin. See `youtube.ts`.
 *
 * Nothing here can tell from the outside whether the video played: an unplayable video is a
 * 200 that renders an error in pixels, which is how this frame used to end up a permanent
 * black rectangle. The player reports `ready` and `error` over `postMessage`, and a player
 * that says neither in `READY_TIMEOUT_MS` counts as failed, so every dead end becomes the
 * "watch on YouTube" link rather than a black box.
 */
export function YoutubeEmbed({ videoId, title }: { videoId: string; title?: string | null }) {
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const label = title?.trim() ? title.trim() : 'the event video';
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!playing || ready || failed) return;
    timeout.current = setTimeout(() => setFailed(true), READY_TIMEOUT_MS);
    return () => {
      if (timeout.current) clearTimeout(timeout.current);
    };
  }, [playing, ready, failed]);

  /**
   * The document failing to load at all. A player that loads and then refuses reports itself
   * through `onPlayerMessage` instead, and subresources that fail are the player's business.
   */
  function onLoadFailed(event: { nativeEvent: { url?: string } }) {
    const url = event.nativeEvent?.url;
    if (!url || url === PLAYER_ORIGIN || url === `${PLAYER_ORIGIN}/`) setFailed(true);
  }

  function onPlayerMessage(data: string) {
    let message: { type?: string };
    try {
      message = JSON.parse(data) as { type?: string };
    } catch {
      return;
    }
    if (message.type === 'ready') setReady(true);
    if (message.type === 'error') setFailed(true);
  }

  /**
   * The player's own chrome links out: the video title, the channel avatar, "Watch on YouTube",
   * "Share". None of those should turn this frame into a browser, so our document and the embed
   * it hosts are the only things allowed to load here and a real tap is handed to the OS. A
   * navigation the player starts in one of its own subframes is refused quietly instead, since
   * nobody asked for it and it must not throw the reader into Safari.
   */
  function onShouldStartLoadWithRequest(request: WebViewNavigation): boolean {
    // iOS reports which frame asked; Android does not send the field at all, where every
    // navigation that reaches here is the top one.
    const { isTopFrame } = request as WebViewNavigation & { isTopFrame?: boolean };
    if (request.url.startsWith('https://www.youtube-nocookie.com/embed/')) return true;
    if (request.url === 'about:blank') return true;
    if (request.url === PLAYER_ORIGIN || request.url === `${PLAYER_ORIGIN}/`) return true;
    if (isTopFrame !== false && /^https?:/i.test(request.url)) {
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
    <View testID="youtube-player" style={[styles.frame, styles.playerFrame]}>
      <WebView
        // `baseUrl` is the whole point: it is the origin YouTube checks for.
        source={{ html: youtubePlayerHtml(videoId), baseUrl: PLAYER_ORIGIN }}
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
        onMessage={(event) => onPlayerMessage(event.nativeEvent.data)}
        onError={onLoadFailed}
        onHttpError={onLoadFailed}
        allowsAirPlayForMediaPlayback
        accessibilityLabel={label}
      />
      {ready ? null : (
        <View style={[StyleSheet.absoluteFill, styles.loading]} pointerEvents="none">
          <ActivityIndicator color={colors.creme} />
        </View>
      )}
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
  // `frame` centres its child, which is what the poster's play button wants and the opposite of
  // what the player wants: a `WebView` has no width of its own, so a centred one is laid out
  // zero-wide and the video plays in a frame nobody can see. That was the black rectangle.
  playerFrame: {
    alignItems: 'stretch',
    justifyContent: 'flex-start',
  },
  pressed: {
    opacity: 0.85,
  },
  web: {
    flex: 1,
    width: '100%',
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
