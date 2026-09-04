import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import initPgQuery from 'pg-query-emscripten';

/**
 * Parses every migration with the real Postgres grammar (the same parser the server
 * uses). Not a substitute for applying them to a database, but it catches the syntax
 * errors that would otherwise surface halfway through a deploy.
 *
 *   npm run validate:sql
 */

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations');
const files = fs
  .readdirSync(dir)
  .filter((file) => file.endsWith('.sql'))
  .sort();

const pgQuery = await initPgQuery();
let failed = 0;

for (const file of files) {
  const sql = fs.readFileSync(path.join(dir, file), 'utf8');
  const result = pgQuery.parse(sql);

  if (result.error) {
    failed += 1;
    const upToError = sql.slice(0, result.error.cursorpos ?? 0);
    const line = upToError.split('\n').length;
    console.error(`  FAIL  ${file}:${line}  ${result.error.message}`);
  } else {
    console.log(`  ok    ${file}  (${result.parse_tree.stmts.length} statements)`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} migration(s) failed to parse.`);
  process.exit(1);
}

console.log(`\n${files.length} migration(s) parsed cleanly.`);
