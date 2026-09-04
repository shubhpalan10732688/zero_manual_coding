import { logger } from './logger';
import { createClient, ingestIncremental } from './ingest';
import { runMigrations } from './db/migrate';

/**
 * Scheduled entry point. Keeps the pg pool and the cached API key alive across warm
 * invocations, so it deliberately does not close the pool.
 */
export async function ingest(): Promise<{ ok: boolean; summary?: unknown; error?: string }> {
  try {
    const client = await createClient();
    const summary = await ingestIncremental(client);
    return { ok: true, summary };
  } catch (error) {
    const message = (error as Error).message;
    logger.error('Scheduled ingest failed', { error: message });
    // Rethrow so the invocation is marked failed and the alarm fires.
    throw error;
  }
}

/** One-shot migration runner, invoked manually after a deploy that changes db/migrations. */
export async function migrate(): Promise<{ applied: string[] }> {
  return { applied: await runMigrations() };
}
