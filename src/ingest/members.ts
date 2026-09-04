import { CursorClient } from '../client/cursorClient';
import { bulkUpsert } from '../db/bulk';
import { query } from '../db/pool';
import { logger } from '../logger';

import { recordRun } from './runs';

export interface MembersIngestResult {
  rows: number;
  active: number;
  removed: number;
}

/**
 * Snapshots /teams/members. Members the API stops returning altogether are marked
 * removed locally rather than deleted, so historical usage keeps a name to hang on.
 */
export async function ingestMembers(client: CursorClient): Promise<MembersIngestResult> {
  return recordRun('members', {}, async () => {
    const members = await client.getMembers();
    logger.info('Fetched team members', { count: members.length });

    const rows = members.map((member) => [
      member.email,
      member.id,
      member.name,
      member.role,
      member.isRemoved === true,
    ]);

    await bulkUpsert({
      table: 'cursor_member',
      columns: ['email', 'user_id', 'name', 'role', 'is_removed'],
      rows,
      conflict: `ON CONFLICT (email) DO UPDATE SET
                   user_id    = EXCLUDED.user_id,
                   name       = COALESCE(EXCLUDED.name, cursor_member.name),
                   role       = EXCLUDED.role,
                   is_removed = EXCLUDED.is_removed,
                   last_seen  = now()`,
    });

    const emails = members.map((member) => member.email);
    // An empty roster means something went wrong upstream, not that everyone left.
    // Reconciling against it would wipe every seat, so skip it.
    const disappeared =
      emails.length === 0
        ? []
        : await query<{ email: string }>(
            `UPDATE cursor_member
                SET is_removed = TRUE, last_seen = now()
              WHERE NOT is_removed
                AND NOT (email = ANY($1::text[]))
              RETURNING email`,
            [emails],
          );

    if (disappeared.length > 0) {
      logger.warn('Marked members as removed: no longer returned by the API', {
        emails: disappeared.map((row) => row.email),
      });
    }

    return {
      rows: rows.length,
      active: members.filter((member) => !member.isRemoved).length,
      removed: members.filter((member) => member.isRemoved).length + disappeared.length,
    };
  });
}
