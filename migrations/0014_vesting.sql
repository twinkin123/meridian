-- pending settlement credits, released 25% every 6h

insert into accounts (code, kind, owner_type) select '2060','liability','platform' where not exists (select 1 from accounts where code='2060' and owner_id is null);

create table if not exists vesting (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  day text not null,
  amount bigint not null,
  due_at timestamptz not null,
  released_at timestamptz
);

create index if not exists vesting_due on vesting (due_at) where released_at is null;

create or replace function ensure_user_accounts(p_user uuid) returns void language plpgsql as $$
declare c text;
begin
  foreach c in array array['2000','2010','2020','2050','2060'] loop
    insert into accounts (code, kind, owner_type, owner_id)
    values (c, 'liability', 'user', p_user)
    on conflict (code, owner_id) do nothing;
  end loop;
end $$;
