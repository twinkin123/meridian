import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeCap, qtyFor, NEW_ADDR_CAP, CAP_FLOOR, CAP_CEIL, ADDRESS_COOLDOWN_MS,
} from '../src/withdrawals.js';

const OLD = ADDRESS_COOLDOWN_MS + 1;
const YOUNG = ADDRESS_COOLDOWN_MS - 1;

test('unknown address gets the flat cap regardless of balance', () => {
  assert.equal(computeCap(false, 0, 900_000_000_000n), NEW_ADDR_CAP);
});

test('known address inside cooldown still gets the flat cap', () => {
  assert.equal(computeCap(true, YOUNG, 900_000_000_000n), NEW_ADDR_CAP);
});

test('small balance is floored at the flat cap', () => {
  assert.equal(computeCap(true, OLD, 100_000_000n), CAP_FLOOR);
});

test('large balance scales to half', () => {
  assert.equal(computeCap(true, OLD, 4_000_000_000n), 2_000_000_000n);
});

test('huge balance is ceilinged', () => {
  assert.equal(computeCap(true, OLD, 900_000_000_000n), CAP_CEIL);
});

test('cap never falls below balance', () => {
  const bal = 100_000_000n;
  assert.ok(computeCap(true, OLD, bal) >= bal);
});

test('usdc qty equals the usd amount', () => {
  assert.equal(qtyFor('USDC', 14_200_000n, 142n), 14_200_000n);
});

test('sol qty converts usd at price', () => {
  assert.equal(qtyFor('SOL', 14_200_000n, 142n), 100_000_000n);
});

test('sol qty rounds down', () => {
  assert.equal(qtyFor('SOL', 1n, 3n), 333n);
});

test('sol qty of ten dollars at 142 is a tenth of a sol', () => {
  assert.equal(qtyFor('SOL', 10_000_000n, 142n), 70_422_535n);
});