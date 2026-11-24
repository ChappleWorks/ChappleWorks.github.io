import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {access, readFile} from 'node:fs/promises';
import test from 'node:test';
import {chromium} from 'playwright';

const sdk = `
export function createClient(_url,_key,options){
  if(options.db.schema!=='vincore'||options.auth.storageKey!=='leonet-vincore-auth')throw Error('Incorrect VINCORE schema or session namespace');
  const user={id:'test-user',email:'dealer@example.test'};
  const signedIn=()=>localStorage.getItem('fixture-session')==='yes';
  const rows=JSON.parse(localStorage.getItem('fixture-vehicles')||'[]');
  const inventory=JSON.parse(localStorage.getItem('fixture-inventory')||'[]');
  const events=JSON.parse(localStorage.getItem('fixture-events')||'[]');
  const transactions=JSON.parse(localStorage.getItem('fixture-transactions')||'[]');
  const valuations=JSON.parse(localStorage.getItem('fixture-valuations')||'[]');
  const table={vehicle_transactions:transactions,vehicle_valuations:valuations,dealer_memberships:[{dealer_id:'a',user_id:user.id,dealers:{name:'Test Dealer'}}],auction_vehicles:rows,auction_events:events,dealer_inventory:inventory};
  let authChanged;
  return {
    auth:{
      onAuthStateChange:fn=>{authChanged=fn},
      getUser:async()=>({data:{user:signedIn()?user:null}}),
      signInWithPassword:async()=>{localStorage.setItem('fixture-session','yes');return {}},
      signOut:async({scope})=>{if(scope!=='local')throw Error('Shared Auth sign-out must stay local');localStorage.removeItem('fixture-session');authChanged('SIGNED_OUT');return {}}
    },
    async rpc(name,{p_kind,p_rows,p_confirm,p_dealer}){
      if(name!=='import_csv')return {error:new Error('Unexpected RPC')};
      const target={inventory,auction:rows,transactions,valuations}[p_kind];
      const result={inserted:0,duplicates:0,updated:0,reconciled:0};
      for(const record of p_rows){
        const duplicate=target.some(existing=>existing.vin===record.vin&&(
          p_kind==='inventory'||(p_kind==='auction'?existing.auction_date===record.auction_date&&existing.lane_run===record.lane_run:existing.record_id===record.record_id)));
        if(duplicate){result.duplicates++;continue;}
        result.inserted++;
        if(p_confirm)target.push({id:String(target.length+1),dealer_id:p_dealer,status:'watching',...record});
      }
      if(p_confirm){
        localStorage.setItem('fixture-vehicles',JSON.stringify(rows));
        localStorage.setItem('fixture-inventory',JSON.stringify(inventory));
        localStorage.setItem('fixture-transactions',JSON.stringify(transactions));
        localStorage.setItem('fixture-valuations',JSON.stringify(valuations));
      }
      return {data:result};
    },
    from(name){
      let filters=[], action='select', values, single=false;
      const query={
        select:()=>query, eq:(k,v)=>{filters.push(r=>r[k]===v);return query},
        order:()=>query, range:()=>query,
        single:()=>{single=true;return query}, maybeSingle:()=>{single=true;return query},
        insert:record=>{action='insert';values=[record];return query},
        upsert:records=>{action='insert';values=records;return query},
        update:record=>{action='update';values=record;return query},
        then(resolve){
          const records=table[name], matches=records.filter(record=>filters.every(fn=>fn(record)));
          if(action==='insert')for(const record of values){
            if(name==='auction_vehicles'&&record.import_key&&records.some(r=>r.import_key===record.import_key))continue;
            if(name==='dealer_inventory'&&records.some(r=>r.vin===record.vin))continue;
            records.push({id:String(records.length+1),status:'watching',created_at:new Date().toISOString(),...record});
            if(name==='auction_events'&&['bid','won','lost','passed'].includes(record.event_type)){
              rows.find(r=>r.id===record.vehicle_id).status=record.event_type==='bid'?'bidding':record.event_type;
            }
          }
          if(action==='update')matches.forEach(record=>Object.assign(record,values));
          localStorage.setItem('fixture-vehicles',JSON.stringify(rows));
          localStorage.setItem('fixture-inventory',JSON.stringify(inventory));
          localStorage.setItem('fixture-events',JSON.stringify(events));
          resolve({data:single?matches[0]||null:matches,error:null});
        }
      };
      return query;
    }
  };
}
`;

test('390px browser flow with mocked Supabase and NHTSA services', {timeout:45000}, async () => {
  const vin='2HJYK16587H520681';
  const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const executablePath=process.env.VINCORE_BROWSER_PATH || (process.platform==='win32'&&await access(edge).then(()=>true,()=>false)?edge:undefined);
  const html=await readFile(new URL('../index.html',import.meta.url));
  const module=await readFile(new URL('../auction-tools.mjs',import.meta.url));
  let configured=false;
  const server=createServer((req,res)=>{
    if(req.url==='/config.js'){
      res.setHeader('Content-Type','application/javascript');
      return res.end(configured?'window.VINCORE_SUPABASE={url:"https://fixture.supabase.co",anonKey:"sb_publishable_fixture"};':'');
    }
    if(req.url==='/auction-tools.mjs'){
      res.setHeader('Content-Type','application/javascript');
      return res.end(module);
    }
    res.setHeader('Content-Type','text/html');
    res.end(html);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try{
    browser=await chromium.launch({executablePath,headless:true});
    const page=await browser.newPage({viewport:{width:390,height:844}});
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({contentType:'application/javascript',headers:{'access-control-allow-origin':'*'},body:sdk}));
    await page.route('https://vpic.nhtsa.dot.gov/**',route=>route.fulfill({headers:{'access-control-allow-origin':'*'},json:{Results:[{ModelYear:'2007',Make:'HONDA',Model:'Ridgeline',ErrorCode:'0'}]}}));
    await page.route('https://api.nhtsa.gov/**',route=>route.fulfill({headers:{'access-control-allow-origin':'*'},json:{results:[{NHTSACampaignNumber:'EXAMPLE',Component:'Fixture'}]}}));
    const url='http://127.0.0.1:'+server.address().port+'/';
    await page.goto(url);
    await page.getByRole('heading',{name:'Dealer portal not configured'}).waitFor();
    configured=true;
    await page.reload();
    await page.locator('#email').fill('dealer@example.test');
    await page.locator('#password').fill('fictional-password');
    await page.getByRole('button',{name:'Sign in',exact:true}).click();
    await page.getByRole('heading',{name:'Dealer auction workspace'}).waitFor();
    await page.locator('#vin').fill(vin);
    await page.locator('#research').click();
    await page.getByText('2007 HONDA Ridgeline · NHTSA vPIC').waitFor();
    await page.getByText('Model-level NHTSA recall campaigns').click();
    await page.getByText('EXAMPLE · Fixture').waitFor();
    await page.getByText('Wholesale and retail maximum bids').click();
    const wholesale=page.locator('#bidInputs fieldset').first();
    await wholesale.getByLabel('Selling value ($)',{exact:true}).fill('14200');
    await wholesale.getByLabel('Costs ($)',{exact:true}).fill('500');
    await wholesale.getByLabel('Required profit ($)',{exact:true}).fill('1000');
    await wholesale.getByRole('button').click();
    assert.equal(await page.locator('#maxbid').inputValue(),'12700');
    await page.locator('#notes').fill('Original preparation');
    await page.getByRole('button',{name:'Save vehicle',exact:true}).click();
    const vehicle=page.getByRole('button',{name:'2007 HONDA Ridgeline',exact:true});
    await vehicle.click();
    await page.getByRole('button',{name:'Edit preparation'}).click();
    await page.locator('#notes').fill('Updated preparation');
    await page.getByRole('button',{name:'Save changes'}).click();
    await page.getByText('Updated preparation',{exact:true}).waitFor();
    await vehicle.click();
    for(const [type,amount] of [['bid','12000'],['won','12000'],['expense','450']]){
      await page.locator('#eventType').selectOption(type);
      await page.locator('#amount').fill(amount);
      await page.getByRole('button',{name:'Record auction action'}).click();
      await page.locator('#events').getByText(type,{exact:true}).waitFor();
    }
    await page.getByText(/Recorded acquisition total \$12,450\.00/).waitFor();
    await page.getByText('Import auction records',{exact:true}).click();
    await page.locator('#importType').selectOption('inventory');
    await page.locator('#importFile').setInputFiles({name:'inventory.csv',mimeType:'text/csv',buffer:Buffer.from('vin,stock_number\n'+vin+',STOCK-1')});
    await page.getByRole('button',{name:'Preview file'}).click();
    await page.locator('#confirmImport').click();
    await page.getByText(/Import complete/).waitFor();
    await vehicle.click();
    await page.getByText('Dealer inventory match: STOCK-1').waitFor();
    await page.evaluate(({vin})=>localStorage.setItem('leonet_vin_notes_'+vin,'Legacy note'),{vin});
    await page.locator('#importType').selectOption('auction');
    await page.locator('#importFile').setInputFiles({name:'run-list.csv',mimeType:'text/csv',buffer:Buffer.from('vin,auction_name,auction_date,lane_run,label\n'+vin+',Example,2026-11-22,A12,Run list truck')});
    await page.getByRole('button',{name:'Preview file'}).click();
    await page.locator('#confirmImport').click();
    await page.getByRole('button',{name:'Run list truck'}).waitFor();
    await page.getByRole('button',{name:'Preview file'}).click();
    await page.locator('#confirmImport').click();
    await page.getByText(/Import complete/).waitFor();
    assert.equal(await page.getByRole('button',{name:'Run list truck'}).count(),1);
    for(const [kind,csv] of [
      ['transactions','vin,source,record_id,acquisition_ref,kind,effective_date,amount,auction_name,costs_complete\n'+
        [',accounting,p1,c1,purchase,2026-11-20,10000,Example,',',accounting,e1,c1,expense,2026-11-21,500,,',',accounting,s1,c1,sale,2026-11-22,13000,,true'].map(row=>vin+row).join('\n')],
      ['valuations','vin,source,record_id,effective_date,basis,amount\n'+vin+',valuation,q1,2026-11-22,retail,15000']
    ]){
      await page.locator('#importType').selectOption(kind);
      await page.locator('#importFile').setInputFiles({name:kind+'.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
      await page.getByRole('button',{name:'Preview file'}).click();
      await page.locator('#confirmImport').click();
      await page.getByText(/Import complete/).waitFor();
    }
    await page.getByRole('button',{name:'Run list truck'}).click();
    await page.locator('#vinTransactions').getByText(/Realized profit \$2,500\.00/).waitFor();
    await page.getByRole('button',{name:'Use as retail selling value'}).click();
    assert.equal(await page.locator('#fileBidInputs fieldset').last().getByLabel('Selling value ($)').inputValue(),'15000');
    await page.getByRole('button',{name:'Preview browser records'}).click();
    await page.locator('#confirmImport').click();
    await page.getByText('Legacy note',{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
    await page.reload();
    await page.getByText('Updated preparation',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Sign out'}).click();
    await page.getByRole('heading',{name:'Dealer sign in'}).waitFor();
    assert.equal(await page.getByText('Updated preparation',{exact:true}).count(),0);
    await page.locator('#email').fill('dealer@example.test');
    await page.locator('#password').fill('fictional-password');
    await page.getByRole('button',{name:'Sign in',exact:true}).click();
    await vehicle.click();
    await page.getByText('Dealer inventory match: STOCK-1').waitFor();
    await page.getByText(/Recorded acquisition total \$12,450\.00/).waitFor();
    assert.deepEqual(errors,[]);
  }finally{
    await browser?.close();
    await new Promise(resolve=>server.close(resolve));
  }
});
