/* Two dead objects removed.

   users.lifetime_dep was never written by anything. Admin /users selects it,
   but public/admin.html renders the deposit join (dep_usd) instead, so the
   column read as a permanent zero and was displayed by nobody. The admin query
   already sums deposits for the "Staked" column.

   deposits_sig_user_asset_uidx (0030) is superseded by deposits_sig_user_uniq
   (0033). The 0033 index is unique on (sig, user_id), which implies uniqueness
   on the wider triple, and its leading columns serve the same lookups. Keeping
   both maintains a redundant index on every deposit insert and sweep update. */

alter table users drop column if exists lifetime_dep;

drop index if exists deposits_sig_user_asset_uidx;