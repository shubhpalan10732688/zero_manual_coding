import { CursorClient, MAX_DAILY_USAGE_WINDOW_DAYS } from '../client/cursorClient';
import { DateWindow, chunkByDays, formatDay } from '../client/dates';
import { DailyUsageRow } from '../client/types';
import { bulkUpsert } from '../db/bulk';
import { logger } from '../logger';

import { recordRun } from './runs';

const COLUMNS = [
  'email',
  'day',
  'user_id',
  'is_active',
  'total_lines_added',
  'total_lines_deleted',
  'accepted_lines_added',
  'accepted_lines_deleted',
  'total_applies',
  'total_accepts',
  'total_rejects',
  'total_tabs_shown',
  'total_tabs_accepted',
  'composer_requests',
  'chat_requests',
  'agent_requests',
  'cmdk_usages',
  'bugbot_usages',
  'most_used_model',
  'apply_most_used_extension',
  'tab_most_used_extension',
  'client_version',
];

const CONFLICT = `ON CONFLICT (email, day) DO UPDATE SET
  user_id                   = EXCLUDED.user_id,
  is_active                 = EXCLUDED.is_active,
  total_lines_added         = EXCLUDED.total_lines_added,
  total_lines_deleted       = EXCLUDED.total_lines_deleted,
  accepted_lines_added      = EXCLUDED.accepted_lines_added,
  accepted_lines_deleted    = EXCLUDED.accepted_lines_deleted,
  total_applies             = EXCLUDED.total_applies,
  total_accepts             = EXCLUDED.total_accepts,
  total_rejects             = EXCLUDED.total_rejects,
  total_tabs_shown          = EXCLUDED.total_tabs_shown,
  total_tabs_accepted       = EXCLUDED.total_tabs_accepted,
  composer_requests         = EXCLUDED.composer_requests,
  chat_requests             = EXCLUDED.chat_requests,
  agent_requests            = EXCLUDED.agent_requests,
  cmdk_usages               = EXCLUDED.cmdk_usages,
  bugbot_usages             = EXCLUDED.bugbot_usages,
  most_used_model           = EXCLUDED.most_used_model,
  apply_most_used_extension = EXCLUDED.apply_most_used_extension,
  tab_most_used_extension   = EXCLUDED.tab_most_used_extension,
  client_version            = EXCLUDED.client_version,
  ingested_at               = now()`;

export function toRow(row: DailyUsageRow): unknown[] {
  return [
    row.email,
    row.day,
    row.userId ?? null,
    row.isActive ?? false,
    row.totalLinesAdded ?? 0,
    row.totalLinesDeleted ?? 0,
    row.acceptedLinesAdded ?? 0,
    row.acceptedLinesDeleted ?? 0,
    row.totalApplies ?? 0,
    row.totalAccepts ?? 0,
    row.totalRejects ?? 0,
    row.totalTabsShown ?? 0,
    row.totalTabsAccepted ?? 0,
    row.composerRequests ?? 0,
    row.chatRequests ?? 0,
    row.agentRequests ?? 0,
    row.cmdkUsages ?? 0,
    row.bugbotUsages ?? 0,
    row.mostUsedModel ?? null,
    row.applyMostUsedExtension ?? null,
    row.tabMostUsedExtension ?? null,
    row.clientVersion ?? null,
  ];
}

/**
 * Ingests /teams/daily-usage-data across an arbitrary range, chunked to the API's
 * 30-day limit. page and pageSize are always sent so inactive members come back too.
 */
export async function ingestDailyUsage(
  client: CursorClient,
  range: { start: Date; end: Date },
  pageSize = 1000,
): Promise<{ rows: number; windows: number }> {
  const windows = chunkByDays(range.start, range.end, MAX_DAILY_USAGE_WINDOW_DAYS);

  return recordRun(
    'daily-usage',
    { start: windows[0]?.start, end: windows[windows.length - 1]?.end },
    async () => {
      let total = 0;
      for (const window of windows) {
        total += await ingestWindow(client, window, pageSize);
      }
      return { rows: total, windows: windows.length };
    },
  );
}

async function ingestWindow(
  client: CursorClient,
  window: DateWindow,
  pageSize: number,
): Promise<number> {
  let rows = 0;
  for await (const page of client.iterateDailyUsage(window, pageSize)) {
    if (page.items.length === 0) continue;
    rows += await bulkUpsert({
      table: 'cursor_daily_usage',
      columns: COLUMNS,
      rows: page.items.map(toRow),
      conflict: CONFLICT,
    });
  }

  logger.info('Ingested daily usage window', {
    start: formatDay(window.start),
    end: formatDay(window.end),
    rows,
  });
  return rows;
}
