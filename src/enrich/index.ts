import { bulkUpsert } from '../db/bulk';
import { query } from '../db/pool';
import { logger } from '../logger';

import {
  chooseSummary,
  classifyWork,
  extractTicketKeysLoose,
} from './classify';
import { toPullNumber, toRepoSlug } from './github';
import { EnrichmentSource, PullRequestRecord, TicketRecord } from './types';

const COLUMNS = [
  'agent_id',
  'email',
  'pr_number',
  'pr_url',
  'pr_title',
  'pr_state',
  'pr_merged',
  'pr_merged_at',
  'pr_author',
  'additions',
  'deletions',
  'changed_files',
  'ticket_key',
  'ticket_type',
  'ticket_summary',
  'ticket_status',
  'ticket_status_category',
  'project_key',
  'project_name',
  'work_type',
  'work_type_source',
  'summary',
  'summary_source',
];

const CONFLICT = `ON CONFLICT (agent_id) DO UPDATE SET
  pr_number              = EXCLUDED.pr_number,
  pr_url                 = EXCLUDED.pr_url,
  pr_title               = EXCLUDED.pr_title,
  pr_state               = EXCLUDED.pr_state,
  pr_merged              = EXCLUDED.pr_merged,
  pr_merged_at           = EXCLUDED.pr_merged_at,
  pr_author              = EXCLUDED.pr_author,
  additions              = EXCLUDED.additions,
  deletions              = EXCLUDED.deletions,
  changed_files          = EXCLUDED.changed_files,
  ticket_key             = EXCLUDED.ticket_key,
  ticket_type            = EXCLUDED.ticket_type,
  ticket_summary         = EXCLUDED.ticket_summary,
  ticket_status          = EXCLUDED.ticket_status,
  ticket_status_category = EXCLUDED.ticket_status_category,
  project_key            = EXCLUDED.project_key,
  project_name           = EXCLUDED.project_name,
  work_type              = EXCLUDED.work_type,
  work_type_source       = EXCLUDED.work_type_source,
  summary                = EXCLUDED.summary,
  summary_source         = EXCLUDED.summary_source,
  enriched_at            = now()`;

interface AgentRow {
  id: string;
  email: string;
  name: string | null;
  repo_url: string | null;
  pr_urls: string[];
  branches: string[];
}

export interface EnrichResult {
  rows: number;
  agents: number;
  withPullRequest: number;
  withTicket: number;
  classified: number;
}

/**
 * Joins each agent to the pull request it opened and the ticket that PR referenced.
 *
 * Enrichment is best-effort by design: an agent with no PR still gets a row, marked
 * unclassified, because "half your agents shipped nothing identifiable" is a finding
 * rather than a gap to be papered over.
 */
export async function enrichUser(
  email: string,
  source: EnrichmentSource,
): Promise<EnrichResult> {
  const agents = await query<AgentRow>(
    `SELECT a.id, a.email, a.name, a.repo_url,
            array_remove(array_agg(DISTINCT r.pr_url), NULL) AS pr_urls,
            array_remove(array_agg(DISTINCT r.branch), NULL) AS branches
     FROM cloud_agent a
     LEFT JOIN cloud_agent_run r ON r.agent_id = a.id
     WHERE a.email = $1
     GROUP BY a.id`,
    [email],
  );

  const ticketCache = new Map<string, TicketRecord | undefined>();
  const rows: unknown[][] = [];
  const result: EnrichResult = {
    rows: 0,
    agents: agents.length,
    withPullRequest: 0,
    withTicket: 0,
    classified: 0,
  };

  for (const agent of agents) {
    const repo = toRepoSlug(agent.repo_url);
    const prNumber = agent.pr_urls.map(toPullNumber).find((value) => value !== undefined);

    let pr: PullRequestRecord | undefined;
    if (repo && prNumber !== undefined) {
      try {
        pr = await source.getPullRequest(repo, prNumber);
      } catch (error) {
        logger.warn('Pull request lookup failed', {
          repo,
          prNumber,
          error: (error as Error).message,
        });
      }
    }
    if (pr) result.withPullRequest += 1;

    const branch = pr?.headBranch ?? agent.branches[0];
    const ticketKey = extractTicketKeysLoose(pr?.title, branch, agent.name ?? undefined)[0];

    let ticket: TicketRecord | undefined;
    if (ticketKey) {
      if (!ticketCache.has(ticketKey)) {
        try {
          ticketCache.set(ticketKey, await source.getTicket(ticketKey));
        } catch (error) {
          logger.warn('Ticket lookup failed', { ticketKey, error: (error as Error).message });
          ticketCache.set(ticketKey, undefined);
        }
      }
      ticket = ticketCache.get(ticketKey);
      if (ticket) result.withTicket += 1;
    }

    const classification = classifyWork({
      jiraIssueType: ticket?.issueType,
      prTitle: pr?.title,
      branch,
    });
    if (classification.workType !== 'unknown') result.classified += 1;

    const summary = chooseSummary({
      ticketSummary: ticket?.summary,
      prTitle: pr?.title,
      agentName: agent.name ?? undefined,
    });

    rows.push([
      agent.id,
      email,
      pr?.number ?? prNumber ?? null,
      pr?.url ?? agent.pr_urls[0] ?? null,
      pr?.title ?? null,
      pr?.state ?? null,
      pr?.merged ?? null,
      pr?.mergedAt ?? null,
      pr?.author ?? null,
      pr?.additions ?? null,
      pr?.deletions ?? null,
      pr?.changedFiles ?? null,
      // Keep the key even when the lookup failed: it still identifies the work.
      ticket?.key ?? ticketKey ?? null,
      ticket?.issueType ?? null,
      ticket?.summary ?? null,
      ticket?.status ?? null,
      ticket?.statusCategory ?? null,
      ticket?.projectKey ?? null,
      ticket?.projectName ?? null,
      classification.workType,
      classification.source,
      summary.summary ?? null,
      summary.source,
    ]);
  }

  result.rows = await bulkUpsert({
    table: 'agent_work_item',
    columns: COLUMNS,
    rows,
    conflict: CONFLICT,
  });

  logger.info('Enriched agents', { email, source: source.name, ...result });
  return result;
}
