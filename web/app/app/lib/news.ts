import { query } from '@core/db/pool';

/**
 * The AI news feed.
 *
 * Reads only from the database: fetching feeds happens in `npm run news` on a schedule, so a
 * blocked outbound connection makes the page stale rather than slow. Items posted by a
 * person and items pulled from a feed sit in the same list, because a reader does not care
 * which arrived how — only the attribution line differs.
 */

export interface NewsItem {
  id: number;
  title: string;
  url: string;
  summary: string | null;
  author: string | null;
  publishedAt: Date | null;
  fetchedAt: Date;
  tags: string[];
  sourceId: string | null;
  sourceName: string | null;
  sourceHomepage: string | null;
  postedBy: string | null;
  postedByName: string | null;
}

export interface NewsSource {
  id: string;
  name: string;
  feedUrl: string;
  homepage: string | null;
  category: string;
  enabled: boolean;
  lastFetchedAt: Date | null;
  lastError: string | null;
  items: number;
}

export async function listNews(
  options: { category?: string; search?: string; limit?: number } = {},
): Promise<NewsItem[]> {
  const conditions = ["n.status = 'published'"];
  const params: unknown[] = [];

  if (options.category) {
    params.push(options.category);
    conditions.push(`$${params.length} = ANY(n.tags)`);
  }
  if (options.search) {
    params.push(`%${options.search}%`);
    const placeholder = `$${params.length}`;
    conditions.push(`(n.title ILIKE ${placeholder} OR n.summary ILIKE ${placeholder})`);
  }

  params.push(options.limit ?? 60);

  const rows = await query<Record<string, unknown>>(
    `SELECT n.id, n.title, n.url, n.summary, n.author, n.published_at, n.fetched_at, n.tags,
            n.source_id, s.name AS source_name, s.homepage AS source_homepage,
            n.posted_by,
            COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''), n.posted_by)
              AS posted_by_name
     FROM news_item n
     LEFT JOIN news_source s ON s.id = n.source_id
     LEFT JOIN app_user u ON u.email = n.posted_by
     WHERE ${conditions.join(' AND ')}
     ORDER BY COALESCE(n.published_at, n.fetched_at) DESC, n.id DESC
     LIMIT $${params.length}`,
    params,
  );

  return rows.map((row) => ({
    id: Number(row.id),
    title: row.title as string,
    url: row.url as string,
    summary: (row.summary as string) ?? null,
    author: (row.author as string) ?? null,
    publishedAt: (row.published_at as Date) ?? null,
    fetchedAt: row.fetched_at as Date,
    tags: (row.tags as string[]) ?? [],
    sourceId: (row.source_id as string) ?? null,
    sourceName: (row.source_name as string) ?? null,
    sourceHomepage: (row.source_homepage as string) ?? null,
    postedBy: (row.posted_by as string) ?? null,
    postedByName: (row.posted_by_name as string) ?? null,
  }));
}

export async function newsCategories(): Promise<string[]> {
  const rows = await query<{ tag: string }>(
    `SELECT tag, COUNT(*) AS uses FROM (
       SELECT unnest(tags) AS tag FROM news_item WHERE status = 'published'
     ) t
     GROUP BY tag ORDER BY uses DESC, tag LIMIT 10`,
  );
  return rows.map((row) => row.tag);
}

export async function listSources(): Promise<NewsSource[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT s.id, s.name, s.feed_url, s.homepage, s.category, s.enabled,
            s.last_fetched_at, s.last_error,
            (SELECT COUNT(*) FROM news_item n WHERE n.source_id = s.id) AS items
     FROM news_source s ORDER BY s.category, s.name`,
  );

  return rows.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    feedUrl: row.feed_url as string,
    homepage: (row.homepage as string) ?? null,
    category: row.category as string,
    enabled: Boolean(row.enabled),
    lastFetchedAt: (row.last_fetched_at as Date) ?? null,
    lastError: (row.last_error as string) ?? null,
    items: Number(row.items ?? 0),
  }));
}

/** When the feed was last known to be current, for the "as of" line on the page. */
export async function lastFetchedAt(): Promise<Date | null> {
  const rows = await query<{ at: Date | null }>(
    'SELECT MAX(last_fetched_at) AS at FROM news_source WHERE enabled',
  );
  return rows[0]?.at ?? null;
}
