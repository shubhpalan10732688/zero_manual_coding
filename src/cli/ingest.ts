import { parseDateInput, startOfUtcDay } from '../client/dates';
import { closePool } from '../db/pool';
import { createClient, ingestIncremental, ingestRange } from '../ingest';

/**
 * Scheduled-equivalent ingest for local runs.
 *
 *   npm run ingest                          incremental, re-fetching the trailing window
 *   npm run ingest -- --since 30d           explicit range, still idempotent
 *   npm run ingest -- --since 2026-07-01 --until 2026-07-31
 */
function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main(): Promise<void> {
  const client = await createClient();
  const since = arg('since');
  const until = arg('until');

  const summary = since
    ? await ingestRange(client, {
        start: parseDateInput(since),
        end: until ? parseDateInput(until) : startOfUtcDay(new Date()),
      })
    : await ingestIncremental(client);

  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error: Error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  })
  .finally(closePool);
