import { query } from '@core/db/pool';

import type { ResourceKind } from './resourceKinds';

/**
 * The resource shelf: repositories, docs and tools worth someone else's time.
 *
 * Upvotes rather than editorial ranking, with a featured flag for the handful an admin wants
 * at the top. Star counts are filled in opportunistically from GitHub and may be absent,
 * which is why they are nullable rather than zero — nobody should read "0 stars" off a
 * lookup that never ran.
 */

export interface Resource {
  id: number;
  title: string;
  url: string;
  kind: ResourceKind;
  description: string | null;
  tags: string[];
  repoStars: number | null;
  repoSlug: string | null;
  featured: boolean;
  submittedBy: string;
  submittedByName: string;
  createdAt: Date;
  votes: number;
  votedByMe: boolean;
}

function mapResource(row: Record<string, unknown>): Resource {
  return {
    id: Number(row.id),
    title: row.title as string,
    url: row.url as string,
    kind: row.kind as ResourceKind,
    description: (row.description as string) ?? null,
    tags: (row.tags as string[]) ?? [],
    repoStars: row.repo_stars === null || row.repo_stars === undefined ? null : Number(row.repo_stars),
    repoSlug: (row.repo_slug as string) ?? null,
    featured: Boolean(row.featured),
    submittedBy: row.submitted_by as string,
    submittedByName: row.submitted_by_name as string,
    createdAt: row.created_at as Date,
    votes: Number(row.votes ?? 0),
    votedByMe: Boolean(row.voted_by_me),
  };
}

export async function listResources(
  viewerEmail: string,
  options: { kind?: ResourceKind; tag?: string; search?: string } = {},
): Promise<Resource[]> {
  const conditions = ["r.status = 'published'"];
  const params: unknown[] = [viewerEmail];

  if (options.kind) {
    params.push(options.kind);
    conditions.push(`r.kind = $${params.length}`);
  }
  if (options.tag) {
    params.push(options.tag);
    conditions.push(`$${params.length} = ANY(r.tags)`);
  }
  if (options.search) {
    params.push(`%${options.search}%`);
    const placeholder = `$${params.length}`;
    conditions.push(
      `(r.title ILIKE ${placeholder} OR r.description ILIKE ${placeholder}
        OR array_to_string(r.tags, ' ') ILIKE ${placeholder})`,
    );
  }

  const rows = await query<Record<string, unknown>>(
    `SELECT r.*, (v.email IS NOT NULL) AS voted_by_me
     FROM v_resource_card r
     LEFT JOIN resource_vote v ON v.resource_id = r.id AND v.email = $1
     WHERE ${conditions.join(' AND ')}
     ORDER BY r.featured DESC, r.votes DESC, r.created_at DESC
     LIMIT 150`,
    params,
  );

  return rows.map(mapResource);
}

export async function resourceTags(limit = 16): Promise<string[]> {
  const rows = await query<{ tag: string }>(
    `SELECT tag, COUNT(*) AS uses FROM (
       SELECT unnest(tags) AS tag FROM resource WHERE status = 'published'
     ) t
     GROUP BY tag ORDER BY uses DESC, tag LIMIT $1`,
    [limit],
  );
  return rows.map((row) => row.tag);
}
