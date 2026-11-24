import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

const settings = process.env;
const url = settings.VINCORE_STAGE_URL?.replace(/\/$/, '');
const key = settings.VINCORE_STAGE_KEY;
const accounts = [
  ['a','vincore-dealer-a@example.com','VINCORE_STAGE_PASSWORD_A','VINCORE Pilot Dealer A'],
  ['b','vincore-dealer-b@example.com','VINCORE_STAGE_PASSWORD_B','VINCORE Pilot Dealer B'],
  ['teammate','vincore-dealer-a-teammate@example.com','VINCORE_STAGE_PASSWORD_TEAMMATE','VINCORE Pilot Dealer A']
];
const vin = '2HJYK16587H520681';
const run = 'VINCORE pilot ' + randomUUID();
const api = '/rest/v1/';

async function request(path, {method='GET', token, body, prefer, schema='vincore'}={}) {
  const headers = {apikey:key};
  if (path.startsWith(api)) {
    headers['Accept-Profile']=schema;
    if (method!=='GET') headers['Content-Profile']=schema;
  }
  if (token) headers.Authorization = 'Bearer ' + token;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;
  const response = await fetch(url + path, {
    method, headers, body:body === undefined ? undefined : JSON.stringify(body),
    redirect:'error', signal:AbortSignal.timeout(15000)
  });
  const raw = await response.text();
  let data;
  try { data=raw ? JSON.parse(raw) : null } catch { data=null }
  return {status:response.status, ok:response.ok, data};
}

function success(result, step) {
  if (!result.ok) throw Error(step + ' failed (HTTP ' + result.status + ').');
  return result.data;
}

function denied(result, step) {
  if (result.status !== 403 || result.data?.code !== '42501')
    throw Error(step + ' did not return the expected access denial (HTTP ' + result.status + ').');
}

async function signIn(account) {
  const [,email,passwordVariable,dealerName] = account;
  const auth = success(await request('/auth/v1/token?grant_type=password', {
    method:'POST', body:{email,password:settings[passwordVariable]}
  }), 'Sign in ' + account[0]);
  assert.ok(auth.access_token && auth.user?.id, 'Missing authenticated session');
  const token = auth.access_token;
  const membership = success(await request(api+'dealer_memberships?select=dealer_id,dealers(name)&user_id=eq.'+auth.user.id,{token}), 'Read test membership');
  assert.ok(membership.length===1 && membership[0].dealers?.name===dealerName, 'Account must have exactly its designated fictional dealership');
  return {token,id:auth.user.id,dealer:membership[0].dealer_id};
}

async function saveVehicle(user) {
  const [row] = success(await request(api+'auction_vehicles?select=id,status', {
    token:user.token, method:'POST', prefer:'return=representation',
    body:{dealer_id:user.dealer,vin,label:run,max_bid:12700,expected_fees:500,notes:'Fictional staging preparation'}
  }), 'Save auction vehicle');
  assert.equal(row.status,'watching');
  return row.id;
}

async function verifyRestored(tag, a, b, teammate) {
  const endpoint=api+'auction_vehicles?select=id,vin,max_bid,status,notes,created_by&label=eq.'+encodeURIComponent(tag);
  const own=success(await request(endpoint,{token:a.token}),'Read restored Dealer A vehicle');
  const other=success(await request(endpoint,{token:b.token}),'Read restored Dealer B vehicle');
  assert.equal(own.length,1);
  assert.equal(other.length,1);
  const [vehicle]=own;
  assert.notEqual(vehicle.id,other[0].id);
  assert.equal(vehicle.vin,vin);
  assert.equal(Number(vehicle.max_bid),12700);
  assert.equal(vehicle.status,'won');
  assert.equal(vehicle.notes,'Fictional teammate confirmed preparation');
  assert.ok(vehicle.created_by===a.id,'Restored original author must match Dealer A');
  const eventsUrl=api+'auction_events?select=event_type,amount,created_by&vehicle_id=eq.'+vehicle.id+'&order=event_type';
  for(const user of [a,teammate]){
    const events=success(await request(eventsUrl,{token:user.token}),'Read restored events as authorized member');
    assert.deepEqual(events.map(event=>[event.event_type,Number(event.amount)]),[['bid',12000],['expense',450],['won',12000]]);
    assert.ok(events.every(event=>event.created_by===teammate.id),'Restored events must retain teammate attribution');
  }
  assert.deepEqual(success(await request(eventsUrl,{token:b.token}),'Check restored events remain private'),[]);
  const stockUrl=api+'dealer_inventory?select=vin&vin=eq.'+vin+'&dealer_id=eq.'+a.dealer;
  assert.deepEqual(success(await request(stockUrl,{token:a.token}),'Read restored inventory'),[{vin}]);
  assert.deepEqual(success(await request(stockUrl,{token:b.token}),'Check restored inventory remains private'),[]);
  console.log('PASS restored vehicles, events, inventory, attribution, and dealer isolation');
}

async function verifyPrivateCrmBoundary(dealers) {
  for(const dealer of dealers){
    for(const [path,label] of [
      ['memberships?select=tenant_id','CRM memberships'],
      ['contacts?select=id','CRM contacts'],
      ['billing_v1?select=tenant_id','Invoice Studio ledgers'],
      ['rpc/billing_v1_workspaces','Invoice Studio workspaces']
    ]){
      const result=await request(api+path,{token:dealer.token,schema:'crm'});
      if(result.status===403 && result.data?.code==='42501')continue;
      const none=success(result,'Check '+label);
      assert.deepEqual(none,[],'Dealer login must see no '+label);
    }
  }
  console.log('PASS dealer credentials see no private CRM or Invoice Studio records on the checked API routes');
}

async function main() {
  if (settings.VINCORE_STAGE_CONFIRM !== 'fictional-staging' ||
      !/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url || '') ||
      !/^sb_publishable_[\w-]+$/.test(key || '') ||
      accounts.some(([, , password])=>!settings[password])) {
    throw Error('Set staging confirmation, hosted project URL, publishable key, and all three test passwords. No requests made.');
  }
  const tag=settings.VINCORE_RESTORE_TAG;
  if(tag!==undefined && !/^VINCORE pilot [0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(tag))
    throw Error('Provide the complete fictional evidence tag. No requests made.');
  const [a,b,team] = await Promise.all(accounts.map(signIn));
  assert.ok(a.dealer===team.dealer && a.dealer!==b.dealer && new Set([a.id,b.id,team.id]).size===3,
    'Expected three distinct accounts in two fictional dealerships');
  console.log('PASS real password authentication and explicit dealer memberships');
  if(tag){
    await verifyRestored(tag,a,b,team);
    return;
  }

  if(url==='https://cyhlursixdgppqnadzml.supabase.co')await verifyPrivateCrmBoundary([a,b,team]);

  // Check database authorization through the same API and public client key as the browser.
  const idA=await saveVehicle(a), idB=await saveVehicle(b);
  const selectB=api+'auction_vehicles?select=id,notes&id=eq.'+idB;
  assert.deepEqual(success(await request(selectB,{token:a.token}),'Check filtered Dealer B read'),[]);
  assert.deepEqual(success(await request(selectB,{token:a.token,method:'PATCH',prefer:'return=representation',
    body:{notes:'Unauthorized staging test'}}),'Check filtered Dealer B update'),[]);
  const [unchanged]=success(await request(selectB,{token:b.token}),'Confirm Dealer B record unchanged');
  assert.equal(unchanged.notes,'Fictional staging preparation');
  const anonymous=await request(selectB);
  assert.ok([401,403].includes(anonymous.status), 'Anonymous access must be denied');

  async function importRows(user, target, inventory=false) {
    const table=inventory?'dealer_inventory?on_conflict=dealer_id,vin':'auction_vehicles?on_conflict=dealer_id,import_key';
    const row=inventory?{dealer_id:target,vin,stock_number:'PILOT-1'}:
      {dealer_id:target,vin,import_key:run,auction_name:run,auction_date:'2026-11-22',lane_run:'A12'};
    return request(api+table,{token:user.token,method:'POST',prefer:'resolution=ignore-duplicates',body:[row]});
  }
  denied(await importRows(a,b.dealer),'Dealer B run-list import');
  denied(await importRows(a,b.dealer,true),'Dealer B inventory import');
  success(await importRows(a,a.dealer),'Import run list');
  success(await importRows(a,a.dealer),'Re-import run list');
  success(await importRows(a,a.dealer,true),'Import inventory');
  const runRows=success(await request(api+'auction_vehicles?select=id&import_key=eq.'+encodeURIComponent(run),{token:a.token}),'Check run-list deduplication');
  assert.equal(runRows.length,1);
  const stock=success(await request(api+'dealer_inventory?select=vin&vin=eq.'+vin,{token:a.token}),'Check VIN match');
  assert.deepEqual(stock,[{vin}]);
  assert.deepEqual(success(await request(api+'dealer_inventory?select=vin&dealer_id=eq.'+a.dealer,{token:b.token}),'Check Dealer A inventory privacy'),[]);
  console.log('PASS server-side dealer read, update and import isolation');

  const endpoint=api+'auction_vehicles?select=status,notes,created_by&id=eq.'+idA;
  const [edited]=success(await request(endpoint,{token:team.token,method:'PATCH',prefer:'return=representation',
    body:{notes:'Fictional teammate confirmed preparation'}}),'Edit preparation as teammate');
  assert.ok(edited.created_by===a.id,'Original author must be retained');
  for(const [event_type,amount,status] of [['bid',12000,'bidding'],['won',12000,'won'],['expense',450,'won']]){
    success(await request(api+'auction_events',{token:team.token,method:'POST',
      body:{dealer_id:a.dealer,vehicle_id:idA,event_type,amount}}),'Record '+event_type);
    const [row]=success(await request(endpoint,{token:a.token}),'Check '+event_type+' status');
    assert.equal(row.status,status);
  }
  success(await request('/auth/v1/logout?scope=local',{method:'POST',token:a.token}),'Sign out');
  const recovered=await signIn(accounts[0]);
  const [row]=success(await request(endpoint,{token:recovered.token}),'Load record after a new sign-in');
  assert.equal(row.status,'won');
  assert.equal(row.notes,'Fictional teammate confirmed preparation');
  const eventsUrl=api+'auction_events?select=event_type,amount&vehicle_id=eq.'+idA+'&order=event_type';
  const events=success(await request(eventsUrl,{token:recovered.token}),'Recover recorded events');
  assert.deepEqual(events.map(event=>[event.event_type,Number(event.amount)]),[['bid',12000],['expense',450],['won',12000]]);
  assert.deepEqual(success(await request(eventsUrl,{token:b.token}),'Check private event history'),[]);
  console.log('PASS teammate attribution, bids, purchase, expenses, and recovery after sign-out');
  console.log('Evidence tag: '+run+' (fictional records retained in staging)');
}

main().catch(error=>{
  console.error(error.message);
  process.exitCode=1;
});
