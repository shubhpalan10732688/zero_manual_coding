import fs from 'node:fs';
import path from 'node:path';

import { logger } from '../logger';

import { getPool } from './pool';

// Bundled Lambda code loses the repo layout, so the path is overridable. The
// serverless package ships db/migrations alongside the handler and sets this.
function defaultMigrationsDir(): string {
  return process.env.MIGRATIONS_DIR
    ? path.resolve(process.env.MIGRATIONS_DIR)
    : path.resolve(__dirname, '..', '..', 'db', 'migrations');
}

export async function runMigrations(dir: string = defaultMigrationsDir()): Promise<string[]> {
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migration (
      name        TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const applied = new Set(
    (await pool.query<{ name: string }>('SELECT name FROM schema_migration')).rows.map(
      (row) => row.name,
    ),
  );

  const files = fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  const executed: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migration (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      logger.info('Applied migration', { file });
      executed.push(file);
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
    } finally {
      client.release();
    }
  }

  if (executed.length === 0) {
    logger.info('No pending migrations');
  }
  return executed;
}
