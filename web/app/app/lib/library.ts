import { query } from '@core/db/pool';

/**
 * The shared library of commands and rules.
 *
 * Cursor exposes no API for team rules or commands — the dashboard is the only place they
 * exist, and the Admin API reports only that one changed. So this is not a mirror of them.
 * It is the organisation's own catalogue: written here, copied out by hand, and attributed,
 * because the point is that people find the ones their colleagues already found useful.
 */

export type AssetKind = 'command' | 'rule';

export interface Asset {
  id: number;
  kind: AssetKind;
  slug: string;
  title: string;
  description: string | null;
  body: string;
  category: string;
  tags: string[];
  globPattern: string | null;
  alwaysApply: boolean;
  authorEmail: string;
  authorName: string;
  status: string;
  copies: number;
  votes: number;
  updatedAt: Date;
  /** Whether the viewer has already upvoted, so the button reflects their own state. */
  votedByMe: boolean;
}

export const COMMAND_CATEGORIES = [
  'Review',
  'Testing',
  'Refactoring',
  'Debugging',
  'Documentation',
  'Migration',
  'Scaffolding',
  'General',
] as const;

export const RULE_CATEGORIES = [
  'Architecture',
  'Style',
  'Testing',
  'Security',
  'Performance',
  'Accessibility',
  'Language',
  'General',
] as const;

export function categoriesFor(kind: AssetKind): readonly string[] {
  return kind === 'command' ? COMMAND_CATEGORIES : RULE_CATEGORIES;
}

function mapAsset(row: Record<string, unknown>): Asset {
  return {
    id: Number(row.id),
    kind: row.kind as AssetKind,
    slug: row.slug as string,
    title: row.title as string,
    description: (row.description as string) ?? null,
    body: row.body as string,
    category: row.category as string,
    tags: (row.tags as string[]) ?? [],
    globPattern: (row.glob_pattern as string) ?? null,
    alwaysApply: Boolean(row.always_apply),
    authorEmail: row.author_email as string,
    authorName: row.author_name as string,
    status: row.status as string,
    copies: Number(row.copies ?? 0),
    votes: Number(row.votes ?? 0),
    updatedAt: row.updated_at as Date,
    votedByMe: Boolean(row.voted_by_me),
  };
}

const SELECT_ASSET = `SELECT a.*, (v.email IS NOT NULL) AS voted_by_me
  FROM v_shared_asset_card a
  LEFT JOIN shared_asset_vote v ON v.asset_id = a.id AND v.email = $1`;

export type AssetSort = 'popular' | 'recent';

export async function listAssets(
  viewerEmail: string,
  kind: AssetKind,
  options: { category?: string; search?: string; sort?: AssetSort; mine?: boolean } = {},
): Promise<Asset[]> {
  const conditions = ['a.kind = $2', "a.status = 'published'"];
  const params: unknown[] = [viewerEmail, kind];

  if (options.mine) {
    // A draft is only visible to the person writing it.
    conditions[1] = "(a.status = 'published' OR a.author_email = $1)";
    params.push(viewerEmail);
    conditions.push(`a.author_email = $${params.length}`);
  }
  if (options.category) {
    params.push(options.category);
    conditions.push(`a.category = $${params.length}`);
  }
  if (options.search) {
    params.push(`%${options.search}%`);
    const placeholder = `$${params.length}`;
    conditions.push(
      `(a.title ILIKE ${placeholder} OR a.description ILIKE ${placeholder}
        OR a.body ILIKE ${placeholder} OR array_to_string(a.tags, ' ') ILIKE ${placeholder})`,
    );
  }

  const order =
    options.sort === 'recent'
      ? 'a.updated_at DESC'
      : 'a.votes DESC, a.copies DESC, a.updated_at DESC';

  const rows = await query<Record<string, unknown>>(
    `${SELECT_ASSET} WHERE ${conditions.join(' AND ')} ORDER BY ${order} LIMIT 120`,
    params,
  );
  return rows.map(mapAsset);
}

export async function getAsset(
  viewerEmail: string,
  kind: AssetKind,
  slug: string,
): Promise<Asset | undefined> {
  const rows = await query<Record<string, unknown>>(
    `${SELECT_ASSET} WHERE a.kind = $2 AND a.slug = $3`,
    [viewerEmail, kind, slug],
  );
  return rows[0] ? mapAsset(rows[0]) : undefined;
}

export async function assetCategories(kind: AssetKind): Promise<{ category: string; count: number }[]> {
  const rows = await query<{ category: string; count: string }>(
    `SELECT category, COUNT(*) AS count FROM shared_asset
     WHERE kind = $1 AND status = 'published'
     GROUP BY category ORDER BY COUNT(*) DESC, category`,
    [kind],
  );
  return rows.map((row) => ({ category: row.category, count: Number(row.count) }));
}

export async function countAssetsBy(email: string): Promise<number> {
  const rows = await query<{ authored: string }>(
    'SELECT COUNT(*) AS authored FROM shared_asset WHERE author_email = $1',
    [email],
  );
  return Number(rows[0]?.authored ?? 0);
}

/**
 * Where a copied asset is meant to land. Commands are files under .cursor/commands and
 * rules are .mdc files with front matter, so the install hint is not the same for both.
 */
export function installPath(asset: Pick<Asset, 'kind' | 'slug'>): string {
  return asset.kind === 'command'
    ? `.cursor/commands/${asset.slug}.md`
    : `.cursor/rules/${asset.slug}.mdc`;
}

export function installBody(asset: Asset): string {
  if (asset.kind === 'command') return asset.body;

  // Project rules are read from front matter: a glob scopes the rule to matching files, and
  // alwaysApply puts it in context for every conversation.
  const front = [
    '---',
    `description: ${asset.description ?? asset.title}`,
    asset.globPattern ? `globs: ${asset.globPattern}` : undefined,
    `alwaysApply: ${asset.alwaysApply}`,
    '---',
    '',
  ].filter((line) => line !== undefined);

  return `${front.join('\n')}${asset.body}`;
}

/** URL-safe, stable, and short enough to be a filename. */
export function toSlug(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
