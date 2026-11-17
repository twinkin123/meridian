alter table deposits drop constraint if exists deposits_sig_key;
create unique index if not exists deposits_sig_user_uidx on deposits (sig, user_id);
