import { query } from '@core/db/pool';

/**
 * The Zero Manual Coding board.
 *
 * Reads are separated from writes here (writes live in board/actions.ts) so a page can never
 * accidentally mutate while rendering. Savings figures come back exactly as the author typed
 * them, and every surface that shows them labels them as self-reported — they are the one
 * set of numbers in this app that no API can confirm.
 */

const numeric = (value: unknown): number => Number(value ?? 0);
const nullableNumeric = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

export interface BoardPost {
  id: number;
  authorEmail: string;
  authorName: string;
  title: string;
  ticketKeys: string[];
  repo: string | null;
  prUrl: string | null;
  context: string | null;
  delivered: string | null;
  helpPlanning: string | null;
  helpImplementation: string | null;
  benefitsNote: string | null;
  effortSavedPct: number | null;
  timeSavedDays: number | null;
  teamName: string | null;
  tags: string[];
  happenedOn: string;
  /** Hidden posts stay readable to their author and disappear from every total. */
  hidden: boolean;
  likes: number;
  collaboratorNames: string[];
  /** Whether this viewer has already liked it, so the button shows their own state. */
  liked: boolean;
}

export interface BoardTotals {
  posts: number;
  contributors: number;
  posts30d: number;
  daysSaved: number;
  postsWithDays: number;
  avgEffortSavedPct: number;
  postsWithEffort: number;
  ticketsReferenced: number;
}

export interface BoardFilters {
  team?: string;
  tag?: string;
  author?: string;
  search?: string;
  mine?: boolean;
}

function mapPost(row: Record<string, unknown>): BoardPost {
  return {
    id: numeric(row.id),
    authorEmail: row.author_email as string,
    authorName: row.author_name as string,
    title: row.title as string,
    ticketKeys: (row.ticket_keys as string[]) ?? [],
    repo: (row.repo as string) ?? null,
    prUrl: (row.pr_url as string) ?? null,
    context: (row.context as string) ?? null,
    delivered: (row.delivered as string) ?? null,
    helpPlanning: (row.help_planning as string) ?? null,
    helpImplementation: (row.help_implementation as string) ?? null,
    benefitsNote: (row.benefits_note as string) ?? null,
    effortSavedPct: nullableNumeric(row.effort_saved_pct),
    timeSavedDays: nullableNumeric(row.time_saved_days),
    teamName: (row.team_name as string) ?? null,
    tags: (row.tags as string[]) ?? [],
    happenedOn: row.happened_on instanceof Date
      ? row.happened_on.toISOString().slice(0, 10)
      : String(row.happened_on),
    hidden: row.status === 'hidden',
    likes: numeric(row.reactions),
    collaboratorNames: (row.collaborator_names as string[]) ?? [],
    liked: Boolean(row.liked),
  };
}

// The view's `reactions` column is the like count now that only one emoji is ever written.
// `liked` is per-viewer, so it is joined here rather than in the view.
const SELECT_CARD = `SELECT c.*, mine.achievement_id IS NOT NULL AS liked
  FROM v_achievement_card c
  LEFT JOIN (
    SELECT DISTINCT achievement_id
    FROM achievement_reaction WHERE email = $1
  ) mine ON mine.achievement_id = c.id`;

export async function boardFeed(
  viewerEmail: string,
  filters: BoardFilters = {},
  limit = 20,
  offset = 0,
): Promise<BoardPost[]> {
  const conditions = ["c.status = 'published'"];
  const params: unknown[] = [viewerEmail];

  if (filters.team) {
    params.push(filters.team);
    conditions.push(`c.team_name = $${params.length}`);
  }
  if (filters.tag) {
    params.push(filters.tag);
    conditions.push(`$${params.length} = ANY(c.tags)`);
  }
  if (filters.author) {
    params.push(filters.author.toLowerCase());
    conditions.push(`c.author_email = $${params.length}`);
  }
  if (filters.mine) {
    conditions.push('c.author_email = $1');
  }
  if (filters.search) {
    params.push(`%${filters.search}%`);
    const placeholder = `$${params.length}`;
    // Ticket keys are searched as text so "VCAP-1192" finds the post that references it.
    conditions.push(
      `(c.title ILIKE ${placeholder} OR c.context ILIKE ${placeholder}
        OR c.delivered ILIKE ${placeholder}
        OR array_to_string(c.ticket_keys, ' ') ILIKE ${placeholder})`,
    );
  }

  params.push(limit, offset);

  const rows = await query<Record<string, unknown>>(
    `${SELECT_CARD}
     WHERE ${conditions.join(' AND ')}
     ORDER BY c.happened_on DESC, c.id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return rows.map(mapPost);
}

/**
 * The feed as an anonymous reader sees it, for the public landing page.
 *
 * A separate function rather than boardFeed with a blank email, because the difference is
 * not a parameter but a guarantee: there is no viewer, so there is no per-viewer join and
 * nothing that could leak one person's reactions to another. Published posts only, which is
 * already the board's own rule — a post its author hid is hidden from everyone.
 */
export async function publicBoardFeed(limit = 12, offset = 0): Promise<BoardPost[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT c.*, FALSE AS liked
     FROM v_achievement_card c
     WHERE c.status = 'published'
     ORDER BY c.happened_on DESC, c.id DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset],
  );

  return rows.map(mapPost);
}

export async function boardPost(
  viewerEmail: string,
  id: number,
): Promise<BoardPost | undefined> {
  const rows = await query<Record<string, unknown>>(`${SELECT_CARD} WHERE c.id = $2`, [
    viewerEmail,
    id,
  ]);
  return rows[0] ? mapPost(rows[0]) : undefined;
}

export async function boardTotals(): Promise<BoardTotals> {
  const rows = await query<Record<string, unknown>>('SELECT * FROM v_board_totals');
  const row = rows[0] ?? {};
  return {
    posts: numeric(row.posts),
    contributors: numeric(row.contributors),
    posts30d: numeric(row.posts_30d),
    daysSaved: numeric(row.days_saved),
    postsWithDays: numeric(row.posts_with_days),
    avgEffortSavedPct: numeric(row.avg_effort_saved_pct),
    postsWithEffort: numeric(row.posts_with_effort),
    ticketsReferenced: numeric(row.tickets_referenced),
  };
}

export interface LeaderboardRow {
  email: string;
  name: string;
  teamName: string | null;
  posts: number;
  daysSaved: number;
  latestPost: string | null;
}

export async function boardLeaderboard(limit = 8): Promise<LeaderboardRow[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT email, name, team_name, posts, days_saved,
            to_char(latest_post, 'YYYY-MM-DD') AS latest_post
     FROM v_board_leaderboard
     ORDER BY days_saved DESC, posts DESC
     LIMIT $1`,
    [limit],
  );

  return rows.map((row) => ({
    email: row.email as string,
    name: row.name as string,
    teamName: (row.team_name as string) ?? null,
    posts: numeric(row.posts),
    daysSaved: numeric(row.days_saved),
    latestPost: (row.latest_post as string) ?? null,
  }));
}

/** Filter options, built from what has actually been posted rather than a fixed list. */
export async function boardFacets(): Promise<{ teams: string[]; tags: string[] }> {
  const [teams, tags] = await Promise.all([
    query<{ team_name: string }>(
      `SELECT DISTINCT team_name FROM v_achievement_card
       WHERE status = 'published' AND team_name IS NOT NULL
       ORDER BY team_name`,
    ),
    query<{ tag: string }>(
      `SELECT tag, COUNT(*) AS uses FROM (
         SELECT unnest(tags) AS tag FROM achievement WHERE status = 'published'
       ) t
       GROUP BY tag ORDER BY uses DESC, tag LIMIT 18`,
    ),
  ]);

  return {
    teams: teams.map((row) => row.team_name),
    tags: tags.map((row) => row.tag),
  };
}

export async function countPostsBy(email: string): Promise<number> {
  const rows = await query<{ posts: string }>(
    "SELECT COUNT(*) AS posts FROM achievement WHERE author_email = $1 AND status = 'published'",
    [email],
  );
  return Number(rows[0]?.posts ?? 0);
}