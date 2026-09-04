import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

/**
 * Postgres for local development: applies the migrations, loads the demo seed, and
 * exposes the wire protocol on a TCP port so the Next.js app can connect with the same
 * `pg` driver it uses in production.
 *
 * State persists in .pglite/ between restarts, because connecting a real API key and
 * pulling real history is too slow to redo on every restart. The seed only truncates
 * the demo tables, so ingested agent data survives.
 *
 *   npm run dev:db
 *   npm run dev:db -- --fresh      discard everything and start over
 *   npm run dev:db -- --no-seed
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.DEV_DB_PORT ?? 5433);
const dataDir = process.env.DEV_DB_DIR ?? path.join(root, '.pglite');

if (process.argv.includes('--fresh')) {
  fs.rmSync(dataDir, { recursive: true, force: true });
  console.log('discarded previous dev database');
}

const db = await PGlite.create({ dataDir });

const migrationsDir = path.join(root, 'db', 'migrations');
for (const file of fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
  await db.exec(fs.readFileSync(path.join(migrationsDir, file), 'utf8'));
  console.log(`applied ${file}`);
}

if (!process.argv.includes('--no-seed')) {
  await db.exec(fs.readFileSync(path.join(root, 'db', 'seed', 'demo.sql'), 'utf8'));
  const seats = await db.query('SELECT COUNT(*)::int AS n FROM v_seat');
  const days = await db.query('SELECT COUNT(*)::int AS n FROM cursor_daily_usage');
  const events = await db.query('SELECT COUNT(*)::int AS n FROM cursor_usage_event');
  console.log(
    `seeded ${seats.rows[0].n} seats, ${days.rows[0].n} daily rows, ${events.rows[0].n} usage events`,
  );

  // The workspace seed is separate because it writes user-authored content. Every page under
  // /app is a different design problem empty and populated, and only one of those states can
  // be checked against an empty database.
  await db.exec(fs.readFileSync(path.join(root, 'db', 'seed', 'workspace.sql'), 'utf8'));
  const posts = await db.query('SELECT COUNT(*)::int AS n FROM achievement');
  const assets = await db.query('SELECT COUNT(*)::int AS n FROM shared_asset');
  const agents = await db.query('SELECT COUNT(*)::int AS n FROM cloud_agent');
  console.log(
    `seeded ${posts.rows[0].n} board posts, ${assets.rows[0].n} shared assets, ${agents.rows[0].n} cloud agents`,
  );
}

const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1' });
await server.start();
console.log(`dev database listening on postgres://postgres:postgres@127.0.0.1:${port}/postgres`);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await server.stop();
    await db.close();
    process.exit(0);
  });
}
