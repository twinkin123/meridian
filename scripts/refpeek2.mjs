import { pool, close } from '../dist/src/db.js';
const l = await pool.query(`select period, referrer_id, commission_usd, tx_id from referral_ledger`);
console.log('ledger', JSON.stringify(l.rows));
const b = await pool.query(`select coalesce(balance,0) b from v_balance where user_id = 'e9295783-abdb-474b-9a77-7b59cf958c14' and code = '2000'`);
console.log('bal', JSON.stringify(b.rows));
const t = await pool.query(`select kind, external_ref from transactions where kind like 'Referral%'`);
console.log('txs', JSON.stringify(t.rows));
await close();