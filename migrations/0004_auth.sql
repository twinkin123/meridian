create table sessions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index sessions_user on sessions (user_id);

create table login_attempts (
  id         bigserial primary key,
  ident      text not null,
  created_at timestamptz not null default now()
);
create index login_attempts_ident on login_attempts (ident, created_at desc);