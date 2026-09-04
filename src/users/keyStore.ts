import { ApiKeyIdentity, CursorApiError, CursorClient } from '../client/cursorClient';
import { fingerprint, looksLikeCursorKey, maskKey, seal, unseal } from '../crypto';
import { query } from '../db/pool';
import { logger } from '../logger';

/**
 * Custody of connected users' Cursor keys.
 *
 * Every path in and out of the database goes through here so there is exactly one place
 * that touches plaintext. Nothing in this module logs a key, and callers get either a
 * live client or a masked display string, never the raw value.
 */

export class InvalidKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidKeyError';
  }
}

export interface ConnectedUser {
  email: string;
  firstName?: string;
  lastName?: string;
  keyName?: string;
  connectedAt: Date;
  lastValidatedAt?: Date;
  lastUsedAt?: Date;
  lastError?: string;
}

/**
 * Verifies a pasted key against /v1/me and stores it sealed. The identity comes from
 * Cursor rather than from the person pasting, so a key is also proof of who they are.
 */
export async function connectKey(
  rawKey: string,
  makeClient: (apiKey: string) => CursorClient = (apiKey) => new CursorClient({ apiKey }),
): Promise<{ identity: ApiKeyIdentity; masked: string }> {
  const apiKey = rawKey.trim();

  if (!looksLikeCursorKey(apiKey)) {
    throw new InvalidKeyError(
      'That does not look like a Cursor API key. Keys start with "crsr_" and are 69 characters long.',
    );
  }

  let identity: ApiKeyIdentity;
  try {
    identity = await makeClient(apiKey).getApiKeyIdentity();
  } catch (error) {
    if (error instanceof CursorApiError && error.isAccessDenied) {
      throw new InvalidKeyError('Cursor rejected that key. It may have been revoked or mistyped.');
    }
    throw error;
  }

  if (!identity.userEmail) {
    throw new InvalidKeyError('Cursor accepted the key but returned no account, so it cannot be linked.');
  }

  return { identity, masked: await storeVerifiedKey(identity, apiKey) };
}

/**
 * Creates the account row for somebody who has not proved a Cursor key.
 *
 * Signing in without a key gets you the shared parts of the workspace and nothing that is
 * measured from Cursor, so there is no key to seal here — only a row to hang authorship of
 * board posts and library entries off. Deliberately never touches user_api_key: a person
 * who signs in keylessly must not be able to clear a key they did not prove.
 */
export async function ensureAppUser(email: string): Promise<void> {
  await query(
    `INSERT INTO app_user (email)
     VALUES ($1)
     ON CONFLICT (email) DO UPDATE SET updated_at = now()`,
    [email.toLowerCase()],
  );
}

/**
 * Writes an already-verified key. Split out from connectKey because the login flow has to
 * check the account Cursor named against the email the person typed, and that comparison
 * has to happen before anything is stored.
 */
export async function storeVerifiedKey(
  identity: ApiKeyIdentity,
  apiKey: string,
): Promise<string> {
  const email = identity.userEmail!.toLowerCase();
  const sealed = seal(apiKey);

  await query(
    `INSERT INTO app_user (email, cursor_user_id, first_name, last_name)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE SET
       cursor_user_id = EXCLUDED.cursor_user_id,
       first_name     = EXCLUDED.first_name,
       last_name      = EXCLUDED.last_name,
       updated_at     = now()`,
    [email, identity.userId ?? null, identity.userFirstName ?? null, identity.userLastName ?? null],
  );

  await query(
    `INSERT INTO user_api_key
       (email, key_name, key_fingerprint, ciphertext, iv, auth_tag, key_version, last_validated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now())
     ON CONFLICT (email) DO UPDATE SET
       key_name          = EXCLUDED.key_name,
       key_fingerprint   = EXCLUDED.key_fingerprint,
       ciphertext        = EXCLUDED.ciphertext,
       iv                = EXCLUDED.iv,
       auth_tag          = EXCLUDED.auth_tag,
       key_version       = EXCLUDED.key_version,
       connected_at      = now(),
       last_validated_at = now(),
       last_error        = NULL`,
    [
      email,
      identity.apiKeyName ?? null,
      fingerprint(apiKey),
      sealed.ciphertext,
      sealed.iv,
      sealed.authTag,
      sealed.keyVersion,
    ],
  );

  logger.info('Connected a user key', { email, keyName: identity.apiKeyName });
  return maskKey(apiKey);
}

/** Returns a client authenticated as the given user, or undefined if they have no key. */
export async function clientFor(
  email: string,
  makeClient: (apiKey: string) => CursorClient = (apiKey) => new CursorClient({ apiKey }),
): Promise<CursorClient | undefined> {
  const rows = await query<{
    ciphertext: Buffer;
    iv: Buffer;
    auth_tag: Buffer;
    key_version: number;
  }>('SELECT ciphertext, iv, auth_tag, key_version FROM user_api_key WHERE email = $1', [
    email.toLowerCase(),
  ]);
  const row = rows[0];
  if (!row) return undefined;

  const apiKey = unseal({
    ciphertext: row.ciphertext,
    iv: row.iv,
    authTag: row.auth_tag,
    keyVersion: row.key_version,
  });
  return makeClient(apiKey);
}

export async function disconnect(email: string): Promise<void> {
  await query('DELETE FROM user_api_key WHERE email = $1', [email.toLowerCase()]);
  logger.info('Disconnected a user key', { email });
}

export async function listConnectedUsers(): Promise<ConnectedUser[]> {
  const rows = await query<{
    email: string;
    first_name: string | null;
    last_name: string | null;
    key_name: string | null;
    connected_at: Date;
    last_validated_at: Date | null;
    last_used_at: Date | null;
    last_error: string | null;
  }>(
    `SELECT u.email, u.first_name, u.last_name,
            k.key_name, k.connected_at, k.last_validated_at, k.last_used_at, k.last_error
     FROM user_api_key k
     JOIN app_user u ON u.email = k.email
     ORDER BY k.connected_at`,
  );

  return rows.map((row) => ({
    email: row.email,
    firstName: row.first_name ?? undefined,
    lastName: row.last_name ?? undefined,
    keyName: row.key_name ?? undefined,
    connectedAt: row.connected_at,
    lastValidatedAt: row.last_validated_at ?? undefined,
    lastUsedAt: row.last_used_at ?? undefined,
    lastError: row.last_error ?? undefined,
  }));
}

/** Records why a refresh failed so the dashboard can prompt for a reconnect. */
export async function recordKeyError(email: string, message: string): Promise<void> {
  await query('UPDATE user_api_key SET last_error = $2 WHERE email = $1', [
    email.toLowerCase(),
    message.slice(0, 500),
  ]);
}
