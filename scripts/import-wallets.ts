import 'dotenv/config';
import { pool } from '../src/db.js';
import { keypairForIndex } from '../src/sweeps.js';
import { importSolanaWallet } from '../src/privy.js';

const { rows } = await pool.query<{ id: string; deposit_addr: string; deposit_index: number }>(
  `select id, deposit_addr, deposit_index from users
    where deposit_addr is not null and privy_address is null
    order by deposit_index`,
);

console.log('to import', rows.length);
let ok = 0;

for (const r of rows) {
  const kp = keypairForIndex(r.deposit_index);
  const addr = kp.publicKey.toBase58();
  if (addr !== r.deposit_addr) { console.log('SKIP mismatch', r.deposit_index); continue; }
  try {
    const w = await importSolanaWallet(addr, kp.secretKey);
    if (w.address !== addr) console.log('ADDR DIFF', addr, '->', w.address);
    await pool.query(
      'update users set privy_wallet_id = $2, privy_address = $3 where id = $1',
      [r.id, w.id, w.address],
    );
    ok++;
    console.log('imported', r.deposit_index, addr);
  } catch (e) {
    console.log('FAIL', r.deposit_index, e instanceof Error ? e.message : e);
  }
}

console.log('done', ok, 'of', rows.length);
await pool.end();