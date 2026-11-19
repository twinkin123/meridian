/* Three objects exist in production but in no migration: deposits.price_micro
   was added by hand and never written (16 rows, all null, no references), and
   the two _bak tables were snapshots from a one-off repair. All three are dead,
   so they are dropped rather than encoded. The backup rows are archived in
   db/archive-0042.sql. */

alter table deposits drop column if exists price_micro;

drop table if exists trade_days_bak;
drop table if exists trade_results_bak;