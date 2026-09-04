import { CursorApiError } from '../client/cursorClient';
import { logger } from '../logger';
import { clientFor, listConnectedUsers, recordKeyError } from '../users/keyStore';

import { ingestCloudAgents } from './cloudAgents';

export interface RefreshSummary {
  users: number;
  succeeded: number;
  failed: number;
  agents: number;
  runs: number;
}

/**
 * Refreshes every connected user in turn.
 *
 * One person's revoked key must not stop everyone else's refresh, so failures are
 * recorded against that user and the loop continues. Users are processed sequentially
 * because each holds its own rate-limit budget only in theory; in practice the limits
 * are undocumented and a burst across accounts is the likeliest way to find out.
 */
export async function refreshAllUsers(): Promise<RefreshSummary> {
  const users = await listConnectedUsers();
  const summary: RefreshSummary = {
    users: users.length,
    succeeded: 0,
    failed: 0,
    agents: 0,
    runs: 0,
  };

  for (const user of users) {
    try {
      const client = await clientFor(user.email);
      if (!client) {
        logger.warn('Listed user has no stored key, skipping', { email: user.email });
        continue;
      }

      const result = await ingestCloudAgents(client, user.email);
      summary.succeeded += 1;
      summary.agents += result.agents;
      summary.runs += result.runs;
    } catch (error) {
      summary.failed += 1;
      const message =
        error instanceof CursorApiError && error.isAccessDenied
          ? 'Cursor rejected this key. Reconnect it to resume refreshes.'
          : ((error as Error).message ?? 'Unknown error');
      await recordKeyError(user.email, message);
      logger.error('Refresh failed for user', { email: user.email, error: message });
    }
  }

  logger.info('Refreshed connected users', { ...summary });
  return summary;
}
