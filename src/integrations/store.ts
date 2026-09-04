import { seal, unseal } from '../crypto';
import { query } from '../db/pool';
import { logger } from '../logger';

/**
 * Custody of each person's GitHub and Jira credentials.
 *
 * These are not a mirror of Cursor's own connectors. Cursor's GitHub App and Jira app are
 * installed in Cursor and cannot be read or created through any API, so this app cannot
 * borrow them: to know whether a pull request merged or what type a ticket is, it needs a
 * credential of its own. That is what these rows are.
 *
 * Everything goes through this module for the same reason as keyStore: one place touches
 * plaintext, callers get either a live client or a masked status, and nothing logs a token.
 */

export type Provider = 'github' | 'jira';

export interface GitHubCredential {
  provider: 'github';
  token: string;
  accountLabel?: string;
  scopes?: string;
}

export interface JiraCredential {
  provider: 'jira';
  token: string;
  baseUrl: string;
  accountEmail: string;
  accountLabel?: string;
}

export type Credential = GitHubCredential | JiraCredential;

export interface IntegrationStatus {
  provider: Provider;
  accountLabel: string | null;
  baseUrl: string | null;
  accountEmail: string | null;
  scopes: string | null;
  connectedAt: Date;
  lastValidatedAt: Date | null;
  lastError: string | null;
}

export async function saveIntegration(email: string, credential: Credential): Promise<void> {
  const sealed = seal(credential.token);
  const isJira = credential.provider === 'jira';

  await query(
    `INSERT INTO user_integration
       (email, provider, account_label, base_url, account_email,
        secret_ciphertext, secret_iv, secret_auth_tag, key_version, scopes, last_validated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
     ON CONFLICT (email, provider) DO UPDATE SET
       account_label     = EXCLUDED.account_label,
       base_url          = EXCLUDED.base_url,
       account_email     = EXCLUDED.account_email,
       secret_ciphertext = EXCLUDED.secret_ciphertext,
       secret_iv         = EXCLUDED.secret_iv,
       secret_auth_tag   = EXCLUDED.secret_auth_tag,
       key_version       = EXCLUDED.key_version,
       scopes            = EXCLUDED.scopes,
       connected_at      = now(),
       last_validated_at = now(),
       last_error        = NULL`,
    [
      email.toLowerCase(),
      credential.provider,
      credential.accountLabel ?? null,
      isJira ? credential.baseUrl : null,
      isJira ? credential.accountEmail : null,
      sealed.ciphertext,
      sealed.iv,
      sealed.authTag,
      sealed.keyVersion,
      credential.provider === 'github' ? (credential.scopes ?? null) : null,
    ],
  );

  logger.info('Saved an integration credential', { email, provider: credential.provider });
}

export async function loadIntegration(
  email: string,
  provider: Provider,
): Promise<Credential | undefined> {
  const rows = await query<{
    base_url: string | null;
    account_email: string | null;
    account_label: string | null;
    scopes: string | null;
    secret_ciphertext: Buffer;
    secret_iv: Buffer;
    secret_auth_tag: Buffer;
    key_version: number;
  }>(
    `SELECT base_url, account_email, account_label, scopes,
            secret_ciphertext, secret_iv, secret_auth_tag, key_version
     FROM user_integration WHERE email = $1 AND provider = $2`,
    [email.toLowerCase(), provider],
  );

  const row = rows[0];
  if (!row) return undefined;

  const token = unseal({
    ciphertext: row.secret_ciphertext,
    iv: row.secret_iv,
    authTag: row.secret_auth_tag,
    keyVersion: row.key_version,
  });

  if (provider === 'jira') {
    // A Jira token is useless without the site and account it belongs to. If either is
    // missing the row predates them or was written wrong, and pretending otherwise would
    // produce a confusing 401 later instead of a clear "not connected" now.
    if (!row.base_url || !row.account_email) return undefined;
    return {
      provider: 'jira',
      token,
      baseUrl: row.base_url,
      accountEmail: row.account_email,
      accountLabel: row.account_label ?? undefined,
    };
  }

  return {
    provider: 'github',
    token,
    accountLabel: row.account_label ?? undefined,
    scopes: row.scopes ?? undefined,
  };
}

export async function removeIntegration(email: string, provider: Provider): Promise<void> {
  await query('DELETE FROM user_integration WHERE email = $1 AND provider = $2', [
    email.toLowerCase(),
    provider,
  ]);
  logger.info('Removed an integration credential', { email, provider });
}

export async function listIntegrations(email: string): Promise<IntegrationStatus[]> {
  const rows = await query<{
    provider: Provider;
    account_label: string | null;
    base_url: string | null;
    account_email: string | null;
    scopes: string | null;
    connected_at: Date;
    last_validated_at: Date | null;
    last_error: string | null;
  }>(
    `SELECT provider, account_label, base_url, account_email, scopes,
            connected_at, last_validated_at, last_error
     FROM user_integration WHERE email = $1 ORDER BY provider`,
    [email.toLowerCase()],
  );

  return rows.map((row) => ({
    provider: row.provider,
    accountLabel: row.account_label,
    baseUrl: row.base_url,
    accountEmail: row.account_email,
    scopes: row.scopes,
    connectedAt: row.connected_at,
    lastValidatedAt: row.last_validated_at,
    lastError: row.last_error,
  }));
}

export async function recordIntegrationError(
  email: string,
  provider: Provider,
  message: string,
): Promise<void> {
  await query(
    'UPDATE user_integration SET last_error = $3 WHERE email = $1 AND provider = $2',
    [email.toLowerCase(), provider, message.slice(0, 500)],
  );
}
