-- Fictional showcase only. Run on VINCORE staging after Dealer A has been provisioned.
-- The existing workspace and prior pilot records are preserved. Safe to repeat.
begin;
do $$
declare
  demo_dealer constant uuid := 'd3c1460b-b3b8-4468-b691-c549fcc0bc75';
  demo_user uuid;
  model_names text[] := array['Toyota Camry LE','Honda Accord Sport','Ford F-150 XLT','Chevrolet Silverado LT','Subaru Outback Premium','Mazda CX-5 Touring','Toyota RAV4 XLE','Honda CR-V EX','Nissan Altima SV','Hyundai Tucson SEL','Kia Sportage LX','Ford Escape SE'];
  auction_names text[] := array['I-75 Dealer Exchange','Bayline Auto Auction','Central Fleet Sale','Pine Ridge Wholesale'];
  i integer;
  bucket integer;
  day date;
  cited_at timestamptz;
  row_id uuid;
  cap numeric;
  winning numeric;
begin
  select u.id into strict demo_user from auth.users u
    join vincore.dealer_memberships m on m.user_id=u.id
    join vincore.dealers d on d.id=m.dealer_id
    where d.id=demo_dealer and d.name='VINCORE Pilot Dealer A'
      and u.email='vincore-dealer-a@example.com' and m.role='owner';
  for i in 1..100 loop
    bucket := (i-1)%20;
    day := case when bucket>=18 then current_date+((i%5)+1)
      when bucket>=16 then current_date else current_date-(2+i%84) end;
    cited_at := least(now(),(day+time '15:00') at time zone 'America/New_York');
    cap := 6800 + ((i*467)%14300);
    winning := cap - 120 - ((i*83)%1000);
    insert into vincore.auction_vehicles(dealer_id,vin,label,auction_name,auction_date,lane_run,max_bid,expected_fees,notes,created_by,created_at,updated_at,import_key)
    values(demo_dealer,'9ZZDEM0AU'||lpad(i::text,8,'0'),
      '[Demo] '||(2016+i%8)||' '||model_names[1+(i-1)%12],
      auction_names[1+((i-1)/3)%4],day,chr(65+i%4)||'-'||(100+i),cap,
      275+i%6*45,
      case when bucket<9 then 'Fictional acquisition. See activity for hammer price and expenses.'
           when bucket<13 then 'Fictional result: bidding exceeded the buying cap.'
           when bucket<16 then 'Fictional result: passed after condition review.'
           when bucket<18 then 'Fictional active bid. Awaiting sale result.'
           else 'Fictional watchlist. Inspect before bidding.' end,
      demo_user,cited_at,cited_at,'demo-history:'||i)
    on conflict(dealer_id,import_key) do nothing
    returning id into row_id;
    if row_id is null then continue; end if;
    if bucket<13 or bucket in (16,17) then
      insert into vincore.auction_events(dealer_id,vehicle_id,event_type,amount,note,created_by,created_at)
      values(demo_dealer,row_id,'bid',case when bucket<9 then winning-100 else cap-150 end,'Fictional manual bid',demo_user,cited_at);
    end if;
    if bucket<9 then
      insert into vincore.auction_events(dealer_id,vehicle_id,event_type,amount,note,created_by,created_at)
      values(demo_dealer,row_id,'won',winning,'Fictional hammer price',demo_user,cited_at+interval '3 minutes');
      insert into vincore.auction_events(dealer_id,vehicle_id,event_type,amount,note,created_by,created_at) values
        (demo_dealer,row_id,'expense',275+i%6*45,'Fictional auction fee',demo_user,cited_at+interval '4 minutes'),
        (demo_dealer,row_id,'expense',180+i%7*40,'Fictional transport',demo_user,cited_at+interval '5 minutes'),
        (demo_dealer,row_id,'expense',150+(i*127)%900,'Fictional reconditioning',demo_user,cited_at+interval '6 minutes');
    elsif bucket<16 then
      insert into vincore.auction_events(dealer_id,vehicle_id,event_type,note,created_by,created_at)
      values(demo_dealer,row_id,case when bucket<13 then 'lost' else 'passed' end,
        case when bucket<13 then 'Fictional outcome: outbid' else 'Fictional outcome: passed on condition' end,
        demo_user,cited_at+interval '3 minutes');
    end if;
  end loop;
end $$;
commit;
