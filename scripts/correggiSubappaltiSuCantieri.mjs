// Backfill UNA TANTUM (non fa parte del giro automatico quotidiano) per correggere retroattivamente
// i subappalti erroneamente finiti in [PERSONALE] Subappalti Manodopera invece che [FORNITORI]
// Subappalti su Cantieri.
//
// Trovato in audit 2026-10-22: la regola di correzione (isSubappaltoSuCantiere, in
// utils/puntaNetImporter.ts) confrontava il nome breve della lista fornitori lettera per lettera con
// la ragione sociale completa di PuntaNet, fallendo per semplici differenze di spazi/punteggiatura
// (es. "Edilmuli di zogaj" nella lista non trovava mai "EDIL MULI DI ZOGAJ FLAMUR" in PuntaNet).
// Risultato: 622.810€ di fatture di 5 fornitori (Edil Muli, G.sc. di Gatto Tarcisio, Tm Toniolo,
// Falegnameria Trentin, Edil Monastier) restavano scritte come Manodopera nel file dati, anche se
// l'app le mostrava corrette in UI (la correzione in App.tsx/migrateBackupData girava solo al
// caricamento, senza mai riscrivere il file) — gli script che leggono il file direttamente (diagnostica,
// confronto con l'Excel) vedevano quindi il dato sbagliato. Inoltre Elettrosystem (80.000€) non era
// proprio in lista.
//
// Questo script applica la stessa funzione isSubappaltoSuCantiere (ora corretta e condivisa tra
// App.tsx e scripts/importaPuntaNet.mjs) direttamente sul file dati, cosi' tutte e tre le fonti
// (app, import automatico, script di diagnostica) restano sempre coerenti tra loro.
//
// Non tocca MAI importo, data, progetto — solo category e ceType, e solo sulle righe EXPENSE
// attualmente in [PERSONALE] Subappalti Manodopera (o nelle sue forme legacy pre-migrazione).
//
// Default: DRY-RUN, nessuna scrittura, solo un report di quante righe verrebbero toccate.
// Uso: npx tsx scripts/correggiSubappaltiSuCantieri.mjs [--scrivi]

import fs from 'fs';
import path from 'path';
import { isSubappaltoSuCantiere } from '../utils/puntaNetImporter.ts';
import { CATEGORY_TO_CE_TYPE } from '../constants.ts';

const SCRIVI = process.argv.includes('--scrivi');

const NAS_DATI = String.raw`\\NAS\Ufficio Tecnico\GRUPPO VISENTIN\00_GESTIONE GV\35_APP GV ECOSISTEM\04-GV GestioneFINANZIARIA\DATI SALVATI`;
const GVCF_PATH = path.join(NAS_DATI, 'gv-cashflow_v2-import-puntanet-automatico.gvcf');
const BACKUP_DIR = path.join(NAS_DATI, 'BACKUP');

const CATEGORIE_MANODOPERA = new Set(['[PERSONALE] Subappalti Manodopera', '[CANTIERE] Subappalti Manodopera', 'SUBAPPALTI MANODOPERA']);
const CATEGORIA_NUOVA = '[FORNITORI] Subappalti su Cantieri';
const TOLLERANZA_PREVISIONE = 0.5; // arrotondamenti, stessa tolleranza di importaPuntaNet.mjs

function importoLordo(t) {
  if (typeof t.grossAmount === 'number') return t.grossAmount;
  const vat = t.vatRate || 0;
  return (t.amount || 0) * (1 + vat / 100);
}

// Capienza residua di una previsione sulle transazioni ATTUALI del file, escludendo il consuntivo
// che stiamo per ricollegare altrove (altrimenti la sua copertura verrebbe contata due volte).
function residuoPrevisione(forecast, transactions, idDaEscludere) {
  const totale = importoLordo(forecast);
  const copertura = transactions
    .filter(t => t.id !== idDaEscludere && t.type === forecast.type && !t.isForecast && (
      t.linkedForecastId === forecast.id || (forecast.loanSourceId && t.loanSourceId === forecast.loanSourceId)
    ))
    .reduce((sum, t) => sum + importoLordo(t), 0);
  return totale - copertura;
}

// Se un consuntivo gia' collegato a una previsione (linkedForecastId) cambia categoria, il
// collegamento vecchio punterebbe a una previsione di una categoria diversa da quella ora corretta
// — la previsione vecchia (Manodopera) risulterebbe "realizzata" da soldi che in realta' sono finiti
// su un'altra categoria (Subappalti su Cantieri), falsando il confronto previsto-vs-reale per
// categoria (Codex review PR #29, 2026-10-22). Le previsioni sono dati manuali dell'utente, mai
// modificabili da uno script — quindi non si tocca la previsione: si cerca una previsione ESISTENTE
// gia' nella nuova categoria con capienza residua sufficiente (stessa logica di
// trovaLinkedForecastId in importaPuntaNet.mjs), altrimenti si scollega semplicemente il consuntivo
// (undefined), lasciando la vecchia previsione tornare non realizzata come dovrebbe essere.
function trovaNuovoLinkedForecastId(transactions, tipo, progetto, categoria, importo, idDaEscludere) {
  const txProj = progetto || 'Generale';
  const candidati = transactions
    .filter(f => f.isForecast && f.type === tipo && (f.project || 'Generale') === txProj && f.category === categoria)
    .map(f => ({ f, residuo: residuoPrevisione(f, transactions, idDaEscludere) }))
    .filter(c => c.residuo >= importo - TOLLERANZA_PREVISIONE)
    .sort((a, b) => a.residuo - b.residuo);
  return candidati.length > 0 ? candidati[0].f.id : undefined;
}

function calcolaAggiornamenti(transactions) {
  const daCorreggere = [];
  for (const t of transactions) {
    if (t.type !== 'EXPENSE' || !CATEGORIE_MANODOPERA.has(t.category)) continue;
    if (!isSubappaltoSuCantiere(t.description || '')) continue;
    daCorreggere.push({ id: t.id, date: t.date, amount: importoLordo(t), description: t.description, categoriaVecchia: t.category, linkedForecastId: t.linkedForecastId });
  }
  return daCorreggere;
}

console.log(`=== Correggi subappalti su cantieri (${SCRIVI ? 'SCRITTURA' : 'dry-run'}) ===\n`);

const gvData = JSON.parse(fs.readFileSync(GVCF_PATH, 'utf8'));
const daCorreggere = calcolaAggiornamenti(gvData.transactions);

const totale = daCorreggere.reduce((s, r) => s + r.amount, 0);
console.log(`Transazioni da spostare a [FORNITORI] Subappalti su Cantieri: ${daCorreggere.length} (${totale.toFixed(2)} €)\n`);

const perFornitore = new Map();
for (const r of daCorreggere) {
  const chiave = r.description || '(senza descrizione)';
  perFornitore.set(chiave, (perFornitore.get(chiave) || 0) + r.amount);
}
for (const [desc, somma] of [...perFornitore.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${somma.toFixed(2).padStart(12)} €   ${desc}`);
}

const conPrevisioneCollegata = daCorreggere.filter(r => r.linkedForecastId);
if (conPrevisioneCollegata.length > 0) {
  console.log(`\n${conPrevisioneCollegata.length} di queste righe sono collegate a una previsione (linkedForecastId): verra' cercata una previsione gia' esistente nella nuova categoria con capienza residua, altrimenti il collegamento verra' rimosso (la previsione stessa non viene mai toccata).`);
}

if (!SCRIVI) {
  console.log('\nNESSUNA scrittura — dry-run. Rilancia con --scrivi per applicare davvero.');
  process.exit(0);
}

if (daCorreggere.length === 0) {
  console.log('\nNulla da aggiornare.');
  process.exit(0);
}

fs.mkdirSync(BACKUP_DIR, { recursive: true });
const stamp = `${new Date().toISOString().slice(0, 10)}_${Date.now()}`;
const backupPath = path.join(BACKUP_DIR, `gv-cashflow_v2_PRE-correggi-subappalti-cantieri_${stamp}.gvcf`);
fs.copyFileSync(GVCF_PATH, backupPath);

// Rilettura del file AL MOMENTO della scrittura (stessa convenzione degli altri script).
const gvDataFresh = JSON.parse(fs.readFileSync(GVCF_PATH, 'utf8'));
const freschi = calcolaAggiornamenti(gvDataFresh.transactions);
const perId = new Set(freschi.map(r => r.id));

let applicati = 0;
let riagganciati = 0;
let scollegati = 0;
for (const t of gvDataFresh.transactions) {
  if (!perId.has(t.id)) continue;
  t.category = CATEGORIA_NUOVA;
  t.ceType = CATEGORY_TO_CE_TYPE[t.category] ?? t.ceType;
  applicati++;

  if (t.linkedForecastId) {
    const forecastAttuale = gvDataFresh.transactions.find(f => f.id === t.linkedForecastId);
    if (!forecastAttuale || forecastAttuale.category !== CATEGORIA_NUOVA) {
      const nuovoId = trovaNuovoLinkedForecastId(gvDataFresh.transactions, t.type, t.project, CATEGORIA_NUOVA, importoLordo(t), t.id);
      if (nuovoId) {
        t.linkedForecastId = nuovoId;
        riagganciati++;
      } else {
        delete t.linkedForecastId;
        scollegati++;
      }
    }
  }
}

gvDataFresh.timestamp = new Date().toISOString();

const tmpPath = `${GVCF_PATH}.tmp_${process.pid}`;
fs.writeFileSync(tmpPath, JSON.stringify(gvDataFresh, null, 2));
fs.renameSync(tmpPath, GVCF_PATH);

console.log(`\n✔ Corrette ${applicati} transazioni (rilette fresche al momento della scrittura).`);
if (riagganciati > 0) console.log(`  Ricollegate a una previsione gia' esistente nella nuova categoria: ${riagganciati}`);
if (scollegati > 0) console.log(`  Scollegate da previsione (nessuna previsione compatibile nella nuova categoria trovata): ${scollegati}`);
console.log(`Backup pre-scrittura: ${backupPath}`);
