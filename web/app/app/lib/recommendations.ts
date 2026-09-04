import { query } from '@core/db/pool';
import { recommend, Recommendation, ActionInputs, Priority } from '@core/insights/actions';

import { connectionState } from './connections';
import { impactSummary, lifetimeSummary, wasteSummary } from './metrics';

/**
 * Assembling the inputs the recommendation rules need, and carrying the reader's decision
 * about each one.
 *
 * The recommendations themselves are recomputed on every load rather than stored, so a
 * problem that a person fixed stops appearing without anyone marking it fixed. What is
 * stored is only their answer to one: working on it, done, or not now. A dismissed item
 * still exists — it moves to the bottom of the page rather than vanishing, because a
 * recommendation that reappears from nowhere is worse than one that stayed visible.
 */

export type ActionStatus = 'open' | 'doing' | 'done' | 'dismissed';

export interface TrackedAction extends Recommendation {
  status: ActionStatus;
  note: string | null;
  updatedAt: Date | null;
}

export interface ActionBoard {
  actions: TrackedAction[];
  open: TrackedAction[];
  parked: TrackedAction[];
  atStakeCents: number;
  byPriority: Record<Priority, number>;
}

async function actionInputs(email: string): Promise<ActionInputs> {
  const [lifetime, waste, impact, connections, authored] = await Promise.all([
    lifetimeSummary(email),
    wasteSummary(email),
    impactSummary(email),
    connectionState(email),
    authoringCounts(email),
  ]);

  return {
    agents: lifetime?.agents ?? 0,
    runs: lifetime?.runs ?? 0,
    rawCostCents: lifetime?.rawCostCents ?? 0,
    cacheReuseRate: lifetime?.cacheReuseRate ?? null,
    coldStartRuns: waste?.coldStartRuns ?? 0,
    coldStartCents: waste?.coldStartCents ?? 0,
    noPrAgents: waste?.noPrAgents ?? 0,
    noPrCents: waste?.noPrCents ?? 0,
    unfinishedRuns: waste?.unfinishedRuns ?? 0,
    unfinishedCents: waste?.unfinishedCents ?? 0,
    costliestAgentShare: waste?.costliestAgentShare ?? null,
    unclassifiedAgents: impact?.unclassifiedAgents ?? 0,
    enrichedAgents: impact?.enrichedAgents ?? 0,
    unmergedPrAgents: impact?.unmergedPrAgents ?? 0,
    unmergedPrCents: impact?.unmergedPrCents ?? 0,
    hasGitHub: Boolean(connections.github),
    hasJira: Boolean(connections.jira),
    achievementsPosted: authored.achievements,
    assetsAuthored: authored.assets,
    daysSinceLastAgent: lifetime?.daysSinceLastAgent ?? null,
  };
}

async function authoringCounts(email: string): Promise<{ achievements: number; assets: number }> {
  const rows = await query<{ achievements: number; assets: number }>(
    `SELECT (SELECT COUNT(*)::int FROM achievement
              WHERE author_email = $1 AND status = 'published') AS achievements,
            (SELECT COUNT(*)::int FROM shared_asset
              WHERE author_email = $1 AND status = 'published') AS assets`,
    [email],
  );
  return { achievements: rows[0]?.achievements ?? 0, assets: rows[0]?.assets ?? 0 };
}

export async function actionBoard(email: string): Promise<ActionBoard> {
  const [inputs, states] = await Promise.all([actionInputs(email), loadStates(email)]);

  const actions: TrackedAction[] = recommend(inputs).map((action) => {
    const state = states.get(action.key);
    return {
      ...action,
      status: state?.status ?? 'open',
      note: state?.note ?? null,
      updatedAt: state?.updatedAt ?? null,
    };
  });

  const open = actions.filter((action) => action.status === 'open' || action.status === 'doing');
  const parked = actions.filter((action) => action.status === 'done' || action.status === 'dismissed');

  const byPriority: Record<Priority, number> = { critical: 0, high: 0, medium: 0, optimization: 0 };
  for (const action of open) byPriority[action.priority] += 1;

  return {
    actions,
    open,
    parked,
    atStakeCents: open.reduce((sum, action) => sum + (action.atStakeCents ?? 0), 0),
    byPriority,
  };
}

interface StoredState {
  status: ActionStatus;
  note: string | null;
  updatedAt: Date;
}

async function loadStates(email: string): Promise<Map<string, StoredState>> {
  const rows = await query<{
    action_key: string;
    status: ActionStatus;
    note: string | null;
    updated_at: Date;
  }>('SELECT action_key, status, note, updated_at FROM action_state WHERE email = $1', [email]);

  return new Map(
    rows.map((row) => [row.action_key, { status: row.status, note: row.note, updatedAt: row.updated_at }]),
  );
}

export async function setActionStatus(
  email: string,
  actionKey: string,
  status: ActionStatus,
  note?: string,
): Promise<void> {
  await query(
    `INSERT INTO action_state (email, action_key, status, note)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email, action_key)
     DO UPDATE SET status = EXCLUDED.status, note = EXCLUDED.note, updated_at = now()`,
    [email, actionKey, status, note ?? null],
  );
}

/** Counts the shell badge needs, without building the whole board. */
export async function openActionCount(email: string): Promise<number> {
  const board = await actionBoard(email);
  return board.open.length;
}
