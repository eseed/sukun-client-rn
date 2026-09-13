import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Linking, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { PLAYER_ORIGIN } from '../../../lib/youtube';
import { YoutubeEmbed } from '../YoutubeEmbed';

const ID = 'aqz-KE-bpKQ';

function webViewProps() {
  const call = jest.mocked(WebView).mock.calls.at(-1);
  return call?.[0];
}

function playerHtml() {
  return (webViewProps()?.source as { html: string }).html;
}

function send(message: unknown) {
  act(() => {
    webViewProps()?.onMessage?.({
      nativeEvent: { data: JSON.stringify(message) },
    } as never);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
});

describe('YoutubeEmbed', () => {
  it('shows a poster frame and no browser until the video is tapped', () => {
    render(<YoutubeEmbed videoId={ID} title="Tulua Festival" />);

    expect(screen.getByLabelText('Play Tulua Festival')).toBeTruthy();
    expect(WebView).not.toHaveBeenCalled();
  });

  it('hosts the embed in a document of our own, under an origin YouTube will accept', () => {
    render(<YoutubeEmbed videoId={ID} title="Tulua Festival" />);
    fireEvent.press(screen.getByLabelText('Play Tulua Festival'));

    // Without a `baseUrl` the embed has no parent origin and YouTube refuses it with error 153.
    expect(webViewProps()?.source).toEqual({
      html: expect.stringContaining(`https://www.youtube-nocookie.com/embed/${ID}?`),
      baseUrl: PLAYER_ORIGIN,
    });
    expect(playerHtml()).toContain('autoplay=1');
    expect(playerHtml()).toContain(`origin=${encodeURIComponent(PLAYER_ORIGIN)}`);
    // Both platforms need these or the frame stays black: iOS throws the video into the OS
    // fullscreen player, and Android ignores `autoplay`.
    expect(webViewProps()?.allowsInlineMediaPlayback).toBe(true);
    expect(webViewProps()?.mediaPlaybackRequiresUserAction).toBe(false);
    expect(webViewProps()?.javaScriptEnabled).toBe(true);
    expect(webViewProps()?.domStorageEnabled).toBe(true);
  });

  it('lets the player fill the frame rather than centring it to nothing', () => {
    render(<YoutubeEmbed videoId={ID} title="Tulua Festival" />);
    fireEvent.press(screen.getByLabelText('Play Tulua Festival'));

    // A centred `WebView` has no width of its own, so the video played in a zero-wide frame and
    // the reader saw a black rectangle. The player frame must stretch its child.
    const frame = StyleSheet.flatten(screen.getByTestId('youtube-player').props.style);
    expect(frame.alignItems).toBe('stretch');
  });

  it('keeps the embed in the frame and sends the player chrome to the OS', () => {
    render(<YoutubeEmbed videoId={ID} />);
    fireEvent.press(screen.getByLabelText('Play the event video'));

    const shouldLoad = webViewProps()?.onShouldStartLoadWithRequest;
    const request = (url: string, isTopFrame = true) =>
      ({ url, isTopFrame }) as Parameters<NonNullable<typeof shouldLoad>>[0];

    expect(shouldLoad?.(request(PLAYER_ORIGIN))).toBe(true);
    expect(shouldLoad?.(request(`https://www.youtube-nocookie.com/embed/${ID}?autoplay=1`))).toBe(
      true,
    );
    expect(Linking.openURL).not.toHaveBeenCalled();

    // "Watch on YouTube" must leave the app rather than turn this frame into a browser.
    expect(shouldLoad?.(request(`https://www.youtube.com/watch?v=${ID}`))).toBe(false);
    expect(Linking.openURL).toHaveBeenCalledWith(`https://www.youtube.com/watch?v=${ID}`);

    // Nobody asked for a navigation the player starts in one of its own frames, so it is
    // refused rather than thrown at Safari.
    jest.mocked(Linking.openURL).mockClear();
    expect(shouldLoad?.(request('https://doubleclick.net/pixel', false))).toBe(false);
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it('stays put while the player is working', () => {
    render(<YoutubeEmbed videoId={ID} title="Tulua Festival" />);
    fireEvent.press(screen.getByLabelText('Play Tulua Festival'));

    send({ type: 'ready' });

    expect(screen.queryByText('This video could not play here.')).toBeNull();
  });

  it('ignores a failure that is not the player document', () => {
    render(<YoutubeEmbed videoId={ID} title="Tulua Festival" />);
    fireEvent.press(screen.getByLabelText('Play Tulua Festival'));

    act(() => {
      webViewProps()?.onError?.({
        nativeEvent: { url: 'https://i.ytimg.com/vi/x/hqdefault.jpg' },
      } as never);
    });

    expect(screen.queryByText('Watch it on YouTube')).toBeNull();
  });

  it('falls back to a YouTube link when the player refuses to play', () => {
    render(<YoutubeEmbed videoId={ID} title="Tulua Festival" />);
    fireEvent.press(screen.getByLabelText('Play Tulua Festival'));

    // A refusal is a page that loads perfectly well and says "error 153" in pixels, so the
    // player's own report is the only signal there is.
    send({ type: 'error', code: 153 });

    const fallback = screen.getByLabelText('Open Tulua Festival on YouTube');
    expect(screen.getByText('Watch it on YouTube')).toBeTruthy();

    fireEvent.press(fallback);
    expect(Linking.openURL).toHaveBeenCalledWith(`https://www.youtube.com/watch?v=${ID}`);
  });

  it('falls back when the player document itself fails to load', () => {
    render(<YoutubeEmbed videoId={ID} title="Tulua Festival" />);
    fireEvent.press(screen.getByLabelText('Play Tulua Festival'));

    act(() => {
      webViewProps()?.onError?.({ nativeEvent: { url: PLAYER_ORIGIN } } as never);
    });

    expect(screen.getByText('Watch it on YouTube')).toBeTruthy();
  });

  it('falls back when the player never reports anything at all', () => {
    jest.useFakeTimers();
    try {
      render(<YoutubeEmbed videoId={ID} title="Tulua Festival" />);
      fireEvent.press(screen.getByLabelText('Play Tulua Festival'));

      expect(screen.queryByText('Watch it on YouTube')).toBeNull();
      act(() => {
        jest.advanceTimersByTime(20000);
      });

      // Silence used to mean a black rectangle with no way out of it.
      expect(screen.getByText('Watch it on YouTube')).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });
});
