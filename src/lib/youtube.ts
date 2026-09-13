/**
 * YouTube link handling for the event description.
 *
 * An admin pastes YouTube links in whatever shape the site handed them: a `watch?v=` URL, a
 * `youtu.be` short link, a Shorts or Live permalink, or a whole `<iframe>` copied out of the
 * share sheet. Only the eleven-character video id is portable between those, so everything
 * here reduces a link to that id and builds the embed and thumbnail URLs from it. Nothing
 * downstream ever passes an admin-supplied URL to the player.
 */

/** YouTube ids are exactly 11 characters from the URL-safe base64 alphabet. */
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

const HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
  'youtu.be',
  'www.youtu.be',
]);

/** Paths that carry the id as their last segment, e.g. `/embed/<id>` or `/shorts/<id>`. */
const PATH_PREFIXES = ['embed', 'shorts', 'live', 'v', 'e'];

/**
 * The video id in a YouTube link, or `null` for anything that is not one. Bare ids are accepted
 * too, since the admin field has historically allowed pasting just the id.
 */
export function youtubeVideoId(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  if (VIDEO_ID.test(raw)) return raw;

  // A protocol-relative or scheme-less paste is still a link an admin meant to embed.
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw)
    ? raw
    : `https://${raw.replace(/^\/\//, '')}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (!HOSTS.has(url.hostname.toLowerCase())) return null;

  const fromQuery = url.searchParams.get('v');
  if (fromQuery && VIDEO_ID.test(fromQuery)) return fromQuery;

  const segments = url.pathname.split('/').filter(Boolean);
  const last = segments[segments.length - 1];
  if (!last || !VIDEO_ID.test(last)) return null;

  // `youtu.be/<id>` has no prefix; every youtube.com path that holds an id has one of these.
  // Refusing the rest keeps `/results?search_query=...` and channel URLs out of the player.
  const isShortLink = url.hostname.toLowerCase().endsWith('youtu.be');
  if (isShortLink && segments.length === 1) return last;

  const prefix = segments.length >= 2 ? segments[segments.length - 2]?.toLowerCase() : undefined;
  return prefix && PATH_PREFIXES.includes(prefix) ? last : null;
}

/** Whether a URL points at a YouTube video we can embed. */
export function isYoutubeUrl(value: string | null | undefined): boolean {
  return youtubeVideoId(value) !== null;
}

/**
 * Every YouTube video referenced by a chunk of the description HTML, in the order it appears
 * and without repeats. Covers `<iframe src>`, `<a href>`, and bare URLs pasted into prose.
 */
export function extractYoutubeIds(html: string | null | undefined): string[] {
  if (!html) return [];

  const ids: string[] = [];
  const candidates = html.match(/(?:https?:)?\/\/[^\s"'<>)\]]+/gi) ?? [];
  for (const candidate of candidates) {
    // Trailing punctuation from prose ("watch it here: https://youtu.be/x.") is not part of
    // the URL. `&amp;` in an attribute is, once decoded.
    const cleaned = candidate.replace(/&amp;/gi, '&').replace(/[.,;:!?]+$/, '');
    const id = youtubeVideoId(cleaned);
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/**
 * The description with its YouTube references removed, so a link that is now rendered as a
 * player does not also sit in the copy as a naked URL. Text an admin wrapped around the link
 * ("Watch the trailer:") is left alone; only the reference itself goes.
 */
export function stripYoutubeEmbeds(html: string | null | undefined): string {
  if (!html) return '';

  return (
    html
      // A whole embed block, iframe or the wrapper YouTube's share sheet sometimes includes.
      .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, (match) =>
        extractYoutubeIds(match).length > 0 ? '' : match,
      )
      .replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (match, attributes: string) =>
        extractYoutubeIds(attributes).length > 0 ? '' : match,
      )
      .replace(/(?:https?:)?\/\/[^\s"'<>)\]]+/gi, (match) => {
        const cleaned = match.replace(/&amp;/gi, '&').replace(/[.,;:!?]+$/, '');
        if (!isYoutubeUrl(cleaned)) return match;
        // Keep the punctuation that ended the sentence the URL was sitting in.
        const trailing = cleaned === match ? '' : match.slice(cleaned.length);
        return trailing;
      })
      // Whatever emptied out can leave a paragraph or a dangling label behind.
      .replace(/<p\b[^>]*>\s*<\/p>/gi, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

/**
 * The origin the player document is served from.
 *
 * YouTube checks who is embedding it and refuses to play with error 153 when the answer is
 * nobody. A `WebView` pointed straight at the embed URL is exactly that case: the embed becomes
 * the top-level document, there is no parent frame and no referrer, and the player loads as a
 * perfectly healthy 200 that renders "Video player configuration error". Serving our own
 * document under this base URL and putting the embed in an iframe inside it gives the player
 * the origin it asks for, on both platforms.
 *
 * It has to be a domain we actually have: claiming `https://www.youtube.com` here clears 153
 * and earns error 152 instead, since the player will not accept an embed pretending to be
 * YouTube's own site.
 */
export const PLAYER_ORIGIN = 'https://sukunwellness.co';

/**
 * The privacy-preserving embed URL for a video id. `youtube-nocookie.com` is YouTube's own
 * host for embeds that must not set tracking cookies until playback starts, and `playsinline`
 * is what keeps iOS from throwing the video into the OS fullscreen player on tap.
 */
export function youtubeEmbedUrl(videoId: string, autoplay = false): string {
  const params = new URLSearchParams({
    playsinline: '1',
    rel: '0',
    modestbranding: '1',
    // `origin` is half of the referrer check above; `enablejsapi` is the other half of knowing
    // whether the video played, since a refusal arrives as a rendered page rather than an error.
    enablejsapi: '1',
    origin: PLAYER_ORIGIN,
    ...(autoplay ? { autoplay: '1' } : {}),
  });
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
}

/**
 * The document the player runs in: an iframe filling the frame, plus the IFrame Player API to
 * report back. The API is the only way to hear that a video will not play, because every
 * refusal (private, deleted, embedding disabled, the 153 above) is a page that loads fine and
 * says so in pixels. `ready` and `error` come back over `postMessage`; see `YoutubeEmbed`.
 */
export function youtubePlayerHtml(videoId: string): string {
  if (!VIDEO_ID.test(videoId)) return '';
  const src = youtubeEmbedUrl(videoId, true);

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no" />
    <style>
      html, body { margin: 0; padding: 0; height: 100%; background: #000; overflow: hidden; }
      iframe { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0; }
    </style>
  </head>
  <body>
    <iframe
      id="player"
      src="${src}"
      allow="autoplay; encrypted-media; picture-in-picture"
      allowfullscreen
    ></iframe>
    <script>
      function post(message) {
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify(message));
        } catch (error) {}
      }
      window.onYouTubeIframeAPIReady = function () {
        new YT.Player('player', {
          events: {
            onReady: function (event) {
              post({ type: 'ready' });
              event.target.playVideo();
            },
            onError: function (event) {
              post({ type: 'error', code: event.data });
            }
          }
        });
      };
      var api = document.createElement('script');
      api.src = 'https://www.youtube.com/iframe_api';
      api.onerror = function () {
        post({ type: 'error', code: 'api' });
      };
      document.head.appendChild(api);
    </script>
  </body>
</html>`;
}

/** The watch page, for the "open in YouTube" fallback when the player cannot load. */
export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/**
 * A poster frame for the video. `hqdefault` is the one size YouTube guarantees for every
 * video, including old uploads that never got a maxres thumbnail generated.
 */
export function youtubeThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}
