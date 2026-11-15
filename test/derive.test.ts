import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { address } from '../src/solana/derive.js';
import { one, none, close } from '../src/db.js';

after(async () => {
  await close();
});

test('indices produce distinct addresses', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const a = address(i);
    assert.ok(!seen.has(a), `collision at ${i}`);
    seen.add(a);
  }
});

test('derivation is deterministic', () => {
  assert.equal(address(42), address(42));
});

test('stored address matches re-derivation', async () => {
  await none(`delete from users where email = 'derive@x'`);
  const row = await one<{ id: string; deposit_index: number }>(
    `insert into users (email, pw_hash, deposit_addr)
     values ('derive@x', 'x', 'pending') returning id, deposit_index`,
  );
  await none(`update users set deposit_addr = $1 where id = $2`, [address(row.deposit_index), row.id]);
  const stored = await one<{ deposit_addr: string }>(`select deposit_addr from users where id = $1`, [row.id]);
  assert.equal(stored.deposit_addr, address(row.deposit_index));
  await none(`delete from users where id = $1`, [row.id]);
});