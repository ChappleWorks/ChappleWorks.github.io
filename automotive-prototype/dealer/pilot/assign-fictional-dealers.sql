-- Run as the database administrator only on an isolated fictional staging project.
-- Create the three confirmed Auth users first. This file assigns memberships only.
do $$
declare
  a constant uuid := 'd3c1460b-b3b8-4468-b691-c549fcc0bc75';
  b constant uuid := '77ed1a33-0cd7-4f80-88ac-cf4ad6ae7a42';
  account record;
  account_id uuid;
begin
  insert into vincore.dealers (id,name) values
    (a,'VINCORE Pilot Dealer A'),(b,'VINCORE Pilot Dealer B')
  on conflict (id) do nothing;

  if not exists (select 1 from vincore.dealers where id=a and name='VINCORE Pilot Dealer A')
     or not exists (select 1 from vincore.dealers where id=b and name='VINCORE Pilot Dealer B') then
    raise exception 'Unexpected pilot dealer identities';
  end if;

  for account in select * from (values
    ('vincore-dealer-a@example.com',a,'owner'),
    ('vincore-dealer-b@example.com',b,'owner'),
    ('vincore-dealer-a-teammate@example.com',a,'dealer')
  ) as fixture(email,dealer_id,role)
  loop
    select id into strict account_id from auth.users
      where email=account.email and email_confirmed_at is not null;
    if exists (select 1 from vincore.dealer_memberships m
      where m.user_id=account_id and (m.dealer_id<>account.dealer_id or m.role<>account.role)) then
      raise exception 'Pilot user has an unexpected existing membership';
    end if;
    insert into vincore.dealer_memberships (dealer_id,user_id,role)
      values (account.dealer_id,account_id,account.role) on conflict do nothing;
  end loop;
end $$;
