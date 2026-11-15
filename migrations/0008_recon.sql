create table system_state (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);
insert into system_state (key, value) values ('freeze_level', '0')
  on conflict (key) do nothing;

create table recon_runs (
  id            bigserial primary key,
  chain_sol     bigint not null,
  chain_usdc    bigint not null,
  chain_usd     bigint not null,
  ledger_assets bigint not null,
  liabilities   bigint not null,
  margin        bigint not null,
  drift         bigint not null,
  stuck         int not null,
  verdict       text not null check (verdict in ('ok','drift','insolvent')),
  created_at    timestamptz not null default now()
);
create index recon_runs_created on recon_runs (created_at desc);