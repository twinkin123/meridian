import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { pool } from './src/db.js';
await pool.query(readFileSync('migrations/0039_deposit_source.sql', 'utf8'));
const c = await pool.query(`select column_name from information_schema.columns where table_name='deposits' and column_name like 'relay%'`);
console.log('added:', c.rows.map((r: any) => r.column_name).join(', ') || 'NONE');
await pool.end();
