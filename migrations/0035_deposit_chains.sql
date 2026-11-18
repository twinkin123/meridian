create table if not exists deposit_routes (
  asset text not null,
  chain text not null,
  symbol text not null,
  network text not null,
  family text not null,
  fee_pct numeric(8, 4),
  viable boolean not null default true,
  checked_at timestamptz not null default now(),
  primary key (asset, chain)
);

create table if not exists deposit_addresses (
  user_id uuid not null references users(id) on delete cascade,
  family text not null,
  address text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, family)
);
