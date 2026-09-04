import { runMigrations } from '../db/migrate';
import { closePool } from '../db/pool';

runMigrations()
  .then((applied) => {
    console.log(applied.length > 0 ? `Applied: ${applied.join(', ')}` : 'Database up to date');
  })
  .catch((error: Error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(closePool);
