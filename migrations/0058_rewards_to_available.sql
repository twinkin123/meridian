-- 0058: referral commission is available balance, not a separate bucket
create or replace function rewards_to_available() returns void language plpgsql as $$
declare r record;
begin
  for r in select vb.user_id, vb.balance
             from v_balance vb
            where vb.code = '2080' and vb.balance <> 0
  loop
    perform post('RewardsToAvailable', 'rw:migrate:' || r.user_id::text, jsonb_build_array(
      jsonb_build_object('code', '2080', 'owner', r.user_id, 'amount',  r.balance),
      jsonb_build_object('code', '2000', 'owner', r.user_id, 'amount', -r.balance)
    ));
  end loop;
end $$;

select rewards_to_available();
