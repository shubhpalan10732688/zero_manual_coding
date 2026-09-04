import { closePool } from '../db/pool';
import { refreshAllUsers } from '../ingest/refreshUsers';

/**
 * Re-pulls Cloud Agent history for every connected user.
 *
 *   npm run refresh
 */
async function main(): Promise<void> {
  const summary = await refreshAllUsers();
  console.log(JSON.stringify(summary, null, 2));

  if (summary.failed > 0) {
    console.log(`\n${summary.failed} user(s) need to reconnect; run "npm run connect -- --list".`);
  }
}

main()
  .catch((error: Error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  })
  .finally(closePool);
