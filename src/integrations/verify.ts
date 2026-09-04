import { optionalEnv } from '../config';

/**
 * Proving a pasted credential works, before it is stored.
 *
 * A token that is saved without being tried looks connected and fails silently hours later
 * during enrichment, where nobody is watching. So each provider is asked who the token
 * belongs to, and the answer is shown back to the person: seeing your own GitHub login or
 * Jira display name is how you know you pasted the right thing.
 */

export class CredentialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CredentialError';
  }
}

export interface GitHubAccount {
  login: string;
  name?: string;
  /** Classic tokens report their scopes in a header; fine-grained tokens report none. */
  scopes?: string;
}

export async function verifyGitHubToken(token: string): Promise<GitHubAccount> {
  const base = (optionalEnv('GITHUB_API_URL', 'https://api.github.com') as string).replace(/\/$/, '');

  let response: Response;
  try {
    response = await fetch(`${base}/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
  } catch (error) {
    throw new CredentialError(`Could not reach GitHub: ${(error as Error).message}`);
  }

  if (response.status === 401) {
    throw new CredentialError('GitHub rejected that token. It may be expired or revoked.');
  }
  if (!response.ok) {
    throw new CredentialError(`GitHub returned ${response.status} when checking the token.`);
  }

  const account = (await response.json()) as { login?: string; name?: string };
  if (!account.login) {
    throw new CredentialError('GitHub accepted the token but named no account.');
  }

  const scopes = response.headers.get('x-oauth-scopes')?.trim();
  return {
    login: account.login,
    name: account.name ?? undefined,
    scopes: scopes ? scopes : undefined,
  };
}

export interface JiraAccount {
  accountId: string;
  displayName: string;
  emailAddress?: string;
}

/** Accepts a site with or without a scheme, since people paste both. */
export function normaliseJiraBaseUrl(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, '');
  if (!trimmed) throw new CredentialError('Enter your Jira site, e.g. https://acme.atlassian.net');
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new CredentialError('That Jira site is not a valid URL.');
  }
  return `${url.protocol}//${url.host}`;
}

export async function verifyJiraCredentials(
  baseUrlInput: string,
  accountEmail: string,
  token: string,
): Promise<{ account: JiraAccount; baseUrl: string }> {
  const baseUrl = normaliseJiraBaseUrl(baseUrlInput);
  const authHeader = `Basic ${Buffer.from(`${accountEmail.trim()}:${token}`).toString('base64')}`;

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/rest/api/3/myself`, {
      headers: { Authorization: authHeader, Accept: 'application/json' },
    });
  } catch (error) {
    throw new CredentialError(`Could not reach ${baseUrl}: ${(error as Error).message}`);
  }

  if (response.status === 401 || response.status === 403) {
    throw new CredentialError(
      'Jira rejected those details. Check the email matches the account the token was created on.',
    );
  }
  if (!response.ok) {
    throw new CredentialError(`Jira returned ${response.status} when checking the token.`);
  }

  const account = (await response.json()) as {
    accountId?: string;
    displayName?: string;
    emailAddress?: string;
  };
  if (!account.accountId) {
    throw new CredentialError('Jira accepted the token but named no account.');
  }

  return {
    account: {
      accountId: account.accountId,
      displayName: account.displayName ?? accountEmail,
      emailAddress: account.emailAddress,
    },
    baseUrl,
  };
}
