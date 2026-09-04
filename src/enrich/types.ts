export interface PullRequestRecord {
  repo: string;
  number: number;
  title?: string;
  body?: string;
  url?: string;
  state?: string;
  merged?: boolean;
  mergedAt?: string;
  author?: string;
  additions?: number;
  deletions?: number;
  changedFiles?: number;
  headBranch?: string;
}

export interface TicketRecord {
  key: string;
  issueType?: string;
  summary?: string;
  status?: string;
  statusCategory?: string;
  projectKey?: string;
  projectName?: string;
}

/**
 * Where enrichment comes from. Implemented against live GitHub and Jira, and against a
 * file of previously exported records for networks where the app cannot reach either.
 */
export interface EnrichmentSource {
  readonly name: string;
  getPullRequest(repo: string, number: number): Promise<PullRequestRecord | undefined>;
  getTicket(key: string): Promise<TicketRecord | undefined>;
}
