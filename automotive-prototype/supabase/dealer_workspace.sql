-- VINCORE dealer workspace v1. Run in a dedicated Supabase project.
-- Dealer organizations are provisioned by an administrator, never by a browser client.
begin;
create schema vincore;
create schema vincore_private;
revoke all on schema vincore, vincore_private from public, anon, authenticated, service_role;
grant usage on schema vincore to authenticated;

create table vincore.dealers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 160),
  created_at timestamptz not null default now()
);
create table vincore.dealer_memberships (
  dealer_id uuid not null references vincore.dealers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'dealer' check (role in ('owner','dealer')),
  created_at timestamptz not null default now(),
  primary key (dealer_id,user_id)
);
create table vincore.auction_vehicles (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references vincore.dealers(id) on delete cascade,
  vin text not null check (vin ~ '^[A-HJ-NPR-Z0-9]{17}$'),
  label text not null default '',
  auction_name text not null default '',
  auction_date date,
  max_bid numeric(12,2) check (max_bid is null or max_bid >= 0),
  expected_fees numeric(12,2) not null default 0 check (expected_fees >= 0),
  status text not null default 'watching' check (status in ('watching','bidding','won','lost','passed')),
  notes text not null default '',
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table vincore.auction_events (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references vincore.dealers(id) on delete cascade,
  vehicle_id uuid not null references vincore.auction_vehicles(id) on delete cascade,
  event_type text not null check (event_type in ('bid','won','lost','passed','note')),
  amount numeric(12,2) check (amount is null or amount >= 0),
  note text not null default '',
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists auction_vehicles_dealer_idx on vincore.auction_vehicles (dealer_id,created_at desc);
create index if not exists auction_events_vehicle_idx on vincore.auction_events (vehicle_id,created_at desc);

-- Private membership lookup. Security definer avoids recursively querying memberships in RLS.
create function vincore_private.is_dealer_member(p_dealer uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from vincore.dealer_memberships m where m.dealer_id=p_dealer and m.user_id=(select auth.uid())) $$;
revoke all on function vincore_private.is_dealer_member(uuid) from public, anon, authenticated, service_role;
grant execute on function vincore_private.is_dealer_member(uuid) to authenticated;

create function vincore_private.event_vehicle_matches_dealer(p_vehicle uuid,p_dealer uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from vincore.auction_vehicles v where v.id=p_vehicle and v.dealer_id=p_dealer) $$;
revoke all on function vincore_private.event_vehicle_matches_dealer(uuid,uuid) from public, anon, authenticated, service_role;
grant execute on function vincore_private.event_vehicle_matches_dealer(uuid,uuid) to authenticated;

alter table vincore.dealers enable row level security;
alter table vincore.dealer_memberships enable row level security;
alter table vincore.auction_vehicles enable row level security;
alter table vincore.auction_events enable row level security;

create policy "Members view their dealer" on vincore.dealers for select to authenticated
using (vincore_private.is_dealer_member(id));
create policy "Members view their memberships" on vincore.dealer_memberships for select to authenticated
using (vincore_private.is_dealer_member(dealer_id));
create policy "Members view vehicles" on vincore.auction_vehicles for select to authenticated
using (vincore_private.is_dealer_member(dealer_id));
create policy "Members add vehicles" on vincore.auction_vehicles for insert to authenticated
with check (vincore_private.is_dealer_member(dealer_id) and created_by=(select auth.uid()));
create policy "Members edit vehicles" on vincore.auction_vehicles for update to authenticated
using (vincore_private.is_dealer_member(dealer_id))
with check (vincore_private.is_dealer_member(dealer_id) and created_by=(select auth.uid()));
create policy "Members view events" on vincore.auction_events for select to authenticated
using (vincore_private.is_dealer_member(dealer_id));
create policy "Members record events" on vincore.auction_events for insert to authenticated
with check (vincore_private.is_dealer_member(dealer_id) and created_by=(select auth.uid()) and vincore_private.event_vehicle_matches_dealer(vehicle_id,dealer_id));

-- Memberships, dealer creation, and deletions are intentionally admin-only.
-- Create the user with Supabase Auth, then use a privileged SQL editor to provision:
-- insert into vincore.dealers(name) values ('Example Dealer') returning id;
-- insert into vincore.dealer_memberships(dealer_id,user_id,role)
-- values ('DEALER_UUID','AUTH_USER_UUID','owner');

revoke all on all tables in schema vincore from public, anon, authenticated, service_role;
commit;
