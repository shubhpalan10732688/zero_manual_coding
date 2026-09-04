import { decodeEntities, parseFeed, stripHtml } from '../src/news/rss';

/**
 * The reader is deliberately not a general XML parser, so what matters is that it handles the
 * shapes real feeds take and skips — rather than guesses at — anything else.
 */

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Example Blog</title>
    <link>https://example.test</link>
    <item>
      <title>Something &amp; something else</title>
      <link>https://example.test/posts/one</link>
      <description><![CDATA[<p>A <b>summary</b> with markup.</p>]]></description>
      <pubDate>Tue, 12 Aug 2025 09:30:00 GMT</pubDate>
      <dc:creator>Ada Lovelace</dc:creator>
    </item>
    <item>
      <title>Second post</title>
      <link>https://example.test/posts/two</link>
      <pubDate>Mon, 11 Aug 2025 09:30:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Example Atom</title>
  <entry>
    <title type="html">Atom &lt;entry&gt; one</title>
    <link rel="alternate" type="text/html" href="https://example.test/atom/one"/>
    <link rel="replies" type="application/atom+xml" href="https://example.test/atom/one/replies"/>
    <summary>The summary.</summary>
    <updated>2025-08-12T09:30:00Z</updated>
    <author><name>Grace Hopper</name></author>
  </entry>
</feed>`;

describe('parseFeed with RSS', () => {
  const items = parseFeed(RSS);

  it('finds every item', () => {
    expect(items).toHaveLength(2);
  });

  it('decodes entities in the title', () => {
    expect(items[0]!.title).toBe('Something & something else');
  });

  it('unwraps CDATA and strips markup from the summary', () => {
    expect(items[0]!.summary).toBe('A summary with markup.');
  });

  it('reads the date', () => {
    expect(items[0]!.publishedAt?.toISOString()).toBe('2025-08-12T09:30:00.000Z');
  });

  it('falls back to dc:creator for the author', () => {
    expect(items[0]!.author).toBe('Ada Lovelace');
  });

  it('leaves an absent summary undefined rather than empty', () => {
    expect(items[1]!.summary).toBeUndefined();
  });
});

describe('parseFeed with Atom', () => {
  const items = parseFeed(ATOM);

  it('reads the href attribute rather than the element body', () => {
    expect(items[0]!.url).toBe('https://example.test/atom/one');
  });

  it('prefers the alternate link over a replies feed', () => {
    expect(items[0]!.url).not.toContain('replies');
  });

  it('reads the nested author name', () => {
    expect(items[0]!.author).toBe('Grace Hopper');
  });

  it('reads updated as the date when there is no published element', () => {
    expect(items[0]!.publishedAt?.toISOString()).toBe('2025-08-12T09:30:00.000Z');
  });
});

describe('parseFeed edge cases', () => {
  it('returns nothing for input that is not a feed', () => {
    expect(parseFeed('<html><body>Not a feed</body></html>')).toEqual([]);
  });

  it('returns nothing for empty input', () => {
    expect(parseFeed('')).toEqual([]);
  });

  it('skips an item with no link', () => {
    expect(parseFeed('<rss><item><title>No link</title></item></rss>')).toEqual([]);
  });

  it('skips an item with no title', () => {
    expect(parseFeed('<rss><item><link>https://x.test/a</link></item></rss>')).toEqual([]);
  });

  it('deduplicates by URL, keeping the first', () => {
    const xml = `<rss>
      <item><title>First</title><link>https://x.test/a</link></item>
      <item><title>Duplicate</title><link>https://x.test/a</link></item>
    </rss>`;
    const items = parseFeed(xml);
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe('First');
  });

  it('ignores a non-http link, such as a relative one', () => {
    expect(parseFeed('<rss><item><title>T</title><link>/relative</link></item></rss>')).toEqual([]);
  });

  it('drops a date far in the future rather than letting it pin to the top', () => {
    const year = new Date().getUTCFullYear() + 5;
    const xml = `<rss><item><title>T</title><link>https://x.test/a</link>
      <pubDate>Tue, 12 Aug ${year} 09:30:00 GMT</pubDate></item></rss>`;
    expect(parseFeed(xml)[0]!.publishedAt).toBeUndefined();
  });

  it('drops an unparseable date instead of failing the item', () => {
    const xml =
      '<rss><item><title>T</title><link>https://x.test/a</link><pubDate>whenever</pubDate></item></rss>';
    const items = parseFeed(xml);
    expect(items).toHaveLength(1);
    expect(items[0]!.publishedAt).toBeUndefined();
  });

  it('caps a very long summary', () => {
    const xml = `<rss><item><title>T</title><link>https://x.test/a</link>
      <description>${'x'.repeat(2000)}</description></item></rss>`;
    expect(parseFeed(xml)[0]!.summary!.length).toBe(600);
  });
});

describe('stripHtml', () => {
  it('removes script content entirely rather than just its tags', () => {
    expect(stripHtml('<script>alert(1)</script>Safe text')).toBe('Safe text');
  });

  it('removes style content', () => {
    expect(stripHtml('<style>.a{}</style>Text')).toBe('Text');
  });

  it('turns breaks and paragraph ends into spaces', () => {
    expect(stripHtml('one<br>two</p>three')).toBe('one two three');
  });

  it('collapses whitespace', () => {
    expect(stripHtml('  a\n\n   b  ')).toBe('a b');
  });
});

describe('decodeEntities', () => {
  it('decodes named entities', () => {
    expect(decodeEntities('a &amp; b &lt;c&gt; &quot;d&quot;')).toBe('a & b <c> "d"');
  });

  it('decodes numeric and hex entities', () => {
    expect(decodeEntities('&#39;&#x27;')).toBe("''");
  });

  it('leaves an unknown entity as written', () => {
    expect(decodeEntities('&notanentity;')).toBe('&notanentity;');
  });
});
