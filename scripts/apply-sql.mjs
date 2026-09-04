import fs from 'node:fs';
import process from 'node:process';

import pg from 'pg';

/**
 * Re-applies a single migration against the dev database.
 *
 * Migrations are written to be idempotent, so replaying one is how a view definition gets
 * updated during development without dropping the ingested data a fresh rebuild would lose.
 *
 *   node scripts/apply-sql.mjs db/migrations/006_agent_impact.sql
 */

const path = process.argv[2];
if (!path) {
  console.error('usage: node scripts/apply-sql.mjs <path-to-sql>');
  process.exit(1);
}

process.loadEnvFile('.env');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

try {
  await pool.query(fs.readFileSync(path, 'utf8'));
  console.log(`applied ${path}`);
} finally {
  await pool.end();
}
