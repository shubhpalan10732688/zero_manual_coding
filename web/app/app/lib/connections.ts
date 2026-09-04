import { listIntegrations, IntegrationStatus } from '@core/integrations/store';

import type { ShellConnection } from '../ui/Shell';

import { cursorConnection, CursorConnection } from './metrics';

/**
 * What this account is actually connected to, in one place, because it decides what several
 * pages are able to say. The shell shows a summary of it on every screen.
 */

export interface ConnectionState {
  cursor: CursorConnection | undefined;
  github: IntegrationStatus | undefined;
  jira: IntegrationStatus | undefined;
  connectedCount: number;
  hasError: boolean;
}

export async function connectionState(email: string): Promise<ConnectionState> {
  const [cursor, integrations] = await Promise.all([
    cursorConnection(email),
    listIntegrations(email),
  ]);

  const github = integrations.find((entry) => entry.provider === 'github');
  const jira = integrations.find((entry) => entry.provider === 'jira');

  return {
    cursor,
    github,
    jira,
    connectedCount: [cursor, github, jira].filter(Boolean).length,
    hasError: Boolean(cursor?.lastError || github?.lastError || jira?.lastError),
  };
}

export function toShellConnection(state: ConnectionState): ShellConnection {
  const names = [
    state.cursor ? 'Cursor' : undefined,
    state.github ? 'GitHub' : undefined,
    state.jira ? 'Jira' : undefined,
  ].filter(Boolean);

  if (state.hasError) {
    return {
      state: 'error',
      label: 'Connection needs attention',
      detail: names.length > 0 ? names.join(' · ') : 'Nothing connected',
    };
  }

  if (state.connectedCount === 3) {
    return { state: 'on', label: 'All three connected', detail: 'Cursor · GitHub · Jira' };
  }

  // Without a Cursor key nothing is broken — the shared workspace is the whole product for
  // this reader — so the chrome offers the upgrade rather than reporting a deficit.
  if (!state.cursor) {
    return {
      state: 'off',
      label: 'Shared workspace',
      detail: 'Add a Cursor key for your own metrics',
    };
  }

  return {
    state: 'on',
    label: `${state.connectedCount} of 3 connected`,
    detail: names.join(' · '),
  };
}
