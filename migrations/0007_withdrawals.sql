create type withdrawal_status as enum
  ('requested','approved','sending','sent','failed','cancelled');

create table withdrawal_addresses (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  address    text not null,
  first_seen timestamptz not null default now(),
  last_used  timestamptz,
  unique (user_id, address)
);

create table withdrawals (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id),
  asset        text not null check (asset in ('SOL','USDC')),
  address      text not null,
  usd_amount   bigint not null check (usd_amount > 0),
  qty_raw      bigint,
  status       withdrawal_status not null default 'requested',
  requested_by uuid references users(id),
  approved_by  text,
  sig          text,
  error        text,
  created_at   timestamptz not null default now(),
  sent_at      timestamptz,
  constraint two_person check (approved_by is null or approved_by <> requested_by::text)
);

create index withdrawals_user on withdrawals (user_id, created_at desc);
create index withdrawals_status on withdrawals (status, created_at);
create unique index withdrawals_sig on withdrawals (sig) where sig is not null;