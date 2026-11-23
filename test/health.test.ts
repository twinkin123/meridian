import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/http/health.ts', import.meta.url), 'utf8');

test('a thrown recon read reports not-ok while db stays true', () => {
  assert.ok(src.includes('return { ok: false, db: true, recon: false'));
  assert.ok(!src.includes('return { ok: true, db: true'));
});

test('the payload distinguishes an unmeasured recon from a dead database', () => {
  assert.ok(src.includes('recon: boolean'));
  assert.ok(src.includes('recon: true'));
  assert.ok(src.includes('db: false, recon: false'));
});