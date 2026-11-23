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
