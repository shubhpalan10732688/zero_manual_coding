import { CursorClient } from '../client/cursorClient';
import { DateWindow, chunkByDays, formatDay } from '../client/dates';
import { UsageEvent } from '../client/types';
import { bulkUpsert } from '../db/bulk';
import { logger } from '../logger';

import { eventKey } from './eventKey';
import { recordRun } from './runs';

const COLUMNS = [
  'event_key',
  'ts',
  'email',
  'model',
  'kind',
  'max_mode',
  'is_headless',
  'is_chargeable',
  'is_token_based_call',
  'requests_costs',
  'charged_cents',
  'cursor_token_fee',
  'input_tokens',
  'output_tokens',
  'cache_read_tokens',
  'cache_write_tokens',
  'conversation_id',
  'service_account_id',
  'cloud_agent_id',
];

// Events are immutable once billed, so a replay of the same event is simply ignored.
const CONFLICT = 'ON CONFLICT (event_key) DO NOTHING';

/** Days per request window. The endpoint has no documented cap; keep windows small. */
const WINDOW_DAYS = 1;

export function toRow(event: UsageEvent): unknown[] {
  const epochMs = Number(event.timestamp);
  return [
    eventKey(event),
    new Date(Number.isFinite(epochMs) ? epochMs : Date.parse(event.timestamp)),
    event.userEmail ?? null,
    event.model ?? null,
    event.kind ?? null,
    event.maxMode ?? null,
    event.isHeadless ?? null,
    event.isChargeable ?? null,
    event.isTokenBasedCall ?? null,
    event.requestsCosts ?? null,
    event.chargedCents ?? 0,
    event.cursorTokenFee ?? null,
    event.tokenUsage?.inputTokens ?? null,
    event.tokenUsage?.outputTokens ?? null,
    event.tokenUsage?.cacheReadTokens ?? null,
    event.tokenUsage?.cacheWriteTokens ?? null,
    event.conversationId ?? null,
    event.serviceAccountId ?? null,
    event.cloudAgentId ?? null,
  ];
}

/**
 * Ingests /teams/filtered-usage-events one day at a time. Both bounds are inclusive and
 * chunkByDays ends each window at 23:59:59.999, so windows never overlap.
 */
export async function ingestUsageEvents(
  client: CursorClient,
  range: { start: Date; end: Date },
  pageSize = 1000,
): Promise<{ rows: number; fetched: number; windows: number }> {
  const windows = chunkByDays(range.start, range.end, WINDOW_DAYS);

  return recordRun(
    'usage-events',
    { start: windows[0]?.start, end: windows[windows.length - 1]?.end },
    async () => {
      let rows = 0;
      let fetched = 0;
      for (const window of windows) {
        const result = await ingestWindow(client, window, pageSize);
        rows += result.rows;
        fetched += result.fetched;
      }
      return { rows, fetched, windows: windows.length };
    },
  );
}

async function ingestWindow(
  client: CursorClient,
  window: DateWindow,
  pageSize: number,
): Promise<{ rows: number; fetched: number }> {
  let rows = 0;
  let fetched = 0;

  for await (const page of client.iterateUsageEvents(window, pageSize)) {
    if (page.items.length === 0) continue;
    fetched += page.items.length;
    rows += await bulkUpsert({
      table: 'cursor_usage_event',
      columns: COLUMNS,
      rows: page.items.map(toRow),
      conflict: CONFLICT,
    });
  }

  logger.info('Ingested usage events window', {
    day: formatDay(window.start),
    fetched,
    inserted: rows,
    duplicates: fetched - rows,
  });
  return { rows, fetched };
}
