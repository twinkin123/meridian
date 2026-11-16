insert into accounts (code, kind, owner_type) values ('5010','expense','platform')
on conflict do nothing;

create table if not exists referral_runs (
  period     text primary key,
  payouts    int not null default 0,
  total_usd  bigint not null default 0,
  ran_at     timestamptz not null default now()
);

create table if not exists referral_ledger (
  id             uuid primary key default gen_random_uuid(),
  period         text not null,
  referrer_id    uuid not null references users(id),
  invited        int not null,
  base_usd       bigint not null,
  rate_bp        int not null,
  commission_usd bigint not null,
  tx_id          uuid,
  created_at     timestamptz not null default now(),
  unique (period, referrer_id)
);

create index if not exists referral_ledger_ref_idx on referral_ledger (referrer_id, period);
