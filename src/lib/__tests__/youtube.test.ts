import {
  extractYoutubeIds,
  isYoutubeUrl,
  stripYoutubeEmbeds,
  youtubeEmbedUrl,
  youtubeThumbnailUrl,
  youtubeVideoId,
  youtubeWatchUrl,
} from '../youtube';

const ID = 'aqz-KE-bpKQ';

describe('youtubeVideoId', () => {
  it.each([
    `https://www.youtube.com/watch?v=${ID}`,
    `http://youtube.com/watch?v=${ID}`,
    `https://m.youtube.com/watch?v=${ID}&t=42s`,
    `https://music.youtube.com/watch?v=${ID}`,
    `https://youtu.be/${ID}`,
    `https://youtu.be/${ID}?t=90`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube-nocookie.com/embed/${ID}`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/live/${ID}`,
    `https://www.youtube.com/v/${ID}`,
    // Admins paste these too: no scheme, or protocol-relative out of an iframe attribute.
    `youtube.com/watch?v=${ID}`,
    `//www.youtube.com/embed/${ID}`,
    `  https://youtu.be/${ID}  `,
    ID,
  ])('reads the id out of %s', (link) => {
    expect(youtubeVideoId(link)).toBe(ID);
  });

  it.each([
    null,
    undefined,
    '',
    '   ',
    'https://vimeo.com/76979871',
    'https://www.youtube.com/results?search_query=sukun',
    'https://www.youtube.com/@sukunwellness',
    'https://www.youtube.com/playlist?list=PL1234567890',
    // A lookalike host must not be treated as YouTube.
    `https://youtube.com.evil.example/watch?v=${ID}`,
    // Only http(s) may reach the player.
    `javascript:alert(1)//youtu.be/${ID}`,
    'https://youtu.be/tooshort',
  ])('refuses %s', (link) => {
    expect(youtubeVideoId(link)).toBeNull();
    expect(isYoutubeUrl(link)).toBe(false);
  });
});

describe('extractYoutubeIds', () => {
  it('finds an iframe embed', () => {
    const html = `<p>Trailer</p><iframe src="https://www.youtube.com/embed/${ID}" allowfullscreen></iframe>`;
    expect(extractYoutubeIds(html)).toEqual([ID]);
  });

  it('finds a link and a bare URL, and decodes entities in attributes', () => {
    const html = `<a href="https://www.youtube.com/watch?v=${ID}&amp;t=10">Watch</a>
      <p>Or here: https://youtu.be/LXb3EKWsInQ.</p>`;
    expect(extractYoutubeIds(html)).toEqual([ID, 'LXb3EKWsInQ']);
  });

  it('keeps the first appearance of a video referenced twice', () => {
    const html = `<iframe src="https://www.youtube.com/embed/${ID}"></iframe> https://youtu.be/${ID}`;
    expect(extractYoutubeIds(html)).toEqual([ID]);
  });

  it('is empty for a description with no video', () => {
    expect(extractYoutubeIds('<p>Bring a mat and a bottle.</p>')).toEqual([]);
    expect(extractYoutubeIds('')).toEqual([]);
    expect(extractYoutubeIds(null)).toEqual([]);
  });
});

describe('stripYoutubeEmbeds', () => {
  it('removes an iframe and leaves the copy', () => {
    const html = `<p>Two days in the desert.</p><iframe src="https://www.youtube.com/embed/${ID}"></iframe>`;
    expect(stripYoutubeEmbeds(html)).toBe('<p>Two days in the desert.</p>');
  });

  it('removes a YouTube anchor but keeps other links', () => {
    const html = `<a href="https://youtu.be/${ID}">Trailer</a><a href="https://sukun.co">Site</a>`;
    expect(stripYoutubeEmbeds(html)).toBe('<a href="https://sukun.co">Site</a>');
  });

  it('removes a bare URL and keeps the sentence it ended', () => {
    expect(stripYoutubeEmbeds(`Here is last season: https://youtu.be/${ID}.`)).toBe(
      'Here is last season: .',
    );
  });

  it('leaves a description with no video untouched', () => {
    const html = '<p>An hour of gongs and stillness.</p>';
    expect(stripYoutubeEmbeds(html)).toBe(html);
  });

  it('does not leave an empty paragraph where an embed was', () => {
    const html = `<p>Watch:</p><p><iframe src="https://www.youtube.com/embed/${ID}"></iframe></p>`;
    expect(stripYoutubeEmbeds(html)).toBe('<p>Watch:</p>');
  });
});

describe('url builders', () => {
  it('embeds through the no-cookie host and plays inline', () => {
    const url = youtubeEmbedUrl(ID);
    expect(url.startsWith(`https://www.youtube-nocookie.com/embed/${ID}?`)).toBe(true);
    expect(url).toContain('playsinline=1');
    expect(url).not.toContain('autoplay');
  });

  it('asks for autoplay only when told to', () => {
    expect(youtubeEmbedUrl(ID, true)).toContain('autoplay=1');
  });

  it('builds the watch page and the poster frame', () => {
    expect(youtubeWatchUrl(ID)).toBe(`https://www.youtube.com/watch?v=${ID}`);
    expect(youtubeThumbnailUrl(ID)).toBe(`https://i.ytimg.com/vi/${ID}/hqdefault.jpg`);
  });
});
