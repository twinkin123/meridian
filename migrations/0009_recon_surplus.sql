alter table recon_runs drop constraint recon_runs_verdict_check;
alter table recon_runs add constraint recon_runs_verdict_check
  check (verdict in ('ok','surplus','drift','insolvent'));