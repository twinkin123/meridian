create table if not exists sweeps (
  id              bigserial primary key,
  deposit_address text not null,
  asset           text not null check (asset in ('SOL','USDC')),
  amount_raw      numeric(38,0) not null,
  destination     text not null,
  signature       text,
  status          text not null default 'pending'
                  check (status in ('pending','submitted','confirmed','failed','skipped')),
  error           text,
  attempts        int not null default 0,
  created_at      timestamptz not null default now(),
  submitted_at    timestamptz,
  confirmed_at    timestamptz
);

create unique index if not exists sweeps_sig_uniq
  on sweeps (signature) where signature is not null;

create index if not exists sweeps_addr_idx on sweeps (deposit_address, status);
create index if not exists sweeps_status_idx on sweeps (status, created_at);