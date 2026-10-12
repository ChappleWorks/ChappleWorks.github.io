// Chapple Works private storage (Google Sheets bound Apps Script)
const TAB='Command Center Storage';
const HISTORY='Command Center Backups';
function onOpen(){SpreadsheetApp.getUi().createMenu('Chapple Works').addItem('Open Storage','openStorage').addToUi()}
function openStorage(){SpreadsheetApp.getUi().showSidebar(HtmlService.createHtmlOutputFromFile('Sidebar').setTitle('Chapple Works Storage'))}
function storage_(){const s=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TAB);if(!s)throw Error('Missing storage tab');return s}
function readState(){const r=storage_().getRange(2,2,2,1).getValues();return {dashboard:r[0][0]?JSON.parse(r[0][0]):null,catalog:r[1][0]?JSON.parse(r[1][0]):null}}
function saveState(x){
 if(!x||!x.dashboard||!Array.isArray(x.dashboard.projects)||!Array.isArray(x.dashboard.tasks)||!Array.isArray(x.dashboard.sessions)||!Array.isArray(x.catalog)||!x.catalog.every(v=>v&&typeof v.name==='string'&&typeof v.type==='string'&&typeof v.owner==='string'))throw Error('Invalid backup');
 const a=JSON.stringify(x.dashboard),b=JSON.stringify(x.catalog);
 if(a.length>45000||b.length>45000)throw Error('Snapshot too large');
 const lock=LockService.getDocumentLock();lock.waitLock(10000);
 try{
  const ss=SpreadsheetApp.getActiveSpreadsheet(),s=storage_(),prior=s.getRange(2,2,2,1).getValues(),stamp=new Date().toISOString();
  let h=ss.getSheetByName(HISTORY);
  if(!h){h=ss.insertSheet(HISTORY);h.appendRow(['Saved At','Dashboard JSON','Catalog JSON','Action'])}
  if(prior[0][0]||prior[1][0])h.appendRow([stamp,String(prior[0][0]||''),String(prior[1][0]||''),'Pre-replacement snapshot']);
  s.getRange(2,2,2,2).setValues([[a,stamp],[b,stamp]]);
  return 'Saved '+stamp;
 }finally{lock.releaseLock()}
}
