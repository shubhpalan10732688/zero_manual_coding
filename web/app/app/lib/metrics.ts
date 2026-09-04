import { query } from '@core/db/pool';

/**
 * Warehouse reads for the workspace.
 *
 * Everything here goes through the ingester's pool rather than the read-only pool the older
 * pages use, for a practical reason: locally both point at a PGlite socket server that
 * serves one client at a time, and two pools in one process deadlock against each other.
 * One pool for the whole workspace also means a page that writes a post and then reads the
 * board back sees its own write.
 *
 * Costs stay in cents. Numerics are cast in SQL, because pg hands back NUMERIC as a string
 * and a silent string would turn every sum on the page into concatenation.
 */

const numeric = (value: unknown): number => Number(value ?? 0);
const nullableNumeric = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

export interface PeriodTotals {
  runs: number;
  agents: number;
  rawCostCents: number;
  chargedCents: number;
  totalTokens: number;
  cacheReuseRate: number | null;
  pullRequests: number;
  coldStartRuns: number;
  coldStartCents: number;
  unfinishedRuns: number;
  unfinishedCents: number;
  durationMs: number;
}

/**
 * Activity in a window, counted from runs rather than from the all-time summary views, so
 * the period selector actually changes the numbers. `offsetPeriods` of 1 gives the window
 * immediately before, which is what a trend is measured against.
 */
export async function periodTotals(
  email: string,
  days: number,
  offsetPeriods = 0,
): Promise<PeriodTotals> {
  const from = days * (offsetPeriods + 1);
  const to = days * offsetPeriods;

  const rows = await query<Record<string, unknown>>(
    `SELECT COUNT(*)::int                                          AS runs,
            COUNT(DISTINCT agent_id)::int                          AS agents,
            COALESCE(SUM(raw_cost_cents), 0)::float8               AS raw_cost_cents,
            COALESCE(SUM(charged_cents), 0)::float8                AS charged_cents,
            COALESCE(SUM(total_tokens), 0)::float8                 AS total_tokens,
            (SUM(cache_read_tokens)::numeric
              / NULLIF(SUM(cache_read_tokens + input_tokens + cache_write_tokens), 0))::float8
                                                                   AS cache_reuse_rate,
            COUNT(DISTINCT pr_url)::int                            AS pull_requests,
            COUNT(*) FILTER (WHERE is_cold_start)::int             AS cold_start_runs,
            COALESCE(SUM(raw_cost_cents) FILTER (WHERE is_cold_start), 0)::float8
                                                                   AS cold_start_cents,
            COUNT(*) FILTER (WHERE NOT finished)::int              AS unfinished_runs,
            COALESCE(SUM(raw_cost_cents) FILTER (WHERE NOT finished), 0)::float8
                                                                   AS unfinished_cents,
            COALESCE(SUM(duration_ms), 0)::float8                  AS duration_ms
     FROM v_agent_run_detail
     WHERE email = $1
       AND created_at >= now() - ($2 || ' days')::interval
       AND ($3 = 0 OR created_at < now() - ($4 || ' days')::interval)`,
    [email, from, offsetPeriods, to],
  );

  const row = rows[0] ?? {};
  return {
    runs: numeric(row.runs),
    agents: numeric(row.agents),
    rawCostCents: numeric(row.raw_cost_cents),
    chargedCents: numeric(row.charged_cents),
    totalTokens: numeric(row.total_tokens),
    cacheReuseRate: nullableNumeric(row.cache_reuse_rate),
    pullRequests: numeric(row.pull_requests),
    coldStartRuns: numeric(row.cold_start_runs),
    coldStartCents: numeric(row.cold_start_cents),
    unfinishedRuns: numeric(row.unfinished_runs),
    unfinishedCents: numeric(row.unfinished_cents),
    durationMs: numeric(row.duration_ms),
  };
}

export interface LifetimeSummary {
  agents: number;
  runs: number;
  pullRequests: number;
  rawCostCents: number;
  chargedCents: number;
  subscriptionAbsorbedCents: number;
  cacheReuseRate: number | null;
  firstAgentAt: string | null;
  lastAgentAt: string | null;
  daysSinceLastAgent: number | null;
}

export async function lifetimeSummary(email: string): Promise<LifetimeSummary | undefined> {
  const rows = await query<Record<string, unknown>>(
    `SELECT agents, runs, pull_requests,
            raw_cost_cents::float8              AS raw_cost_cents,
            charged_cents::float8               AS charged_cents,
            subscription_absorbed_cents::float8 AS subscription_absorbed_cents,
            cache_reuse_rate::float8            AS cache_reuse_rate,
            to_char(first_agent_at, 'YYYY-MM-DD') AS first_agent_at,
            to_char(last_agent_at, 'YYYY-MM-DD')  AS last_agent_at,
            EXTRACT(DAY FROM now() - last_agent_at)::int AS days_since_last_agent
     FROM v_agent_user_summary WHERE email = $1`,
    [email],
  );

  const row = rows[0];
  if (!row) return undefined;

  return {
    agents: numeric(row.agents),
    runs: numeric(row.runs),
    pullRequests: numeric(row.pull_requests),
    rawCostCents: numeric(row.raw_cost_cents),
    chargedCents: numeric(row.charged_cents),
    subscriptionAbsorbedCents: numeric(row.subscription_absorbed_cents),
    cacheReuseRate: nullableNumeric(row.cache_reuse_rate),
    firstAgentAt: (row.first_agent_at as string) ?? null,
    lastAgentAt: (row.last_agent_at as string) ?? null,
    daysSinceLastAgent: nullableNumeric(row.days_since_last_agent),
  };
}

export interface WasteSummary {
  coldStartCents: number;
  coldStartRuns: number;
  unfinishedCents: number;
  unfinishedRuns: number;
  noPrCents: number;
  noPrAgents: number;
  totalAgents: number;
  totalCents: number;
  totalRuns: number;
  costliestAgentShare: number | null;
}

export async function wasteSummary(email: string): Promise<WasteSummary | undefined> {
  const rows = await query<Record<string, unknown>>(
    `SELECT cold_start_cents::float8      AS cold_start_cents,
            cold_start_runs,
            unfinished_cents::float8      AS unfinished_cents,
            unfinished_runs,
            no_pr_cents::float8           AS no_pr_cents,
            no_pr_agents,
            total_agents,
            total_cents::float8           AS total_cents,
            total_runs,
            costliest_agent_share::float8 AS costliest_agent_share
     FROM v_agent_waste WHERE email = $1`,
    [email],
  );

  const row = rows[0];
  if (!row) return undefined;

  return {
    coldStartCents: numeric(row.cold_start_cents),
    coldStartRuns: numeric(row.cold_start_runs),
    unfinishedCents: numeric(row.unfinished_cents),
    unfinishedRuns: numeric(row.unfinished_runs),
    noPrCents: numeric(row.no_pr_cents),
    noPrAgents: numeric(row.no_pr_agents),
    totalAgents: numeric(row.total_agents),
    totalCents: numeric(row.total_cents),
    totalRuns: numeric(row.total_runs),
    costliestAgentShare: nullableNumeric(row.costliest_agent_share),
  };
}

export interface DailyPoint {
  day: string;
  runs: number;
  rawCostCents: number;
  totalTokens: number;
  cacheReuseRate: number | null;
}

export async function dailyActivity(email: string, days: number): Promise<DailyPoint[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT to_char(day, 'YYYY-MM-DD')     AS day,
            runs,
            raw_cost_cents::float8         AS raw_cost_cents,
            total_tokens::float8           AS total_tokens,
            cache_reuse_rate::float8       AS cache_reuse_rate
     FROM v_agent_daily
     WHERE email = $1 AND day >= current_date - $2::int
     ORDER BY day`,
    [email, days],
  );

  return rows.map((row) => ({
    day: row.day as string,
    runs: numeric(row.runs),
    rawCostCents: numeric(row.raw_cost_cents),
    totalTokens: numeric(row.total_tokens),
    cacheReuseRate: nullableNumeric(row.cache_reuse_rate),
  }));
}

export interface AgentRow {
  id: string;
  name: string | null;
  status: string | null;
  repo: string | null;
  agentUrl: string | null;
  createdAt: string | null;
  runs: number;
  finishedRuns: number;
  pullRequests: number;
  rawCostCents: number;
  cacheReuseRate: number | null;
  totalDurationMs: number | null;
}

export async function topAgents(email: string, days: number, limit = 12): Promise<AgentRow[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT id, name, status, agent_url, runs, finished_runs, pull_requests,
            raw_cost_cents::float8   AS raw_cost_cents,
            cache_reuse_rate::float8 AS cache_reuse_rate,
            total_duration_ms::float8 AS total_duration_ms,
            to_char(created_at, 'YYYY-MM-DD') AS created_at,
            COALESCE(
              NULLIF(regexp_replace(repo_url, '^(https?://)?(www\\.)?github\\.com/', ''), ''),
              'no repository'
            ) AS repo
     FROM v_agent_efficiency
     WHERE email = $1 AND (created_at IS NULL OR created_at >= now() - ($2 || ' days')::interval)
     ORDER BY raw_cost_cents DESC NULLS LAST
     LIMIT $3`,
    [email, days, limit],
  );

  return rows.map((row) => ({
    id: row.id as string,
    name: (row.name as string) ?? null,
    status: (row.status as string) ?? null,
    repo: (row.repo as string) ?? null,
    agentUrl: (row.agent_url as string) ?? null,
    createdAt: (row.created_at as string) ?? null,
    runs: numeric(row.runs),
    finishedRuns: numeric(row.finished_runs),
    pullRequests: numeric(row.pull_requests),
    rawCostCents: numeric(row.raw_cost_cents),
    cacheReuseRate: nullableNumeric(row.cache_reuse_rate),
    totalDurationMs: nullableNumeric(row.total_duration_ms),
  }));
}

export interface RunRow {
  id: string;
  agentName: string | null;
  status: string | null;
  createdAt: string;
  durationMs: number | null;
  repo: string | null;
  branch: string | null;
  prUrl: string | null;
  rawCostCents: number;
  totalTokens: number;
  cacheReuseRate: number | null;
  isColdStart: boolean;
}

export async function recentRuns(email: string, limit = 15): Promise<RunRow[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT id, agent_name, status, repo, branch, pr_url,
            duration_ms::float8      AS duration_ms,
            raw_cost_cents::float8   AS raw_cost_cents,
            total_tokens::float8     AS total_tokens,
            cache_reuse_rate::float8 AS cache_reuse_rate,
            is_cold_start,
            to_char(created_at, 'YYYY-MM-DD HH24:MI') AS created_at
     FROM v_agent_run_detail
     WHERE email = $1 AND created_at IS NOT NULL
     ORDER BY created_at DESC
     LIMIT $2`,
    [email, limit],
  );

  return rows.map((row) => ({
    id: row.id as string,
    agentName: (row.agent_name as string) ?? null,
    status: (row.status as string) ?? null,
    createdAt: row.created_at as string,
    durationMs: nullableNumeric(row.duration_ms),
    repo: (row.repo as string) ?? null,
    branch: (row.branch as string) ?? null,
    prUrl: (row.pr_url as string) ?? null,
    rawCostCents: numeric(row.raw_cost_cents),
    totalTokens: numeric(row.total_tokens),
    cacheReuseRate: nullableNumeric(row.cache_reuse_rate),
    isColdStart: Boolean(row.is_cold_start),
  }));
}

export interface ImpactSummary {
  agents: number;
  shippedAgents: number;
  tickets: number;
  featureAgents: number;
  bugAgents: number;
  unclassifiedAgents: number;
  rawCostCents: number;
  featureCents: number;
  bugCents: number;
  unshippedCents: number;
  additions: number;
  deletions: number;
  enrichedAgents: number;
  unmergedPrAgents: number;
  unmergedPrCents: number;
}

export async function impactSummary(email: string): Promise<ImpactSummary | undefined> {
  const rows = await query<Record<string, unknown>>(
    `SELECT agents, shipped_agents, tickets, feature_agents, bug_agents, unclassified_agents,
            raw_cost_cents::float8    AS raw_cost_cents,
            feature_cents::float8     AS feature_cents,
            bug_cents::float8         AS bug_cents,
            unshipped_cents::float8   AS unshipped_cents,
            additions, deletions, enriched_agents, unmerged_pr_agents,
            unmerged_pr_cents::float8 AS unmerged_pr_cents
     FROM v_impact_summary WHERE email = $1`,
    [email],
  );

  const row = rows[0];
  if (!row) return undefined;

  return {
    agents: numeric(row.agents),
    shippedAgents: numeric(row.shipped_agents),
    tickets: numeric(row.tickets),
    featureAgents: numeric(row.feature_agents),
    bugAgents: numeric(row.bug_agents),
    unclassifiedAgents: numeric(row.unclassified_agents),
    rawCostCents: numeric(row.raw_cost_cents),
    featureCents: numeric(row.feature_cents),
    bugCents: numeric(row.bug_cents),
    unshippedCents: numeric(row.unshipped_cents),
    additions: numeric(row.additions),
    deletions: numeric(row.deletions),
    enrichedAgents: numeric(row.enriched_agents),
    unmergedPrAgents: numeric(row.unmerged_pr_agents),
    unmergedPrCents: numeric(row.unmerged_pr_cents),
  };
}

export interface TicketImpact {
  ticketKey: string;
  projectKey: string | null;
  ticketType: string | null;
  ticketStatus: string | null;
  summary: string | null;
  workType: string;
  agents: number;
  runs: number;
  rawCostCents: number;
  shippedAgents: number;
  pullRequests: number;
  additions: number;
  deletions: number;
  changedFiles: number;
}

export async function impactByTicket(email: string): Promise<TicketImpact[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT ticket_key, project_key, ticket_type, ticket_status, summary, work_type,
            agents, runs, shipped_agents, pull_requests, additions, deletions, changed_files,
            raw_cost_cents::float8 AS raw_cost_cents
     FROM v_impact_by_ticket
     WHERE email = $1 AND ticket_key <> 'unassigned'
     ORDER BY raw_cost_cents DESC`,
    [email],
  );

  return rows.map((row) => ({
    ticketKey: row.ticket_key as string,
    projectKey: (row.project_key as string) ?? null,
    ticketType: (row.ticket_type as string) ?? null,
    ticketStatus: (row.ticket_status as string) ?? null,
    summary: (row.summary as string) ?? null,
    workType: (row.work_type as string) ?? 'unknown',
    agents: numeric(row.agents),
    runs: numeric(row.runs),
    rawCostCents: numeric(row.raw_cost_cents),
    shippedAgents: numeric(row.shipped_agents),
    pullRequests: numeric(row.pull_requests),
    additions: numeric(row.additions),
    deletions: numeric(row.deletions),
    changedFiles: numeric(row.changed_files),
  }));
}

export interface TypeImpact {
  workType: string;
  agents: number;
  shippedAgents: number;
  rawCostCents: number;
  additions: number;
  deletions: number;
  centsPerShipped: number | null;
}

export async function impactByType(email: string): Promise<TypeImpact[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT work_type, agents, shipped_agents, additions, deletions,
            raw_cost_cents::float8    AS raw_cost_cents,
            cents_per_shipped::float8 AS cents_per_shipped
     FROM v_impact_by_type WHERE email = $1 ORDER BY raw_cost_cents DESC`,
    [email],
  );

  return rows.map((row) => ({
    workType: (row.work_type as string) ?? 'unknown',
    agents: numeric(row.agents),
    shippedAgents: numeric(row.shipped_agents),
    rawCostCents: numeric(row.raw_cost_cents),
    additions: numeric(row.additions),
    deletions: numeric(row.deletions),
    centsPerShipped: nullableNumeric(row.cents_per_shipped),
  }));
}

export interface UnticketedAgent {
  agentId: string;
  agentName: string | null;
  summary: string | null;
  rawCostCents: number;
  runs: number;
  prUrl: string | null;
  prMerged: boolean;
  workType: string;
  createdAt: string | null;
}

export async function unticketedAgents(email: string, limit = 25): Promise<UnticketedAgent[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT agent_id, agent_name, summary, runs, pr_url, work_type,
            raw_cost_cents::float8 AS raw_cost_cents,
            COALESCE(pr_merged, FALSE) AS pr_merged,
            to_char(created_at, 'YYYY-MM-DD') AS created_at
     FROM v_agent_impact
     WHERE email = $1 AND ticket_key IS NULL
     ORDER BY raw_cost_cents DESC
     LIMIT $2`,
    [email, limit],
  );

  return rows.map((row) => ({
    agentId: row.agent_id as string,
    agentName: (row.agent_name as string) ?? null,
    summary: (row.summary as string) ?? null,
    rawCostCents: numeric(row.raw_cost_cents),
    runs: numeric(row.runs),
    prUrl: (row.pr_url as string) ?? null,
    prMerged: Boolean(row.pr_merged),
    workType: (row.work_type as string) ?? 'unknown',
    createdAt: (row.created_at as string) ?? null,
  }));
}

export interface EditorWeek {
  weekStart: string;
  activeDays: number;
  tabsAccepted: number;
  tabAcceptanceRate: number | null;
  acceptedLinesAdded: number;
  chatRequests: number;
  composerRequests: number;
  agentRequests: number;
  cmdkUsages: number;
}

/**
 * In-editor activity, which a personal key cannot see at all: it comes from the Team Admin
 * API ingest. Returns an empty list when this person is not covered by it, and the dashboard
 * says so rather than showing zeros that look like inactivity.
 */
export async function editorWeeks(email: string, weeks = 8): Promise<EditorWeek[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT to_char(week_start, 'YYYY-MM-DD') AS week_start,
            active_days,
            tabs_accepted,
            tab_acceptance_rate::float8 AS tab_acceptance_rate,
            accepted_lines_added,
            chat_requests, composer_requests, agent_requests, cmdk_usages
     FROM v_developer_weekly
     WHERE lower(email) = lower($1) AND week_start >= current_date - ($2 * 7)
     ORDER BY week_start`,
    [email, weeks],
  );

  return rows.map((row) => ({
    weekStart: row.week_start as string,
    activeDays: numeric(row.active_days),
    tabsAccepted: numeric(row.tabs_accepted),
    tabAcceptanceRate: nullableNumeric(row.tab_acceptance_rate),
    acceptedLinesAdded: numeric(row.accepted_lines_added),
    chatRequests: numeric(row.chat_requests),
    composerRequests: numeric(row.composer_requests),
    agentRequests: numeric(row.agent_requests),
    cmdkUsages: numeric(row.cmdk_usages),
  }));
}

export interface RepoActivity {
  repo: string;
  agents: number;
  runs: number;
  pullRequests: number;
  rawCostCents: number;
}

export async function repoActivity(email: string, limit = 8): Promise<RepoActivity[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT repo, agents, runs, pull_requests, raw_cost_cents::float8 AS raw_cost_cents
     FROM v_agent_repo_activity
     WHERE email = $1
     ORDER BY raw_cost_cents DESC NULLS LAST
     LIMIT $2`,
    [email, limit],
  );

  return rows.map((row) => ({
    repo: (row.repo as string) ?? 'unknown',
    agents: numeric(row.agents),
    runs: numeric(row.runs),
    pullRequests: numeric(row.pull_requests),
    rawCostCents: numeric(row.raw_cost_cents),
  }));
}

export interface CursorConnection {
  keyName: string | null;
  connectedAt: Date;
  lastUsedAt: Date | null;
  lastError: string | null;
}

export async function cursorConnection(email: string): Promise<CursorConnection | undefined> {
  const rows = await query<{
    key_name: string | null;
    connected_at: Date;
    last_used_at: Date | null;
    last_error: string | null;
  }>(
    `SELECT key_name, connected_at, last_used_at, last_error
     FROM v_connected_user WHERE email = $1 AND has_key`,
    [email],
  );

  const row = rows[0];
  if (!row) return undefined;
  return {
    keyName: row.key_name,
    connectedAt: row.connected_at,
    lastUsedAt: row.last_used_at,
    lastError: row.last_error,
  };
}
