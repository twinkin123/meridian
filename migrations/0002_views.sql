create view v_balance as
select a.owner_id as user_id, a.code,
       coalesce(-sum(p.amount), 0) as balance
from accounts a
left join postings p on p.account_id = a.id
where a.owner_type = 'user'
group by a.owner_id, a.code;

create function total_liabilities() returns bigint language sql stable as $$
  select coalesce(sum(-p.amount), 0)
  from postings p join accounts a on a.id = p.account_id
  where a.kind = 'liability'
$$;

create function total_client_assets() returns bigint language sql stable as $$
  select coalesce(sum(p.amount), 0)
  from postings p join accounts a on a.id = p.account_id
  where a.code in ('1000','1010')
$$;

create function solvency_margin() returns bigint language sql stable as $$
  select total_client_assets() - total_liabilities()
$$;