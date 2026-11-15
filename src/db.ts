import pg from 'pg';
import { env } from './env.js';

export const pool = new pg.Pool({
  connectionString: env.databaseUrl,
  max: env.isTest ? 4 : 20,
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
