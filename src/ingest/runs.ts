import { logger } from '../logger';
import { query } from '../db/pool';

export interface RunWindow {
  start?: Date;
  end?: Date;
}

/**
 * Wraps a job so every attempt leaves a row in ingest_run, including failures.
 * That table is the only way to tell "no usage yesterday" from "the job never ran".
 */
export async function recordRun<T extends { rows: number }>(
  source: string,
  window: RunWindow,
  fn: () => Promise<T>,
): Promise<T> {
  const started = await query<{ id: string }>(
    `INSERT INTO ingest_run (source, window_start, window_end, status)
     VALUES ($1, $2, $3, 'running')
     RETURNING id`,
    [source, window.start ?? null, window.end ?? null],
  );
  const runId = started[0]?.id;

  try {
    const result = await fn();
    await query(
      `UPDATE ingest_run SET status = 'succeeded', rows_written = $2, ran_at = now() WHERE id = $1`,
      [runId, result.rows],
    );
    logger.info('Ingest job finished', { source, rows: result.rows });
    return result;
  } catch (error) {
    const message = (error as Error).message ?? String(error);
    await query(
      `UPDATE ingest_run SET status = 'failed', error = $2, ran_at = now() WHERE id = $1`,
      [runId, message.slice(0, 2000)],
    );
    logger.error('Ingest job failed', { source, error: message });
    throw error;
  }
}

/** Latest successfully ingested day for a source, used to pick the next window. */
export async function lastSuccessfulWindowEnd(source: string): Promise<Date | undefined> {
  const rows = await query<{ window_end: Date | null }>(
    `SELECT window_end FROM ingest_run
     WHERE source = $1 AND status = 'succeeded' AND window_end IS NOT NULL
     ORDER BY window_end DESC
     LIMIT 1`,
    [source],
  );
  return rows[0]?.window_end ?? undefined;
}
