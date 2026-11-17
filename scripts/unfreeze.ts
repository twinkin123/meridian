import 'dotenv/config';
import { pool } from '../src/db.js';
await pool.query("update system_state set value = '0', updated_at = now() where key = 'freeze_level'");
await pool.query("insert into system_state (key, value) values ('freeze_actor', 'manual:unfreeze') on conflict (key) do update set value = excluded.value, updated_at = now()");
console.log('unfrozen');
await pool.end();