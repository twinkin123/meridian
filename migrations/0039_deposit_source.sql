alter table deposits add column if not exists relay_order text;
alter table deposits add column if not exists relay_fill text;
create unique index if not exists deposits_relay_uidx on deposits (relay_order, coalesce(relay_fill, '')) where relay_order is not null;