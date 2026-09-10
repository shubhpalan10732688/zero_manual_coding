import { workspacePathEnabled } from '../../features';

/**
 * Where to land after signing in.
 *
 * Only ever a path inside the workspace. The public landing page links people at specific
 * board posts, so the destination has to survive the sign-in — but it arrives in a query
 * string a stranger can write, and anything that is not obviously ours is an open redirect
 * waiting to be reported. A leading `//` is rejected because browsers read it as a host.
 *
 * Its own module rather than a helper in actions.ts, because that file is `'use server'`
 * and everything exported from one of those has to be an async server action.
 */
export function safeDestination(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  if (!/^\/app(?:[/?#]|$)/.test(value) || /[\\\s]/.test(value)) return fallback;
  // Normalize traversal before applying the same route policy as middleware.
  const destination = new URL(value, 'https://workspace.invalid');
  if (!workspacePathEnabled(destination.pathname)) return fallback;
  return value;
}
