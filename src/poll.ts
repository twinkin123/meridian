import { pool } from './db.js';
import { getSigs } from './solana/rpc.js';
import { processSig } from './http/routes/webhooks.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';
import { USDC_MINT } from './solana/match.js';

// Round-robin: only a slice of wallets per cycle, so RPC volume stays flat as
// the user count grows. Each address is revisited every (wallets / SLICE)
// cycles — roughly 15 minutes at 5 per cycle and 25 wallets.
const SLICE = 5;
let busy = false;
let cursor = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function pollDeposits(): Promise<void> {
  if (busy) return;
  busy = true;
  let hits = 0;
  try {
    const { rows } = await pool.query<{ a: string }>(
      'select privy_address a from users where privy_address is not null order by id',
    );
    if (rows.length === 0) return;

    const take = Math.min(SLICE, rows.length);
    const slice: string[] = [];
    for (let i = 0; i < take; i++) slice.push(rows[(cursor + i) % rows.length].a);
    cursor = (cursor + take) % rows.length;

    for (const a of slice) {
      let ata: string;
      try {
        ata = (await getAssociatedTokenAddress(new PublicKey(USDC_MINT), new PublicKey(a))).toBase58();
      } catch (e) {
        console.error('poll: ata', a, e instanceof Error ? e.message : e);
        continue;
      }

      const seen = new Set<string>();

      for (const addr of [a, ata]) {
        let sigs: string[] = [];
        try {
          sigs = await getSigs(addr, 5);
        } catch (e) {
          console.error('poll', addr, e instanceof Error ? e.message : e);
        }

        for (const sig of sigs) {
          if (seen.has(sig)) continue;
          seen.add(sig);
          try {
            await processSig(sig);
            hits++;
          } catch (e) {
            console.error('processSig', sig, e instanceof Error ? e.message : e);
          }
        }
      }

      await sleep(250);
    }
    if (hits) console.log('poll: scanned', hits, 'of', slice.length, 'wallets');
  } finally {
    busy = false;
  }
}