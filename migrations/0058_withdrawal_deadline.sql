-- A withdrawal that never settles must not hold its row forever.
alter table withdrawals add column if not exists first_attempt_at timestamptz;
update withdrawals set first_attempt_at = created_at
  where status = 'sending' and first_attempt_at is null;
