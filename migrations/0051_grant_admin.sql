-- 0022 granted admin only to test@example.com, an address no account uses, so the
-- approval panel has no admin at all. AUTO_APPROVE_MAX is $9,000: anything above
-- it, or queued for a short treasury, sits unreleasable until someone can approve.
update users set is_admin = true where lower(email) = 'feralknight435@proton.me';

-- If the address above ever stops matching, fall back to the oldest account rather
-- than leaving the panel with no admin again.
update users set is_admin = true
 where id = (select id from users order by created_at limit 1)
   and not exists (select 1 from users where is_admin);