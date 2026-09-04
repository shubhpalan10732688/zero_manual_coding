import { GitHubClient } from '../enrich/github';
import { enrichUser, EnrichResult } from '../enrich/index';
import { JiraClient } from '../enrich/jira';
import { ApiSource } from '../enrich/sources';
import { logger } from '../logger';

import { loadIntegration, recordIntegrationError } from './store';

/**
 * Turning a person's stored credentials into the clients enrichment already knows how to
 * use. The enrichment pipeline takes its source as an argument precisely so it can run on
 * behalf of one person with one person's access, rather than needing a service account
 * that can see every repository in the organisation.
 */

export interface UserSource {
  source: ApiSource;
  hasGitHub: boolean;
  hasJira: boolean;
}

export async function sourceFor(email: string): Promise<UserSource> {
  const [github, jira] = await Promise.all([
    loadIntegration(email, 'github'),
    loadIntegration(email, 'jira'),
  ]);

  const githubClient =
    github?.provider === 'github' ? new GitHubClient(github.token) : undefined;
  const jiraClient =
    jira?.provider === 'jira'
      ? new JiraClient(jira.baseUrl, jira.accountEmail, jira.token)
      : undefined;

  return {
    source: new ApiSource(githubClient, jiraClient),
    hasGitHub: Boolean(githubClient),
    hasJira: Boolean(jiraClient),
  };
}

/**
 * Joins one person's agents to their pull requests and tickets. Returns undefined when they
 * have connected neither system, because running with no source would rewrite every row to
 * say "unclassified" and look like a regression rather than a missing credential.
 */
export async function enrichForUser(email: string): Promise<EnrichResult | undefined> {
  const { source, hasGitHub, hasJira } = await sourceFor(email);
  if (!hasGitHub && !hasJira) return undefined;

  try {
    return await enrichUser(email, source);
  } catch (error) {
    const message = (error as Error).message ?? 'enrichment failed';
    logger.warn('Enrichment failed for user', { email, error: message });
    if (hasGitHub) await recordIntegrationError(email, 'github', message);
    if (hasJira) await recordIntegrationError(email, 'jira', message);
    throw error;
  }
}
