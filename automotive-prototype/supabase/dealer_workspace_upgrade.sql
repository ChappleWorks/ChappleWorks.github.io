
-- Upgrade the original draft without discarding dealer records.
begin;
alter table public.auction_vehicles add column if not exists lane_run text not null default '';
alter table public.auction_vehicles add column if not exists import_key text;
alter table public.auction_vehicles add column if not exists imported_record jsonb;
alter table public.auction_vehicles add constraint auction_vehicle_import_key unique (dealer_id, import_key);
alter table public.auction_vehicles add constraint auction_vehicle_dealer_identity unique (dealer_id, id);
alter table public.auction_events drop constraint auction_events_vehicle_id_fkey;
alter table public.auction_events add constraint auction_event_dealer_vehicle_fk
  foreign key (dealer_id, vehicle_id) references public.auction_vehicles(dealer_id, id) on delete cascade;
alter table public.auction_events drop constraint auction_events_event_type_check;
alter table public.auction_events add constraint auction_events_event_type_check
  check (event_type in ('bid','won','lost','passed','note','expense'));
alter table public.auction_events add constraint auction_money_event_requires_amount
  check (event_type not in ('bid','won','expense') or amount is not null) not valid;

alter table public.auction_vehicles add constraint auction_vehicle_input_bounds
  check (length(label) <= 180 and length(auction_name) <= 180 and length(lane_run) <= 180
    and length(notes) <= 20000 and (import_key is null or length(import_key) <= 100)
    and (imported_record is null or (jsonb_typeof(imported_record) = 'object'
      and octet_length(imported_record::text) <= 2000000 and imported_record->>'vin' is not distinct from vin))
    and max_bid is distinct from 'NaN'::numeric and expected_fees <> 'NaN'::numeric) not valid;
alter table public.auction_events add constraint auction_event_input_bounds
  check (length(note) <= 20000 and amount is distinct from 'NaN'::numeric) not valid;

drop policy "Members record events" on public.auction_events;
drop function public.event_vehicle_matches_dealer(uuid,uuid);
create policy "Members record events" on public.auction_events for insert to authenticated
with check (public.is_dealer_member(dealer_id) and created_by=(select auth.uid()));
drop policy "Members edit vehicles" on public.auction_vehicles;
create policy "Members edit vehicles" on public.auction_vehicles for update to authenticated
using (public.is_dealer_member(dealer_id)) with check (public.is_dealer_member(dealer_id));

-- Status and record creation metadata cannot be changed through client update calls.
revoke all on public.dealers, public.dealer_memberships, public.auction_vehicles, public.auction_events from public, anon, authenticated;
grant select on public.dealers, public.dealer_memberships, public.auction_vehicles, public.auction_events to authenticated;
grant insert (dealer_id, vin, label, auction_name, auction_date, max_bid, expected_fees, notes, lane_run, import_key, imported_record)
  on public.auction_vehicles to authenticated;
grant update (label, auction_name, auction_date, max_bid, expected_fees, notes, lane_run)
  on public.auction_vehicles to authenticated;
grant insert (dealer_id, vehicle_id, event_type, amount, note) on public.auction_events to authenticated;

create function public.touch_auction_vehicle() returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger touch_auction_vehicle before update on public.auction_vehicles
for each row execute function public.touch_auction_vehicle();

create function public.apply_auction_event() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.event_type not in ('note','expense') then
    update public.auction_vehicles
      set status = case when new.event_type = 'bid' then 'bidding' else new.event_type end
      where dealer_id = new.dealer_id and id = new.vehicle_id
        and status in ('watching','bidding');
    if not found then
      raise exception 'Vehicle unavailable or auction already closed';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.apply_auction_event() from public, anon, authenticated;
create trigger apply_auction_event after insert on public.auction_events
for each row execute function public.apply_auction_event();
create table public.dealer_inventory (
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  vin text not null check (vin ~ '^[A-HJ-NPR-Z0-9]{17}$'),
  label text not null default '' check (length(label) <= 180),
  stock_number text not null default '' check (length(stock_number) <= 180),
  primary key (dealer_id, vin)
);
alter table public.dealer_inventory enable row level security;
create policy "Members view inventory" on public.dealer_inventory for select to authenticated
using (public.is_dealer_member(dealer_id));
create policy "Members add inventory" on public.dealer_inventory for insert to authenticated
with check (public.is_dealer_member(dealer_id));
revoke all on public.dealer_inventory from public, anon, authenticated;
grant select, insert (dealer_id, vin, label, stock_number) on public.dealer_inventory to authenticated;
commit;
