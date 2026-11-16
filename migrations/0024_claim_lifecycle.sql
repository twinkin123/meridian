alter table deposits add column if not exists claim_rejected_at timestamptz;
alter table deposits add column if not exists claim_reject_reason text;

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  kind text not null,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists notifications_user_idx on notifications (user_id, created_at desc);