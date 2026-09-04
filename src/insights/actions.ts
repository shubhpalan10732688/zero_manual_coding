/**
 * Turning measurements into things worth doing.
 *
 * The concept UI carried a hand-written backlog of recommendations. This replaces it with
 * rules over figures the warehouse actually holds, which imposes two constraints worth
 * stating. Every recommendation names the numbers that produced it, so a reader can
 * disagree with it. And no recommendation claims a saving: what it reports is the cost
 * currently sitting behind the problem, because "you spent $4.10 on agents that never
 * opened a pull request" is a fact, while "you will save $4.10" is a guess about a person's
 * future behaviour.
 *
 * Pure on purpose — no database, no clock — so every threshold is testable.
 */

export type Priority = 'critical' | 'high' | 'medium' | 'optimization';

export interface ActionInputs {
  agents: number;
  runs: number;
  rawCostCents: number;
  /** Cache reads as a share of cache traffic; null when there was none to measure. */
  cacheReuseRate: number | null;
  coldStartRuns: number;
  coldStartCents: number;
  noPrAgents: number;
  noPrCents: number;
  unfinishedRuns: number;
  unfinishedCents: number;
  costliestAgentShare: number | null;
  unclassifiedAgents: number;
  enrichedAgents: number;
  unmergedPrAgents: number;
  unmergedPrCents: number;
  hasGitHub: boolean;
  hasJira: boolean;
  achievementsPosted: number;
  assetsAuthored: number;
  daysSinceLastAgent: number | null;
}

export interface Recommendation {
  /** Stable across renders: it is the key a person's decision is stored against. */
  key: string;
  title: string;
  priority: Priority;
  detail: string;
  evidence: { label: string; value: string }[];
  action: string;
  href?: string;
  /** Cost already spent on the thing being described, not a projected saving. */
  atStakeCents?: number;
  basis: 'measured' | 'inferred';
}

const ORDER: Record<Priority, number> = { critical: 0, high: 1, medium: 2, optimization: 3 };

function money(cents: number): string {
  const amount = cents / 100;
  return amount >= 100 ? `$${Math.round(amount)}` : `$${amount.toFixed(2)}`;
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function recommend(inputs: ActionInputs): Recommendation[] {
  const found: Recommendation[] = [];
  const share = (cents: number) =>
    inputs.rawCostCents > 0 ? cents / inputs.rawCostCents : 0;

  // Cache reuse is the strongest lever a personal key can even see: a run that reads a warm
  // cache costs a fraction of one that writes a cold one.
  if (inputs.runs >= 5 && inputs.cacheReuseRate !== null && inputs.cacheReuseRate < 0.35) {
    found.push({
      key: 'cache-reuse',
      title: 'Your agents keep starting from cold',
      priority: inputs.cacheReuseRate < 0.15 ? 'high' : 'medium',
      detail:
        'Only a small share of your token traffic is cache reads, which means most runs rebuild context they could have inherited. Continuing an existing agent, or narrowing what each run has to read, costs materially less than starting fresh.',
      evidence: [
        { label: 'Cache reuse', value: percent(inputs.cacheReuseRate) },
        { label: 'Cold-start runs', value: `${inputs.coldStartRuns} of ${inputs.runs}` },
        { label: 'Spent on cold starts', value: money(inputs.coldStartCents) },
      ],
      action: 'See which runs started cold',
      href: '/app/impact',
      atStakeCents: inputs.coldStartCents,
      basis: 'measured',
    });
  }

  if (inputs.noPrAgents > 0 && share(inputs.noPrCents) >= 0.15) {
    found.push({
      key: 'agents-without-pr',
      title: 'Some agents cost money and shipped nothing',
      priority: share(inputs.noPrCents) >= 0.4 ? 'high' : 'medium',
      detail:
        'These agents ran but never opened a pull request. Some will be exploration, which is fine and worth knowing the price of. The rest are usually a task that was too vague to finish, and those are the ones worth restating before running again.',
      evidence: [
        { label: 'Agents with no pull request', value: `${inputs.noPrAgents} of ${inputs.agents}` },
        { label: 'Cost', value: money(inputs.noPrCents) },
        { label: 'Share of your spend', value: percent(share(inputs.noPrCents)) },
      ],
      action: 'Review them',
      href: '/app/impact',
      atStakeCents: inputs.noPrCents,
      basis: 'measured',
    });
  }

  if (inputs.unfinishedRuns > 0 && inputs.unfinishedCents > 50) {
    found.push({
      key: 'unfinished-runs',
      title: 'Runs that stopped without finishing',
      priority: 'medium',
      detail:
        'A run that ends in any state other than finished still consumed tokens. A few are normal; a pattern usually points at a task that needs breaking up or a repository the agent could not build.',
      evidence: [
        { label: 'Unfinished runs', value: `${inputs.unfinishedRuns} of ${inputs.runs}` },
        { label: 'Cost', value: money(inputs.unfinishedCents) },
      ],
      action: 'Look at the failures',
      href: '/app/impact',
      atStakeCents: inputs.unfinishedCents,
      basis: 'measured',
    });
  }

  if (inputs.costliestAgentShare !== null && inputs.costliestAgentShare >= 0.4 && inputs.agents >= 3) {
    found.push({
      key: 'concentrated-spend',
      title: 'One agent accounts for most of your spend',
      priority: 'optimization',
      detail:
        'A single long-lived agent carrying a whole project keeps re-reading everything it has already seen. Splitting it at natural boundaries usually costs less in total and makes each result easier to review.',
      evidence: [
        { label: 'Largest agent', value: `${percent(inputs.costliestAgentShare)} of spend` },
        { label: 'Agents', value: String(inputs.agents) },
      ],
      action: 'See the breakdown',
      href: '/app/impact',
      basis: 'measured',
    });
  }

  // Connections come after cost signals: they are cheap to fix, but they change what the
  // rest of the dashboard is able to tell you, so they are never the loudest item.
  if (!inputs.hasGitHub) {
    found.push({
      key: 'connect-github',
      title: 'Connect GitHub so shipped work can be told from abandoned',
      priority: inputs.agents > 0 ? 'high' : 'medium',
      detail:
        'Cursor reports that an agent ran and what it cost. Whether the pull request it opened was merged lives in GitHub. Without that, every agent looks equally successful.',
      evidence: [{ label: 'Agents awaiting a merge status', value: String(inputs.agents) }],
      action: 'Connect GitHub',
      href: '/app/connections',
      basis: 'measured',
    });
  }

  if (!inputs.hasJira && inputs.hasGitHub) {
    found.push({
      key: 'connect-jira',
      title: 'Connect Jira to see what kind of work your agents do',
      priority: 'medium',
      detail:
        'Ticket type is the organisation\'s own answer to whether something was a feature or a fix. With Jira connected, cost splits by work type instead of sitting in one bucket.',
      evidence: [{ label: 'Agents with no ticket type', value: String(inputs.unclassifiedAgents) }],
      action: 'Connect Jira',
      href: '/app/connections',
      basis: 'measured',
    });
  }

  if (
    inputs.hasJira &&
    inputs.enrichedAgents > 0 &&
    inputs.unclassifiedAgents / Math.max(inputs.enrichedAgents, 1) >= 0.4
  ) {
    found.push({
      key: 'ticket-keys-in-branches',
      title: 'Most of your agent work cannot be traced to a ticket',
      priority: 'medium',
      detail:
        'Work is matched to a ticket by finding its key in a branch name or pull request title. Where neither carries one, the cost stays unattributed however good the connection is. Naming branches after the ticket fixes it for everything you run afterwards.',
      evidence: [
        {
          label: 'Unattributed agents',
          value: `${inputs.unclassifiedAgents} of ${inputs.enrichedAgents}`,
        },
      ],
      action: 'See unattributed work',
      href: '/app/impact',
      basis: 'measured',
    });
  }

  if (inputs.unmergedPrAgents > 0 && inputs.unmergedPrCents > 100) {
    found.push({
      key: 'stale-pull-requests',
      title: 'Pull requests are open but not merged',
      priority: 'high',
      detail:
        'The work is done and paid for and is sitting in review. This is the cheapest value on the board to recover, because it needs a reviewer rather than another agent run.',
      evidence: [
        { label: 'Agents waiting on a merge', value: String(inputs.unmergedPrAgents) },
        { label: 'Cost already spent', value: money(inputs.unmergedPrCents) },
      ],
      action: 'See the open ones',
      href: '/app/impact',
      atStakeCents: inputs.unmergedPrCents,
      basis: 'measured',
    });
  }

  if (inputs.assetsAuthored === 0 && inputs.runs >= 10) {
    found.push({
      key: 'author-shared-asset',
      title: 'Turn something you repeat into a shared command',
      priority: 'optimization',
      detail:
        'You have run enough agents to have a house style by now. Whatever you retype every time — the review checklist, the test scaffold, the migration steps — is worth writing down once where the rest of the team can take it.',
      evidence: [{ label: 'Your runs', value: String(inputs.runs) }],
      action: 'Write a command',
      href: '/app/library/new?kind=command',
      basis: 'inferred',
    });
  }

  if (inputs.achievementsPosted === 0 && inputs.agents > 0) {
    found.push({
      key: 'post-achievement',
      title: 'Put one delivery on the Zero Manual Coding Board',
      priority: 'optimization',
      detail:
        'Cost and merge state say what happened, not what it was worth. A short write-up of one piece of work, with the time it saved, is the only place that number can come from.',
      evidence: [{ label: 'Your posts', value: '0' }],
      action: 'Add a post',
      href: '/app/board/new',
      basis: 'inferred',
    });
  }

  if (inputs.daysSinceLastAgent !== null && inputs.daysSinceLastAgent >= 21) {
    found.push({
      key: 'dormant',
      title: 'No Cloud Agent has run in a while',
      priority: 'optimization',
      detail:
        'Nothing is wrong with this — most work still happens in the editor, which a personal key cannot see. It is worth flagging only because everything else on this page goes stale with it.',
      evidence: [{ label: 'Days since last agent', value: String(inputs.daysSinceLastAgent) }],
      action: 'See what is possible',
      href: '/app/resources',
      basis: 'measured',
    });
  }

  return found.sort((a, b) => {
    const byPriority = ORDER[a.priority] - ORDER[b.priority];
    if (byPriority !== 0) return byPriority;
    return (b.atStakeCents ?? 0) - (a.atStakeCents ?? 0);
  });
}
