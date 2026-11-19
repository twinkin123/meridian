import { readFileSync, writeFileSync } from 'node:fs';

function sub(s, from, to, label) {
  if (!s.includes(from)) { console.log('ANCHOR MISS', label); process.exit(1); }
  return s.split(from).join(to);
}

// --- webhooks.ts: memo helper + store ids, conflict on either constraint
{
  const p = 'src/http/routes/webhooks.ts';
  let s = readFileSync(p, 'utf8');
  if (!s.includes('function memosFrom')) {
    s = sub(
      s,
      '/** Helius puts the signature at the top level',
      `/** Relay attaches order and fill ids as memo instructions. */
function memosFrom(t: any): string[] {
  const out: string[] = [];
  for (const ix of t?.transaction?.message?.instructions ?? []) {
    if (ix?.programId === 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr' && typeof ix?.parsed === 'string') out.push(ix.parsed);
  }
  return out;
}

/** Helius puts the signature at the top level`,
      'memo helper',
    );
  }
  s = sub(
    s,
    `  if (!t) throw new Error(\`tx_not_found:\` + sig);`,
    `  if (!t) throw new Error(\`tx_not_found:\` + sig);\n\n  const memos = memosFrom(t);`,
    'memos const',
  );
  s = sub(
    s,
    `        \`insert into deposits (user_id, sig, asset, qty, usd_at_det, status)\n         values ($1,$2,$3,$4,$5,'detected')\n         on conflict (sig, user_id) do nothing returning id\`,\n        [u.id, sig, m.asset, qty.toString(), usd.toString()],`,
    `        \`insert into deposits (user_id, sig, asset, qty, usd_at_det, status, relay_order, relay_fill)\n         values ($1,$2,$3,$4,$5,'detected',$6,$7)\n         on conflict do nothing returning id\`,\n        [u.id, sig, m.asset, qty.toString(), usd.toString(), memos[0] ?? null, memos[1] ?? null],`,
    'insert',
  );
  writeFileSync(p, s);
  console.log('webhooks.ts patched');
}

// --- poll.ts: raise the per-address ceiling
{
  const p = 'src/poll.ts';
  let s = readFileSync(p, 'utf8');
  s = sub(s, 'const PER_ADDRESS = 20;', 'const PER_ADDRESS = 100;', 'per_address');
  writeFileSync(p, s);
  console.log('poll.ts patched');
}

// --- index.ts: poll faster than we sweep, register the watcher
{
  const p = 'src/index.ts';
  let s = readFileSync(p, 'utf8');
  s = sub(s, `import { pollDeposits } from './poll.js';`, `import { pollDeposits } from './poll.js';\nimport { watchDeposits } from './jobs/deposit-watch.js';`, 'import');
  s = sub(s, `  every(15 * 60 * 1000, pollDeposits, 'deposits');`, `  every(2 * 60 * 1000, pollDeposits, 'deposits');`, 'poll interval');
  s = sub(s, `  every(5 * 60 * 1000, () => runSweep({ dryRun: false, limit: 200 }), 'sweep');`, `  every(10 * 60 * 1000, () => runSweep({ dryRun: false, limit: 200 }), 'sweep');\n  every(10 * 60 * 1000, watchDeposits, 'deposit-watch');`, 'sweep interval');
  writeFileSync(p, s);
  console.log('index.ts patched');
}
