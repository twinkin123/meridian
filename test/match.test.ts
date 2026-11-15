import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchDeposit, usdMicro, USDC_MINT } from '../src/solana/match.js';

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
      postBalances: [900],
      preTokenBalances: [],
      postTokenBalances: [],
    },
    transaction: { message: { accountKeys: [addr] } },
  };
  assert.deepEqual(matchDeposit(t, addr), { asset: 'SOL', qty: 800n });
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