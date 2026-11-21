alter table perp_positions drop constraint if exists perp_positions_leverage_check;
alter table perp_positions
  add constraint perp_positions_leverage_check check (leverage between 500 and 1000);