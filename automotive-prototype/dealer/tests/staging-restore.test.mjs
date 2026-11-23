import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

const checker=fileURLToPath(new URL('./staging-check.mjs',import.meta.url));
const mock=`
globalThis.fetch = async (url, options) => {
  const path = new URL(url);
  const token = options.headers.Authorization?.split(' ')[1];
  let data;
  if (path.pathname === '/auth/v1/token' && options.method === 'POST') {
    const email=JSON.parse(options.body).email;
    const id=email.includes('teammate')?'team':email.includes('dealer-b')?'b':'a';
    data={access_token:id,user:{id}};
  } else {
    if (options.method !== 'GET') throw Error('Restore mode attempted a mutation');
    if (path.pathname.endsWith('/dealer_memberships')){
      data=[{dealer_id:token==='b'?'B':'A',dealers:{name:'VINCORE Pilot Dealer '+(token==='b'?'B':'A')}}];
    } else if (path.pathname.endsWith('/auction_vehicles')){
      data=[{id:token==='b'?'b-car':'a-car',vin:'2HJYK16587H520681',max_bid:12700,status:'won',notes:'Fictional teammate confirmed preparation',created_by:'a'}];
    } else if (path.pathname.endsWith('/auction_events')){
      data=token==='b'&&!process.env.FIXTURE_LEAK?[]:
        [['bid',12000],['expense',450],['won',12000]].map(([event_type,amount])=>({event_type,amount,created_by:'team'}));
    } else if (path.pathname.endsWith('/dealer_inventory')){
      data=token==='b'?[]:[{vin:'2HJYK16587H520681'}];
    } else throw Error('Unexpected restore endpoint');
  }
  return new Response(JSON.stringify(data),{status:200});
};
`;
const env={
  ...process.env,
  VINCORE_STAGE_CONFIRM:'fictional-staging',
  VINCORE_STAGE_URL:'https://fixture.supabase.co',
  VINCORE_STAGE_KEY:'sb_publishable_fixture',
  VINCORE_STAGE_PASSWORD_A:'fixture-a',
  VINCORE_STAGE_PASSWORD_B:'fixture-b',
  VINCORE_STAGE_PASSWORD_TEAMMATE:'fixture-team',
  VINCORE_RESTORE_TAG:'VINCORE pilot 00000000-0000-0000-0000-000000000001',
  FIXTURE_LEAK:''
};
const run=overrides=>spawnSync(process.execPath,['--import','data:text/javascript,'+encodeURIComponent(mock),checker],
  {env:{...env,...overrides},encoding:'utf8',timeout:15000});

test('restore checker reads the original records without writing new rows',()=>{
  const result=run({});
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/PASS restored vehicles/);
});

test('restore checker rejects leaked records and malformed tags',()=>{
  const leak=run({FIXTURE_LEAK:'yes'});
  assert.equal(leak.status,1);
  assert.doesNotMatch(leak.stdout,/PASS restored vehicles/);
  const invalid=run({VINCORE_RESTORE_TAG:'invalid'});
  assert.equal(invalid.status,1);
  assert.match(invalid.stderr,/No requests made/);
});
