import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { tx, one, none, close } from '../src/db.js';
import { post } from '../src/ledger/post.js';
import { available, liabilities } from '../src/ledger/balances.js';

let uid: string;

beforeEach(async () => {
  await none('truncate postings, transactions restart identity');
  await none(`delete from accounts where owner_type='user'`);
  await none('delete from users');
  uid = (
    await one<{ id: string }>(
      `insert into users (email,pw_hash,deposit_addr) values ('t@x','x','a1') returning id`,
    )
  ).id;
  for (const c of ['2000', '2010', '2020', '2050']) {
    await none(
      `insert into accounts (code,kind,owner_type,owner_id) values ($1,'liability','user',$2)`,
      [c, uid],
    );
  }
});

after(async () => { await close(); });

test('single leg throws', async () => {
  await assert.rejects(() => tx((t) => post(t, 'x', null, [{ code: '1000', amount: 100n }])));
});

test('balanced two legs pass', async () => {
  await tx((t) => post(t, 'dep', null, [
    { code: '1000', amount: 500n },
    { code: '2000', owner: uid, amount: -500n },
  ]));
  assert.equal(await available(uid), 500n);
  assert.equal(await liabilities(), 500n);
});

test('three legs must still net zero', async () => {
  await assert.rejects(() => tx((t) => post(t, 'bad', null, [
    { code: '1000', amount: 500n },
    { code: '2000', owner: uid, amount: -400n },
  ])));
});

test('zero amount rejected', async () => {
  await assert.rejects(() => tx((t) => post(t, 'z', null, [
    { code: '1000', amount: 0n },
    { code: '2000', owner: uid, amount: 0n },
  ])));
});

test('postings are immutable', async () => {
  await tx((t) =>
    post(t, 'c', null, [
      { code: '1000', amount: 100n },
      { code: '2000', owner: uid, amount: -100n },
    ]),
  );
  await assert.rejects(() => none('update postings set amount = amount + 1'));
  await assert.rejects(() => none('delete from postings'));
});

test('external_ref unique per kind', async () => {
  const legs = [{ code: '1000', amount: 10n }, { code: '2000', owner: uid, amount: -10n }];
  await tx((t) => post(t, 'dep', 'sig1', legs));
  await assert.rejects(() => tx((t) => post(t, 'dep', 'sig1', legs)));
});

test('balance is derived not stored', async () => {
  await tx((t) => post(t, 'c', null, [
    { code: '1010', amount: 900n }, { code: '2000', owner: uid, amount: -900n },
  ]));
  await tx((t) => post(t, 'd', null, [
    { code: '2000', owner: uid, amount: 400n }, { code: '1010', amount: -400n },
  ]));
  assert.equal(await available(uid), 500n);
  assert.equal(await liabilities(), 500n);
});
