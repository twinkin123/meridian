import pg from 'pg';
import { env } from './env.js';

// Railway's public proxy presents a chain Node will not trust. Local tooling
// needs TLS with verification off; the internal host and CI use no TLS at all.
const looseTls = (u: string): boolean =>
  process.env.DATABASE_SSL === 'no-verify' || /proxy\.rlwy\.net/.test(u);

export const pool = new pg.Pool({
  connectionString: env.databaseUrl,
  max: env.isTest ? 4 : 20,
  ...(looseTls(env.databaseUrl) ? { ssl: { rejectUnauthorized: false } } : {}),
});

export type Tx = pg.PoolClient;

export async function tx<T>(fn: (t: Tx) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('begin');
    const r = await fn(c);
    await c.query('commit');
    return r;
  } catch (e) {
    await c.query('rollback');
    throw e;
  } finally {
    c.release();
  }
}

export async function one<T = any>(sql: string, args: unknown[] = []): Promise<T> {
  return (await pool.query(sql, args)).rows[0] as T;
}

export async function none(sql: string, args: unknown[] = []): Promise<void> {
  await pool.query(sql, args);
}

export async function close(): Promise<void> {
  await pool.end();
}