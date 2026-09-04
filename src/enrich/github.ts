import { optionalEnv } from '../config';
import { logger } from '../logger';

import { PullRequestRecord } from './types';

/**
 * Minimal GitHub REST client: one pull request at a time, which is all enrichment needs.
 *
 * Deliberately not a dependency on Octokit. This makes two field-limited GET requests and
 * the surface is small enough that the maintenance cost of a client library outweighs it.
 */
export class GitHubClient {
  private readonly token: string;
  private readonly baseUrl: string;

  constructor(token: string, baseUrl = optionalEnv('GITHUB_API_URL', 'https://api.github.com')!) {
    this.token = token;
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  static fromEnv(): GitHubClient | undefined {
    const token = optionalEnv('GITHUB_TOKEN');
    if (!token) return undefined;
    return new GitHubClient(token);
  }

  private async request<T>(path: string): Promise<T | undefined> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (response.status === 404) return undefined;
    if (response.status === 403 || response.status === 429) {
      // Secondary rate limits are common on PR reads; the caller can retry the job later.
      throw new Error(`GitHub rate limit or access denied for ${path}`);
    }
    if (!response.ok) {
      throw new Error(`GitHub ${response.status} for ${path}: ${(await response.text()).slice(0, 200)}`);
    }
    return (await response.json()) as T;
  }

  async getPullRequest(repo: string, number: number): Promise<PullRequestRecord | undefined> {
    interface Response {
      number: number;
      title?: string;
      body?: string;
      html_url?: string;
      state?: string;
      merged?: boolean;
      merged_at?: string;
      user?: { login?: string };
      additions?: number;
      deletions?: number;
      changed_files?: number;
      head?: { ref?: string };
    }

    const data = await this.request<Response>(`/repos/${repo}/pulls/${number}`);
    if (!data) {
      logger.warn('Pull request not found', { repo, number });
      return undefined;
    }

    return {
      repo,
      number: data.number,
      title: data.title,
      body: data.body,
      url: data.html_url,
      state: data.state,
      merged: data.merged,
      mergedAt: data.merged_at,
      author: data.user?.login,
      additions: data.additions,
      deletions: data.deletions,
      changedFiles: data.changed_files,
      headBranch: data.head?.ref,
    };
  }
}

/** `https://github.com/owner/name` and `github.com/owner/name` both yield `owner/name`. */
export function toRepoSlug(repoUrl: string | null | undefined): string | undefined {
  if (!repoUrl) return undefined;
  const match = repoUrl.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/([^/]+\/[^/#?]+)/);
  return match?.[1]?.replace(/\.git$/, '');
}

/** Pull request URLs end in the number, which is the only part the API needs. */
export function toPullNumber(prUrl: string | null | undefined): number | undefined {
  const match = prUrl?.match(/\/pull\/(\d+)/);
  return match ? Number(match[1]) : undefined;
}
