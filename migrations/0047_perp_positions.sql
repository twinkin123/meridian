create table if not exists perp_positions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id),
  market      text not null,
  side        text not null check (side in ('long','short')),
  stake       bigint not null check (stake >= 1000000 and stake <= 10000000),
  leverage    integer not null check (leverage in (500,1000)),
  entry       numeric(38,10) not null,
  qty         numeric(38,12) not null,
  liq_price   numeric(38,10) not null,
  status      text not null default 'open' check (status in ('open','closed','liquidated')),
  exit_price  numeric(38,10),
  pnl         bigint,
  opened_at   timestamptz not null default now(),
  closed_at   timestamptz
);

create index if not exists perp_positions_open on perp_positions (status) where status = 'open';
create index if not exists perp_positions_user on perp_positions (user_id, opened_at desc);

insert into accounts (code, kind, owner_type, owner_id)
values ('2100', 'liability', 'platform', null)
on conflict (code, owner_id) do nothing;