-- Go-live reset. Keeps: trade_days, trade_results, credit_runs, deposit_routes,
-- platform chart-of-accounts (owner_id is null), _migrations.
begin;

-- postings carry a BEFORE DELETE/UPDATE guard; lift it for the reset
alter table postings disable trigger postings_immutable;

-- ledger first: postings -> transactions -> user accounts
delete from postings;
delete from transactions;
delete from accounts where owner_id is not null;

delete from crash_bets;
delete from crash_rounds;
delete from perp_positions;
delete from vesting;
delete from referral_ledger;
delete from referral_runs;
delete from deposit_addresses;
delete from deposits;
delete from withdrawal_addresses;
delete from withdrawals;
delete from notifications;
delete from password_resets;
delete from sessions;
delete from login_attempts;
delete from wallet_nonces;
delete from changenow_orders;
delete from recon_runs;
delete from sweeps;

-- users self-reference via referred_by
update users set referred_by = null;
delete from users;
select setval(pg_get_serial_sequence('users', 'deposit_index'), 1, false);

update system_state set value = '0', updated_at = now() where key = 'freeze_level';
update system_state set value = 'wipe:go-live', updated_at = now() where key = 'freeze_actor';

alter table postings enable trigger postings_immutable;

commit;
-- deploy check
