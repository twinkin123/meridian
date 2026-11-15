create function post(p_kind text, p_ref text, p_legs jsonb) returns uuid
language plpgsql as $$
declare v_tx uuid; v_leg jsonb;
begin
  insert into transactions (kind, external_ref) values (p_kind, p_ref) returning id into v_tx;
  for v_leg in select * from jsonb_array_elements(p_legs) loop
    insert into postings (tx_id, account_id, amount)
    select v_tx, a.id, (v_leg->>'amount')::bigint
    from accounts a
    where a.code = v_leg->>'code'
      and a.owner_id is not distinct from (v_leg->>'owner')::uuid;
  end loop;
  return v_tx;
end $$;