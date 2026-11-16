-- 30-day deposit lock

alter type deposit_status add value if not exists 'locked';

insert into accounts (code, kind, owner_type) values ('2070','liability','platform') on conflict (code, owner_id) do nothing;

alter table deposits add column if not exists unlock_at timestamptz;
alter table deposits add column if not exists released_at timestamptz;

update deposits set unlock_at = created_at + interval '30 days' where unlock_at is null;

create index if not exists deposits_locked on deposits (unlock_at) where released_at is null;

create or replace function ensure_user_accounts(p_user uuid) returns void language plpgsql as $$
declare c text;
begin
  foreach c in array array['2000','2010','2020','2050','2060','2070'] loop
    insert into accounts (code, kind, owner_type, owner_id)
    values (c, 'liability', 'user', p_user)
    on conflict (code, owner_id) do nothing;
  end loop;
end $$;