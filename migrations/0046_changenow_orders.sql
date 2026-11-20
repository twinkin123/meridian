create table if not exists changenow_orders (
  id                uuid primary key default gen_random_uuid(),
  user_id           text not null,
  wallet_id         text not null,
  changenow_id      text not null unique,
  from_currency     text not null,
  from_network      text not null,
  to_currency       text not null,
  to_network        text not null,
  from_amount       numeric(38,12) not null,
  to_amount         numeric(38,12) not null,
  flow              text not null default 'standard',
  payout_address    text not null,
  payout_extra_id   text,
  refund_address    text,
  payin_address     text not null,
  status            text not null default 'awaiting_deposit',
  changenow_status  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  finished_at       timestamptz
);

create index if not exists changenow_orders_user_idx
  on changenow_orders (user_id, created_at desc);

create index if not exists changenow_orders_open_idx
  on changenow_orders (status) where status not in ('done','failed','refunded');