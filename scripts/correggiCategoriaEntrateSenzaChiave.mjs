// Backfill UNA TANTUM (non fa parte del giro automatico quotidiano) — richiesto dall'utente il
// 2026-10-27, seguito di sospendiEntrateConCategoriaDiSpesa.mjs. Quello script ha sospeso 10 delle
// 13 entrate con categoria di spesa (quelle con una chiave PuntaNet tracciabile), ma ha lasciato
// FUORI le altre 3 perche' prive di puntaNetIDMovimento/IDDocumento/IDRata — confermato via
// scripts/ispezionaTransazioniSenzaChiave.mjs che sono transazioni reali (non inserite a mano
// dall'utente), solo "troppo vecchie" di schema: provengono da un giro di conferma del modale
// PuntaNet precedente all'introduzione del tracciamento di questi ID (vedi commento in
// importaPuntaNet.mjs, riga ~467), quindi non sono sospendibili in sicurezza con lo stesso
// meccanismo (nessuna chiave da usare per "Annulla Import"/riconciliazione).
//
// Sono comunque entrate vere con semplicemente la categoria sbagliata (bug di classificaRiga,
// gia' corretto per il futuro in importaPuntaNet.mjs, PR #42): qui si corregge DIRETTAMENTE la
// categoria (e il ceType) sulla transazione esistente, senza spostarla in bozza — a differenza
// delle altre 10, qui non c'e' alcun rischio di duplicato legato a un futuro re-import (non hanno
// una chiave PuntaNet con cui un giro futuro potrebbe mai farle ricomparire).
//
// Le 3 righe sono individuate per data+importo (stesso criterio, verificato gia' univoco da
// ispezionaTransazioniSenzaChiave.mjs) e la nuova categoria e' scelta leggendo la descrizione reale
// di ciascuna:
//   - 2026-03-16, 288.00€   "RIMBORSO DA EDILCASSA VENETO PER ASSUNZIONE..."      -> Contributi e Incentivi Pubblici
//   - 2026-04-07, 369.60€   "ACCREDITO DA EDILCASSA VENETO PER ACQUISTO..."       -> Contributi e Incentivi Pubblici
//   - 2026-04-10, 3500.00€  "ACCREDITO DA UNIPOL SAI ASSICURAZIONI PER DANNO..."  -> Rimborsi Assicurativi
//
// Default: DRY-RUN, nessuna scrittura, solo un report di cosa verrebbe cambiato.
// Uso: npx tsx scripts/correggiCategoriaEntrateSenzaChiave.mjs [--scrivi]

import fs from 'fs';
import path from 'path';

const SCRIVI = process.argv.includes('--scrivi');

const NAS_DATI = String.raw`\\NAS\Ufficio Tecnico\GRUPPO VISENTIN\00_GESTIONE GV\35_APP GV ECOSISTEM\04-GV GestioneFINANZIARIA\DATI SALVATI`;
const GVCF_PATH = path.join(NAS_DATI, 'gv-cashflow_v2-import-puntanet-automatico.gvcf');
const BACKUP_DIR = path.join(NAS_DATI, 'BACKUP');

const CORREZIONI = [
  { date: '2026-03-16', amountLike: 288.00, categoriaNuova: '[RIMBORSI] Contributi e Incentivi Pubblici' },
  { date: '2026-04-07', amountLike: 369.60, categoriaNuova: '[RIMBORSI] Contributi e Incentivi Pubblici' },
  { date: '2026-04-10', amountLike: 3500.00, categoriaNuova: '[RIMBORSI] Rimborsi Assicurativi' },
];
const CE_TYPE_NUOVO = 'ricavo_altro';

function importoLordo(t) {
  if (typeof t.grossAmount === 'number') return t.grossAmount;
  const vat = t.vatRate || 0;
  return (t.amount || 0) * (1 + (vat || 0) / 100);
}

function calcolaCorrezioni(transactions) {
  const risultati = [];
  for (const c of CORREZIONI) {
    const trovate = transactions.filter(t => {
      if (t.type !== 'INCOME' || t.isForecast) return false;
      if (t.date !== c.date) return false;
      return Math.abs(importoLordo(t) - c.amountLike) < 1;
    });
    if (trovate.length === 0) {
      risultati.push({ ...c, stato: 'non-trovata' });
      continue;
    }
    if (trovate.length > 1) {
      risultati.push({ ...c, stato: 'ambigua', candidate: trovate });
      continue;
    }
    const t = trovate[0];
    if (t.category === c.categoriaNuova) {
      risultati.push({ ...c, stato: 'gia-corretta', transazione: t });
      continue;
    }
    risultati.push({ ...c, stato: 'da-correggere', transazione: t });
  }
  return risultati;
}

console.log(`=== Correggi categoria entrate senza chiave PuntaNet (${SCRIVI ? 'SCRITTURA' : 'dry-run'}) ===\n`);

const gvData = JSON.parse(fs.readFileSync(GVCF_PATH, 'utf8'));
const risultati = calcolaCorrezioni(gvData.transactions);

for (const r of risultati) {
  if (r.stato === 'non-trovata') {
    console.log(`✖ Nessuna transazione trovata per ${r.date} ~${r.amountLike}€ — verificare a mano.`);
  } else if (r.stato === 'ambigua') {
    console.log(`⚠ Più di una transazione corrisponde a ${r.date} ~${r.amountLike}€ — non corretta automaticamente:`);
    for (const t of r.candidate) console.log(`    ${t.id} | ${t.category} | ${t.description}`);
  } else if (r.stato === 'gia-corretta') {
    console.log(`= ${r.date} ${r.amountLike.toFixed(2)}€ — già sulla categoria corretta ("${r.categoriaNuova}"), nessuna modifica.`);
  } else {
    console.log(`→ ${r.date} ${r.amountLike.toFixed(2)}€ — "${r.transazione.description}"`);
    console.log(`    categoria: "${r.transazione.category}" → "${r.categoriaNuova}"  (ceType: "${r.transazione.ceType}" → "${CE_TYPE_NUOVO}")`);
  }
}

const daCorreggere = risultati.filter(r => r.stato === 'da-correggere');
console.log(`\nTransazioni da correggere: ${daCorreggere.length}`);

if (!SCRIVI) {
  console.log('\nNESSUNA scrittura — dry-run. Rilancia con --scrivi per applicare davvero.');
  process.exit(0);
}

if (daCorreggere.length === 0) {
  console.log('\nNulla da correggere.');
  process.exit(0);
}

fs.mkdirSync(BACKUP_DIR, { recursive: true });
const stamp = `${new Date().toISOString().slice(0, 10)}_${Date.now()}`;
const backupPath = path.join(BACKUP_DIR, `gv-cashflow_v2_PRE-correggi-categoria-entrate-senza-chiave_${stamp}.gvcf`);
fs.copyFileSync(GVCF_PATH, backupPath);

// Rilettura del file AL MOMENTO della scrittura (stessa convenzione degli altri script).
const gvDataFresh = JSON.parse(fs.readFileSync(GVCF_PATH, 'utf8'));
const risultatiFreschi = calcolaCorrezioni(gvDataFresh.transactions);
let corrette = 0;
for (const r of risultatiFreschi) {
  if (r.stato !== 'da-correggere') continue;
  const t = gvDataFresh.transactions.find(tx => tx.id === r.transazione.id);
  if (!t) continue;
  t.category = r.categoriaNuova;
  t.ceType = CE_TYPE_NUOVO;
  corrette++;
}
gvDataFresh.timestamp = new Date().toISOString();

const tmpPath = `${GVCF_PATH}.tmp_${process.pid}`;
fs.writeFileSync(tmpPath, JSON.stringify(gvDataFresh, null, 2));
fs.renameSync(tmpPath, GVCF_PATH);

console.log(`\n✔ Corrette ${corrette} transazioni (rilette fresche al momento della scrittura). Backup pre-scrittura: ${backupPath}`);
