export const validVin = vin => /^[A-HJ-NPR-Z0-9]{17}$/.test(vin);
export const maximumBid = (sale, costs, profit) =>
  sale === '' ? null : Math.max(0, Math.round((Number(sale) - Number(costs) - Number(profit)) * 100) / 100);

export async function lookupVin(vin, signal) {
  const response = await fetch('https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/' +
    encodeURIComponent(vin) + '?format=json', {signal});
  if (!response.ok) throw Error('NHTSA lookup failed');
  const {Results: [vehicle]} = await response.json();
  if (!vehicle?.Make || !vehicle.Model || !vehicle.ModelYear)
    throw Error(vehicle?.ErrorText || 'No complete vehicle identity returned');
  return vehicle;
}

const read = (storage, key, fallback) => {
  const raw = storage.getItem(key);
  return raw === null ? fallback : JSON.parse(raw);
};

export function legacyRecords(storage) {
  const imports = read(storage, 'leonet_vehicle_imports_v1', []);
  const decisions = read(storage, 'leonet_bid_decisions_v1', []);
  const vins = new Set([...imports, ...decisions].map(row => row.vin));
  const prefixes = ['leonet_auction_events_v1_', 'leonet_vehicle_events_v1_', 'leonet_vin_notes_', 'leonet_vin_profile_'];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    const prefix = prefixes.find(item => key.startsWith(item));
    if (prefix) vins.add(key.slice(prefix.length));
  }
  return [...vins].filter(validVin).sort().map(vin => ({
    vin,
    auctionAppearances: read(storage, prefixes[0] + vin, []),
    vehicleRecords: read(storage, prefixes[1] + vin, []),
    notes: storage.getItem(prefixes[2] + vin),
    profile: read(storage, prefixes[3] + vin, {}),
    importedRecords: imports.filter(row => row.vin === vin),
    bidDecisions: decisions.filter(row => row.vin === vin)
  }));
}

async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function prepareLegacy(records) {
  return Promise.all(records.map(async record => {
    if (!validVin(record.vin)) throw Error('Import contains an invalid VIN');
    const {exportedAt, format, ...snapshot} = record;
    // The archived vehicle profile may contain a customer's email or phone.
    const {contact, ...profile} = snapshot.profile || {};
    snapshot.profile = profile;
    const notes = typeof snapshot.notes === 'string' ? snapshot.notes : '';
    return {vin: record.vin, notes: notes.slice(0, 20000), import_key: 'legacy:' + await digest(snapshot), imported_record: snapshot};
  }));
}
function csvParse(text) {
  const rows = [];
  let row = [], cell = '', quoted = false, closed = false;
  function field() {
    row.push(cell.trim());
    cell = '';
    closed = false;
  }
  function line() {
    field();
    if (row.some(Boolean)) rows.push(row);
    row = [];
  }
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
        closed = true;
      } else {
        cell += char;
      }
    } else if (char === ',') {
      field();
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      line();
    } else if (char === '"' && cell === '' && !closed) {
      quoted = true;
    } else {
      if (closed || char === '"') throw Error('Malformed quoted CSV field');
      cell += char;
    }
  }
  if (quoted) throw Error('Unclosed quoted CSV field');
  line();
  if (rows.length < 2) return [];
  const keys = rows.shift().map(key => key.toLowerCase());
  if (!keys.includes('vin') || new Set(keys).size !== keys.length || keys.some(key => !key))
    throw Error('Use unique CSV column names and include a VIN column');
  return rows.map((values, index) => {
    if (values.length !== keys.length) throw Error('Wrong column count on data row ' + (index + 1));
    return Object.fromEntries(keys.map((key, i) => [key, values[i]]));
  });
}

export async function prepareRunList(csv) {
  const rows = csvParse(csv.replace(/^\uFEFF/, ''));
  if (!rows.length || rows.length > 500)
    throw Error('Use a CSV with a VIN header and 1–500 rows');
  const unique = new Map();
  for (const [index, row] of rows.entries()) {
    const vin = String(row.vin || '').trim().toUpperCase();
    if (!validVin(vin) || !row.auction_name || !row.auction_date || !row.lane_run ||
        [row.label, row.auction_name, row.lane_run].some(field => field?.length > 180) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(row.auction_date) ||
        Number.isNaN(Date.parse(row.auction_date)) || new Date(row.auction_date).toISOString().slice(0, 10) !== row.auction_date)
      throw Error('Invalid VIN, auction, date, or lane/run on data row ' + (index + 1));
    const identity = [vin, row.auction_name.toLowerCase(), row.auction_date, row.lane_run.toLowerCase()];
    const import_key = 'run:' + await digest(identity);
    unique.set(import_key, {vin, label: row.label || '', auction_name: row.auction_name,
      auction_date: row.auction_date, lane_run: row.lane_run, import_key});
  }
  return [...unique.values()];
}


export function prepareInventory(csv) {
  const rows = csvParse(csv.replace(/^\uFEFF/, ''));
  if (!rows.length || rows.length > 500) throw Error('Use a CSV with a VIN header and 1–500 rows');
  const unique = new Set();
  return rows.map((row, index) => {
    const vin = String(row.vin || '').trim().toUpperCase();
    const label = row.label || '', stock_number = row.stock_number || '';
    if (!validVin(vin) || label.length > 180 || stock_number.length > 180 || unique.has(vin))
      throw Error('Invalid or duplicate inventory VIN or field on data row ' + (index + 1));
    unique.add(vin);
    return {vin,label,stock_number};
  });
}

export async function modelRecalls(vehicle, signal) {
  const query = new URLSearchParams({make:vehicle.Make, model:vehicle.Model, modelYear:vehicle.ModelYear});
  const response = await fetch('https://api.nhtsa.gov/recalls/recallsByVehicle?' + query, {signal});
  if (!response.ok) throw Error('NHTSA recall lookup unavailable');
  const data = await response.json();
  return data.results || data.Results || [];
}

export function auctionSummary(vehicles, events) {
  const totalsByVehicle = new Map();
  for (const event of events) {
    const cents = Math.round(Number(event.amount) * 100);
    if (event.amount == null || !Number.isFinite(cents)) continue;
    const totals = totalsByVehicle.get(event.vehicle_id) || { purchase: null, expense: 0 };
    if (event.event_type === 'won') totals.purchase = cents;
    if (event.event_type === 'expense') totals.expense += cents;
    totalsByVehicle.set(event.vehicle_id, totals);
  }
  const groups = new Map();
  for (const vehicle of vehicles) {
    const auction = vehicle.auction_name.trim() || 'Auction not entered';
    const value = groups.get(auction) || {
      auction, total: 0, watching: 0, bidding: 0, won: 0, lost: 0, passed: 0,
      priced: 0, purchase: 0, expense: 0
    };
    value.total++;
    value[vehicle.status]++;
    const costs = totalsByVehicle.get(vehicle.id);
    if (vehicle.status === 'won' && costs?.purchase != null) {
      value.priced++;
      value.purchase += costs.purchase;
      value.expense += costs.expense;
    }
    groups.set(auction, value);
  }
  return [...groups.values()].sort((a, b) => a.auction.localeCompare(b.auction));
}

export const importTemplates = {
  auction: ['vin','auction_name','auction_date','lane_run','label'],
  inventory: ['vin','label','stock_number','mileage','acquisition_date','acquisition_cost'],
  transactions: ['vin','source','record_id','acquisition_ref','kind','effective_date','amount','auction_name','category','costs_complete','manual_event_id'],
  valuations: ['vin','source','record_id','effective_date','basis','amount','notes']
};

export function standardImport(csv, kind) {
  const rows = csvParse(csv.replace(/^\uFEFF/, ''));
  if (!Object.hasOwn(importTemplates,kind) || !rows.length || rows.length>500)
    throw Error('Use the selected template with 1–500 records');
  const date = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))
    && new Date(s).toISOString().slice(0,10)===s;
  const dollars = s => /^\d{1,10}(\.\d{1,2})?$/.test(s);
  const inventoryVins = new Set();
  const validated = rows.map((input,index) => {
    const row = Object.fromEntries(importTemplates[kind].map(key=>[key,input[key]||'']));
    row.vin=row.vin.toUpperCase();
    const problem = message => {throw Error('CSV row '+(index+2)+': '+message)};
    if(!validVin(row.vin))problem('Use a valid 17-character VIN');
    if(kind==='auction' && (!row.auction_name || !date(row.auction_date) || !row.lane_run))problem('Auction, date and lane/run are required');
    if(kind==='inventory'){
      if(inventoryVins.has(row.vin))problem('Use one current inventory row per VIN');
      inventoryVins.add(row.vin);
      if(row.mileage&&!/^\d{1,9}$/.test(row.mileage))problem('Mileage must be a whole number');
      if(row.acquisition_date&&!date(row.acquisition_date))problem('Acquisition date must be YYYY-MM-DD');
      if(row.acquisition_cost&&!dollars(row.acquisition_cost))problem('Acquisition cost must be a dollar amount');
    }
    if(kind==='transactions'||kind==='valuations'){
      if(!row.source||!row.record_id||!date(row.effective_date))problem('Source, record ID and date are required');
      if(kind==='valuations'){
        if(!['retail','wholesale'].includes(row.basis)||!dollars(row.amount)||Number(row.amount)<=0)
          problem('Use a positive valuation and retail or wholesale basis');
      }else{
        if(!row.acquisition_ref||!['purchase','expense','sale'].includes(row.kind))problem('Acquisition reference and a supported transaction type are required');
        if((row.amount||row.kind!=='expense')&&!dollars(row.amount))problem('Use dollars with up to two decimals. Only an expense may be blank.');
        if(!['','true','false'].includes(row.costs_complete)||(row.costs_complete==='true'&&row.kind!=='sale'))
          problem('Only a sale may confirm complete costs');
        row.costs_complete=row.costs_complete==='true';
      }
    }
    return row;
  });
  // Purchases establish cycles before any related expense or sale is validated.
  return kind==='transactions'?validated.sort((a,b)=>Number(b.kind==='purchase')-Number(a.kind==='purchase')):validated;
}

export function acquisitionCycles(transactions, manualEvents=[], asOf=new Date().toISOString().slice(0,10)) {
  const cycles = new Map();
  const cents = value => Math.round(Number(value)*100);
  for(const row of transactions){
    const key=JSON.stringify([row.source,row.acquisition_ref]);
    const group=cycles.get(key)||{purchase:null,sale:null,expenses:[],ref:row.acquisition_ref,source:row.source};
    if(row.kind==='expense')group.expenses.push(row);
    else group[row.kind]=row;
    cycles.set(key,group);
  }
  return [...cycles.values()].map(group=>{
    const {purchase,sale,expenses}=group;
    const manualPurchase=manualEvents.find(event=>event.id===purchase?.manual_event_id);
    const linked=new Set(expenses.map(expense=>expense.manual_event_id).filter(Boolean));
    const additional=manualPurchase?manualEvents.filter(event=>event.vehicle_id===manualPurchase.vehicle_id&&
      event.event_type==='expense'&&!linked.has(event.id)):[];
    const costs=[...expenses,...additional];
    const knownExpenses=costs.reduce((total,row)=>total+(row.amount==null?0:cents(row.amount)),0);
    const acquisition=purchase?cents(purchase.amount)+knownExpenses:null;
    const complete=!!sale?.costs_complete&&costs.every(row=>row.amount!=null);
    const profit=sale&&acquisition!==null&&complete?cents(sale.amount)-acquisition:null;
    const days=purchase?(Date.parse(sale?.effective_date||asOf)-Date.parse(purchase.effective_date))/86400000:null;
    return {...group,knownExpenses,acquisition,profit,days};
  });
}
