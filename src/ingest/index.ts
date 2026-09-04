import { CursorClient } from '../client/cursorClient';
import { CURSOR_API_BASE_URL, numericEnv } from '../config';
import { addDays, formatDay, startOfUtcDay } from '../client/dates';
import { logger } from '../logger';
import { getCursorApiKey } from '../secrets';

import { ingestDailyUsage } from './dailyUsage';
import { ingestMembers } from './members';
import { lastSuccessfulWindowEnd } from './runs';
import { ingestUsageEvents } from './usageEvents';

export async function createClient(): Promise<CursorClient> {
  return new CursorClient({
    apiKey: await getCursorApiKey(),
    baseUrl: CURSOR_API_BASE_URL(),
  });
}

export interface IngestSummary {
  members: number;
  dailyUsageRows: number;
  usageEventRows: number;
  start: string;
  end: string;
}

export async function ingestRange(
  client: CursorClient,
  range: { start: Date; end: Date },
): Promise<IngestSummary> {
  logger.info('Starting ingest', { start: formatDay(range.start), end: formatDay(range.end) });

  const members = await ingestMembers(client);
  const daily = await ingestDailyUsage(client, range);
  const events = await ingestUsageEvents(client, range);

  return {
    members: members.rows,
    dailyUsageRows: daily.rows,
    usageEventRows: events.rows,
    start: formatDay(range.start),
    end: formatDay(range.end),
  };
}

/**
 * The scheduled path. Re-fetches a trailing window rather than trusting a hard
 * watermark: Cursor aggregates hourly, so yesterday's numbers keep moving for a while
 * after the day closes, and every write here is idempotent.
 */
export async function ingestIncremental(client: CursorClient, now = new Date()): Promise<IngestSummary> {
  const lookbackDays = numericEnv('INGEST_LOOKBACK_DAYS', 3);
  const end = startOfUtcDay(now);

  const previous = await lastSuccessfulWindowEnd('daily-usage');
  const defaultStart = addDays(end, -lookbackDays);
  const start = previous ? minDate(addDays(previous, -lookbackDays), defaultStart) : addDays(end, -30);

  return ingestRange(client, { start: startOfUtcDay(start), end });
}

function minDate(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b;
}
