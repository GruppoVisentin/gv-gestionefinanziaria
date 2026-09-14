import fs from 'fs';

const NAS_PATH = String.raw`\\NAS\Ufficio Tecnico\GRUPPO VISENTIN\00_GESTIONE GV\35_APP GV ECOSISTEM\04-GV GestioneFINANZIARIA\DATI SALVATI\gv-cashflow_v2-import-puntanet-automatico.gvcf`;

const raw = JSON.parse(fs.readFileSync(NAS_PATH, 'utf8'));
const data = raw.data || raw;
const transactions = data.transactions || [];

const capexReal = transactions.filter(t => t.ceType === 'capex' && !t.isForecast);
const capexForecast = transactions.filter(t => t.ceType === 'capex' && t.isForecast);

console.log('# capex REALI:', capexReal.length, ' somma:', capexReal.reduce((s,t)=>s+Math.abs(t.amount),0).toFixed(2));
console.log('# capex FORECAST:', capexForecast.length, ' somma:', capexForecast.reduce((s,t)=>s+Math.abs(t.amount),0).toFixed(2));
console.log('');
console.log('Dettaglio capex REALI (categoria, data, importo):');
capexReal
  .sort((a,b) => a.date.localeCompare(b.date))
  .forEach(t => console.log(`  ${t.date}  ${t.category}  ${t.amount}`));

console.log('');
console.log('Dettaglio capex FORECAST 2026 (categoria, data, importo):');
capexForecast
  .filter(t => t.date.startsWith('2026'))
  .sort((a,b) => a.date.localeCompare(b.date))
  .forEach(t => console.log(`  ${t.date}  ${t.category}  ${t.amount}`));

console.log('');
const ammortamentoTx = transactions.filter(t => t.ceType === 'ammortamento');
console.log('# transazioni con ceType=ammortamento (manuali, non capex-derivate):', ammortamentoTx.length);
ammortamentoTx.forEach(t => console.log(`  ${t.date}  isForecast=${t.isForecast}  ${t.category}  ${t.amount}`));

console.log('');
console.log('Ultimo SP snapshot (per immobilizzazioni materiali/immateriali reali sul bilancio):');
const spSnaps = data.spSnapshots || [];
const last = [...spSnaps].sort((a,b) => a.dataRiferimento.localeCompare(b.dataRiferimento)).pop();
console.log(JSON.stringify(last, null, 2));
