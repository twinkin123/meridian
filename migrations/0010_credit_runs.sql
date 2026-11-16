create table credit_runs (
  day        date primary key,
  posted     int not null default 0,
  total      bigint not null default 0,
  created_at timestamptz not null default now()
);