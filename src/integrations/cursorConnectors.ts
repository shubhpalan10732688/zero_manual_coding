import { query } from '../db/pool';

/**
 * Whether Cursor itself has GitHub and Jira wired up — inferred, because it cannot be asked.
 *
 * Cursor's connectors are a GitHub App installed from the Cursor dashboard and a Jira app
 * installed from the Atlassian Marketplace. No endpoint reports either one, and the Admin
 * API covers members, usage, spend and audit events only. So instead of claiming a status
 * we cannot read, this looks at what the connectors leave behind in Cloud Agent data: an
 * agent that has a repository was given one by the GitHub connector, a run that produced a
 * pull request URL pushed through it, and a branch carrying a ticket key came from work
 * that was tracked in Jira.
 *
 * Every result is labelled as inference in the UI, and the setup steps are shown regardless,
 * because "not detected" here means "no evidence yet", not "not connected".
 */

export interface ConnectorCounts {
  agents: number;
  agentsWithRepo: number;
  runs: number;
  runsWithPullRequest: number;
  branchesWithTicketKey: number;
}

export type ConnectorState = 'detected' | 'not-detected' | 'no-data';

export interface ConnectorSignal {
  provider: 'github' | 'jira';
  state: ConnectorState;
  headline: string;
  detail: string;
  evidence: { label: string; value: string }[];
}

/** Separated from the query so the reasoning can be tested without a database. */
export function interpretConnectorSignals(counts: ConnectorCounts): ConnectorSignal[] {
  const noData = counts.agents === 0;

  const github: ConnectorSignal = noData
    ? {
        provider: 'github',
        state: 'no-data',
        headline: 'No evidence either way',
        detail:
          'You have no Cloud Agents yet, so there is nothing to infer from. Run an agent and this will fill in.',
        evidence: [],
      }
    : counts.agentsWithRepo > 0
      ? {
          provider: 'github',
          state: 'detected',
          headline: 'Connected, judging by your agents',
          detail: `${counts.agentsWithRepo} of your ${counts.agents} Cloud Agents were given a repository, which only the Git connector can do.`,
          evidence: [
            { label: 'Agents with a repository', value: `${counts.agentsWithRepo} of ${counts.agents}` },
            { label: 'Runs that opened a pull request', value: String(counts.runsWithPullRequest) },
          ],
        }
      : {
          provider: 'github',
          state: 'not-detected',
          headline: 'No sign of it',
          detail:
            'None of your Cloud Agents carry a repository. Either the Git connector is not set up, or your agents have only ever run without one.',
          evidence: [{ label: 'Agents with a repository', value: `0 of ${counts.agents}` }],
        };

  const jira: ConnectorSignal = noData
    ? {
        provider: 'jira',
        state: 'no-data',
        headline: 'No evidence either way',
        detail: 'Nothing to infer from until you have run a Cloud Agent.',
        evidence: [],
      }
    : counts.branchesWithTicketKey > 0
      ? {
          provider: 'jira',
          state: 'detected',
          headline: 'Ticket keys are reaching your branches',
          detail: `${counts.branchesWithTicketKey} of your runs worked on a branch naming a ticket, so this work is traceable to Jira.`,
          evidence: [
            { label: 'Runs on a ticket branch', value: `${counts.branchesWithTicketKey} of ${counts.runs}` },
          ],
        }
      : {
          provider: 'jira',
          state: 'not-detected',
          headline: 'No ticket keys found',
          detail:
            'No branch or pull request mentions a ticket key, so agent work cannot be tied to Jira issues. That may be the connector, or simply branch naming.',
          evidence: [{ label: 'Runs on a ticket branch', value: `0 of ${counts.runs}` }],
        };

  return [github, jira];
}

export async function connectorCounts(email: string): Promise<ConnectorCounts> {
  const rows = await query<Record<string, string>>(
    `SELECT
       (SELECT COUNT(*) FROM cloud_agent WHERE email = $1)                                  AS agents,
       (SELECT COUNT(*) FROM cloud_agent WHERE email = $1 AND repo_url IS NOT NULL)          AS agents_with_repo,
       (SELECT COUNT(*) FROM cloud_agent_run WHERE email = $1)                               AS runs,
       (SELECT COUNT(*) FROM cloud_agent_run WHERE email = $1 AND pr_url IS NOT NULL)        AS runs_with_pr,
       (SELECT COUNT(*) FROM cloud_agent_run
         WHERE email = $1 AND branch ~ '[A-Z][A-Z0-9]+-[0-9]+')                              AS branches_with_ticket`,
    [email.toLowerCase()],
  );

  const row = rows[0] ?? {};
  return {
    agents: Number(row.agents ?? 0),
    agentsWithRepo: Number(row.agents_with_repo ?? 0),
    runs: Number(row.runs ?? 0),
    runsWithPullRequest: Number(row.runs_with_pr ?? 0),
    branchesWithTicketKey: Number(row.branches_with_ticket ?? 0),
  };
}

export async function inferCursorConnectors(email: string): Promise<ConnectorSignal[]> {
  return interpretConnectorSignals(await connectorCounts(email));
}
