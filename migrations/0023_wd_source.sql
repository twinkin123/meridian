-- withdrawals remember which bucket funded them, so a failure refunds to the right place
alter table withdrawals add column if not exists source text not null default 'available';