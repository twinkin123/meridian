import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verdictFor, DRIFT_FREEZE_USD } from '../src/recon.js';

test('clean books are ok', () => {
  assert.equal(verdictFor(0n, 0n), 'ok');
});

test('small drift under the threshold is ok', () => {
  assert.equal(verdictFor(0n, DRIFT_FREEZE_USD - 1n), 'ok');
});

test('positive drift over the threshold freezes', () => {
  assert.equal(verdictFor(0n, DRIFT_FREEZE_USD + 1n), 'drift');
});

test('negative drift over the threshold freezes', () => {
  assert.equal(verdictFor(0n, -(DRIFT_FREEZE_USD + 1n)), 'drift');
});

test('negative margin outranks drift', () => {
  assert.equal(verdictFor(-1n, DRIFT_FREEZE_USD * 100n), 'insolvent');
});

test('zero margin with no drift is ok', () => {
  assert.equal(verdictFor(0n, 0n), 'ok');
});