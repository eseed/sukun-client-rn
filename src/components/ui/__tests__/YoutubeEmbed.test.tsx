import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { WebView } from 'react-native-webview';
import { YoutubeEmbed } from '../YoutubeEmbed';

const ID = 'aqz-KE-bpKQ';

function webViewProps() {
  const call = jest.mocked(WebView).mock.calls.at(-1);
  return call?.[0];
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

  it('mounts the player on the no-cookie host with autoplay once tapped', () => {
    render(<YoutubeEmbed videoId={ID} title="Tulua Festival" />);
    fireEvent.press(screen.getByLabelText('Play Tulua Festival'));

    const props = webViewProps();
    expect(props?.source).toEqual({
      uri: expect.stringContaining(`https://www.youtube-nocookie.com/embed/${ID}?`),
    });
    expect((props?.source as { uri: string }).uri).toContain('autoplay=1');
    // Both platforms need these or the frame stays black: iOS throws the video into the OS
    // fullscreen player, and Android ignores `autoplay`.
    expect(props?.allowsInlineMediaPlayback).toBe(true);
    expect(props?.mediaPlaybackRequiresUserAction).toBe(false);
    expect(props?.javaScriptEnabled).toBe(true);
    expect(props?.domStorageEnabled).toBe(true);
  });

  it('keeps the embed in the frame and sends the player chrome to the OS', () => {
    render(<YoutubeEmbed videoId={ID} />);
    fireEvent.press(screen.getByLabelText('Play the event video'));

    const shouldLoad = webViewProps()?.onShouldStartLoadWithRequest;
    const request = (url: string) => ({ url }) as Parameters<NonNullable<typeof shouldLoad>>[0];

    expect(shouldLoad?.(request(`https://www.youtube-nocookie.com/embed/${ID}?autoplay=1`))).toBe(
      true,
    );
    expect(Linking.openURL).not.toHaveBeenCalled();

    // "Watch on YouTube" must leave the app rather than turn this frame into a browser.
    expect(shouldLoad?.(request(`https://www.youtube.com/watch?v=${ID}`))).toBe(false);
    expect(Linking.openURL).toHaveBeenCalledWith(`https://www.youtube.com/watch?v=${ID}`);
  });

  it('ignores a failure that is not the embed document', () => {
    render(<YoutubeEmbed videoId={ID} title="Tulua Festival" />);
    fireEvent.press(screen.getByLabelText('Play Tulua Festival'));

    act(() => {
      webViewProps()?.onError?.({
        nativeEvent: { url: 'https://i.ytimg.com/vi/x/hqdefault.jpg' },
      } as never);
    });

    expect(screen.queryByText('Watch it on YouTube')).toBeNull();
  });

  it('falls back to a YouTube link when the player fails to load', () => {
    render(<YoutubeEmbed videoId={ID} title="Tulua Festival" />);
    fireEvent.press(screen.getByLabelText('Play Tulua Festival'));

    const embedUrl = (webViewProps()?.source as { uri: string }).uri;
    act(() => {
      webViewProps()?.onError?.({ nativeEvent: { url: embedUrl } } as never);
    });

    const fallback = screen.getByLabelText('Open Tulua Festival on YouTube');
    expect(screen.getByText('Watch it on YouTube')).toBeTruthy();

    fireEvent.press(fallback);
    expect(Linking.openURL).toHaveBeenCalledWith(`https://www.youtube.com/watch?v=${ID}`);
  });
});
