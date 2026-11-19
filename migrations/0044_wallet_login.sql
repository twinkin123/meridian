-- 0044_wallet_login.sql — a wallet is a login method, nothing else changes
alter table users alter column email drop not null;
alter table users alter column pw_hash drop not null;

alter table users add column if not exists wallet_addr text;
create unique index if not exists users_wallet_addr_idx on users (wallet_addr) where wallet_addr is not null;

create table if not exists wallet_nonces (
  addr text primary key,
  nonce text not null,
  created_at timestamptz not null default now()
);
create index if not exists wallet_nonces_created_idx on wallet_nonces (created_at);