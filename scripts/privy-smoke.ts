import { createDepositWallet, sendUsdc, privyReady } from '../src/privy.js';

const run = async () => {
  if (!privyReady()) { console.log('privy not configured'); process.exit(1); }
  const w = await createDepositWallet('smoke-' + Date.now());
  console.log('deposit wallet', w.id, w.address);
  const id = await sendUsdc(
    process.argv[2] ?? w.address,
    1000000n,
    'smoke',
    'smoke-' + Date.now(),
  );
  console.log('transfer action', id);
};
run().catch((e) => { console.error(e); process.exit(1); });