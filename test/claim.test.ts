import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canClaim } from '../src/withdrawals.js';

test('an approved row with no action can be claimed', () => {
  assert.equal(canClaim('approved', null), true);
});

test('an approved row still carrying an action can be claimed', () => {
  assert.equal(canClaim('approved', 'act_1'), true);
});

test('a stranded sending row with no action can be claimed', () => {
  assert.equal(canClaim('sending', null), true);
});

test('a sending row with a live action belongs to the other worker', () => {
  assert.equal(canClaim('sending', 'act_1'), false);
});

test('terminal and pending statuses are never claimed', () => {
  for (const s of ['sent', 'failed', 'cancelled', 'requested']) {
    assert.equal(canClaim(s, null), false, s);
    assert.equal(canClaim(s, 'act_1'), false, s);
  }
});

test('the claim reads the action id off the locked row', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/withdrawals.ts', import.meta.url), 'utf8');
  assert.ok(src.includes('privy_action_id from withdrawals where id = $1 for update'));
  assert.ok(src.includes('canClaim(cur.status, cur.privy_action_id)'));
});

test('a dead action is cleared before the claim, guarded on its id', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/withdrawals.ts', import.meta.url), 'utf8');
  const clear = src.indexOf('privy_action_id = null, sig = null');
  const claim = src.indexOf('canClaim(cur.status');
  assert.ok(clear > 0, 'clear present');
  assert.ok(claim > clear, 'clear precedes the claim');
  assert.ok(src.includes('and privy_action_id = $2'), 'clear is guarded');
});