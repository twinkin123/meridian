alter table users add column if not exists privy_wallet_id text;
alter table users add column if not exists privy_address text;
create unique index if not exists users_privy_address_idx on users (privy_address) where privy_address is not null;
alter table withdrawals add column if not exists privy_action_id text;
create index if not exists withdrawals_action_idx on withdrawals (privy_action_id) where privy_action_id is not null;