import { PoolClient } from 'pg';

import { getPool } from './pool';

/** Postgres caps a statement at 65535 bound parameters; stay well under it. */
const MAX_PARAMS_PER_STATEMENT = 30_000;

export interface BulkUpsertOptions {
  table: string;
  columns: string[];
  rows: unknown[][];
  /** Full conflict clause, e.g. `ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name`. */
  conflict: string;
  client?: PoolClient;
}

/**
 * Inserts rows in batches sized to the parameter limit. Every ingest job re-fetches a
 * trailing window, so all writes must be idempotent via the caller's conflict clause.
 */
export async function bulkUpsert({
  table,
  columns,
  rows,
  conflict,
  client,
}: BulkUpsertOptions): Promise<number> {
  if (rows.length === 0) return 0;

  const executor = client ?? getPool();
  const rowsPerStatement = Math.max(1, Math.floor(MAX_PARAMS_PER_STATEMENT / columns.length));
  let written = 0;

  for (let offset = 0; offset < rows.length; offset += rowsPerStatement) {
    const batch = rows.slice(offset, offset + rowsPerStatement);
    const params: unknown[] = [];
    const tuples = batch.map((row) => {
      const placeholders = row.map((value) => {
        params.push(value);
        return `$${params.length}`;
      });
      return `(${placeholders.join(', ')})`;
    });

    const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${tuples.join(', ')} ${conflict}`;
    const result = await executor.query(sql, params);
    written += result.rowCount ?? 0;
  }

  return written;
}
