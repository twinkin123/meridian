import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchDeposit, usdMicro, USDC_MINT, ownerTokenDelta } from '../src/solana/match.js';

const addr = 'DepositAddr111';
const P = 71_500_000n;

function usdcTx(delta: string) {
  return {
    meta: {
      err: null,
      preTokenBalances: [{ mint: USDC_MINT, owner: addr, uiTokenAmount: { amount: '0' } }],
      postTokenBalances: [{ mint: USDC_MINT, owner: addr, uiTokenAmount: { amount: delta } }],
      preBalances: [0],
      postBalances: [0],
    },
    transaction: { message: { accountKeys: [addr] } },
  };
}

test('detects usdc credit', () => {
  assert.deepEqual(matchDeposit(usdcTx('5000000'), addr), { asset: 'USDC', qty: 5000000n });
});

test('ignores failed tx', () => {
  const t = usdcTx('5000000');
  (t.meta as any).err = { x: 1 };
  assert.equal(matchDeposit(t, addr), null);
});

test('ignores wrong owner', () => {
  assert.equal(matchDeposit(usdcTx('5000000'), 'Other'), null);
});

test('ignores zero delta', () => {
  assert.equal(matchDeposit(usdcTx('0'), addr), null);
});

test('detects native sol', () => {
  const t = {
    meta: {
      err: null,
      preBalances: [100],
      postBalances: [4000900],
      preTokenBalances: [],
      postTokenBalances: [],
    },
    transaction: { message: { accountKeys: [addr] } },
  };
  assert.deepEqual(matchDeposit(t, addr), { asset: 'SOL', qty: 4000800n });
});

test('usdc is already micro-dollars', () => {
  assert.equal(usdMicro('USDC', 7_100_000n, P), 7_100_000n);
});

test('sol converts lamports at the micro price', () => {
  assert.equal(usdMicro('SOL', 100_000_000n, P), 7_150_000n);
  assert.equal(usdMicro('SOL', 50_000_000n, P), 3_575_000n);
});

test('sol dust rounds to zero', () => {
  assert.equal(usdMicro('SOL', 1n, 1n), 0n);
});
test('spl delta sums every token account of the owner', () => {
  const meta = {
    preTokenBalances: [
      { mint: USDC_MINT, owner: addr, uiTokenAmount: { amount: '100' } },
      { mint: USDC_MINT, owner: 'Other', uiTokenAmount: { amount: '999' } },
    ],
    postTokenBalances: [
      { mint: USDC_MINT, owner: addr, uiTokenAmount: { amount: '600' } },
      { mint: USDC_MINT, owner: 'Other', uiTokenAmount: { amount: '999' } },
    ],
  };
  assert.equal(ownerTokenDelta(meta, addr, USDC_MINT), 500n);
});

test('spl delta counts a freshly created token account', () => {
  const meta = {
    preTokenBalances: [],
    postTokenBalances: [{ mint: USDC_MINT, owner: addr, uiTokenAmount: { amount: '38000000' } }],
  };
  assert.equal(ownerTokenDelta(meta, addr, USDC_MINT), 38000000n);
});

test('spl delta is zero when the owner is untouched', () => {
  assert.equal(ownerTokenDelta({}, addr, USDC_MINT), 0n);
  assert.equal(ownerTokenDelta(null, addr, USDC_MINT), 0n);
});

test('spl delta ignores a different mint', () => {
  const meta = { postTokenBalances: [{ mint: 'OtherMint', owner: addr, uiTokenAmount: { amount: '5' } }] };
  assert.equal(ownerTokenDelta(meta, addr, USDC_MINT), 0n);
});
