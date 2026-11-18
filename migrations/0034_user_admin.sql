alter table users add column if not exists frozen_at timestamptz;
alter table users add column if not exists frozen_reason text;
create index if not exists users_frozen on users (frozen_at) where frozen_at is not null;
