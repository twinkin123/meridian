import fs from 'fs';
import pg from 'pg';
for (const line of fs.readFileSync('.env','utf8').split(/\r?\n/)) {
  const i = line.indexOf('=');
  if (i > 0) { const k = line.slice(0,i).trim(); if (/^[A-Z_]+$/.test(k)) process.env[k] = line.slice(i+1).trim().replace(/^"|"$/g,''); }
}
console.log(process.env.DATABASE_URL.replace(/:\/\/[^@]*@/, '://***@'));
const p = new pg.Pool({ connectionString: process.env.DATABASE_URL });
console.table((await p.query('select email, referral_code, referred_by from users order by created_at')).rows);
console.table((await p.query('select * from referral_ledger')).rows);
await p.end();
