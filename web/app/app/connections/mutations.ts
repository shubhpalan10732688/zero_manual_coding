'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { LoginError, authenticate } from '@core/auth/login';
import { CursorNetworkError } from '@core/client/cursorClient';
import { query } from '@core/db/pool';
import { ingestCloudAgents } from '@core/ingest/cloudAgents';
import { enrichForUser } from '@core/integrations/clients';
import { removeIntegration, saveIntegration, type Provider } from '@core/integrations/store';
import { CredentialError, verifyGitHubToken, verifyJiraCredentials } from '@core/integrations/verify';
import { logger } from '@core/logger';
import { clientFor, disconnect as removeCursorKey } from '@core/users/keyStore';

import { requireUser } from '../lib/auth';
import { text } from '../lib/forms';

import type { ConnectFormState } from './types';

/**
 * Connecting GitHub and Jira.
 *
 * Every credential is proved before it is stored: the provider is asked who the token belongs
 * to, and the answer is shown back. A token saved unverified looks connected and then fails
 * hours later inside a background job, where nobody sees it.
 *
 * Immediately after a successful connection the person's existing agent history is enriched,
 * so the dashboard fills in retrospectively rather than only for work done from now on. That
 * is the difference between a connection that appears to do something and one that does.
 */

/**
 * Adding a Cursor key to an account that signed in without one.
 *
 * Goes through the same authenticate() the login form uses rather than a looser path,
 * because the rule that matters is unchanged: the key must belong to the account holding
 * this session. Without that check anyone could attach a colleague's key and read their
 * spend under their own name.
 */
export async function connectCursorAction(
  _previous: ConnectFormState,
  form: FormData,
): Promise<ConnectFormState> {
  const user = await requireUser();
  const apiKey = text(form, 'apiKey', 200);
  if (!apiKey) return { error: 'Paste a Cursor User API Key.', field: 'apiKey' };

  try {
    await authenticate(user.email, apiKey);
  } catch (error) {
    if (error instanceof LoginError) return { error: error.message, field: 'apiKey' };
    if (error instanceof CursorNetworkError) return { error: error.message, field: 'apiKey' };
    logger.warn('Cursor key connection failed', { email: user.email });
    return { error: 'Something went wrong checking that key. Try again.', field: 'apiKey' };
  }

  await pullAgentHistory(user.email);

  revalidatePath('/app/connections');
  revalidatePath('/app');
  revalidatePath('/app/impact');
  revalidatePath('/app/actions');

  return { connected: user.email };
}

/**
 * Removing the Cursor key without removing the account.
 *
 * The session survives, because the key is no longer what the session rests on. What goes
 * is the measured half of the workspace; everything the person wrote on the board stays,
 * and so does their access to it.
 */
export async function disconnectCursorAction(): Promise<void> {
  const user = await requireUser();
  await removeCursorKey(user.email);

  revalidatePath('/app/connections');
  revalidatePath('/app');
  revalidatePath('/app/impact');
  revalidatePath('/app/actions');

  redirect('/app/connections');
}

/**
 * Fills in agent history for a key connected after sign-in, so the dashboard is populated
 * by the time they click through to it. Backgrounded once there is history to show, since a
 * full pull costs two API calls per agent.
 */
async function pullAgentHistory(email: string): Promise<void> {
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
    logger.warn('Could not pull agent history after connecting a key', {
      email,
      error: (error as Error).message,
    });
  }
}

export async function connectGitHubAction(
  _previous: ConnectFormState,
  form: FormData,
): Promise<ConnectFormState> {
  const user = await requireUser();
  const token = text(form, 'token', 500);
  if (!token) return { error: 'Paste a personal access token.', field: 'token' };

  try {
    const account = await verifyGitHubToken(token);
    await saveIntegration(user.email, {
      provider: 'github',
      token,
      accountLabel: account.name ? `${account.login} (${account.name})` : account.login,
      scopes: account.scopes,
    });

    await enrichQuietly(user.email);
    revalidatePath('/app/connections');
    revalidatePath('/app/impact');
    revalidatePath('/app');

    return { connected: account.login };
  } catch (error) {
    if (error instanceof CredentialError) return { error: error.message, field: 'token' };
    logger.warn('GitHub connection failed', { email: user.email });
    return { error: 'Something went wrong checking that token. Try again.', field: 'token' };
  }
}

export async function connectJiraAction(
  _previous: ConnectFormState,
  form: FormData,
): Promise<ConnectFormState> {
  const user = await requireUser();

  const site = text(form, 'site', 300);
  const accountEmail = text(form, 'accountEmail', 200) || user.email;
  const token = text(form, 'token', 500);

  if (!site) return { error: 'Enter your Jira site, e.g. https://acme.atlassian.net', field: 'site' };
  if (!token) return { error: 'Paste an Atlassian API token.', field: 'token' };

  try {
    const { account, baseUrl } = await verifyJiraCredentials(site, accountEmail, token);
    await saveIntegration(user.email, {
      provider: 'jira',
      token,
      baseUrl,
      accountEmail,
      accountLabel: account.displayName,
    });

    await enrichQuietly(user.email);
    revalidatePath('/app/connections');
    revalidatePath('/app/impact');
    revalidatePath('/app');

    return { connected: account.displayName };
  } catch (error) {
    if (error instanceof CredentialError) return { error: error.message, field: 'token' };
    logger.warn('Jira connection failed', { email: user.email });
    return { error: 'Something went wrong checking those details. Try again.', field: 'token' };
  }
}

export async function disconnectAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const provider = text(formData, 'provider', 10) as Provider;
  if (provider !== 'github' && provider !== 'jira') return;

  await removeIntegration(user.email, provider);
  revalidatePath('/app/connections');
  revalidatePath('/app/impact');
}

/** Re-runs enrichment on demand, for when a pull request merged after the last pass. */
export async function refreshEnrichmentAction(): Promise<void> {
  const user = await requireUser();
  await enrichQuietly(user.email);
  revalidatePath('/app/connections');
  revalidatePath('/app/impact');
  revalidatePath('/app');
}

/**
 * Enrichment is a nice-to-have at this moment, not the point of the request: the credential is
 * already stored and verified. A repository the token cannot see must not turn a successful
 * connection into an error message.
 */
async function enrichQuietly(email: string): Promise<void> {
  try {
    await enrichForUser(email);
  } catch (error) {
    logger.warn('Post-connection enrichment failed', {
      email,
      error: (error as Error).message,
    });
  }
}
