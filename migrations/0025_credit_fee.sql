alter table credit_runs add column if not exists gross_total text;
alter table credit_runs add column if not exists fee_total text;
alter table credit_runs add column if not exists fee_bp int not null default 1500;