import { CursorApiError, CursorClient } from '../client/cursorClient';
import { CloudAgent, CloudAgentRun, CloudAgentUsage } from '../client/types';
import { bulkUpsert } from '../db/bulk';
import { query } from '../db/pool';
import { logger } from '../logger';

import { recordRun } from './runs';

const AGENT_COLUMNS = [
  'id',
  'email',
  'name',
  'status',
  'env_type',
  'env_name',
  'repo_url',
  'agent_url',
  'latest_run_id',
  'created_at',
  'updated_at',
  'input_tokens',
  'output_tokens',
  'cache_write_tokens',
  'cache_read_tokens',
  'total_tokens',
  'raw_cost_cents',
  'charged_cents',
  'usage_fetched_at',
];

const AGENT_CONFLICT = `ON CONFLICT (id) DO UPDATE SET
  name               = EXCLUDED.name,
  status             = EXCLUDED.status,
  env_type           = EXCLUDED.env_type,
  env_name           = EXCLUDED.env_name,
  repo_url           = EXCLUDED.repo_url,
  agent_url          = EXCLUDED.agent_url,
  latest_run_id      = EXCLUDED.latest_run_id,
  updated_at         = EXCLUDED.updated_at,
  input_tokens       = EXCLUDED.input_tokens,
  output_tokens      = EXCLUDED.output_tokens,
  cache_write_tokens = EXCLUDED.cache_write_tokens,
  cache_read_tokens  = EXCLUDED.cache_read_tokens,
  total_tokens       = EXCLUDED.total_tokens,
  raw_cost_cents     = EXCLUDED.raw_cost_cents,
  charged_cents      = EXCLUDED.charged_cents,
  usage_fetched_at   = EXCLUDED.usage_fetched_at,
  ingested_at        = now()`;

const RUN_COLUMNS = [
  'id',
  'agent_id',
  'email',
  'status',
  'created_at',
  'updated_at',
  'duration_ms',
  'repo_url',
  'branch',
  'pr_url',
  'input_tokens',
  'output_tokens',
  'cache_write_tokens',
  'cache_read_tokens',
  'total_tokens',
  'raw_cost_cents',
  'charged_cents',
];

const RUN_CONFLICT = `ON CONFLICT (id) DO UPDATE SET
  status             = EXCLUDED.status,
  updated_at         = EXCLUDED.updated_at,
  duration_ms        = EXCLUDED.duration_ms,
  repo_url           = COALESCE(EXCLUDED.repo_url, cloud_agent_run.repo_url),
  branch             = COALESCE(EXCLUDED.branch, cloud_agent_run.branch),
  pr_url             = COALESCE(EXCLUDED.pr_url, cloud_agent_run.pr_url),
  input_tokens       = EXCLUDED.input_tokens,
  output_tokens      = EXCLUDED.output_tokens,
  cache_write_tokens = EXCLUDED.cache_write_tokens,
  cache_read_tokens  = EXCLUDED.cache_read_tokens,
  total_tokens       = EXCLUDED.total_tokens,
  raw_cost_cents     = EXCLUDED.raw_cost_cents,
  charged_cents      = EXCLUDED.charged_cents,
  ingested_at        = now()`;

export function toAgentRow(agent: CloudAgent, email: string, usage?: CloudAgentUsage): unknown[] {
  const totals = usage?.totalUsage;
  return [
    agent.id,
    email,
    agent.name ?? null,
    agent.status ?? null,
    agent.env?.type ?? null,
    agent.env?.name ?? null,
    agent.repos?.[0]?.url ?? null,
    agent.url ?? null,
    agent.latestRunId ?? null,
    agent.createdAt ?? null,
    agent.updatedAt ?? null,
    totals?.inputTokens ?? 0,
    totals?.outputTokens ?? 0,
    totals?.cacheWriteTokens ?? 0,
    totals?.cacheReadTokens ?? 0,
    totals?.totalTokens ?? 0,
    usage?.cost?.rawCostCents ?? 0,
    usage?.cost?.chargedCents ?? 0,
    usage ? new Date() : null,
  ];
}

export function toRunRow(
  run: CloudAgentRun,
  agentId: string,
  email: string,
  usage?: CloudAgentUsage,
): unknown[] {
  // Per-run token counts live in the usage payload, keyed by run id, not on the run itself.
  const runUsage = usage?.runs?.find((candidate) => candidate.id === run.id);
  const branch = run.git?.branches?.[0];

  return [
    run.id,
    agentId,
    email,
    run.status ?? null,
    run.createdAt ?? null,
    run.updatedAt ?? null,
    run.durationMs ?? null,
    branch?.repoUrl ?? null,
    branch?.branch ?? null,
    branch?.prUrl ?? null,
    runUsage?.usage?.inputTokens ?? 0,
    runUsage?.usage?.outputTokens ?? 0,
    runUsage?.usage?.cacheWriteTokens ?? 0,
    runUsage?.usage?.cacheReadTokens ?? 0,
    runUsage?.usage?.totalTokens ?? 0,
    runUsage?.cost?.rawCostCents ?? 0,
    runUsage?.cost?.chargedCents ?? 0,
  ];
}

export interface AgentIngestResult {
  rows: number;
  agents: number;
  runs: number;
  failures: number;
}

/** Runs tasks with a ceiling on how many are in flight, preserving input order. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await fn(items[index] as T);
    }
  });

  await Promise.all(workers);
  return results;
}

/**
 * Pulls one person's Cloud Agent history: two extra calls per agent, for usage and runs.
 *
 * Those calls go out a few at a time because a person connecting their key waits on this
 * synchronously, and doing forty round trips end to end takes half a minute. A single
 * agent failing must not abandon the rest, since partial history beats none.
 */
export async function ingestCloudAgents(
  client: CursorClient,
  email: string,
  concurrency = 6,
): Promise<AgentIngestResult> {
  return recordRun(`cloud-agents:${email}`, {}, async () => {
    const agents = await client.listAgents();
    logger.info('Fetched cloud agents', { email, count: agents.length });

    let failures = 0;

    const fetched = await mapWithConcurrency(agents, concurrency, async (agent) => {
      const [usage, runs] = await Promise.all([
        client.getAgentUsage(agent.id).catch((error: unknown) => {
          failures += 1;
          logger.warn('Could not fetch agent usage', {
            agentId: agent.id,
            status: error instanceof CursorApiError ? error.status : undefined,
          });
          return undefined as CloudAgentUsage | undefined;
        }),
        client.getAgentRuns(agent.id).catch((error: unknown) => {
          failures += 1;
          logger.warn('Could not fetch agent runs', {
            agentId: agent.id,
            status: error instanceof CursorApiError ? error.status : undefined,
          });
          return [];
        }),
      ]);
      return { agent, usage, runs };
    });

    const agentRows: unknown[][] = [];
    const runRows: unknown[][] = [];

    for (const { agent, usage, runs } of fetched) {
      agentRows.push(toAgentRow(agent, email, usage));
      for (const run of runs) {
        runRows.push(toRunRow(run, agent.id, email, usage));
      }
    }

    const written =
      (await bulkUpsert({
        table: 'cloud_agent',
        columns: AGENT_COLUMNS,
        rows: agentRows,
        conflict: AGENT_CONFLICT,
      })) +
      (await bulkUpsert({
        table: 'cloud_agent_run',
        columns: RUN_COLUMNS,
        rows: runRows,
        conflict: RUN_CONFLICT,
      }));

    await query('UPDATE user_api_key SET last_used_at = now(), last_error = NULL WHERE email = $1', [
      email,
    ]);

    return { rows: written, agents: agentRows.length, runs: runRows.length, failures };
  });
}
