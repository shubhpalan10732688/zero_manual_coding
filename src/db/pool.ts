import { Pool, PoolClient, QueryResultRow } from 'pg';

import { optionalEnv, requireEnv } from '../config';

let pool: Pool | undefined;

export function getPool(): Pool {
  if (pool) return pool;

  const sslMode = optionalEnv('PGSSLMODE');
  pool = new Pool({
    connectionString: requireEnv('DATABASE_URL'),
    max: Number(optionalEnv('PG_POOL_MAX', '5')),
    idleTimeoutMillis: Number(optionalEnv('PG_IDLE_TIMEOUT_MS', '10000')),
    // RDS presents a certificate signed by the Amazon root CA, which is not in the
    // Node trust store, so verification is disabled rather than the connection.
    ssl: sslMode === 'require' ? { rejectUnauthorized: false } : undefined,
  });
  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await getPool().query<T>(text, params);
  return result.rows;
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (!pool) return;
  await pool.end();
  pool = undefined;
}
