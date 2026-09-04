import fs from 'node:fs';

import { logger } from '../logger';

import { GitHubClient } from './github';
import { JiraClient } from './jira';
import { EnrichmentSource, PullRequestRecord, TicketRecord } from './types';

/** Live GitHub and Jira, either of which may be unconfigured. */
export class ApiSource implements EnrichmentSource {
  readonly name: string;

  constructor(
    private readonly github?: GitHubClient,
    private readonly jira?: JiraClient,
  ) {
    this.name = [github ? 'github' : undefined, jira ? 'jira' : undefined]
      .filter(Boolean)
      .join('+') || 'none';
  }

  static fromEnv(): ApiSource {
    return new ApiSource(GitHubClient.fromEnv(), JiraClient.fromEnv());
  }

  async getPullRequest(repo: string, number: number): Promise<PullRequestRecord | undefined> {
    return this.github?.getPullRequest(repo, number);
  }

  async getTicket(key: string): Promise<TicketRecord | undefined> {
    return this.jira?.getIssue(key);
  }
}

export interface EnrichmentExport {
  pullRequests?: PullRequestRecord[];
  tickets?: TicketRecord[];
}

/**
 * Records exported earlier and replayed from disk.
 *
 * Corporate networks routinely block a server from reaching GitHub or Jira directly even
 * when a person can. Rather than making enrichment impossible there, the same records can
 * be collected elsewhere and imported, and the rest of the pipeline cannot tell.
 */
export class FileSource implements EnrichmentSource {
  readonly name = 'file';
  private readonly pullRequests = new Map<string, PullRequestRecord>();
  private readonly tickets = new Map<string, TicketRecord>();

  constructor(data: EnrichmentExport) {
    for (const pr of data.pullRequests ?? []) {
      this.pullRequests.set(`${pr.repo}#${pr.number}`, pr);
    }
    for (const ticket of data.tickets ?? []) {
      this.tickets.set(ticket.key.toUpperCase(), ticket);
    }
    logger.info('Loaded enrichment export', {
      pullRequests: this.pullRequests.size,
      tickets: this.tickets.size,
    });
  }

  static fromFile(path: string): FileSource {
    return new FileSource(JSON.parse(fs.readFileSync(path, 'utf8')) as EnrichmentExport);
  }

  async getPullRequest(repo: string, number: number): Promise<PullRequestRecord | undefined> {
    return this.pullRequests.get(`${repo}#${number}`);
  }

  async getTicket(key: string): Promise<TicketRecord | undefined> {
    return this.tickets.get(key.toUpperCase());
  }
}

/** Tries each source in order, so a file can fill gaps the APIs cannot reach. */
export class ChainedSource implements EnrichmentSource {
  readonly name: string;

  constructor(private readonly sources: EnrichmentSource[]) {
    this.name = sources.map((source) => source.name).join(' then ');
  }

  async getPullRequest(repo: string, number: number): Promise<PullRequestRecord | undefined> {
    for (const source of this.sources) {
      const found = await source.getPullRequest(repo, number);
      if (found) return found;
    }
    return undefined;
  }

  async getTicket(key: string): Promise<TicketRecord | undefined> {
    for (const source of this.sources) {
      const found = await source.getTicket(key);
      if (found) return found;
    }
    return undefined;
  }
}
