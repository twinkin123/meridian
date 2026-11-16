-- restore strict recon

create or replace function total_client_assets() returns bigint language sql stable as $$
select coalesce(sum(p.amount), 0)
from postings p join accounts a on a.id = p.account_id
where a.code in ('1000','1010')
$$;

create or replace function total_liabilities() returns bigint language sql stable as $$
select coalesce(sum(-p.amount), 0)
from postings p join accounts a on a.id = p.account_id
where a.kind = 'liability'
$$;