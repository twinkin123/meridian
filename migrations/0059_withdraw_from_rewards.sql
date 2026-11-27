alter table withdrawals add column if not exists from_rewards bigint not null default 0;
