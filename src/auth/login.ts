import { ApiKeyIdentity, CursorApiError, CursorClient } from '../client/cursorClient';
import { optionalEnv } from '../config';
import { looksLikeCursorKey } from '../crypto';
import { query } from '../db/pool';
import { logger } from '../logger';
import { ensureAppUser, storeVerifiedKey } from '../users/keyStore';

/**
 * Signing in.
 *
 * There is no password here and there is no user table to be breached, because the app
 * never invents an identity of its own. A person types their work email and, optionally, a
 * Cursor User API Key; when a key is given Cursor is asked whose it is, and the two must
 * agree. That makes the key a credential and the email a claim to be checked against it,
 * rather than the other way round — pasting someone else's key cannot get you in as them.
 *
 * The key is optional because most of this app is not about Cursor telemetry at all: the
 * Zero Manual Coding board, the shared commands and rules, the resources and the news are
 * written by people, for people, and demanding an API key to read them kept out exactly the
 * colleagues the board is meant to reach. What a key buys is the measured half — your own
 * Cloud Agent cost, cache behaviour and shipped work — which nothing else can stand in for.
 *
 * The trade-off is stated plainly because it is real: a keyless sign-in proves nothing about
 * who is typing. ALLOWED_EMAIL_DOMAINS is what keeps that honest in a deployment, and it is
 * enforced here for keyless sign-ins even where a deployment has otherwise left it open.
 */

export type LoginFailure =
  | 'email-missing'
  | 'email-domain'
  | 'key-format'
  | 'key-rejected'
  | 'key-anonymous'
  | 'identity-mismatch'
  | 'unreachable';

export class LoginError extends Error {
  constructor(
    readonly reason: LoginFailure,
    message: string,
  ) {
    super(message);
    this.name = 'LoginError';
  }
}

export interface Authenticated {
  email: string;
  /** Absent when they signed in without a key, in which case nothing vouches for them. */
  identity?: ApiKeyIdentity;
  /** Whether a Cursor key is now stored, which decides what the workspace can show them. */
  hasKey: boolean;
  /** True the first time this person signs in, so the app can show them around. */
  isNewUser: boolean;
}

/**
 * Domains allowed to sign in. Unset means any, which is right for a laptop and wrong for a
 * deployment, so the deployment notes call it out.
 */
export function allowedDomains(): string[] {
  return (optionalEnv('ALLOWED_EMAIL_DOMAINS', '') ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean);
}

export function isAllowedDomain(email: string): boolean {
  const domains = allowedDomains();
  if (domains.length === 0) return true;
  const domain = email.split('@')[1]?.toLowerCase();
  return domain !== undefined && domains.includes(domain);
}

function normaliseEmail(value: string): string {
  return value.trim().toLowerCase();
}

/** A plausible address. Deliberately loose: Cursor decides whether it is real. */
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(value);
}

export async function authenticate(
  emailInput: string,
  apiKeyInput: string | undefined,
  makeClient: (apiKey: string) => CursorClient = (apiKey) => new CursorClient({ apiKey }),
): Promise<Authenticated> {
  const email = normaliseEmail(emailInput);
  const apiKey = (apiKeyInput ?? '').trim();

  if (!looksLikeEmail(email)) {
    throw new LoginError('email-missing', 'Enter the work email address on your Cursor account.');
  }

  if (!isAllowedDomain(email)) {
    throw new LoginError(
      'email-domain',
      `This dashboard is limited to ${allowedDomains().map((domain) => `@${domain}`).join(', ')} accounts.`,
    );
  }

  if (apiKey === '') {
    const isNewUser = await storeEmailOnly(email);
    return { email, hasKey: false, isNewUser };
  }

  if (!looksLikeCursorKey(apiKey)) {
    throw new LoginError(
      'key-format',
      'That does not look like a Cursor API key. Keys start with "crsr_" and are 69 characters long.',
    );
  }

  let identity: ApiKeyIdentity;
  try {
    identity = await makeClient(apiKey).getApiKeyIdentity();
  } catch (error) {
    if (error instanceof CursorApiError && error.isAccessDenied) {
      throw new LoginError(
        'key-rejected',
        'Cursor rejected that key. It may have been revoked, or copied incompletely.',
      );
    }
    throw error;
  }

  if (!identity.userEmail) {
    throw new LoginError(
      'key-anonymous',
      'Cursor accepted the key but named no account, so it cannot be matched to you.',
    );
  }

  if (normaliseEmail(identity.userEmail) !== email) {
    // Says only that they disagree. Naming the account the key belongs to would turn this
    // form into a way of looking up who owns a key you found.
    logger.warn('Login rejected: key belongs to a different account', { claimed: email });
    throw new LoginError(
      'identity-mismatch',
      'That key belongs to a different Cursor account. Check the email, or create a key on this account.',
    );
  }

  const isNewUser = await storeIdentity(identity, apiKey);
  return { email, identity, hasKey: true, isNewUser };
}

async function storeIdentity(identity: ApiKeyIdentity, apiKey: string): Promise<boolean> {
  const email = identity.userEmail!.toLowerCase();
  const firstTime = await isFirstLogin(email);

  await storeVerifiedKey(identity, apiKey);
  await markLoggedIn(email);

  return firstTime;
}

async function storeEmailOnly(email: string): Promise<boolean> {
  const firstTime = await isFirstLogin(email);

  await ensureAppUser(email);
  await markLoggedIn(email);

  logger.info('Signed in without a Cursor key', { email });
  return firstTime;
}

async function isFirstLogin(email: string): Promise<boolean> {
  const existing = await query<{ last_login_at: Date | null }>(
    'SELECT last_login_at FROM app_user WHERE email = $1',
    [email],
  );
  return existing.length === 0 || existing[0]!.last_login_at === null;
}

async function markLoggedIn(email: string): Promise<void> {
  await query('UPDATE app_user SET last_login_at = now() WHERE email = $1', [email]);
}
