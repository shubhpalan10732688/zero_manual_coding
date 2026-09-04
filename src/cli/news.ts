import { closePool } from '../db/pool';
import { refreshNews } from '../news/ingest';

/**
 * Pulls every enabled AI news feed into the database.
 *
 *   npm run news
 *
 * Meant for a scheduler: hourly is plenty. A feed that cannot be reached records its error
 * and the others still run, so a blocked source never stops the rest.
 */
async function main(): Promise<void> {
  const results = await refreshNews();

  for (const result of results) {
    const outcome = result.error
      ? `failed: ${result.error}`
      : `${result.inserted} new of ${result.fetched}`;
    console.log(`${result.id.padEnd(20)} ${outcome}`);
  }

  const failed = results.filter((result) => result.error).length;
  const inserted = results.reduce((sum, result) => sum + result.inserted, 0);
  console.log(`\n${inserted} new item(s) from ${results.length - failed} of ${results.length} source(s).`);
}

main()
  .catch((error: Error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  })
  .finally(closePool);
