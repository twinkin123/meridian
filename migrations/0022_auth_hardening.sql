-- 0022: auth hardening. admin role, forced password change, session metadata, reset tokens.

alter table users add column if not exists is_admin boolean not null default false;
alter table users add column if not exists must_change_pw boolean not null default false;

alter table sessions add column if not exists ua text;
alter table sessions add column if not exists ip inet;
alter table sessions add column if not exists last_seen_at timestamptz not null default now();
alter table sessions add column if not exists revoked_at timestamptz;

create index if not exists sessions_live on sessions (user_id, created_at desc) where revoked_at is null;

create table if not exists password_resets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists password_resets_user on password_resets (user_id, created_at desc);

update users set is_admin = true where lower(email) = 'test@example.com';