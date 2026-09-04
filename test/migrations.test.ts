import fs from 'node:fs';
import path from 'node:path';

/**
 * Structural checks on the migration files. Grammar validation lives in
 * scripts/validate-sql.mjs, which runs the real Postgres parser; that package is
 * ESM-only and does not load under this CommonJS test setup.
 */

const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'db', 'migrations');
const files = fs
  .readdirSync(MIGRATIONS_DIR)
  .filter((file) => file.endsWith('.sql'))
  .sort();

describe('migrations', () => {
  it('has at least one migration', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('numbers migrations so they apply in a deterministic order', () => {
    for (const file of files) {
      expect(file).toMatch(/^\d{3}_[a-z0-9_]+\.sql$/);
    }
  });

  describe.each(files)('%s', (file) => {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');

    it('is safe to re-run, because the migration runner is not the only thing that applies it', () => {
      const creates = sql.match(/CREATE\s+(OR\s+REPLACE\s+)?(TABLE|INDEX|VIEW)/gi) ?? [];
      const guarded =
        (sql.match(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS/gi) ?? []).length +
        (sql.match(/CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS/gi) ?? []).length +
        (sql.match(/CREATE\s+OR\s+REPLACE\s+VIEW/gi) ?? []).length;

      expect(guarded).toBe(creates.length);
    });
  });
});
