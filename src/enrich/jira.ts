import { optionalEnv } from '../config';
import { logger } from '../logger';

import { TicketRecord } from './types';

/**
 * Minimal Jira Cloud client: one issue at a time, requesting only the fields that decide
 * work type and summary. Asking for everything would pull entire descriptions and comment
 * threads for no benefit.
 */
export class JiraClient {
  private readonly authHeader: string;
  private readonly baseUrl: string;

  constructor(baseUrl: string, email: string, apiToken: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.authHeader = `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`;
  }

  static fromEnv(): JiraClient | undefined {
    const baseUrl = optionalEnv('JIRA_BASE_URL');
    const email = optionalEnv('JIRA_EMAIL');
    const apiToken = optionalEnv('JIRA_API_TOKEN');
    if (!baseUrl || !email || !apiToken) return undefined;
    return new JiraClient(baseUrl, email, apiToken);
  }

  async getIssue(key: string): Promise<TicketRecord | undefined> {
    const fields = 'summary,issuetype,status,project';
    const response = await fetch(
      `${this.baseUrl}/rest/api/3/issue/${encodeURIComponent(key)}?fields=${fields}`,
      { headers: { Authorization: this.authHeader, Accept: 'application/json' } },
    );

    if (response.status === 404) {
      logger.warn('Jira issue not found', { key });
      return undefined;
    }
    if (!response.ok) {
      throw new Error(`Jira ${response.status} for ${key}: ${(await response.text()).slice(0, 200)}`);
    }

    interface Response {
      key: string;
      fields?: {
        summary?: string;
        issuetype?: { name?: string };
        status?: { name?: string; statusCategory?: { key?: string } };
        project?: { key?: string; name?: string };
      };
    }

    const data = (await response.json()) as Response;
    return {
      key: data.key,
      issueType: data.fields?.issuetype?.name,
      summary: data.fields?.summary,
      status: data.fields?.status?.name,
      statusCategory: data.fields?.status?.statusCategory?.key,
      projectKey: data.fields?.project?.key,
      projectName: data.fields?.project?.name,
    };
  }
}
