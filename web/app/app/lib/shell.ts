import { cache } from 'react';

import { redirect } from 'next/navigation';

import { EXTENDED_WORKSPACE_ENABLED } from '../../../features';

import { workspaceNav, type NavItem } from '../ui/nav';
import type { ShellConnection, ShellUser } from '../ui/Shell';

import { requireUser, type AppUser } from './auth';
import { connectionState, toShellConnection, type ConnectionState } from './connections';
import { openActionCount } from './recommendations';

/**
 * The three things every page under /app needs before it can render its own content: who is
 * asking, what they are connected to, and the sidebar with its counts.
 *
 * Assembled once per request. Pages render the shell themselves rather than inheriting it
 * from a layout, so without this each of them would repeat the same four queries — and the
 * open-action count is the expensive one, since it derives the whole recommendation set.
 * Without a Cursor key that set is always empty and the page it counts for is not in the
 * sidebar, so the derivation is skipped rather than run to produce a zero.
 */

export interface ShellContext {
  user: AppUser;
  shellUser: ShellUser;
  connections: ConnectionState;
  connection: ShellConnection;
  nav: NavItem[];
  /** Whether Cursor-measured pages have anything to draw on. */
  hasCursorKey: boolean;
}

export const shellContext = cache(async (): Promise<ShellContext> => {
  const user = await requireUser();
  // Do not even read credentials/telemetry for the board-only experience.
  const connections: ConnectionState = EXTENDED_WORKSPACE_ENABLED
    ? await connectionState(user.email)
    : { cursor: undefined, github: undefined, jira: undefined, connectedCount: 0, hasError: false };
  const hasCursorKey = Boolean(connections.cursor);
  const actions = hasCursorKey ? await openActionCount(user.email) : 0;

  return {
    user,
    shellUser: {
      name: user.name,
      email: user.email,
      initials: user.initials,
      isAdmin: user.isAdmin,
      role: user.jobTitle ?? user.teamName ?? user.email,
    },
    connections,
    connection: toShellConnection(connections),
    nav: workspaceNav({ actions, hasCursorKey }),
    hasCursorKey,
  };
});

/**
 * The guard for the three pages that are nothing but Cursor measurements.
 *
 * Sends people to the board instead of showing an empty dashboard, because the board is
 * what they came for if they signed in without a key — and Connections, one click away in
 * the sidebar, is where they turn the rest on.
 */
export const cursorShellContext = cache(async (): Promise<ShellContext> => {
  if (!EXTENDED_WORKSPACE_ENABLED) redirect('/app/board');
  const context = await shellContext();
  if (!context.hasCursorKey) redirect('/app/board');
  return context;
});

/** Reads a single search param, which Next hands over as string | string[] | undefined. */
export function one(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  const trimmed = first?.trim();
  return trimmed ? trimmed : undefined;
}

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;
