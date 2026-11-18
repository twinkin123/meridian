import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verdictFor, driftThreshold, DRIFT_FLOOR_USD, DRIFT_FLOOR_USD } from '../src/recon.js';

const LIMIT = driftThreshold(0n);

test('the band floors at DRIFT_FLOOR_USD when liabilities are zero', () => {
  assert.equal(LIMIT, DRIFT_FLOOR_USD);
});

test('the band scales at DRIFT_FREEZE_BP of liabilities', () => {
  assert.equal(driftThreshold(100_000_000_000n), 10_000_000_000n);
});

test('clean books are ok', () => {
  assert.equal(verdictFor(0n, 0n), 'ok');
});

test('drift inside the band is ok either way', () => {
  assert.equal(verdictFor(0n, LIMIT), 'ok');
  assert.equal(verdictFor(0n, -LIMIT), 'ok');
});

test('more coins than owed is a surplus, not a freeze', () => {
  assert.equal(verdictFor(0n, LIMIT + 1n), 'surplus');
});

test('fewer coins than owed is drift and freezes', () => {
  assert.equal(verdictFor(0n, -(LIMIT + 1n)), 'drift');
});

test('negative margin outranks everything', () => {
  assert.equal(verdictFor(-1n, DRIFT_FLOOR_USD * 100n), 'insolvent');
  assert.equal(verdictFor(-1n, -(DRIFT_FLOOR_USD * 100n)), 'insolvent');
});
