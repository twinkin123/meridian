import 'dotenv/config';
import argon2 from '@node-rs/argon2';
import pg from 'pg';
const [email, pw] = process.argv.slice(2);
const h = await argon2.hash(pw, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
const p = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await p.query('update users set pw_hash=$1 where email=$2', [h, email]);
await p.end();
console.log('set', email);