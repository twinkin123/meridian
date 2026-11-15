import { one } from '../db.js';

export async function available(userId: string): Promise<bigint> {
  const r = await one<{ b: string }>(
    `select coalesce(balance,0) b from v_balance where user_id=$1 and code='2000'`,
    [userId],
  );
  return BigInt(r.b);
}

export async function liabilities(): Promise<bigint> {
  return BigInt((await one<{ v: string }>('select total_liabilities() v')).v);
}

export async function margin(): Promise<bigint> {
  return BigInt((await one<{ v: string }>('select solvency_margin() v')).v);
}
