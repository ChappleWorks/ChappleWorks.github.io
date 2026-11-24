import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {legacyRecords, maximumBid, prepareLegacy, prepareRunList, prepareInventory, auctionSummary, acquisitionCycles} from '../auction-tools.mjs';

const vin = '2HJYK16587H520681';
const ids = ['a','b','c','d','e','f','1','2'].map(c => c.repeat(8)+'-'+c.repeat(4)+'-'+c.repeat(4)+'-'+c.repeat(4)+'-'+c.repeat(12));
const [alice, teammate, bob, dealerA, dealerB, vehicleA, vehicleB, jointVehicle] = ids;
const schema = file => readFile(new URL('../../supabase/'+file, import.meta.url), 'utf8');

test('auction reporting separates auctions, records expenses and excludes purchases without prices',()=>{
  const v=[{id:'1',auction_name:'Sale A',status:'won'},{id:'2',auction_name:'Sale A',status:'won'},
    {id:'3',auction_name:'Sale B',status:'lost'}];
  const e=[{vehicle_id:'1',event_type:'won',amount:'1200.50'},
    {vehicle_id:'1',event_type:'expense',amount:'55.24'},{vehicle_id:'2',event_type:'expense',amount:20}];
  const [a,b]=auctionSummary(v,e);
  assert.deepEqual([a.total,a.won,a.priced,a.purchase,a.expense],[2,2,1,120050,5524]);
  assert.deepEqual([b.total,b.lost,b.priced],[1,1,0]);
});

test('bid caps, valid run lists, and VIN-matched dealer inventory', async () => {
  assert.equal(maximumBid('14200','500','1000'),12700);
  assert.equal(maximumBid('18900','2500','3000'),13400);
  assert.equal(maximumBid('','0','0'),null);
  assert.equal(maximumBid('100','101','1'),0);
  const header='vin,auction_name,auction_date,lane_run,label';
  const row=vin+',Example,2026-11-22,A12,"Truck, pickup"';
  const list=await prepareRunList([header,row,row].join('\n'));
  assert.equal(list.length,1);
  assert.equal(list[0].label,'Truck, pickup');
  await assert.rejects(prepareRunList(header+'\n'+vin+',Example,2026-02-30,A12,'),/Invalid/);
  await assert.rejects(prepareRunList(header+'\n'+vin+',Example,2026-11-22,A12,"broken'),/Unclosed/);
  assert.equal(prepareInventory('vin,stock_number\n'+vin.toLowerCase()+',S1')[0].vin,vin);
  assert.throws(()=>prepareInventory('vin\n'+vin+'\n'+vin),/duplicate/);
});

test('legacy migration leaves local data intact and archives the original bid and auction data', async () => {
  const rows=new Map([
    ['leonet_vin_notes_'+vin,'Private prep text'],
    ['leonet_vin_profile_'+vin,JSON.stringify({contact:'excluded@example.test',miles:'120000'})],
    ['leonet_bid_decisions_v1',JSON.stringify([{vin,wholesale:12700},{vin:'UNASSIGNED'}])],
    ['leonet_auction_events_v1_'+vin,JSON.stringify([{auctionResult:'bought',winningBid:'12000'}])]
  ]);
  const storage={length:rows.size,key:i=>[...rows.keys()][i],getItem:key=>rows.get(key)??null};
  const [record]=legacyRecords(storage);
  const [first]=await prepareLegacy([record]);
  const [second]=await prepareLegacy([{...record,exportedAt:'later'}]);
  assert.equal(first.import_key,second.import_key);
  assert.equal(first.notes,'Private prep text');
  assert.equal(first.imported_record.profile.contact,undefined);
  assert.equal(first.imported_record.bidDecisions[0].wholesale,12700);
  assert.equal(first.imported_record.auctionAppearances[0].winningBid,'12000');
  assert.equal(rows.size,4);
});

test('PostgreSQL applies both migrations and enforces isolation and atomic outcomes before and after backup/restore', async () => {
  const db=new PGlite();
  let restored;
  const query=(sql,...args)=>db.query(sql,args);
  const role=async (name, id='')=>{
    await db.exec('reset role; set role '+name);
    await query("select set_config('request.jwt.claim.sub', $1, false)",id);
  };
  try{
    await db.exec(`
      create role anon;
      create role authenticated; create role service_role;
      create schema auth;
      create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to anon, authenticated;
      create schema crm;
      create table crm.memberships(user_id uuid primary key);
      create table crm.records(note text not null);
      alter table crm.records enable row level security;
      grant usage on schema crm to authenticated;
      grant select on crm.memberships,crm.records to authenticated;
      create policy crm_members_read on crm.records for select to authenticated
        using (exists (select 1 from crm.memberships where user_id=auth.uid()));
    `);
    // Embedded PostgreSQL has core gen_random_uuid(); extension installation is exercised in Supabase staging.
    await db.exec(await schema('dealer_workspace.sql'));
    await query('insert into auth.users(id) values($1),($2),($3)',alice,teammate,bob);
    await query("insert into vincore.dealers(id,name) values($1,'Dealer A'),($2,'Dealer B')",dealerA,dealerB);
    await query('insert into vincore.dealer_memberships(dealer_id,user_id) values($1,$2),($1,$3),($4,$5),($4,$3)',dealerA,alice,teammate,dealerB,bob);
    await query('insert into vincore.auction_vehicles(id,dealer_id,vin,created_by) values($1,$2,$3,$4),($5,$6,$3,$7),($8,$2,$3,$4)',vehicleA,dealerA,vin,alice,vehicleB,dealerB,bob,jointVehicle);
    await db.exec(await schema('dealer_workspace_upgrade.sql'));
    const crmUser='99999999-9999-9999-9999-999999999999';
    await query('insert into crm.memberships values($1)',crmUser);
    await query("insert into crm.records values('independent CRM record')");
    await role('authenticated',crmUser);
    assert.equal((await query('select * from crm.records')).rows.length,1);
    for(const table of ['dealers','dealer_memberships','auction_vehicles','auction_events','dealer_inventory'])
      assert.equal((await query('select * from vincore.'+table)).rows.length,0);
    await assert.rejects(query('insert into vincore.auction_vehicles(dealer_id,vin) values($1,$2)',dealerA,vin),/row-level security/);
    assert.equal((await query("update vincore.auction_vehicles set notes='no' where id=$1",vehicleA)).affectedRows,0);
    await assert.rejects(query('insert into vincore.dealer_inventory(dealer_id,vin) values($1,$2)',dealerA,vin),/row-level security/);
    await assert.rejects(query("insert into vincore.auction_events(dealer_id,vehicle_id,event_type) values($1,$2,'note')",dealerA,vehicleA),/row-level security/);
    await assert.rejects(query('select vincore_private.is_dealer_member($1)',dealerA),/permission denied/);
    await role('authenticated',alice);
    assert.equal((await query('select * from crm.records')).rows.length,0);
    await role('anon');
    await assert.rejects(query('select * from vincore.auction_vehicles'),/permission denied/);
    await assert.rejects(query('select * from vincore.dealer_inventory'),/permission denied/);

    await role('authenticated',alice);
    assert.deepEqual((await query('select distinct dealer_id from vincore.auction_vehicles')).rows,[{dealer_id:dealerA}]);
    assert.equal((await query('select * from vincore.dealer_memberships where dealer_id=$1',dealerB)).rows.length,0);
    assert.equal((await query("update vincore.auction_vehicles set notes='private' where id=$1",vehicleB)).affectedRows,0);
    await assert.rejects(query('insert into vincore.auction_vehicles(dealer_id,vin) values($1,$2)',dealerB,vin),/row-level security/);
    await assert.rejects(query('update vincore.auction_vehicles set dealer_id=$1 where id=$2',dealerB,vehicleA),/permission denied/);
    await assert.rejects(query("update vincore.auction_vehicles set status='won' where id=$1",vehicleA),/permission denied/);
    await assert.rejects(query('insert into vincore.dealer_memberships(dealer_id,user_id) values($1,$2)',dealerB,alice),/permission denied/);
    await assert.rejects(query("insert into vincore.auction_events(dealer_id,vehicle_id,event_type) values($1,$2,'note')",dealerA,vehicleB),/foreign key/);
    await assert.rejects(query("insert into vincore.auction_events(dealer_id,vehicle_id,event_type) values($1,$2,'note')",dealerB,vehicleB),/row-level security/);

    await assert.rejects(query("insert into vincore.auction_vehicles(dealer_id,vin,import_key) values($1,$2,'foreign-run') on conflict(dealer_id,import_key) do nothing",dealerB,vin),/row-level security/);
    await assert.rejects(query("insert into vincore.dealer_inventory(dealer_id,vin,stock_number) values($1,$2,'foreign-stock') on conflict(dealer_id,vin) do nothing",dealerB,vin),/row-level security/);

    await role('authenticated',teammate);
    assert.equal((await query("update vincore.auction_vehicles set notes='team edit' where id=$1 returning created_by",vehicleA)).rows[0].created_by,alice);
    await assert.rejects(query("insert into vincore.auction_events(dealer_id,vehicle_id,event_type) values($1,$2,'note')",dealerB,jointVehicle),/foreign key/);
    await assert.rejects(query("insert into vincore.auction_events(dealer_id,vehicle_id,event_type) values($1,$2,'won')",dealerA,vehicleA),/check constraint/);
    const event=type=>query('insert into vincore.auction_events(dealer_id,vehicle_id,event_type,amount) values($1,$2,$3,100)',dealerA,vehicleA,type);
    await event('bid');
    assert.equal((await query('select status from vincore.auction_vehicles where id=$1',vehicleA)).rows[0].status,'bidding');
    await event('won');
    await event('expense');
    await assert.rejects(event('bid'),/auction already closed/);
    assert.equal((await query('select status from vincore.auction_vehicles where id=$1',vehicleA)).rows[0].status,'won');
    assert.equal((await query('select * from vincore.auction_events where vehicle_id=$1',vehicleA)).rows.length,3);
    await assert.rejects(query("update vincore.auction_events set note='rewrite' where vehicle_id=$1",vehicleA),/permission denied/);
    const importRows=()=>query("insert into vincore.auction_vehicles(dealer_id,vin,import_key) values($1,$2,'test-import') on conflict(dealer_id,import_key) do nothing",dealerA,vin);
    assert.equal((await importRows()).affectedRows,1);
    assert.equal((await importRows()).affectedRows,0);
    await query("insert into vincore.dealer_inventory(dealer_id,vin,stock_number) values($1,$2,'A1')",dealerA,vin);
    await role('authenticated',bob);
    assert.equal((await query('select * from vincore.auction_events where vehicle_id=$1',vehicleA)).rows.length,0);
    assert.equal((await query('select * from vincore.dealer_inventory')).rows.length,0);
    await assert.rejects(query('insert into vincore.dealer_inventory(dealer_id,vin) values($1,$2)',dealerA,vin),/row-level security/);
    await query("insert into vincore.dealer_inventory(dealer_id,vin,stock_number) values($1,$2,'B1')",dealerB,vin);
    assert.equal((await query('select stock_number from vincore.dealer_inventory')).rows[0].stock_number,'B1');
    await db.exec('reset role');
    const fixture=await readFile(new URL('../pilot/assign-fictional-dealers.sql',import.meta.url),'utf8');
    await assert.rejects(db.exec(fixture),/no rows/);
    assert.equal((await query("select count(*)::int as count from vincore.dealers where name like 'VINCORE Pilot%'")).rows[0].count,0);
    await db.exec(`
      insert into auth.users(id,email,email_confirmed_at)
      select gen_random_uuid(), email, now() from (values
        ('vincore-dealer-a@example.com'),('vincore-dealer-b@example.com'),
        ('vincore-dealer-a-teammate@example.com')) as fixture(email);
    `);
    await db.exec(fixture);
    await db.exec(fixture);
    const memberCount=await query("select count(*)::int as count from vincore.dealer_memberships join vincore.dealers on dealer_id=id where name like 'VINCORE Pilot%'");
    assert.equal(memberCount.rows[0].count,3);

    await db.exec(await schema('dealer_imports.sql'));
    await role('authenticated',alice);
    const importCsv=(dealer,kind,rows,confirm=true)=>
      query("select vincore.import_csv($1,$2,'fixture.csv',$3::jsonb,$4) as result",dealer,kind,JSON.stringify(rows),confirm).then(x=>x.rows[0].result);
    const inv={vin,label:'Fixture pickup',stock_number:'INV-A',mileage:'120000'};
    const run={vin,auction_name:'Fixture Auction',auction_date:'2026-10-01',lane_run:'B12',label:'Fixture pickup'};
    const record=(record_id,kind,effective_date,amount,extra={})=>({
      vin,source:'Fixture Books',record_id,acquisition_ref:'first-cycle',kind,effective_date,amount,...extra
    });
    const costRows=[record('p1','purchase','2026-10-01','10000',{auction_name:'Fixture Auction'}),
      record('e1','expense','2026-10-02','500'),record('s1','sale','2026-10-12','13000',{costs_complete:true})];
    const valuation={vin,source:'Fixture Valuation',record_id:'q1',effective_date:'2026-10-01',basis:'retail',amount:'15000'};
    const inventoryPreview=await importCsv(dealerA,'inventory',[inv],false);
    assert.equal(inventoryPreview.updated,1);
    assert.equal(inventoryPreview.inventory_changes[0].before.stock_number,'A1');
    assert.equal((await query('select stock_number from vincore.dealer_inventory')).rows[0].stock_number,'A1');
    assert.equal((await query('select * from vincore.import_batches')).rows.length,0);
    assert.equal((await importCsv(dealerA,'inventory',[inv])).updated,1);
    assert.equal((await importCsv(dealerA,'inventory',[inv])).duplicates,1);
    await assert.rejects(query("select vincore.import_csv($1,'inventory','fixture.csv',$2::jsonb,true,$3::jsonb)",dealerA,
      JSON.stringify([inv]),JSON.stringify(inventoryPreview)),/changed since preview/);
    assert.equal((await importCsv(dealerA,'auction',[run])).inserted,1);
    assert.equal((await importCsv(dealerA,'auction',[run])).duplicates,1);
    assert.equal((await importCsv(dealerA,'auction',[{...run,auction_date:'2026-10-02'}])).inserted,1);
    await assert.rejects(importCsv(dealerA,'auction',[{...run,label:'Conflict'}]),/different label/);
    assert.equal((await importCsv(dealerA,'valuations',[valuation])).inserted,1);
    assert.equal((await importCsv(dealerA,'valuations',[valuation])).duplicates,1);
    await assert.rejects(importCsv(dealerA,'valuations',[{...valuation,amount:'16000'}]),/conflicts/);
    assert.equal((await importCsv(dealerA,'transactions',costRows,false)).inserted,3);
    assert.equal((await query('select * from vincore.vehicle_transactions')).rows.length,0);
    assert.equal((await importCsv(dealerA,'transactions',costRows)).inserted,3);
    assert.equal((await importCsv(dealerA,'transactions',costRows)).duplicates,3);
    await assert.rejects(importCsv(dealerA,'transactions',[{...costRows[0],source:'Second Export'}]),/Possible duplicate purchase/);
    const missing=[record('p2','purchase','2026-10-20','12000',{acquisition_ref:'second-cycle'}),
      record('e2','expense','2026-10-21','',{acquisition_ref:'second-cycle'}),
      record('s2','sale','2026-10-29','15000',{costs_complete:true,acquisition_ref:'second-cycle'})];
    await importCsv(dealerA,'transactions',missing);
    await assert.rejects(importCsv(dealerA,'transactions',[record('discard','expense','2026-10-11','100'),{...costRows[0],amount:'42'}]),/conflicts/);
    assert.equal((await query("select * from vincore.vehicle_transactions where record_id='discard'")).rows.length,0);
    await assert.rejects(importCsv(dealerA,'transactions',[record('orphan','sale','2026-10-29','15000',{acquisition_ref:'missing'})]),/matching purchase/);
    const manual=(await query("select id,vehicle_id,event_type,amount,created_at::date::text as day from vincore.auction_events where vehicle_id=$1",vehicleA)).rows;
    const won=manual.find(row=>row.event_type==='won'), expense=manual.find(row=>row.event_type==='expense');
    const same=[record('p3','purchase',won.day,'100',{acquisition_ref:'manual-cycle'}),
      record('e3','expense',expense.day,'100',{acquisition_ref:'manual-cycle',manual_event_id:expense.id}),
      record('s3','sale',won.day,'300',{acquisition_ref:'manual-cycle',costs_complete:true})];
    await assert.rejects(importCsv(dealerA,'transactions',same),/Possible duplicate/);
    same[0].manual_event_id=won.id;
    assert.equal((await importCsv(dealerA,'transactions',same)).reconciled,2);
    const cycles=acquisitionCycles((await query('select * from vincore.vehicle_transactions')).rows,manual);
    const byReference=Object.fromEntries(cycles.map(c=>[c.ref,c]));
    assert.deepEqual([byReference['first-cycle'].profit,byReference['first-cycle'].days],[250000,11]);
    assert.equal(byReference['second-cycle'].profit,null);
    assert.equal(byReference['manual-cycle'].profit,10000);
    await assert.rejects(query("delete from vincore.vehicle_transactions where dealer_id=$1",dealerA),/permission denied/);
    await role('authenticated',bob);
    for(const table of ['vehicle_transactions','vehicle_valuations','import_batches'])
      assert.equal((await query('select * from vincore.'+table)).rows.length,0);
    for(const [kind,rows] of [['transactions',costRows],['valuations',[valuation]],['auction',[run]],['inventory',[inv]]])
      await assert.rejects(importCsv(dealerA,kind,rows),/permission denied|insufficient_privilege/);
    await role('anon');
    await assert.rejects(importCsv(dealerA,'valuations',[valuation]),/permission denied/);
    await db.exec('reset role');
    const demo=await readFile(new URL('../pilot/seed-fictional-auction-history.sql',import.meta.url),'utf8');
    await db.exec(demo);
    await db.exec(demo);
    const seeded=(await query("select status,count(*)::int as n from vincore.auction_vehicles where import_key like 'demo-history:%' group by status order by status")).rows;
    assert.deepEqual(seeded,[{status:'bidding',n:10},{status:'lost',n:20},{status:'passed',n:15},{status:'watching',n:10},{status:'won',n:45}]);

    // Export only VINCORE records. The destination owns its Auth and CRM state.
    await db.exec('reset role');
    const tables=['dealers','dealer_memberships','auction_vehicles','auction_events','dealer_inventory','import_batches','vehicle_transactions','vehicle_valuations'];
    const archive=new Map();
    for(const table of tables){
      const {rows}=await query("select coalesce(jsonb_agg(t),'[]'::jsonb) as data from vincore."+table+' t');
      archive.set(table,JSON.stringify(rows[0].data));
    }
    restored=new PGlite();
    await restored.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to anon, authenticated;
      create schema crm;
      create table crm.records(note text);
      insert into crm.records values ('Destination CRM retained');
    `);
    await restored.exec(await schema('dealer_workspace.sql'));
    await restored.exec(await schema('dealer_workspace_upgrade.sql'));
    await restored.exec(await schema('dealer_imports.sql'));
    const restore=()=>restored.transaction(async tx=>{
      // Existing status is restored with the vehicle. Do not replay transitions from the event log.
      await tx.exec('alter table vincore.auction_events disable trigger apply_auction_event');
      for(const [table,data] of archive)
        await tx.query('insert into vincore.'+table+' select * from jsonb_populate_recordset(null::vincore.'+table+',$1::jsonb)',[data]);
      await tx.exec('alter table vincore.auction_events enable trigger apply_auction_event');
    });
    await assert.rejects(restore(),/foreign key/);
    assert.equal((await restored.query('select * from vincore.dealers')).rows.length,0);
    const identities=(await query('select id from auth.users')).rows;
    for(const {id} of identities)await restored.query('insert into auth.users values ($1)',[id]);
    const authBefore=(await restored.query('select id from auth.users order by id')).rows;
    await restore();
    assert.deepEqual((await restored.query('select id from auth.users order by id')).rows,authBefore);
    assert.deepEqual((await restored.query('select * from crm.records')).rows,[{note:'Destination CRM retained'}]);
    await restored.exec('set role authenticated');
    await restored.query("select set_config('request.jwt.claim.sub',$1,false)",[alice]);
    assert.deepEqual((await restored.query('select status,notes from vincore.auction_vehicles where id=$1',[vehicleA])).rows,
      [{status:'won',notes:'team edit'}]);
    assert.deepEqual((await restored.query('select event_type,amount from vincore.auction_events where vehicle_id=$1 order by event_type',[vehicleA])).rows,
      ['bid','expense','won'].map(event_type=>({event_type,amount:'100.00'})));
    assert.deepEqual((await restored.query('select stock_number from vincore.dealer_inventory')).rows,[{stock_number:'INV-A'}]);
    assert.equal((await restored.query('select * from vincore.vehicle_transactions')).rows.length,9);
    assert.equal((await restored.query('select * from vincore.vehicle_valuations')).rows.length,1);
    await restored.query("select set_config('request.jwt.claim.sub',$1,false)",[bob]);
    assert.equal((await restored.query('select * from vincore.vehicle_transactions')).rows.length,0);
    assert.equal((await restored.query('select * from vincore.auction_events where vehicle_id=$1',[vehicleA])).rows.length,0);
    assert.deepEqual((await restored.query('select stock_number from vincore.dealer_inventory')).rows,[{stock_number:'B1'}]);
  }finally{
    await restored?.close();
    await db.close();
  }
});
