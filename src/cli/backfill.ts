import { CursorApiError, CursorClient } from '../client/cursorClient';
import { DateWindow, addDays, chunkByDays, formatDay, startOfUtcDay } from '../client/dates';
import { closePool, query } from '../db/pool';
import { createClient, ingestRange } from '../ingest';
import { logger } from '../logger';

/**
 * Historical backfill.
 *
 * Cursor documents no retention window for the usage APIs, so this walks backwards in
 * 30-day windows asking for one page at a time until the data runs dry. What it finds
 * is written to retention_probe, which is how we know where our history actually
 * begins rather than guessing.
 *
 *   npm run backfill -- --probe-only          discover the horizon, ingest nothing
 *   npm run backfill -- --dry-run             probe with only an API key, no database
 *   npm run backfill -- --months 24           probe up to 24 months back, then ingest
 *   npm run backfill -- --from 2025-01-01     skip probing, ingest from a known date
 */

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

interface ProbeOutcome {
  window: DateWindow;
  dailyRows: number;
  eventRows: number;
  httpStatus?: number;
  note?: string;
}

async function probeWindow(client: CursorClient, window: DateWindow): Promise<ProbeOutcome> {
  const outcome: ProbeOutcome = { window, dailyRows: 0, eventRows: 0 };

  try {
    const daily = await client.getDailyUsagePage(window, 1, 100);
    // Rows exist for every member in range; only active ones prove data survives.
    outcome.dailyRows = daily.items.filter((row) => row.isActive !== false).length;
  } catch (error) {
    if (error instanceof CursorApiError) {
      outcome.httpStatus = error.status;
      outcome.note = error.body?.slice(0, 200);
    } else {
      outcome.note = (error as Error).message;
    }
  }

  try {
    const events = await client.getUsageEventsPage(window, 1, 25);
    outcome.eventRows = events.totalCount ?? events.items.length;
  } catch (error) {
    if (error instanceof CursorApiError && outcome.httpStatus === undefined) {
      outcome.httpStatus = error.status;
      outcome.note = error.body?.slice(0, 200);
    }
  }

  return outcome;
}

async function recordProbe(outcome: ProbeOutcome): Promise<void> {
  if (flag('dry-run')) return;
  await query(
    `INSERT INTO retention_probe (source, window_start, window_end, rows_returned, http_status, note)
     VALUES ('daily-usage', $1, $2, $3, $4, $5), ('usage-events', $1, $2, $6, $4, $5)`,
    [
      formatDay(outcome.window.start),
      formatDay(outcome.window.end),
      outcome.dailyRows,
      outcome.httpStatus ?? null,
      outcome.note ?? null,
      outcome.eventRows,
    ],
  );
}

async function discoverHorizon(client: CursorClient, months: number): Promise<Date | undefined> {
  const today = startOfUtcDay(new Date());
  const windows = chunkByDays(addDays(today, -Math.round(months * 30)), addDays(today, -1), 30)
    .slice()
    .reverse();

  let earliestWithData: Date | undefined;
  let emptyStreak = 0;

  for (const window of windows) {
    const outcome = await probeWindow(client, window);
    await recordProbe(outcome);

    const hasData = outcome.dailyRows > 0 || outcome.eventRows > 0;
    console.log(
      `  ${formatDay(window.start)} .. ${formatDay(window.end)}  ` +
        `daily=${outcome.dailyRows} events=${outcome.eventRows}` +
        (outcome.httpStatus ? `  HTTP ${outcome.httpStatus}` : ''),
    );

    if (hasData) {
      earliestWithData = window.start;
      emptyStreak = 0;
      continue;
    }

    // Two consecutive empty months is the retention edge, not a quiet holiday period.
    emptyStreak += 1;
    if (emptyStreak >= 2) {
      console.log('  Two consecutive empty windows; treating this as the retention edge.');
      break;
    }
  }

  return earliestWithData;
}

async function main(): Promise<void> {
  const client = await createClient();
  const today = startOfUtcDay(new Date());
  const explicitFrom = arg('from');

  let start: Date | undefined;

  if (explicitFrom) {
    start = startOfUtcDay(new Date(`${explicitFrom}T00:00:00.000Z`));
  } else {
    const months = Number(arg('months') ?? 18);
    console.log(`Probing up to ${months} months of history in 30-day windows...\n`);
    start = await discoverHorizon(client, months);

    if (!start) {
      console.error('\nNo historical data found in any probed window. Nothing to backfill.');
      return;
    }
    console.log(`\nObserved retention horizon: ${formatDay(start)}`);
  }

  if (flag('dry-run')) {
    console.log('\n--dry-run set; nothing written to the database.');
    return;
  }

  const observed = await query<{ source: string; earliest_day_with_data: string | null }>(
    'SELECT source, earliest_day_with_data FROM v_observed_retention',
  );
  if (observed.length > 0) {
    console.log('Recorded retention:', JSON.stringify(observed));
  }

  if (flag('probe-only')) {
    console.log('\n--probe-only set; skipping ingestion.');
    return;
  }

  console.log(`\nBackfilling ${formatDay(start)} to ${formatDay(today)}. This will take a while:`);
  console.log('daily usage is limited to 20 requests/min and usage events to 60/min.\n');

  const summary = await ingestRange(client, { start, end: today });
  logger.info('Backfill complete', { ...summary });
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error: Error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  })
  .finally(closePool);
