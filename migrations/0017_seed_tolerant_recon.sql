-- exclude fixture deposits from client assets while testing

create or replace function total_client_assets() returns bigint language sql stable as $$
select coalesce(sum(p.amount), 0)
from postings p
join accounts a on a.id = p.account_id
left join transactions t on t.id = p.tx_id
where a.code in ('1000','1010')
  and coalesce(t.external_ref, '') not like 'seed-%'
$$;