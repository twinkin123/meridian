create extension if not exists pgcrypto;

create type account_kind as enum ('asset','liability','equity','revenue','expense');
create type owner_type   as enum ('platform','user');

create table users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null,
  pw_hash       text not null,
  deposit_index integer not null unique,
  deposit_addr  text not null unique,
  tier          smallint not null default 0 check (tier between 0 and 4),
  lifetime_dep  bigint not null default 0,
  created_at    timestamptz not null default now()
);
create unique index users_email_lower on users (lower(email));

create sequence deposit_index_seq start 1;
alter table users alter column deposit_index set default nextval('deposit_index_seq');

create table accounts (
  id         uuid primary key default gen_random_uuid(),
  code       text not null,
  kind       account_kind not null,
  owner_type owner_type not null,
  owner_id   uuid references users(id),
  currency   text not null default 'USDC',
  check ((owner_type='platform' and owner_id is null)
      or (owner_type='user'     and owner_id is not null)),
  unique nulls not distinct (code, owner_id)
);

insert into accounts (code, kind, owner_type) values
  ('1000','asset','platform'), ('1010','asset','platform'), ('1020','asset','platform'),
  ('2000','liability','platform'), ('2010','liability','platform'),
  ('2020','liability','platform'), ('2030','liability','platform'),
  ('2040','liability','platform'), ('2050','liability','platform'),
  ('3000','equity','platform'), ('4000','revenue','platform'), ('5000','expense','platform');

create table transactions (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null,
  external_ref text,
  created_at   timestamptz not null default now(),
  unique (kind, external_ref)
);

create table postings (
  id         bigserial primary key,
  tx_id      uuid not null references transactions(id),
  account_id uuid not null references accounts(id),
  amount     bigint not null check (amount <> 0),
  created_at timestamptz not null default now()
);
create index postings_acct on postings (account_id, id);
create index postings_tx on postings (tx_id);

create function assert_tx_balanced() returns trigger language plpgsql as $$
declare s bigint;
begin
  select coalesce(sum(amount),0) into s from postings where tx_id = NEW.tx_id;
  if s <> 0 then raise exception 'tx % unbalanced by %', NEW.tx_id, s; end if;
  return null;
end $$;

create constraint trigger tx_balanced after insert on postings
  deferrable initially deferred for each row execute function assert_tx_balanced();

create function block_mutation() returns trigger language plpgsql as $$
begin raise exception 'postings are append-only'; end $$;

create trigger postings_immutable before update or delete on postings
  for each row execute function block_mutation();