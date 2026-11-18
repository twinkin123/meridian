import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeCap, qtyFor, NEW_ADDR_CAP, ADDRESS_COOLDOWN_MS,
} from '../src/withdrawals.js';

const OLD = ADDRESS_COOLDOWN_MS + 1;
const YOUNG = ADDRESS_COOLDOWN_MS - 1;
const P = 71_500_000n;

test('unknown address gets the flat cap regardless of balance', () => {
  assert.equal(computeCap(false, 0, 900_000_000_000n), NEW_ADDR_CAP);
});

test('known address inside cooldown still gets the flat cap', () => {
  assert.equal(computeCap(true, YOUNG, 900_000_000_000n), NEW_ADDR_CAP);
});

test('the flat cap is well under a large balance', () => {
  assert.ok(NEW_ADDR_CAP < 900_000_000_000n);
});

test('known address past cooldown gets the whole balance', () => {
  assert.equal(computeCap(true, OLD, 100_000_000n), 100_000_000n);
});

test('no ceiling applies to a large balance', () => {
  assert.equal(computeCap(true, OLD, 4_000_000_000n), 4_000_000_000n);
  assert.equal(computeCap(true, OLD, 900_000_000_000n), 900_000_000_000n);
});

test('a zero balance yields a zero cap', () => {
  assert.equal(computeCap(true, OLD, 0n), 0n);
});

test('usdc qty equals the usd amount', () => {
  assert.equal(qtyFor('USDC', 14_200_000n, P), 14_200_000n);
});

test('sol qty converts usd at the micro price', () => {
  assert.equal(qtyFor('SOL', 14_200_000n, P), 198_601_398n);
});

test('sol qty rounds down', () => {
  assert.equal(qtyFor('SOL', 1n, 3n), 333_333_333n);
});

test('ten dollars buys the right sol at 71.50', () => {
  assert.equal(qtyFor('SOL', 10_000_000n, P), 139_860_139n);
});
