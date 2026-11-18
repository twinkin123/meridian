import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withRetry } from '../src/privy.js';

test('retry returns the first success', async () => {
  let calls = 0;
  const v = await withRetry(async () => {
    calls++;
    if (calls < 3) throw new Error('429');
    return 'ok';
  }, 4);
  assert.equal(v, 'ok');
  assert.equal(calls, 3);
});

test('retry rethrows after the last attempt', async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(async () => {
      calls++;
      throw new Error('429');
    }, 3),
    /429/,
  );
  assert.equal(calls, 3);
});

test('retry does not retry a success', async () => {
  let calls = 0;
  await withRetry(async () => {
    calls++;
    return 1;
  });
  assert.equal(calls, 1);
});
