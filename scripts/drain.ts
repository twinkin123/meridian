import 'dotenv/config';
import { sendUsdc, sendSol, treasuryOnchainAddress, waitForTreasuryAction, actionSig } from '../src/privy.js';
import { getSolLamports, getSplAmount } from '../src/solana/rpc.js';

const TO = process.argv[2];
const DRY = process.argv.includes('--dry');
if (!TO) {
  console.error('usage: tsx scripts/drain.ts <destination> [--dry]');
  process.exit(1);
}

/** Left behind so the SOL transfer and any ATA rent can be paid. */
const FEE_RESERVE = 15_000_000n;

const mint = process.env.USDC_MINT;
if (!mint) throw new Error('USDC_MINT missing');

const from = await treasuryOnchainAddress();
const usdcBal = await getSplAmount(from, mint);
const lamports = await getSolLamports(from);
const solSend = lamports > FEE_RESERVE ? lamports - FEE_RESERVE : 0n;

console.log(JSON.stringify({
  from, to: TO,
  usdc_micro: usdcBal.toString(),
  lamports: lamports.toString(),
  sol_lamports_sent: solSend.toString(),
  sol_left: (lamports - solSend).toString(),
  dry: DRY,
}, null, 1));

if (DRY) process.exit(0);

if (usdcBal > 0n) {
  const id = await sendUsdc(TO, usdcBal, 'drain:usdc', `drain-usdc-${Date.now()}`);
  const s = await waitForTreasuryAction(id);
  console.log('usdc', s, (await actionSig(id)) ?? '');
  if (s !== 'succeeded') { console.error('usdc did not settle'); process.exit(1); }
}

if (solSend > 0n) {
  const id = await sendSol(TO, solSend, 'drain:sol', `drain-sol-${Date.now()}`);
  const s = await waitForTreasuryAction(id);
  console.log('sol', s, (await actionSig(id)) ?? '');
  if (s !== 'succeeded') { console.error('sol did not settle'); process.exit(1); }
}

console.log('drained');