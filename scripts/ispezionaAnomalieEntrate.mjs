// Diagnostica SOLA LETTURA (nessuna scrittura) — richiesta dall'utente il 2026-10-26 dopo il
// confronto ENTRATE Excel vs app (confrontaFlussoCassaExcel.mjs), per due anomalie trovate:
//
// 1) A gennaio 2026 l'app mostra 792.800€ di [FINANZA] Finanziamenti Ricevuti senza alcun
//    riscontro nell'Excel. L'utente segnala che nel foglio il finanziamento e' registrato in una
//    riga vicina al riepilogo entrate/uscite, FUORI dalla sezione ENTRATE (righe prima di "TOTALE
//    INCASSATO") che confrontaFlussoCassaExcel.mjs scansiona — quindi lo script di confronto non
//    lo vede affatto, non e' un vero buco di riconciliazione. Questa diagnostica elenca TUTTE le
//    righe del foglio che hanno un valore nella colonna di un mese scelto (sia lato entrate col.
//    4+m*5 sia lato uscite col. 6+m*5), per individuare la riga esatta e la sua posizione.
//
// 2) In piu' mesi, una entrata ricorrente e' classificata con una categoria di SPESA
//    ([FORNITORI] Fornitori Materiali), non di ricavo. L'utente sospetta sia la vendita di rottami
//    di ferro a un fornitore di materiali (es. Frasson Rottami) — un incasso vero, ma con la
//    categoria sbagliata (probabile bug: classificaRiga in utils/puntaNetImporter.ts non distingue
//    EXPENSE da INCOME quando assegna una categoria per corrispondenza di nome fornitore). Questa
//    diagnostica elenca TUTTE le transazioni INCOME dell'app con una categoria di spesa, con data,
//    importo e descrizione/entity esatti, per confermare l'identita' del fornitore prima di
//    decidere come correggere.
//
// Uso: npx tsx scripts/ispezionaAnomalieEntrate.mjs ["<percorso excel>"] [mese] [anno]
//   percorso excel: opzionale — se omesso, salta la Parte 2 (solo Excel)
//   mese: 1-12, default mese corrente (serve solo per la Parte 2)
//   anno: default anno corrente (serve solo per la Parte 2)

import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import { EXPENSE_CATEGORIES } from '../constants.ts';

const [, , xlsxPathArg, meseArg, annoArg] = process.argv;

const NAS_DATI = String.raw`\\NAS\Ufficio Tecnico\GRUPPO VISENTIN\00_GESTIONE GV\35_APP GV ECOSISTEM\04-GV GestioneFINANZIARIA\DATI SALVATI`;
const GVCF_PATH = path.join(NAS_DATI, 'gv-cashflow_v2-import-puntanet-automatico.gvcf');

const oggi = new Date();
const MESE = Number(meseArg) || (oggi.getMonth() + 1); // 1-12
const ANNO = Number(annoArg) || oggi.getFullYear();
const meseIdx = MESE - 1; // 0-based

function importoLordo(t) {
  if (typeof t.grossAmount === 'number') return t.grossAmount;
  const vat = t.vatRate || 0;
  return (t.amount || 0) * (1 + (vat || 0) / 100);
}

// --- PARTE 1: transazioni INCOME dell'app con categoria di spesa (qualunque data) ---
console.log('=== PARTE 1: entrate (app) classificate con una categoria di spesa ===\n');
const gvData = JSON.parse(fs.readFileSync(GVCF_PATH, 'utf8'));
const categorieSpesa = new Set(EXPENSE_CATEGORIES);
const anomale = gvData.transactions.filter(t => t.type === 'INCOME' && !t.isForecast && categorieSpesa.has(t.category));

if (anomale.length === 0) {
  console.log('Nessuna entrata con categoria di spesa trovata.\n');
} else {
  anomale.sort((a, b) => a.date.localeCompare(b.date));
  for (const t of anomale) {
    console.log(`  ${t.date} | ${importoLordo(t).toFixed(2).padStart(10)} €  | ${t.category}  | ${t.description || '(senza descrizione)'}`);
  }
  const totale = anomale.reduce((s, t) => s + importoLordo(t), 0);
  console.log(`\nTotale: ${anomale.length} righe, ${totale.toFixed(2)} €\n`);
}

// --- PARTE 2: tutte le righe del foglio Excel con un valore nella colonna del mese scelto ---
if (xlsxPathArg) {
  console.log(`=== PARTE 2: righe del foglio con un valore per ${String(MESE).padStart(2, '0')}/${ANNO} (entrata=col. ${4 + meseIdx * 5}, uscita=col. ${6 + meseIdx * 5}) ===\n`);
  const wb = XLSX.readFile(xlsxPathArg);
  const nomeFoglio = `FLUSSO DI CASSA ${ANNO}`;
  const ws = wb.Sheets[nomeFoglio];
  if (!ws) {
    console.error(`✖ Foglio "${nomeFoglio}" non trovato. Fogli disponibili: ${wb.SheetNames.join(', ')}`);
    process.exit(1);
  }
  const righe = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  const colEntrata = 4 + meseIdx * 5;
  const colUscita = 6 + meseIdx * 5;
  let trovateRighe = 0;
  for (let i = 0; i < righe.length; i++) {
    const label = righe[i]?.[0];
    if (typeof label !== 'string' || !label.trim()) continue;
    const vEntrata = righe[i]?.[colEntrata];
    const vUscita = righe[i]?.[colUscita];
    const haEntrata = typeof vEntrata === 'number' && vEntrata !== 0;
    const haUscita = typeof vUscita === 'number' && vUscita !== 0;
    if (!haEntrata && !haUscita) continue;
    trovateRighe++;
    console.log(`  riga ${i}: "${label.trim()}"${haEntrata ? `  entrata=${vEntrata}` : ''}${haUscita ? `  uscita=${vUscita}` : ''}`);
  }
  console.log(`\nTotale: ${trovateRighe} righe con un valore questo mese.\n`);
} else {
  console.log('(nessun percorso Excel indicato — salto la Parte 2)\n');
}

console.log('=== Fine ispezione — nessun dato e\' stato modificato ===');
