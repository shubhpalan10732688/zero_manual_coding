import { recommend, type ActionInputs } from '../src/insights/actions';

/**
 * The rules decide what a person is told to do about their own spending, so the thresholds
 * are worth pinning down. Two properties matter beyond any individual rule: nothing is
 * recommended without evidence attached, and no recommendation ever claims a saving.
 */

const quiet: ActionInputs = {
  agents: 0,
  runs: 0,
  rawCostCents: 0,
  cacheReuseRate: null,
  coldStartRuns: 0,
  coldStartCents: 0,
  noPrAgents: 0,
  noPrCents: 0,
  unfinishedRuns: 0,
  unfinishedCents: 0,
  costliestAgentShare: null,
  unclassifiedAgents: 0,
  enrichedAgents: 0,
  unmergedPrAgents: 0,
  unmergedPrCents: 0,
  hasGitHub: true,
  hasJira: true,
  achievementsPosted: 1,
  assetsAuthored: 1,
  daysSinceLastAgent: null,
};

const keys = (inputs: Partial<ActionInputs>) =>
  recommend({ ...quiet, ...inputs }).map((action) => action.key);

describe('recommend', () => {
  it('says nothing when there is nothing to say', () => {
    expect(recommend(quiet)).toEqual([]);
  });

  it('flags poor cache reuse once there are enough runs to judge', () => {
    expect(keys({ runs: 20, cacheReuseRate: 0.1, coldStartRuns: 16, coldStartCents: 900 })).toContain(
      'cache-reuse',
    );
  });

  it('does not judge cache reuse from a handful of runs', () => {
    expect(keys({ runs: 3, cacheReuseRate: 0.05 })).not.toContain('cache-reuse');
  });

  it('does not judge cache reuse when there was no cache traffic to measure', () => {
    expect(keys({ runs: 50, cacheReuseRate: null })).not.toContain('cache-reuse');
  });

  it('treats very poor reuse as more urgent than merely poor reuse', () => {
    const bad = recommend({ ...quiet, runs: 20, cacheReuseRate: 0.1 });
    const middling = recommend({ ...quiet, runs: 20, cacheReuseRate: 0.3 });
    expect(bad.find((action) => action.key === 'cache-reuse')!.priority).toBe('high');
    expect(middling.find((action) => action.key === 'cache-reuse')!.priority).toBe('medium');
  });

  it('ignores agents that shipped nothing when they are a small share of spend', () => {
    expect(keys({ agents: 20, rawCostCents: 10000, noPrAgents: 1, noPrCents: 200 })).not.toContain(
      'agents-without-pr',
    );
  });

  it('raises them once they are a material share of spend', () => {
    expect(keys({ agents: 10, rawCostCents: 1000, noPrAgents: 4, noPrCents: 500 })).toContain(
      'agents-without-pr',
    );
  });

  it('ignores a trivial amount of unfinished spend', () => {
    expect(keys({ runs: 10, unfinishedRuns: 1, unfinishedCents: 20 })).not.toContain(
      'unfinished-runs',
    );
  });

  it('asks for GitHub before Jira, since merge state changes more of the product', () => {
    const ordered = keys({ agents: 5, hasGitHub: false, hasJira: false });
    expect(ordered).toContain('connect-github');
    expect(ordered).not.toContain('connect-jira');
  });

  it('asks for Jira once GitHub is connected', () => {
    expect(keys({ agents: 5, hasJira: false, unclassifiedAgents: 5 })).toContain('connect-jira');
  });

  it('points at branch naming when Jira is connected but nothing is attributed', () => {
    expect(keys({ agents: 10, enrichedAgents: 10, unclassifiedAgents: 7 })).toContain(
      'ticket-keys-in-branches',
    );
  });

  it('does not blame branch naming when most work is attributed', () => {
    expect(keys({ agents: 10, enrichedAgents: 10, unclassifiedAgents: 1 })).not.toContain(
      'ticket-keys-in-branches',
    );
  });

  it('treats work waiting on review as high priority, since a reviewer is all it needs', () => {
    const found = recommend({ ...quiet, unmergedPrAgents: 3, unmergedPrCents: 800 });
    expect(found.find((action) => action.key === 'stale-pull-requests')!.priority).toBe('high');
  });

  it('nudges a heavy user who has never written a shared command', () => {
    expect(keys({ runs: 30, assetsAuthored: 0 })).toContain('author-shared-asset');
  });

  it('does not nudge someone who has barely used it', () => {
    expect(keys({ runs: 4, assetsAuthored: 0 })).not.toContain('author-shared-asset');
  });

  it('notes a dormant account without treating it as a problem', () => {
    const found = recommend({ ...quiet, agents: 4, daysSinceLastAgent: 40 });
    expect(found.find((action) => action.key === 'dormant')!.priority).toBe('optimization');
  });

  it('does not call a recent user dormant', () => {
    expect(keys({ agents: 4, daysSinceLastAgent: 3 })).not.toContain('dormant');
  });

  it('orders by priority, then by money already spent', () => {
    const found = recommend({
      ...quiet,
      agents: 12,
      runs: 40,
      rawCostCents: 5000,
      cacheReuseRate: 0.1,
      coldStartCents: 1200,
      noPrAgents: 5,
      noPrCents: 2000,
      unfinishedRuns: 4,
      unfinishedCents: 600,
      unmergedPrAgents: 2,
      unmergedPrCents: 3000,
      costliestAgentShare: 0.6,
    });

    const rank = { critical: 0, high: 1, medium: 2, optimization: 3 };
    for (let index = 1; index < found.length; index += 1) {
      const previous = found[index - 1]!;
      const current = found[index]!;
      expect(rank[previous.priority]).toBeLessThanOrEqual(rank[current.priority]);
      if (previous.priority === current.priority) {
        expect(previous.atStakeCents ?? 0).toBeGreaterThanOrEqual(current.atStakeCents ?? 0);
      }
    }
  });

  it('gives every recommendation a stable key, an action and a basis', () => {
    const found = recommend({
      ...quiet,
      agents: 12,
      runs: 40,
      rawCostCents: 5000,
      cacheReuseRate: 0.1,
      noPrAgents: 5,
      noPrCents: 2000,
      hasGitHub: false,
      hasJira: false,
      achievementsPosted: 0,
      assetsAuthored: 0,
      daysSinceLastAgent: 30,
    });

    expect(found.length).toBeGreaterThan(3);
    expect(new Set(found.map((action) => action.key)).size).toBe(found.length);

    for (const action of found) {
      expect(action.action).toBeTruthy();
      expect(action.title).toBeTruthy();
      expect(['measured', 'inferred']).toContain(action.basis);
      // Every claim has to be traceable to a figure, except the two encouragements that
      // openly rest on an absence rather than on a measurement.
      if (action.basis === 'measured') expect(action.evidence.length).toBeGreaterThan(0);
    }
  });

  it('never reports a negative amount at stake', () => {
    const found = recommend({
      ...quiet,
      agents: 5,
      runs: 20,
      rawCostCents: 100,
      noPrAgents: 5,
      noPrCents: 100,
      unfinishedRuns: 5,
      unfinishedCents: 100,
    });
    for (const action of found) {
      expect(action.atStakeCents ?? 0).toBeGreaterThanOrEqual(0);
    }
  });
});
