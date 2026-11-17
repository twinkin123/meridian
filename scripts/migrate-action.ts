import 'dotenv/config';
import { pool } from '../src/db.js';
await pool.query('alter table withdrawals add column if not exists privy_action_id text');
await pool.query('create index if not exists withdrawals_action_idx on withdrawals (privy_action_id) where privy_action_id is not null');
console.log('migrated');
await pool.end();