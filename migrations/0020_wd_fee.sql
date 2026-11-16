-- 5% withdrawal fee

alter table withdrawals add column if not exists fee bigint not null default 0;