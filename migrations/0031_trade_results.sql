create table if not exists trade_days (
  day date primary key,
  rate_bp integer not null check (rate_bp between 0 and 10000),
  source text not null check (source in ('recorded', 'estimated')),
  created_at timestamptz not null default now()
);

create table if not exists trade_results (
  day date not null references trade_days(day) on delete cascade,
  seq integer not null,
  symbol text not null,
  side text not null check (side in ('long', 'short')),
  open_px numeric(24, 10) not null,
  close_px numeric(24, 10) not null,
  opened_min integer not null,
  closed_min integer not null,
  ret_bp integer not null,
  primary key (day, seq)
);

create index if not exists trade_results_day_idx on trade_results (day);