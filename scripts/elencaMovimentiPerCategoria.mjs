// Diagnostica SOLA LETTURA (nessuna scrittura) — richiesta dall'utente il 2026-10-27 dopo le
// tabelle di confronto mensili (confrontaFlussoCassaExcel.mjs): "dammi di ognuno le fatture che
// fanno la differenza". L'Excel "PIANIFICAZIONE FLUSSO DI CASSA ANNUALE" è un riepilogo mensile per
// categoria (un numero per categoria/mese), NON un registro per singola fattura/movimento — quindi
// non esiste un "elenco fatture Excel" da mostrare. Questo script elenca invece, mese per mese e
// categoria per categoria, OGNI movimento (entrata o uscita) che l'app somma in quel totale — con
// data, importo e descrizione — cosi' si vede esattamente cosa compone il numero app, e si puo'
// incrociarlo a mano con l'Excel/gli estratti conto per capire dove sta davvero lo scarto.
//
// Usa la STESSA logica di categorizzazione di confrontaFlussoCassaExcel.mjs (categoriaNormalizzata
// per le uscite, stessa migrazione per le entrate), cosi' i totali per categoria qui coincidono
// esattamente con quelli già mostrati nel confronto.
//
// Uso: npx tsx scripts/elencaMovimentiPerCategoria.mjs <mese1,mese2,...> [anno] [categoria]
//   mese: numero 1-12 (1=Gennaio)
//   categoria (opzionale): se indicata, filtra solo quella categoria (nome Excel tipo "NOLEGGI",
//     o nome app tra parentesi quadre) — altrimenti elenca TUTTE le categorie del mese.
//   Esempio: npx tsx scripts/elencaMovimentiPerCategoria.mjs 8,9 2026
//   Esempio filtrato: npx tsx scripts/elencaMovimentiPerCategoria.mjs 8 2026 NOLEGGI

import fs from 'fs';
import path from 'path';
import { CATEGORY_MIGRATION_MAP } from '../constants.ts';
import { isSubappaltoSuCantiere } from '../utils/puntaNetImporter.ts';

const [, , mesiArg, annoArg, categoriaFiltro] = process.argv;
if (!mesiArg) {
  console.error('Uso: npx tsx scripts/elencaMovimentiPerCategoria.mjs <mese1,mese2,...> [anno] [categoria]');
  process.exit(1);
}
const ANNO = annoArg ? Number(annoArg) : 2026;
const NOMI_MESE = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

const MESI_RICHIESTI = mesiArg.split(',').map(s => s.trim()).filter(Boolean).map(s => {
  const n = Number(s);
  if (!Number.isInteger(n) || n < 1 || n > 12) {
    console.error(`✖ Mese non valido: "${s}".`);
    process.exit(1);
  }
  return n - 1;
});

const NAS_DATI = String.raw`\\NAS\Ufficio Tecnico\GRUPPO VISENTIN\00_GESTIONE GV\35_APP GV ECOSISTEM\04-GV GestioneFINANZIARIA\DATI SALVATI`;
const GVCF_PATH = path.join(NAS_DATI, 'gv-cashflow_v2-import-puntanet-automatico.gvcf');

function importoLordo(t) {
  if (typeof t.grossAmount === 'number') return t.grossAmount;
  const vat = t.vatRate || 0;
  return (t.amount || 0) * (1 + vat / 100);
}

// Stessa logica di confrontaFlussoCassaExcel.mjs (categoriaNormalizzata) per le USCITE.
function categoriaNormalizzataUscita(t) {
  let categoria = t.category;
  const descLower = (t.description || '').toLowerCase();
  if (categoria === '[PERSONALE] Subappalti Manodopera' || categoria === '[CANTIERE] Subappalti Manodopera' || categoria === 'SUBAPPALTI MANODOPERA') {
    if (isSubappaltoSuCantiere(t.description || '')) categoria = '[FORNITORI] Subappalti su Cantieri';
  }
  if (categoria === '[FORNITORI] Fornitori Materiali' || categoria === '[CANTIERE] Fornitori Materiali' || categoria === 'FORNITORI MATERIALI') {
    if (/terreno|terreni/i.test(descLower) || /acquisizione.*terren/i.test(descLower) || /acquisto.*terren/i.test(descLower)) {
      categoria = '[INVESTIMENTI] Acquisto Terreni per Sviluppo';
    }
  }
  if (categoria && CATEGORY_MIGRATION_MAP[categoria]) categoria = CATEGORY_MIGRATION_MAP[categoria];
  return categoria;
}

// Stessa logica di confrontaFlussoCassaExcel.mjs (appPerCategoriaEntrate) per le ENTRATE.
function categoriaNormalizzataEntrata(t) {
  let categoria = t.category;
  if (categoria && CATEGORY_MIGRATION_MAP[categoria]) categoria = CATEGORY_MIGRATION_MAP[categoria];
  if (!categoria) categoria = '(categoria mancante)';
  return categoria;
}

const gvData = JSON.parse(fs.readFileSync(GVCF_PATH, 'utf8'));
console.log(`App: dati letti da ${GVCF_PATH} (timestamp file: ${gvData.timestamp || '(assente)'})`);

const sessioniAnnullateIds = new Set((gvData.importSessions || []).filter(s => s.annullata).map(s => s.id));
const esisteSessioneStoricoAttiva = (gvData.importSessions || []).some(s => !s.annullata && s.nomeFile && s.nomeFile.startsWith('Storico Excel'));
function transazioneValida(t) {
  if (t.importSessionId && sessioniAnnullateIds.has(t.importSessionId)) return false;
  if (!t.importSessionId && t.sourceRef && t.sourceRef.startsWith('Storico Excel') && !esisteSessioneStoricoAttiva) return false;
  return true;
}

function elencaMese(meseIdx) {
  console.log(`\n\n=== ${NOMI_MESE[meseIdx]} ${ANNO} — movimenti per categoria ===`);

  for (const [tipo, etichetta, normalizza] of [['EXPENSE', 'USCITE', categoriaNormalizzataUscita], ['INCOME', 'ENTRATE', categoriaNormalizzataEntrata]]) {
    const perCategoria = new Map();
    for (const t of gvData.transactions) {
      if (t.type !== tipo || t.isForecast) continue;
      if (!transazioneValida(t)) continue;
      const d = new Date(`${t.date}T00:00:00Z`);
      if (d.getUTCFullYear() !== ANNO || d.getUTCMonth() !== meseIdx) continue;
      const categoria = normalizza(t);
      if (categoriaFiltro && !categoria.toUpperCase().includes(categoriaFiltro.toUpperCase())) continue;
      if (!perCategoria.has(categoria)) perCategoria.set(categoria, []);
      perCategoria.get(categoria).push(t);
    }
    if (perCategoria.size === 0) continue;
    console.log(`\n--- ${etichetta} ---`);
    const categorieOrdinate = [...perCategoria.entries()].sort((a, b) => {
      const totA = a[1].reduce((s, t) => s + importoLordo(t), 0);
      const totB = b[1].reduce((s, t) => s + importoLordo(t), 0);
      return totB - totA;
    });
    for (const [categoria, righe] of categorieOrdinate) {
      const totale = righe.reduce((s, t) => s + importoLordo(t), 0);
      console.log(`\n  ${categoria}  —  totale: ${totale.toFixed(2)} €  (${righe.length} righe)`);
      for (const t of righe.sort((a, b) => a.date.localeCompare(b.date))) {
        console.log(`    ${t.date}  ${importoLordo(t).toFixed(2).padStart(10)} €   ${t.description || '(senza descrizione)'}`);
      }
    }
  }
}

for (const meseIdx of MESI_RICHIESTI) elencaMese(meseIdx);

console.log('\n\n=== Fine elenco — nessun dato e\' stato modificato ===');
