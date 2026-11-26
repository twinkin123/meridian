-- 0056_crash_indexes.sql - the two indexes production already carries.
-- Added so a from-scratch build matches the deployed database.

create index if not exists crash_bets_round on crash_bets (round_id);
create index if not exists crash_rounds_recent on crash_rounds (id desc);
