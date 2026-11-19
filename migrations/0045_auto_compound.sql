-- 0045_auto_compound.sql — per-account compounding flag, referenced by the daily run
alter table users add column if not exists auto_compound boolean not null default true;