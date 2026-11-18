import { pool } from './db.js';
import { getSigs } from './solana/rpc.js';
import { processSig } from './http/routes/webhooks.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';
import { USDC_MINT } from './solana/match.js';

// Cursor lives in the database (users.last_polled_at) so it survives deploys.
// Ordering is nulls-first, so new addresses are covered before old ones repeat.
const SLICE = 50;
const PER_ADDRESS = 20;
let busy = false;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function pollDeposits(): Promise<void> {
  if (busy) return;
  busy = true;

  let hits = 0;
  try {
    const { rows } = await pool.query<{ a: string; id: string; last_deposit_sig: string | null; last_ata_sig: string | null }>(
      `select privy_address a, id, last_deposit_sig, last_ata_sig from users
        where privy_address is not null
        order by last_polled_at nulls first
        limit $1`,
      [SLICE],
    );
    if (rows.length === 0) return;

    for (const row of rows) {
      const a = row.a;

      let ata: string;
      try {
        ata = (await getAssociatedTokenAddress(new PublicKey(USDC_MINT), new PublicKey(a))).toBase58();
      } catch (e) {
        console.error('poll: ata', a, e instanceof Error ? e.message : e);
        await pool.query('update users set last_polled_at = now() where id = $1', [row.id]);
        continue;
      }

      const seen = new Set<string>();
      let nextNative: string | null = row.last_deposit_sig;
      let nextAta: string | null = row.last_ata_sig;

      for (const addr of [a, ata]) {
        const cursor = addr === a ? row.last_deposit_sig : row.last_ata_sig;
        let sigs: string[] = [];
        let failed = false;
        try {
          sigs = await getSigs(addr, PER_ADDRESS, cursor);
        } catch (e) {
          failed = true;
          console.error('poll', addr, e instanceof Error ? e.message : e);
        }
        for (const sig of sigs) {
          if (seen.has(sig)) continue;
          seen.add(sig);
          try {
            await processSig(sig);
            hits++;
          } catch (e) {
            failed = true;
            console.error('processSig', sig, e instanceof Error ? e.message : e);
          }
        }
        if (!failed && sigs.length) {
          if (addr === a) nextNative = sigs[0];
          else nextAta = sigs[0];
        }
      }

      await pool.query(
        'update users set last_polled_at = now(), last_deposit_sig = coalesce($2, last_deposit_sig), last_ata_sig = coalesce($3, last_ata_sig) where id = $1',
        [row.id, nextNative, nextAta],
      );
      await sleep(120);
    }

    if (hits) console.log('poll: processed', hits, 'signatures across', rows.length, 'addresses');
  } finally {
    busy = false;
  }
}
