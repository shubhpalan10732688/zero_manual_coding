import { numericEnv } from '../config';
import { query } from '../db/pool';
import { logger } from '../logger';

import { FeedItem, parseFeed } from './rss';

/**
 * Pulling the AI news feed.
 *
 * Runs on a schedule rather than on page load. Feeds are slow, occasionally down, and
 * frequently unreachable from a server inside a corporate network even when a laptop can
 * read them — so a page that fetched them directly would be slow when it worked and empty
 * when it did not. Instead each source records what happened last time it was tried, the
 * page reads only the database, and someone can post a link by hand when the network
 * refuses to cooperate.
 */

export interface SourceRow {
  id: string;
  name: string;
  feed_url: string;
  category: string;
}

export interface SourceResult {
  id: string;
  fetched: number;
  inserted: number;
  error?: string;
}

async function fetchFeed(url: string, timeoutMs: number): Promise<string> {
  const response = await fetch(url, {
    headers: {
      // Some feeds serve HTML to a client that does not ask for XML.
      Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
      'User-Agent': 'zero-manual-coding-dashboard/1.0 (+internal)',
    },
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.text();
}

/** Keeps one feed from filling the page: newest first, then a fixed ceiling. */
function newest(items: FeedItem[], limit: number): FeedItem[] {
  return [...items]
    .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))
    .slice(0, limit);
}

async function insertItems(source: SourceRow, items: FeedItem[]): Promise<number> {
  let inserted = 0;

  for (const item of items) {
    // Insert-only. An item already stored keeps whatever a person did to it, such as being
    // hidden, instead of a later poll quietly reinstating it.
    const rows = await query<{ id: string }>(
      `INSERT INTO news_item (source_id, title, url, summary, author, published_at, tags)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (url) DO NOTHING
       RETURNING id`,
      [
        source.id,
        item.title.slice(0, 400),
        item.url,
        item.summary ?? null,
        item.author?.slice(0, 120) ?? null,
        item.publishedAt ?? null,
        [source.category],
      ],
    );
    if (rows.length > 0) inserted += 1;
  }

  return inserted;
}

export async function refreshSource(source: SourceRow): Promise<SourceResult> {
  const timeoutMs = numericEnv('NEWS_FETCH_TIMEOUT_MS', 15_000);
  const perFeed = numericEnv('NEWS_ITEMS_PER_FEED', 12);

  try {
    const xml = await fetchFeed(source.feed_url, timeoutMs);
    const items = newest(parseFeed(xml), perFeed);
    const inserted = await insertItems(source, items);

    await query(
      `UPDATE news_source
       SET last_fetched_at = now(), last_error = NULL, items_seen = items_seen + $2
       WHERE id = $1`,
      [source.id, inserted],
    );

    logger.info('Refreshed a news source', { source: source.id, fetched: items.length, inserted });
    return { id: source.id, fetched: items.length, inserted };
  } catch (error) {
    const message = (error as Error).message ?? 'unknown error';
    await query('UPDATE news_source SET last_fetched_at = now(), last_error = $2 WHERE id = $1', [
      source.id,
      message.slice(0, 300),
    ]);
    logger.warn('News source failed', { source: source.id, error: message });
    return { id: source.id, fetched: 0, inserted: 0, error: message };
  }
}

export async function refreshNews(): Promise<SourceResult[]> {
  const sources = await query<SourceRow>(
    'SELECT id, name, feed_url, category FROM news_source WHERE enabled ORDER BY id',
  );

  const results: SourceResult[] = [];
  // Sequential on purpose. There are a handful of sources, this is not on a request path,
  // and a burst of parallel fetches is what makes a proxy start refusing connections.
  for (const source of sources) {
    results.push(await refreshSource(source));
  }
  return results;
}
