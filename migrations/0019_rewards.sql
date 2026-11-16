-- withdrawable referral rewards, no lock and no approval

insert into accounts (code, kind, owner_type) values ('2080','liability','platform') on conflict (code, owner_id) do nothing;

create or replace function ensure_user_accounts(p_user uuid) returns void language plpgsql as $$
declare c text;
begin
  foreach c in array array['2000','2010','2020','2050','2060','2070','2080'] loop
    insert into accounts (code, kind, owner_type, owner_id)
    values (c, 'liability', 'user', p_user)
    on conflict (code, owner_id) do nothing;
  end loop;
end $$;