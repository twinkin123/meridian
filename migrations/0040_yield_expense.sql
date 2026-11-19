-- 0040: the daily credit is a platform cost, not an asset.
--
-- The platform generates the percentage itself; no USDC arrives on-chain to back
-- it. Booking the gross against cash asset 1010 therefore inflated assets against
-- the chain by the full credit every day. From here the gross goes to an expense
-- account and cash is left untouched.
--
-- 1010 is the SOL asset account, so this also stops USDC-denominated yield being
-- mixed into a lamport-scaled balance.

insert into accounts (code, kind, owner_type)
values ('5020', 'expense', 'platform')
on conflict do nothing;

-- One-off correction: move the historic unfunded yield out of 1010.
-- X is derived from the ledger, never from a chain read.
do $$
declare x bigint;
begin
  if exists (select 1 from transactions where kind = 'ReclassYieldToExpense') then
    raise notice '0040: already reclassed, skipping';
    return;
  end if;

  select coalesce(sum(p.amount), 0)
    into x
    from postings p
    join accounts a on a.id = p.account_id
    join transactions t on t.id = p.tx_id
   where a.code = '1010'
     and t.kind = 'SettlementCredit';

  if x <= 0 then
    raise notice '0040: no historic yield to reclass';
    return;
  end if;

  perform post(
    'ReclassYieldToExpense',
    'yield-reclass-0040',
    jsonb_build_array(
      jsonb_build_object('code', '5020', 'amount', x),
      jsonb_build_object('code', '1010', 'amount', -x)
    )
  );

  raise notice '0040: reclassed % micro-USD of unfunded yield out of 1010', x;
end $$;