alter table users add column email_verified_at timestamptz;

create table email_verifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);
create index email_verifications_hash on email_verifications (token_hash);
create index email_verifications_user on email_verifications (user_id);

-- everyone already registered counts as confirmed
update users set email_verified_at = now();
