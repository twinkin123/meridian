import 'dotenv/config';
import argon2 from '@node-rs/argon2';
import pg from 'pg';
const [email, pw] = process.argv.slice(2);
if (!email || !pw) { console.error('usage: node scripts/setpw.mjs <email> <password>'); process.exit(1); }
const h = await argon2.hash(pw, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
const p = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const r = await p.query('update users set pw_hash=$1 where email=$2', [h, email]);
if (r.rowCount === 0) { console.error('no user', email); process.exit(1); }
await p.end();
console.log('set', email);