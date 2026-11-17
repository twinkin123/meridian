import 'dotenv/config';
import { pool } from '../src/db.js';
await pool.query('alter table users add column if not exists privy_wallet_id text');
await pool.query('alter table users add column if not exists privy_address text');
await pool.query('create unique index if not exists users_privy_address_idx on users (privy_address) where privy_address is not null');
console.log('migrated');
await pool.end();