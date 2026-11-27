-- 0060: paper funding out of client assets; tag stake rows
alter table deposits add column if not exists source text not null default 'onchain';
alter table deposits drop constraint if exists deposits_source_check;
alter table deposits add constraint deposits_source_check check (source in ('onchain','stake'));
create index if not exists deposits_source_idx on deposits (source);
update deposits set source = 'stake' where sig like 'stake:%';

create or replace function total_paper_assets() returns bigint language sql stable as $$
  select coalesce(sum(p.amount), 0) from postings p join accounts a on a.id = p.account_id where a.code = '1020'
$$;

do $$
declare moved bigint;
begin
  if (select coalesce(sum(p.amount),0) from postings p join accounts a on a.id=p.account_id where a.code='1020') = 0 then
    select coalesce(sum(p.amount),0) into moved
      from postings p join transactions t on t.id=p.tx_id join accounts a on a.id=p.account_id
     where t.kind like 'AdminFund%' and a.code='1000';
    if moved > 0 then
      perform post('PaperReclass', 'paper:reclass:1', jsonb_build_array(
        jsonb_build_object('code','1000','amount', -moved),
        jsonb_build_object('code','1020','amount',  moved)
      ));
    end if;
  end if;
end $$;
