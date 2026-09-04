import { createHash, randomBytes } from 'node:crypto';

import { numericEnv } from '../config';
import { query } from '../db/pool';
import { logger } from '../logger';

/**
 * Sessions as rows.
 *
 * The older self-service pages sign an email into a cookie and trust the signature, which
 * is enough for one screen but cannot be revoked: disconnecting a key leaves any browser
 * holding that cookie still signed in until it expires. Here the cookie carries a random
 * token and the row is the authority, so signing out ends the session everywhere it is
 * checked, and removing an account ends all of its sessions with it.
 *
 * Only the hash of the token is stored. A database dump therefore contains nothing that
 * can be replayed as a login.
 */

export const SESSION_COOKIE = 'zmc_session';

function lifetimeDays(): number {
  return numericEnv('SESSION_LIFETIME_DAYS', 14);
}

function hash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface IssuedSession {
  token: string;
  expiresAt: Date;
  maxAgeSeconds: number;
}

export async function createSession(email: string, userAgent?: string): Promise<IssuedSession> {
  const token = randomBytes(32).toString('base64url');
  const maxAgeSeconds = lifetimeDays() * 24 * 60 * 60;
  const expiresAt = new Date(Date.now() + maxAgeSeconds * 1000);

  await query(
    `INSERT INTO app_session (token_hash, email, expires_at, user_agent)
     VALUES ($1, $2, $3, $4)`,
    [hash(token), email.toLowerCase(), expiresAt, userAgent?.slice(0, 300) ?? null],
  );

  // Opportunistic housekeeping. Expired rows are harmless but there is no scheduler here,
  // and a login is the one moment we know the database is already awake.
  await query('DELETE FROM app_session WHERE expires_at < now() - interval \'7 days\'');

  return { token, expiresAt, maxAgeSeconds };
}

/**
 * Resolves a token to an email, refusing anything expired.
 *
 * last_seen_at is written on every hit rather than sampled. It is a single primary-key
 * update against a narrow table, and the alternative — read, compare, sometimes write — is
 * two round trips to save one.
 */
export async function resolveSession(token: string | undefined): Promise<string | null> {
  if (!token) return null;

  const rows = await query<{ email: string }>(
    `UPDATE app_session SET last_seen_at = now()
     WHERE token_hash = $1 AND expires_at > now()
     RETURNING email`,
    [hash(token)],
  );

  return rows[0]?.email ?? null;
}

export async function destroySession(token: string | undefined): Promise<void> {
  if (!token) return;
  await query('DELETE FROM app_session WHERE token_hash = $1', [hash(token)]);
}

export async function destroyAllSessions(email: string): Promise<number> {
  const rows = await query<{ token_hash: string }>(
    'DELETE FROM app_session WHERE email = $1 RETURNING token_hash',
    [email.toLowerCase()],
  );
  logger.info('Ended all sessions for a user', { email, count: rows.length });
  return rows.length;
}

export interface SessionSummary {
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  userAgent: string | null;
  isCurrent: boolean;
}

export async function listSessions(
  email: string,
  currentToken?: string,
): Promise<SessionSummary[]> {
  const rows = await query<{
    token_hash: string;
    created_at: Date;
    last_seen_at: Date;
    expires_at: Date;
    user_agent: string | null;
  }>(
    `SELECT token_hash, created_at, last_seen_at, expires_at, user_agent
     FROM app_session
     WHERE email = $1 AND expires_at > now()
     ORDER BY last_seen_at DESC`,
    [email.toLowerCase()],
  );

  const current = currentToken ? hash(currentToken) : undefined;
  return rows.map((row) => ({
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    expiresAt: row.expires_at,
    userAgent: row.user_agent,
    isCurrent: row.token_hash === current,
  }));
}
