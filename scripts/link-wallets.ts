import 'dotenv/config';
import { pool } from '../src/db.js';

const id = process.env.PRIVY_APP_ID!;
const sec = process.env.PRIVY_APP_SECRET!;
const auth = 'Basic ' + Buffer.from(`${id}:${sec}`).toString('base64');

const byAddr = new Map<string, string>();
let cursor: string | undefined;
for (;;) {
  const url = new URL('https://api.privy.io/v1/wallets');
  url.searchParams.set('chain_type', 'solana');
  url.searchParams.set('limit', '100');
  if (cursor) url.searchParams.set('cursor', cursor);
  const r = await fetch(url, { headers: { 'privy-app-id': id, Authorization: auth } });
  if (!r.ok) throw new Error(`list ${r.status}`);
  const j = (await r.json()) as { data?: { id: string; address: string }[]; next_cursor?: string };
  for (const w of j.data ?? []) byAddr.set(w.address, w.id);
  cursor = j.next_cursor;
  if (!cursor) break;
}

const { rows } = await pool.query<{ id: string; deposit_addr: string }>(
  'select id, deposit_addr from users where privy_address is null and deposit_addr is not null',
);
let ok = 0;
for (const r of rows) {
  const wid = byAddr.get(r.deposit_addr);
  if (!wid) { console.log('NO WALLET', r.deposit_addr); continue; }
  await pool.query(
    'update users set privy_wallet_id = $2, privy_address = $3 where id = $1',
    [r.id, wid, r.deposit_addr],
  );
  ok++;
}
console.log('linked', ok, 'of', rows.length);
await pool.end();