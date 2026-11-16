-- same fixture exclusion on the liability side

create or replace function total_liabilities() returns bigint language sql stable as $$
select coalesce(sum(-p.amount), 0)
from postings p
join accounts a on a.id = p.account_id
left join transactions t on t.id = p.tx_id
where a.kind = 'liability'
  and coalesce(t.external_ref, '') not like 'seed-%'
$$;