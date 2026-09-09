// Crea un NUOVO file dati (nuova generazione import PuntaNet) — il file originale NON viene
// mai toccato, resta intatto come riferimento storico.
// Nel nuovo file:
//  - Tutte le PREVISIONI (isForecast=true) sono mantenute IDENTICHE, qualunque sia la data.
//  - Il CONSUNTIVO di gennaio-aprile 2026 (quello con il problema IVA sui subappalti) viene
//    rimosso e ricostruito da zero con il nuovo metodo (Conti Movimenti + arricchimento fattura).
//  - Il consuntivo fuori da quella finestra (prima del 2026, o 2026 dopo aprile) resta intatto.
// Solo lettura sul file originale — scrive esclusivamente sul nuovo file.

import fs from 'fs';
import path from 'path';

const NAS_DATI = String.raw`\\NAS\Ufficio Tecnico\GRUPPO VISENTIN\00_GESTIONE GV\35_APP GV ECOSISTEM\04-GV GestioneFINANZIARIA\DATI SALVATI`;
const ORIGINALE_PATH = path.join(NAS_DATI, 'gv-cashflow.gvcf');
const NUOVO_PATH = path.join(NAS_DATI, 'gv-cashflow_v2-import-puntanet-automatico.gvcf');
const REPORT_PATH = path.join(NAS_DATI, 'AUTO', 'dryrun_2026-09-09.json');

const FINESTRA_INIZIO = '2026-01-01';
const FINESTRA_FINE = '2026-04-30';

const gvData = JSON.parse(fs.readFileSync(ORIGINALE_PATH, 'utf8'));
const report = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'));

console.log(`File originale: ${gvData.transactions.length} transazioni totali`);

const previsioni = gvData.transactions.filter(t => t.isForecast === true);
const consuntivoDaRimuovere = gvData.transactions.filter(t =>
  t.isForecast !== true && t.date >= FINESTRA_INIZIO && t.date <= FINESTRA_FINE
);
const consuntivoDaTenere = gvData.transactions.filter(t =>
  t.isForecast !== true && !(t.date >= FINESTRA_INIZIO && t.date <= FINESTRA_FINE)
);

console.log(`\nPrevisioni (mantenute intatte, qualunque data): ${previsioni.length}`);
console.log(`Consuntivo gennaio-aprile 2026 RIMOSSO: ${consuntivoDaRimuovere.length}`);
console.log(`Consuntivo fuori finestra (mantenuto intatto): ${consuntivoDaTenere.length}`);

const nuovoConsuntivo2026 = report.consuntivo; // gia' generato dal metodo nuovo, tutto il 2026 fin qui
console.log(`Nuovo consuntivo 2026 dal metodo PuntaNet: ${nuovoConsuntivo2026.length}`);

const nuoveTransazioni = [...previsioni, ...consuntivoDaTenere, ...nuovoConsuntivo2026];

const nuovoFile = JSON.parse(JSON.stringify(gvData));
nuovoFile.transactions = nuoveTransazioni;
nuovoFile.version = (gvData.version || '4.0') + '-v2-puntanet-auto';
nuovoFile.timestamp = new Date().toISOString();

fs.writeFileSync(NUOVO_PATH, JSON.stringify(nuovoFile, null, 2));

console.log(`\n=== NUOVO FILE CREATO: ${NUOVO_PATH} ===`);
console.log(`Transazioni totali nel nuovo file: ${nuoveTransazioni.length}`);
console.log(`(era ${gvData.transactions.length} nel file originale, che resta INTATTO e non toccato)`);

// ─── Verifica di sicurezza: nessuna previsione persa ──────────────
const previsioniOriginali = new Set(previsioni.map(t => t.id));
const previsioniNelNuovoFile = new Set(nuovoFile.transactions.filter(t => t.isForecast === true).map(t => t.id));
const previsioniPerse = [...previsioniOriginali].filter(id => !previsioniNelNuovoFile.has(id));
console.log(`\n=== VERIFICA SICUREZZA ===`);
console.log(`Previsioni originali: ${previsioniOriginali.size} | Previsioni nel nuovo file: ${previsioniNelNuovoFile.size} | Perse: ${previsioniPerse.length}`);
if (previsioniPerse.length > 0) {
  console.log('!!! ATTENZIONE: previsioni perse, controllare subito !!!');
} else {
  console.log('OK — nessuna previsione persa.');
}

// ─── Confronto mensile finale ──────────────────────────────────
function aggregaPerMese(transazioni) {
  const agg = {};
  for (const t of transazioni) {
    if (t.isForecast || !t.date?.startsWith('2026')) continue;
    const key = `${t.date.slice(0, 7)}|${t.type}`;
    agg[key] = (agg[key] || 0) + (t.amount ?? 0);
  }
  return agg;
}
const vecchioAgg = aggregaPerMese(gvData.transactions);
const nuovoAgg = aggregaPerMese(nuovoFile.transactions);
const mesi = [...new Set([...Object.keys(vecchioAgg), ...Object.keys(nuovoAgg)])].sort();
console.log('\n=== CONFRONTO NETTO MENSILE (vecchio file vs nuovo file v2) ===');
for (const key of mesi) {
  const [mese, tipo] = key.split('|');
  console.log(`${mese} | ${tipo.padEnd(7)} | vecchio=€${(vecchioAgg[key]||0).toFixed(2).padStart(11)} | nuovo v2=€${(nuovoAgg[key]||0).toFixed(2).padStart(11)}`);
}
