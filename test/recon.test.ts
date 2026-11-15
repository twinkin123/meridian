import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verdictFor, DRIFT_FREEZE_USD } from '../src/recon.js';

test('clean books are ok', () => {
  assert.equal(verdictFor(0n, 0n), 'ok');
});

test('drift inside the band is ok either way', () => {
  assert.equal(verdictFor(0n, DRIFT_FREEZE_USD), 'ok');
  assert.equal(verdictFor(0n, -DRIFT_FREEZE_USD), 'ok');
});

test('more coins than owed is a surplus, not a freeze', () => {
  assert.equal(verdictFor(0n, DRIFT_FREEZE_USD + 1n), 'surplus');
});

test('fewer coins than owed is drift and freezes', () => {
  assert.equal(verdictFor(0n, -(DRIFT_FREEZE_USD + 1n)), 'drift');
});

test('negative margin outranks everything', () => {
  assert.equal(verdictFor(-1n, DRIFT_FREEZE_USD * 100n), 'insolvent');
  assert.equal(verdictFor(-1n, -(DRIFT_FREEZE_USD * 100n)), 'insolvent');
});