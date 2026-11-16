import { pool, close } from '../dist/src/db.js';
await pool.query(`delete from referral_runs`);
await pool.query(`delete from referral_ledger`);
console.log('ok');
await close();