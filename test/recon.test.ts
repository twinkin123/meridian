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
test('daily credit is never gated by the freeze', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/jobs/daily.ts', import.meta.url), 'utf8');
  assert.equal(src.split('freezeLevel').length - 1, 0);
});

test('recon never sets the freeze level itself', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/recon.ts', import.meta.url), 'utf8');
  assert.ok(src.includes('export async function setFreeze'));
  assert.equal(src.split('await setFreeze(').length - 1, 0);
});

test('admin is the only caller that sets the freeze', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  const sep = String.fromCharCode(92);
  const files = readdirSync(new URL('../src', import.meta.url), { recursive: true })
    .map((f) => String(f).split(sep).join(String.fromCharCode(47)))
    .filter((f) => f.endsWith('.ts'))
    .map((f) => 'src/' + f);
  const callers = files.filter((f) => readFileSync(f, 'utf8').includes('await setFreeze('));
  assert.deepEqual(callers.sort(), ['src/admin.ts']);
});
