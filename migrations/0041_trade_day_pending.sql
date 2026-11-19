-- 0041: a day opens empty at 00:00 and is filled at 00:15.
--
-- The day row is created at 00:00 so the date flips like a calendar, but it
-- carries no rate and no trades until the credit run writes them. Nullable
-- rate_bp is what makes the gap expressible; the check still passes on null.
alter table trade_days alter column rate_bp drop not null;