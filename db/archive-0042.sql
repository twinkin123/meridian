/* Contents of trade_days_bak and trade_results_bak at the moment migration 0042
   dropped them, 2026-11-19. Restore by running this against a database, then
   delete 0042 from _migrations if you want the tables back permanently. */

create table if not exists trade_days_bak (
    day date,
    rate_bp integer,
    source text,
    created_at timestamp with time zone
);

create table if not exists trade_results_bak (
    day date,
    seq integer,
    symbol text,
    side text,
    open_px numeric(24,10),
    close_px numeric(24,10),
    opened_min integer,
    closed_min integer,
    ret_bp integer
);

insert into trade_days_bak (day, rate_bp, source, created_at) values
  ('2026-11-17', 276, 'recorded', '2026-11-18 03:53:58.817998+00'),
  ('2026-11-18', 153, 'recorded', '2026-11-18 03:53:58.808198+00');

insert into trade_results_bak (day, seq, symbol, side, open_px, close_px, opened_min, closed_min, ret_bp) values
  ('2026-11-17', 0, 'BTC',  'short', 64904.0000000000, 64320.0000000000, 565, 594,  90),
  ('2026-11-17', 1, 'RNDR', 'short',     4.2000000000,     4.2230000000, 1291, 1332, -54),
  ('2026-11-17', 2, 'SEI',  'long',      0.2101000000,     0.2108000000, 454, 488,  31),
  ('2026-11-17', 3, 'AAVE', 'long',    103.6000000000,   105.2000000000, 141, 158, 155),
  ('2026-11-17', 4, 'UNI',  'short',     7.8080000000,     7.7660000000, 343, 420,  54),
  ('2026-11-18', 0, 'SOL',  'short',    71.6500000000,    71.3300000000,  58,  86,  44),
  ('2026-11-18', 1, 'ARB',  'long',      0.5086000000,     0.5077000000, 673, 683, -17),
  ('2026-11-18', 2, 'AVAX', 'short',     6.9940000000,     6.9710000000, 250, 312,  33),
  ('2026-11-18', 3, 'XRP',  'long',      0.9495000000,     0.9514000000,  55, 107,  20),
  ('2026-11-18', 4, 'LDO',  'long',      0.9215000000,     0.9282000000, 309, 337,  73);