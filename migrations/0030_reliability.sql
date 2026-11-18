alter table users add column if not exists last_polled_at timestamptz;
alter table users add column if not exists last_deposit_sig text;
alter table users add column if not exists last_swept_at timestamptz;
create index if not exists users_poll_idx on users (last_polled_at nulls first) where privy_address is not null;
create index if not exists users_sweep_idx on users (last_swept_at nulls first) where privy_address is not null and privy_wallet_id is not null;
drop index if exists deposits_sig_user_uidx;
create unique index if not exists deposits_sig_user_asset_uidx on deposits (sig, user_id, asset);
alter table deposits add column if not exists stuck_at timestamptz;
create index if not exists deposits_detected_idx on deposits (created_at) where status = 'detected';
