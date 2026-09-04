/**
 * A small RSS and Atom reader.
 *
 * No XML dependency. That is a deliberate trade and worth being honest about: this is not a
 * general parser and would not survive arbitrary XML. It handles the shape that news feeds
 * actually take — a flat list of items, each with a title, a link, a date and a summary —
 * against a list of feeds we choose ourselves. Anything it cannot understand is skipped
 * rather than guessed at, and the caller reports how many items a feed yielded, so a feed
 * that changes format shows up as zero rather than as silence.
 */

export interface FeedItem {
  title: string;
  url: string;
  summary?: string;
  author?: string;
  publishedAt?: Date;
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  '#39': "'",
  '#x27': "'",
  '#x2F': '/',
  '#8217': '\u2019',
  '#8216': '\u2018',
  '#8220': '\u201c',
  '#8221': '\u201d',
  '#8211': '\u2013',
  '#8212': '\u2014',
  hellip: '\u2026',
  mdash: '\u2014',
  ndash: '\u2013',
  rsquo: '\u2019',
  lsquo: '\u2018',
  ldquo: '\u201c',
  rdquo: '\u201d',
};

export function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, name: string) => {
    const known = ENTITIES[name];
    if (known !== undefined) return known;
    if (/^#x[0-9a-fA-F]+$/.test(name)) {
      return String.fromCodePoint(Number.parseInt(name.slice(2), 16));
    }
    if (/^#\d+$/.test(name)) return String.fromCodePoint(Number(name.slice(1)));
    return match;
  });
}

/** Feed summaries are usually HTML. The board shows plain text, so tags come out. */
export function stripHtml(value: string): string {
  return decodeEntities(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/p>/gi, ' ')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function unwrap(raw: string): string {
  const cdata = raw.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return (cdata ? cdata[1]! : raw).trim();
}

/** First occurrence of a tag's text content, ignoring namespace prefixes. */
function tagText(block: string, ...names: string[]): string | undefined {
  for (const name of names) {
    const pattern = new RegExp(`<(?:[a-zA-Z0-9]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[a-zA-Z0-9]+:)?${name}>`, 'i');
    const match = block.match(pattern);
    if (match) {
      const value = unwrap(match[1]!);
      if (value) return value;
    }
  }
  return undefined;
}

/**
 * Atom puts the destination in an attribute rather than in the element body, and a single
 * entry can carry several links. The alternate link is the article; the rest are things
 * like comment feeds and enclosures.
 */
function linkFrom(block: string): string | undefined {
  const body = tagText(block, 'link');
  if (body && /^https?:\/\//i.test(body)) return body;

  const hrefs = [...block.matchAll(/<link\b([^>]*)\/?>/gi)].map((match) => match[1] ?? '');
  const parsed = hrefs
    .map((attributes) => ({
      href: attributes.match(/href\s*=\s*["']([^"']+)["']/i)?.[1],
      rel: attributes.match(/rel\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase(),
      type: attributes.match(/type\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase(),
    }))
    .filter((entry) => entry.href && /^https?:\/\//i.test(entry.href));

  const alternate = parsed.find(
    (entry) => (!entry.rel || entry.rel === 'alternate') && (!entry.type || entry.type.includes('html')),
  );
  return (alternate ?? parsed[0])?.href;
}

function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value.trim());
  if (Number.isNaN(parsed.getTime())) return undefined;
  // A date in the future is a broken feed, not news. Dropping it keeps such items from
  // pinning themselves to the top of the list forever.
  if (parsed.getTime() > Date.now() + 24 * 60 * 60 * 1000) return undefined;
  return parsed;
}

const MAX_SUMMARY = 600;

export function parseFeed(xml: string): FeedItem[] {
  const blocks = [
    ...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi),
    ...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi),
  ].map((match) => match[0]);

  const items: FeedItem[] = [];
  const seen = new Set<string>();

  for (const block of blocks) {
    const url = linkFrom(block);
    const rawTitle = tagText(block, 'title');
    if (!url || !rawTitle) continue;

    const title = stripHtml(rawTitle);
    if (!title || seen.has(url)) continue;
    seen.add(url);

    const summaryRaw =
      tagText(block, 'description', 'summary') ?? tagText(block, 'encoded', 'content');
    const summary = summaryRaw ? stripHtml(summaryRaw).slice(0, MAX_SUMMARY) : undefined;

    const authorBlock = tagText(block, 'author');
    const author = authorBlock ? stripHtml(authorBlock) || undefined : tagText(block, 'creator');

    items.push({
      title,
      url,
      summary: summary || undefined,
      author: author ? stripHtml(author) : undefined,
      publishedAt: parseDate(tagText(block, 'pubDate', 'published', 'updated', 'date')),
    });
  }

  return items;
}
