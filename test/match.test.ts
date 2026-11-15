import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchDeposit, USDC_MINT } from '../src/solana/match.js';

const addr = 'DepositAddr111';

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