-- 0049_crash.sql — provably-fair crash rounds and their bets.
-- Reconstructed from production, which applied this before the file was committed.

create sequence if not exists crash_rounds_id_seq start with 1 increment by 1 no minvalue no maxvalue cache 1;

create table if not exists crash_rounds (
  id          bigint not null default nextval('crash_rounds_id_seq'::regclass),
  server_seed text not null,
  seed_hash   text not null,
  client_seed text not null,
  crash_point numeric(20,4) not null,
  status      text not null default 'betting'
              check (status = any (array['betting'::text, 'running'::text, 'done'::text])),
  bet_ends_at timestamptz not null,
  started_at  timestamptz,
  ended_at    timestamptz,
  created_at  timestamptz not null default now(),
  constraint crash_rounds_pkey primary key (id)
);

alter sequence crash_rounds_id_seq owned by crash_rounds.id;

create table if not exists crash_bets (
  id         uuid not null default gen_random_uuid(),
  round_id   bigint not null,
  user_id    uuid not null,
  stake      bigint not null check (stake > 0),
  cashed_at  numeric(20,4),
  payout     bigint,
  created_at timestamptz not null default now(),
  constraint crash_bets_pkey primary key (id),
  constraint crash_bets_round_id_user_id_key unique (round_id, user_id),
  constraint crash_bets_round_id_fkey foreign key (round_id) references crash_rounds(id),
  constraint crash_bets_user_id_fkey foreign key (user_id) references users(id)
);