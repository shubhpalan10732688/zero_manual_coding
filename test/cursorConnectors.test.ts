import { interpretConnectorSignals } from '../src/integrations/cursorConnectors';

/**
 * Cursor's connectors cannot be read through any API, so this reasoning is all the product
 * has. The property that matters most is the one about honesty: with no agent data the answer
 * must be "no evidence", never "not connected".
 */

const counts = {
  agents: 0,
  agentsWithRepo: 0,
  runs: 0,
  runsWithPullRequest: 0,
  branchesWithTicketKey: 0,
};

const signalFor = (provider: 'github' | 'jira', overrides: Partial<typeof counts>) =>
  interpretConnectorSignals({ ...counts, ...overrides }).find(
    (signal) => signal.provider === provider,
  )!;

describe('interpretConnectorSignals', () => {
  it('reports both providers, always in the same order', () => {
    const signals = interpretConnectorSignals(counts);
    expect(signals.map((signal) => signal.provider)).toEqual(['github', 'jira']);
  });

  it('says there is no evidence when no agent has ever run', () => {
    expect(signalFor('github', {}).state).toBe('no-data');
    expect(signalFor('jira', {}).state).toBe('no-data');
  });

  it('offers no evidence chips when there is nothing to evidence', () => {
    expect(signalFor('github', {}).evidence).toEqual([]);
  });

  it('detects the Git connector from an agent that was given a repository', () => {
    const signal = signalFor('github', { agents: 4, agentsWithRepo: 3 });
    expect(signal.state).toBe('detected');
    expect(signal.evidence[0]).toEqual({
      label: 'Agents with a repository',
      value: '3 of 4',
    });
  });

  it('reports no sign of it when agents exist but none has a repository', () => {
    expect(signalFor('github', { agents: 4 }).state).toBe('not-detected');
  });

  it('detects Jira from a ticket key in a branch', () => {
    const signal = signalFor('jira', { agents: 2, runs: 6, branchesWithTicketKey: 4 });
    expect(signal.state).toBe('detected');
    expect(signal.evidence[0]!.value).toBe('4 of 6');
  });

  it('reports no ticket keys when none were found', () => {
    expect(signalFor('jira', { agents: 2, runs: 6 }).state).toBe('not-detected');
  });

  it('judges the two providers independently', () => {
    const signals = interpretConnectorSignals({
      ...counts,
      agents: 3,
      agentsWithRepo: 3,
      runs: 5,
    });
    expect(signals[0]!.state).toBe('detected');
    expect(signals[1]!.state).toBe('not-detected');
  });

  it('always explains itself', () => {
    for (const overrides of [{}, { agents: 3 }, { agents: 3, agentsWithRepo: 3, runs: 4, branchesWithTicketKey: 2 }]) {
      for (const signal of interpretConnectorSignals({ ...counts, ...overrides })) {
        expect(signal.headline).toBeTruthy();
        expect(signal.detail.length).toBeGreaterThan(20);
      }
    }
  });
});
