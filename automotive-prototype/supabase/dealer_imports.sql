-- VINCORE standardized imports. Apply after the dealer workspace upgrade.
begin;
create table vincore.import_batches (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references vincore.dealers(id),
  kind text not null check (kind in ('auction','inventory','transactions','valuations')),
  file_label text not null check (length(file_label) between 1 and 180),
  template_version integer not null default 1,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  result jsonb not null default '{}',
  unique (dealer_id,id)
);
create table vincore.vehicle_transactions (
  dealer_id uuid not null,
  batch_id uuid not null,
  source text not null check (length(source) between 1 and 120),
  record_id text not null check (length(record_id) between 1 and 120),
  acquisition_ref text not null check (length(acquisition_ref) between 1 and 120),
  vin text not null check (vin ~ '^[A-HJ-NPR-Z0-9]{17}$'),
  kind text not null check (kind in ('purchase','expense','sale')),
  effective_date date not null,
  amount numeric(12,2) check (amount >= 0 and amount <> 'NaN'::numeric),
  auction_name text not null default '',
  category text not null default '',
  costs_complete boolean not null default false check (not costs_complete or kind='sale'),
  manual_event_id uuid,
  check (kind='expense' or amount is not null),
  check (length(auction_name)<=180 and length(category)<=120),
  primary key (dealer_id,source,record_id),
  unique (dealer_id,manual_event_id),
  foreign key (dealer_id,batch_id) references vincore.import_batches(dealer_id,id),
  foreign key (manual_event_id) references vincore.auction_events(id)
);
create unique index vehicle_cycle_milestones on vincore.vehicle_transactions(dealer_id,source,acquisition_ref,kind)
  where kind in ('purchase','sale');
create index vehicle_transaction_vin on vincore.vehicle_transactions(dealer_id,vin,effective_date);

create table vincore.vehicle_valuations (
  dealer_id uuid not null,
  batch_id uuid not null,
  source text not null check (length(source) between 1 and 120),
  record_id text not null check (length(record_id) between 1 and 120),
  vin text not null check (vin ~ '^[A-HJ-NPR-Z0-9]{17}$'),
  effective_date date not null,
  basis text not null check (basis in ('retail','wholesale')),
  amount numeric(12,2) not null check (amount>0 and amount<>'NaN'::numeric),
  notes text not null default '' check(length(notes)<=1000),
  primary key (dealer_id,source,record_id),
  foreign key (dealer_id,batch_id) references vincore.import_batches(dealer_id,id)
);
create index vehicle_valuation_vin on vincore.vehicle_valuations(dealer_id,vin,effective_date);

alter table vincore.dealer_inventory add column mileage integer check (mileage>=0);
alter table vincore.dealer_inventory add column acquisition_date date;
alter table vincore.dealer_inventory add column acquisition_cost numeric(12,2) check (acquisition_cost>=0 and acquisition_cost<>'NaN'::numeric);
alter table vincore.import_batches enable row level security;
alter table vincore.vehicle_transactions enable row level security;
alter table vincore.vehicle_valuations enable row level security;
create policy dealer_import_batches on vincore.import_batches for select to authenticated using (vincore_private.is_dealer_member(dealer_id));
create policy dealer_transactions on vincore.vehicle_transactions for select to authenticated using (vincore_private.is_dealer_member(dealer_id));
create policy dealer_valuations on vincore.vehicle_valuations for select to authenticated using (vincore_private.is_dealer_member(dealer_id));
revoke all on vincore.import_batches,vincore.vehicle_transactions,vincore.vehicle_valuations from public,anon,authenticated,service_role;
grant select on vincore.import_batches,vincore.vehicle_transactions,vincore.vehicle_valuations to authenticated;

create function vincore.import_csv(p_dealer uuid,p_kind text,p_file text,p_rows jsonb,p_confirm boolean,p_expected jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  batch uuid;
  actor uuid := auth.uid();
  r jsonb;
  row_number integer := 0;
  inserted integer := 0;
  skipped integer := 0;
  updated integer := 0;
  linked integer := 0;
  inventory_changes jsonb := '[]';
  import_result jsonb;
  state text;
  v text;
  src text;
  ref text;
  record_key text;
  tx_kind text;
  event_kind text;
  lot text;
  row_label text;
  auction text;
  day date;
  row_amount numeric(12,2);
  manual uuid;
  tr vincore.vehicle_transactions;
  valuation vincore.vehicle_valuations;
  inv vincore.dealer_inventory;
  appearance vincore.auction_vehicles;
  first_purchase vincore.vehicle_transactions;
begin
  if actor is null or not vincore_private.is_dealer_member(p_dealer) then raise insufficient_privilege; end if;
  if p_kind is null or p_kind not in ('auction','inventory','transactions','valuations') or p_confirm is null
    or pg_catalog.jsonb_typeof(p_rows) is distinct from 'array' or pg_catalog.octet_length(p_rows::text)>2000000 then
    raise exception 'Invalid import request';
  end if;
  if pg_catalog.jsonb_array_length(p_rows) not between 1 and 500 then raise exception 'Import must contain 1–500 records'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('vincore:csv:'||p_dealer,0));
  begin
    insert into vincore.import_batches(dealer_id,kind,file_label,created_by)
      values(p_dealer,p_kind,p_file,actor) returning id into batch;
    for r in select value from pg_catalog.jsonb_array_elements(p_rows) loop
      row_number := row_number+1;
      v := r->>'vin';
      if v is null or v !~ '^[A-HJ-NPR-Z0-9]{17}$' then raise exception 'Invalid VIN'; end if;
      if p_kind='auction' then
        auction:=pg_catalog.btrim(r->>'auction_name');
        day:=(r->>'auction_date')::date;
        lot:=pg_catalog.btrim(r->>'lane_run');
        row_label:=coalesce(r->>'label','');
        if coalesce(auction,'')='' or day is null or coalesce(lot,'')='' or length(auction)>180 or length(lot)>180 or length(row_label)>180 then
          raise exception 'Auction, date, and lane/run are required';
        end if;
        select * into appearance from vincore.auction_vehicles where dealer_id=p_dealer and vin=v and auction_date=day
          and lower(auction_name)=lower(auction) and lower(lane_run)=lower(lot) order by created_at,id limit 1;
        if found then
          if appearance.label is distinct from row_label and row_label<>'' then raise exception 'Auction appearance already exists with a different label'; end if;
          skipped:=skipped+1;
        else
          insert into vincore.auction_vehicles(dealer_id,vin,auction_name,auction_date,lane_run,label,created_by)
            values(p_dealer,v,auction,day,lot,row_label,actor);
          inserted:=inserted+1;
        end if;
      elsif p_kind='inventory' then
        select * into inv from vincore.dealer_inventory where dealer_id=p_dealer and vin=v for update;
        if found then
          update vincore.dealer_inventory set label=coalesce(nullif(r->>'label',''),inv.label),
            stock_number=coalesce(nullif(r->>'stock_number',''),inv.stock_number),
            mileage=coalesce(nullif(r->>'mileage','')::integer,inv.mileage),
            acquisition_date=coalesce(nullif(r->>'acquisition_date','')::date,inv.acquisition_date),
            acquisition_cost=coalesce(nullif(r->>'acquisition_cost','')::numeric(12,2),inv.acquisition_cost)
          where dealer_id=p_dealer and vin=v and
          (label,stock_number,mileage,acquisition_date,acquisition_cost) is distinct from
          (coalesce(nullif(r->>'label',''),inv.label),coalesce(nullif(r->>'stock_number',''),inv.stock_number),
           coalesce(nullif(r->>'mileage','')::integer,inv.mileage),coalesce(nullif(r->>'acquisition_date','')::date,inv.acquisition_date),
           coalesce(nullif(r->>'acquisition_cost','')::numeric(12,2),inv.acquisition_cost));
          if found then
            updated:=updated+1;
            inventory_changes:=inventory_changes||pg_catalog.jsonb_build_array(
              pg_catalog.jsonb_build_object('vin',v,'before',pg_catalog.to_jsonb(inv)-'dealer_id',
                'after',(select pg_catalog.to_jsonb(i)-'dealer_id' from vincore.dealer_inventory i where i.dealer_id=p_dealer and i.vin=v)));
          else skipped:=skipped+1;
          end if;
        else
          insert into vincore.dealer_inventory(dealer_id,vin,label,stock_number,mileage,acquisition_date,acquisition_cost)
            values(p_dealer,v,coalesce(r->>'label',''),coalesce(r->>'stock_number',''),nullif(r->>'mileage','')::integer,
              nullif(r->>'acquisition_date','')::date,nullif(r->>'acquisition_cost','')::numeric(12,2));
          inserted:=inserted+1;
        end if;
      else
        src:=pg_catalog.lower(pg_catalog.btrim(r->>'source'));
        record_key:=pg_catalog.btrim(r->>'record_id');
        day:=(r->>'effective_date')::date;
        if coalesce(src,'')='' or coalesce(record_key,'')='' or day is null then raise exception 'Source, record ID, and date are required'; end if;
        if coalesce(r->>'amount','') !~ '^([0-9]{1,10}([.][0-9]{1,2})?)?$' then raise exception 'Use a nonnegative dollar amount with at most two decimals'; end if;
        row_amount:=nullif(r->>'amount','')::numeric(12,2);
        if p_kind='valuations' then
          select * into valuation from vincore.vehicle_valuations where dealer_id=p_dealer and source=src and record_id=record_key;
          if found then
            if (valuation.vin,valuation.effective_date,valuation.basis,valuation.amount,valuation.notes)
              is distinct from (v,day,r->>'basis',row_amount,coalesce(r->>'notes','')) then raise exception 'Valuation ID conflicts with a saved record'; end if;
            skipped:=skipped+1;
          else
            insert into vincore.vehicle_valuations values(p_dealer,batch,src,record_key,v,day,r->>'basis',row_amount,coalesce(r->>'notes',''));
            inserted:=inserted+1;
          end if;
        else
          ref:=pg_catalog.btrim(r->>'acquisition_ref');
          tx_kind:=r->>'kind';
          manual:=nullif(r->>'manual_event_id','')::uuid;
          auction:=coalesce(r->>'auction_name','');
          select * into tr from vincore.vehicle_transactions where dealer_id=p_dealer and source=src and record_id=record_key;
          if found then
            if (tr.acquisition_ref,tr.vin,tr.kind,tr.effective_date,tr.amount,tr.auction_name,tr.category,tr.costs_complete,tr.manual_event_id)
              is distinct from (ref,v,tx_kind,day,row_amount,auction,coalesce(r->>'category',''),coalesce((r->>'costs_complete')::boolean,false),manual)
              then raise exception 'Transaction ID conflicts with a saved record'; end if;
            skipped:=skipped+1;
            continue;
          end if;
          if coalesce(ref,'')='' then raise exception 'Acquisition reference is required'; end if;
          if tx_kind='purchase' and exists (
            select 1 from vincore.vehicle_transactions t where t.dealer_id=p_dealer and t.vin=v and t.kind='purchase'
              and t.effective_date=day and t.amount=row_amount
          ) then raise exception 'Possible duplicate purchase for this VIN, date and amount; keep its existing source and ID'; end if;
          if tx_kind<>'purchase' then
            select * into first_purchase from vincore.vehicle_transactions where dealer_id=p_dealer and source=src and acquisition_ref=ref and kind='purchase';
            if not found or first_purchase.vin<>v or day<first_purchase.effective_date then raise exception 'Transaction needs a matching purchase of the same VIN dated on or before it'; end if;
          end if;
          event_kind:=case tx_kind when 'purchase' then 'won' when 'expense' then 'expense' end;
          if manual is not null then
            if event_kind is null or not exists(select 1 from vincore.auction_events e join vincore.auction_vehicles a on a.dealer_id=e.dealer_id and a.id=e.vehicle_id
              where e.dealer_id=p_dealer and e.id=manual and e.event_type=event_kind and e.amount=row_amount and a.vin=v) then
              raise exception 'Auction activity ID must match the VIN, transaction type and amount in this dealership';
            end if;
            if tx_kind='expense' and first_purchase.manual_event_id is not null and not exists (
              select 1 from vincore.auction_events root join vincore.auction_events expense
                on expense.vehicle_id=root.vehicle_id and expense.dealer_id=root.dealer_id
              where root.dealer_id=p_dealer and root.id=first_purchase.manual_event_id and expense.id=manual
            ) then raise exception 'Auction expense and purchase belong to different appearances'; end if;
            linked:=linked+1;
          elsif event_kind is not null and exists (
            select 1 from vincore.auction_events e join vincore.auction_vehicles a on a.id=e.vehicle_id and a.dealer_id=e.dealer_id
            where e.dealer_id=p_dealer and a.vin=v and e.event_type=event_kind and e.amount=row_amount
              and coalesce(a.auction_date,(e.created_at at time zone 'UTC')::date)=day
          ) then
            raise exception 'Possible duplicate of manual auction activity; copy its activity ID into the CSV';
          end if;
          insert into vincore.vehicle_transactions values(p_dealer,batch,src,record_key,ref,v,tx_kind,day,row_amount,auction,coalesce(r->>'category',''),
            coalesce((r->>'costs_complete')::boolean,false),manual);
          inserted:=inserted+1;
        end if;
      end if;
    end loop;
    import_result:=pg_catalog.jsonb_build_object('inserted',inserted,'duplicates',skipped,'updated',updated,'reconciled',linked,'inventory_changes',inventory_changes);
    if not p_confirm then raise sqlstate 'VX001'; end if;
    if p_expected is not null and p_expected is distinct from import_result then
      raise exception 'Records changed since preview. Preview the file again.';
    end if;
    update vincore.import_batches set result=import_result where id=batch and dealer_id=p_dealer;
  exception
    when sqlstate 'VX001' then return import_result;
    when others then
      get stacked diagnostics state = returned_sqlstate;
      if state='23505' then raise exception 'Row %: duplicate acquisition milestone or linked auction activity',row_number; end if;
      if state in ('23502','23514','22001','22003','22007','22008','22P02') then
        raise exception 'Row %: invalid or missing CSV field (%)',row_number,state;
      end if;
      raise exception 'Row %: %',row_number,sqlerrm;
  end;
  return import_result;
end $$;
revoke all on function vincore.import_csv(uuid,text,text,jsonb,boolean,jsonb) from public,anon,authenticated,service_role;
grant execute on function vincore.import_csv(uuid,text,text,jsonb,boolean,jsonb) to authenticated;
commit;
