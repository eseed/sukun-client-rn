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
 * The privacy-preserving embed URL for a video id. `youtube-nocookie.com` is YouTube's own
 * host for embeds that must not set tracking cookies until playback starts, and `playsinline`
 * is what keeps iOS from throwing the video into the OS fullscreen player on tap.
 */
export function youtubeEmbedUrl(videoId: string, autoplay = false): string {
  const params = new URLSearchParams({
    playsinline: '1',
    rel: '0',
    modestbranding: '1',
    ...(autoplay ? { autoplay: '1' } : {}),
  });
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
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
