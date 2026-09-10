'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { LoginError, authenticate } from '@core/auth/login';
import { SESSION_COOKIE, createSession } from '@core/auth/sessions';
import { CursorNetworkError } from '@core/client/cursorClient';
import { query } from '@core/db/pool';
import { ingestCloudAgents } from '@core/ingest/cloudAgents';
import { logger } from '@core/logger';
import { clientFor } from '@core/users/keyStore';

import { EXTENDED_WORKSPACE_ENABLED } from '../../features';

import { safeDestination } from './destination';

export interface LoginState {
  error?: string;
  /** Set when the failure is worth explaining at length rather than in one line. */
  help?: 'mismatch' | 'domain' | 'format';
}

/**
 * Signing in.
 *
 * The email is a claim; a key, if one is given, is the proof, and the two are checked
 * against each other before anything is written. What comes back to the browser is only
 * ever a message: the key is never echoed, never logged, and never put in a URL.
 *
 * Without a key there is nothing measured to show, so the redirect goes to the board rather
 * than to a dashboard that would be entirely empty.
 */
export async function loginAction(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '');
  // Ignore keys from stale forms or handcrafted requests while integrations are retired.
  const apiKey = EXTENDED_WORKSPACE_ENABLED ? String(formData.get('apiKey') ?? '') : '';
  const next = String(formData.get('next') ?? '') || undefined;

  if (!email.trim()) {
    return { error: 'Enter your work email.' };
  }

  let signedInAs: string;
  let hasKey: boolean;
  try {
    const result = await authenticate(email, apiKey);
    signedInAs = result.email;
    hasKey = result.hasKey;
  } catch (error) {
    if (error instanceof LoginError) {
      const help =
        error.reason === 'identity-mismatch'
          ? 'mismatch'
          : error.reason === 'email-domain'
            ? 'domain'
            : error.reason === 'key-format'
              ? 'format'
              : undefined;
      return { error: error.message, help };
    }
    // Nearly always TLS interception or a proxy. The client's own message names the fix,
    // and hiding it behind "something went wrong" costs whoever deployed this an afternoon.
    if (error instanceof CursorNetworkError) {
      return { error: error.message };
    }
    logger.warn('Login failed unexpectedly', { error: (error as Error).message });
    return { error: `Could not sign you in: ${(error as Error).message ?? 'unknown error'}` };
  }

  const session = await createSession(signedInAs, (await headers()).get('user-agent') ?? undefined);
  (await cookies()).set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: session.maxAgeSeconds,
  });

  if (EXTENDED_WORKSPACE_ENABLED && hasKey) {
    await pullHistory(signedInAs);
    redirect(safeDestination(next, '/app'));
  }

  redirect(safeDestination(next, '/app/board'));
}

/**
 * Fills the dashboard before the person reaches it — but only the first time, because a
 * full pull costs two API calls per agent and nobody should wait through it on every login.
 * Afterwards it runs behind the redirect, and the dashboard offers a refresh button anyway.
 */
async function pullHistory(email: string): Promise<void> {
  try {
    const client = await clientFor(email);
    if (!client) return;

    const rows = await query<{ agents: string }>(
      'SELECT COUNT(*) AS agents FROM cloud_agent WHERE email = $1',
      [email],
    );

    if (Number(rows[0]?.agents ?? 0) === 0) {
      await ingestCloudAgents(client, email);
      return;
    }

    void ingestCloudAgents(client, email).catch((error: Error) => {
      logger.warn('Background agent refresh failed', { email, error: error.message });
    });
  } catch (error) {
    // The session is live and the key is stored, so send them in regardless. The dashboard
    // reports a stale or failed connection itself.
    logger.warn('Could not pull agent history at login', {
      email,
      error: (error as Error).message,
    });
  }
}
