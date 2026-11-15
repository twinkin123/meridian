create type deposit_status as enum ('detected','credited','held','failed','returned');

create table deposits (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id),
  sig        text not null unique,
  asset      text not null check (asset in ('USDC','SOL')),
  qty        bigint not null,
  usd_at_det bigint not null,
  status     deposit_status not null default 'detected',
  created_at timestamptz not null default now()
);
create index deposits_user on deposits (user_id);

create function ensure_user_accounts(p_user uuid) returns void language plpgsql as $$
declare c text;
begin
  foreach c in array array['2000','2010','2020','2050'] loop
    insert into accounts (code, kind, owner_type, owner_id)
    values (c, 'liability', 'user', p_user)
    on conflict (code, owner_id) do nothing;
  end loop;
end $$;