import { pool } from './db.js';
import { getSigs } from './solana/rpc.js';
import { processSig } from './http/routes/webhooks.js';

let busy = false;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function pollDeposits(): Promise<void> {
  if (busy) return;
  busy = true;
  let hits = 0;
  try {
    const { rows } = await pool.query<{ a: string }>(
      'select privy_address a from users where privy_address is not null',
    );
    for (const { a } of rows) {
      try {
        for (const sig of await getSigs(a, 10)) {
          await processSig(sig);
          hits++;
        }
      } catch (e) {
        console.error('poll', a, e instanceof Error ? e.message : e);
      }
      await sleep(250);
    }
    if (hits) console.log('poll: scanned', hits);
  } finally {
    busy = false;
  }
}