// Diagnostica SOLA LETTURA (nessuna scrittura) per confrontare, categoria per categoria, il
// "TOTALE USCITE" consuntivo calcolato dall'app (stessa logica di ExpenseTimeline.getMonthlyTotal,
// vedi diagnosticaScostamentoUscite.mjs) con il file Excel "PIANIFICAZIONE_FLUSSO_DI_CASSA_ANNUALE"
// tenuto a mano dall'utente.
//
// Richiesto 2026-10-21, dopo che il confronto per data+importo (diagnosticaScostamentoUscite.mjs)
// non ha spiegato gli scarti di decine di migliaia di euro a luglio/agosto: serve vedere DOVE,
// categoria per categoria, l'app e l'Excel si discostano, non solo "quanto" in totale.
//
// L'Excel usa nomi di categoria "vecchi" (es. "NOLEGGI"), l'app li ha rinominati e in alcuni casi
// SPLITTATI in due categorie (es. RATE E INTERESSI FINANZIAMENTI → Interessi Passivi + Quota
// Capitale). La mappatura sotto e' presa da CATEGORY_MIGRATION_MAP in constants.ts (la stessa usata
// dall'app per migrare dati vecchi) — dove un nome vecchio e' stato splittato in piu' categorie
// nuove, o dove CATEGORY_MIGRATION_MAP non ha un target esplicito, la mappatura e' segnalata come
// "incerta" nel report (trovato in review: Codex, 2026-10-21).
//
// Uso: npx tsx scripts/confrontaFlussoCassaExcel.mjs <percorso.xlsx> <mese1,mese2,...> [anno]
//   mese: numero 1-12 (1=Gennaio)
//   Esempio: npx tsx scripts/confrontaFlussoCassaExcel.mjs "C:\...\PIANIFICAZIONE_FLUSSO_DI_CASSA_ANNUALE.xlsx" 6,7,8

import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import { CATEGORY_MIGRATION_MAP, FIXED_COST_CATEGORIES, VARIABLE_COST_CATEGORIES } from '../constants.ts';
import { isSubappaltoSuCantiere } from '../utils/puntaNetImporter.ts';
import { MAPPATURA_USCITE as MAPPATURA, MAPPATURA_ENTRATE } from './mappaturaCategorieExcelApp.mjs';

const [, , xlsxPathArg, mesiArg, annoArg] = process.argv;
if (!xlsxPathArg || !mesiArg) {
  console.error('Uso: npx tsx scripts/confrontaFlussoCassaExcel.mjs <percorso.xlsx> <mese1,mese2,...> [anno]');
  process.exit(1);
}
const ANNO = annoArg ? Number(annoArg) : 2026;

const NOMI_MESE = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

// Valida i mesi richiesti (1-12): un numero fuori range o non numerico (es. un refuso "6,7," con
// virgola finale) produceva in silenzio un mese sbagliato o un indice di colonna casuale invece di
// un errore (trovato in review: Codex, 2026-10-21).
const MESI_RICHIESTI = mesiArg.split(',').map(s => s.trim()).filter(s => s.length > 0).map(s => {
  const n = Number(s);
  if (!Number.isInteger(n) || n < 1 || n > 12) {
    console.error(`✖ Mese non valido: "${s}". Usa numeri interi da 1 (Gennaio) a 12 (Dicembre), separati da virgola.`);
    process.exit(1);
  }
  return n - 1; // 0-based
});
if (MESI_RICHIESTI.length === 0) {
  console.error('✖ Nessun mese valido indicato.');
  process.exit(1);
}

const NAS_DATI = String.raw`\\NAS\Ufficio Tecnico\GRUPPO VISENTIN\00_GESTIONE GV\35_APP GV ECOSISTEM\04-GV GestioneFINANZIARIA\DATI SALVATI`;
const GVCF_PATH = path.join(NAS_DATI, 'gv-cashflow_v2-import-puntanet-automatico.gvcf');

// Excel (nome vecchio) → categorie app corrispondenti. Dove l'Excel aveva UNA voce e l'app l'ha
// splittata in piu' categorie, qui si sommano per tornare comparabili. `incerta: true` segnala una
// mappatura dedotta per nome o uno split non documentato esplicitamente in CATEGORY_MIGRATION_MAP —
// da verificare a mano, non è detto che il confronto per quella riga sia affidabile.
// MAPPATURA (uscite) e MAPPATURA_ENTRATE importate da mappaturaCategorieExcelApp.mjs — estratte in
// un modulo condiviso senza side effect cosi' elencaMovimentiPerCategoria.mjs puo' usare la STESSA
// mappatura per risolvere un filtro categoria scritto nel nome Excel (trovato in review: Codex, PR
// #47, 2026-10-27, prima erano duplicate qui e in quello script, a rischio di disallinearsi).

// Righe di riepilogo del foglio — NON sono categorie di costo, sommarle raddoppierebbe il totale
// (stessa lista di ImportStoricoModal.tsx, ESCLUDI_USCITE — trovato in review: Codex, 2026-10-21).
const ESCLUDI_RIGHE = new Set(['TOTALE PAGATO', 'SALDO MESE', 'FLUSSO NETTO', 'TOTALE', 'TOTALE USCITE', 'NOTE']);

// Converte sia numeri che importi salvati come testo (es. "1.234,56" incollato da un'altra cella) —
// stessa logica di ImportStoricoModal.tsx, safeParseFloat (trovato in review: Codex, 2026-10-21).
function safeParseFloat(val) {
  if (typeof val === 'number') return Number.isFinite(val) ? val : NaN;
  if (typeof val !== 'string') return NaN;
  let str = val.trim();
  if (str === '-' || str === '') return 0;
  if (str.includes(',') && str.includes('.')) {
    const lastComma = str.lastIndexOf(',');
    const lastDot = str.lastIndexOf('.');
    str = lastComma > lastDot ? str.replace(/\./g, '').replace(',', '.') : str.replace(/,/g, '');
  } else if (str.includes(',')) {
    str = (str.split(',').length > 2 || str.match(/,\d{3}$/)) ? str.replace(/,/g, '') : str.replace(',', '.');
  }
  return parseFloat(str.replace(/[^\d.-]/g, ''));
}

function importoLordo(t) {
  if (typeof t.grossAmount === 'number') return t.grossAmount;
  const vat = t.vatRate || 0;
  return (t.amount || 0) * (1 + vat / 100);
}

// Stessa funzione condivisa di App.tsx/importaPuntaNet.mjs (utils/puntaNetImporter.ts,
// isSubappaltoSuCantiere) — prima questo script manteneva una copia propria della lista
// fornitori con un confronto lettera-per-lettera senza normalizzazione (lo stesso bug corretto
// in PR #29 sulla fonte condivisa): oltre a duplicare la lista, restava disallineato ad ogni
// aggiunta successiva, riportando scostamenti di categoria che non riflettevano quelli reali
// dell'app (Codex review PR #30, 2026-10-22).
function categoriaNormalizzata(t) {
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

// --- Lato APP: somma per categoria, mese per mese ---
const gvData = JSON.parse(fs.readFileSync(GVCF_PATH, 'utf8'));
console.log(`App: dati letti da ${GVCF_PATH} (timestamp file: ${gvData.timestamp || '(assente)'})`);

// Stessa logica di App.tsx, migrateBackupData: esclude le transazioni di sessioni di import
// annullate (e le righe "Storico Excel" orfane, senza sessione attiva) — trovato in review: Codex,
// 2026-10-21.
const sessioniAnnullateIds = new Set((gvData.importSessions || []).filter(s => s.annullata).map(s => s.id));
const esisteSessioneStoricoAttiva = (gvData.importSessions || []).some(s => !s.annullata && s.nomeFile && s.nomeFile.startsWith('Storico Excel'));
function transazioneValida(t) {
  if (t.importSessionId && sessioniAnnullateIds.has(t.importSessionId)) return false;
  if (!t.importSessionId && t.sourceRef && t.sourceRef.startsWith('Storico Excel') && !esisteSessioneStoricoAttiva) return false;
  return true;
}

// Come in App.tsx: usa le liste personalizzate nel file se presenti, altrimenti i default — stessa
// fonte di diagnosticaScostamentoUscite.mjs (trovato in review: Codex, 2026-10-21: senza questo
// filtro una categoria rimossa/non configurata finiva nel confronto anche se l'app la esclude dal
// "TOTALE USCITE" mostrato).
const fixedCategories = gvData.fixedCategories || [...FIXED_COST_CATEGORIES];
const variableCategories = gvData.variableCategories || [...VARIABLE_COST_CATEGORIES];
const categorieValide = new Set([...fixedCategories, ...variableCategories]);

function appPerCategoria(meseIdx) {
  const mappa = new Map();
  for (const t of gvData.transactions) {
    if (t.type !== 'EXPENSE' || t.isForecast || t.ceType === 'ammortamento') continue;
    if (!transazioneValida(t)) continue;
    const d = new Date(`${t.date}T00:00:00Z`);
    if (d.getUTCFullYear() !== ANNO || d.getUTCMonth() !== meseIdx) continue;
    const categoria = categoriaNormalizzata(t);
    if (!categorieValide.has(categoria)) continue;
    mappa.set(categoria, (mappa.get(categoria) || 0) + importoLordo(t));
  }
  return mappa;
}

// Lato ENTRATE (ricavi/incassi) — richiesto dall'utente il 2026-10-26, dopo il confronto sulle
// uscite, per verificare anche le entrate. A differenza di appPerCategoria sopra, NON filtra per
// una lista di categorie valide: IncomeTimeline.tsx (components/IncomeTimeline.tsx, riga 173,
// incomeTransactions = transactions.filter(t => t.type === 'INCOME')) mostra il totale di TUTTE le
// entrate non previsionali, qualunque sia la categoria — filtrare qui avrebbe fatto leggere al
// confronto un totale app diverso da quello che l'utente vede davvero in app, anche in presenza di
// entrate con categoria mancante o non (ancora) elencata (trovato in review: Codex, 2026-10-26).
// Le categorie non riconosciute restano comunque visibili: finiscono nell'elenco "senza
// corrispondenza Excel" piu' sotto, invece di sparire in silenzio dal totale.
function appPerCategoriaEntrate(meseIdx) {
  const mappa = new Map();
  for (const t of gvData.transactions) {
    if (t.type !== 'INCOME' || t.isForecast) continue;
    if (!transazioneValida(t)) continue;
    const d = new Date(`${t.date}T00:00:00Z`);
    if (d.getUTCFullYear() !== ANNO || d.getUTCMonth() !== meseIdx) continue;
    let categoria = t.category;
    if (categoria && CATEGORY_MIGRATION_MAP[categoria]) categoria = CATEGORY_MIGRATION_MAP[categoria];
    if (!categoria) categoria = '(categoria mancante)';
    mappa.set(categoria, (mappa.get(categoria) || 0) + importoLordo(t));
  }
  return mappa;
}

// --- Lato EXCEL: individua le righe "categoria" (tutto maiuscolo) e le colonne di ogni mese ---
const wb = XLSX.readFile(xlsxPathArg);
const nomeFoglio = `FLUSSO DI CASSA ${ANNO}`;
const ws = wb.Sheets[nomeFoglio];
if (!ws) {
  console.error(`✖ Foglio "${nomeFoglio}" non trovato. Fogli disponibili: ${wb.SheetNames.join(', ')}`);
  process.exit(1);
}
const righe = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });

// Una riga e' una "categoria" (non un fornitore/dettaglio) se ogni parola e' tutta maiuscola,
// a parte qualche connettivo italiano comune in minuscolo (es. "ACQUISIZIONE TERRENI o IMMOBILI"),
// e non e' una riga di riepilogo del foglio (ESCLUDI_RIGHE).
const CONNETTIVI = new Set(['o', 'e', 'di', 'su', 'per', 'a', 'da', 'in', 'il', 'la']);
function eCategoria(valore) {
  if (typeof valore !== 'string') return false;
  const s = valore.trim();
  if (ESCLUDI_RIGHE.has(s.toUpperCase())) return false;
  const parole = s.split(/\s+/);
  let haParolaMaiuscola = false;
  for (const p of parole) {
    const pulita = p.replace(/[^\p{L}]/gu, '');
    if (!pulita) continue;
    if (pulita === pulita.toLocaleUpperCase('it-IT')) { haParolaMaiuscola = true; continue; }
    if (!CONNETTIVI.has(pulita.toLocaleLowerCase('it-IT'))) return false;
  }
  return haParolaMaiuscola;
}

let inizioUscite = -1, fineUscite = righe.length;
for (let i = 0; i < righe.length; i++) {
  const v = righe[i]?.[0];
  if (typeof v === 'string' && v.toUpperCase().includes('TOTALE INCASSATO')) inizioUscite = i + 1;
  if (typeof v === 'string' && v.toUpperCase().includes("LIQUIDITA") && inizioUscite >= 0) { fineUscite = i; break; }
}
if (inizioUscite < 0) {
  console.error('✖ Non trovo "TOTALE INCASSATO" nel foglio — impossibile delimitare la sezione USCITE.');
  process.exit(1);
}

function excelPerCategoria(meseIdx) {
  const colConsuntivoUscite = 6 + meseIdx * 5; // 0-based: vedi nota in testa al file
  const mappa = new Map();
  for (let i = inizioUscite; i < fineUscite; i++) {
    const nome = righe[i]?.[0];
    if (!eCategoria(nome)) continue;
    const v = safeParseFloat(righe[i]?.[colConsuntivoUscite]);
    if (!Number.isNaN(v)) mappa.set(nome.trim(), v);
  }
  return mappa;
}

// --- Lato EXCEL: sezione ENTRATE (ricavi/incassi), righe PRIMA di "TOTALE INCASSATO" ---
// Richiesto dall'utente il 2026-10-26, dopo il confronto sulle uscite. Il primo tentativo
// riusava a specchio la logica delle uscite (colonna 6+m*5, righe "categoria" tutte in maiuscolo)
// ed e' risultato sbagliato su tutti e due i punti (trovato in review: Codex, 2026-10-26,
// confrontando con la stessa sezione ENTRATE gia' gestita da components/ImportStoricoModal.tsx):
//
// 1) Colonna: il blocco di 5 colonne per mese ha la colonna CONSUNTIVO delle entrate a 4+m*5
//    (colEntrataCons), non 6+m*5 (colUscitaCons) — quest'ultima e' solo per le uscite.
//
// 2) Formato righe: a differenza delle uscite (righe-categoria in maiuscolo, es. "NOLEGGI"), la
//    sezione ENTRATE del foglio NON ha righe-categoria: ha una riga per ogni cliente/incasso (nome
//    in maiuscolo/minuscolo qualunque), che l'importer storico mappa SEMPRE sulla stessa categoria
//    app "[CANTIERE] SAL — Stato Avanzamento Lavori" (vedi parseExcelStorico, ImportStoricoModal.tsx
//    riga ~209). Un primo tentativo escludeva da qui le righe con un nome tipo "accredito
//    mutuo"/"finanziamento" per sommarle a parte, ma sui dati reali non ne esiste NESSUNA nella
//    sezione ENTRATE: i finanziamenti non sono affatto righe cliente. Il foglio li registra altrove
//    (vedi punto 3), e quella ricerca per pattern non trovava mai nulla — per questo gennaio 2026
//    risultava 792.800€ di finanziamento nell'app senza riscontro nell'Excel: non era un buco di
//    riconciliazione, era semplicemente nel punto sbagliato del foglio (trovato dall'utente aprendo
//    il file reale, 2026-10-26).
//
// 3) I finanziamenti sono registrati in una riga di riepilogo SEPARATA, "ENTRATE DA ALTRI
//    FINANZIAMENTI", dentro la sezione "LIQUIDITA' IN CONTO CORRENTE" molto piu' in basso nel
//    foglio (fuori da qualunque intervallo ENTRATE/USCITE delimitato da "TOTALE INCASSATO") — con
//    l'etichetta in COLONNA C (non A o B: un primo tentativo assumeva B sulla base dello screenshot,
//    ma la diagnostica raw su dati reali, 2026-10-26, ha mostrato C616="ENTRATE DA ALTRI
//    FINANZIAMENTI", non B616 — l'intera sezione di riepilogo usa la colonna C per le etichette, es.
//    anche C615="ENTRATE" e C617="ENTRATE-USCITE"), ma con la STESSA colonna consuntivo per mese
//    (4+m*5) della sezione ENTRATE normale (confermato: D616=E616=792800 a gennaio). Confermato sui
//    dati reali: 792.800€ a gennaio, identico a [FINANZA] Finanziamenti Ricevuti nell'app.
const fineEntrate = inizioUscite - 1; // la riga "TOTALE INCASSATO" stessa resta esclusa

function trovaRigaFinanziamenti() {
  for (let i = 0; i < righe.length; i++) {
    const a = righe[i]?.[0];
    const b = righe[i]?.[1];
    const c = righe[i]?.[2];
    const testo = [a, b, c].filter(v => typeof v === 'string').join(' ');
    if (/ENTRATE\s+DA\s+ALTRI\s+FINANZIAMENTI/i.test(testo)) return i;
  }
  return -1;
}
const rigaFinanziamenti = trovaRigaFinanziamenti();

function excelPerCategoriaEntrate(meseIdx) {
  const colConsuntivo = 4 + meseIdx * 5; // colEntrataCons in ImportStoricoModal.tsx
  let sommaClienti = 0;
  for (let i = 0; i < fineEntrate; i++) {
    const nome = righe[i]?.[0];
    if (typeof nome !== 'string') continue;
    const label = nome.trim();
    if (!label || label === 'MESE') continue;
    if (ESCLUDI_RIGHE.has(label.toUpperCase())) continue;
    const v = safeParseFloat(righe[i]?.[colConsuntivo]);
    if (Number.isNaN(v) || v <= 0) continue;
    sommaClienti += v;
  }
  const mappa = new Map();
  if (sommaClienti > 0) mappa.set('INCASSI CLIENTI (somma righe nel foglio, mappate su SAL dall\'importer storico)', sommaClienti);
  if (rigaFinanziamenti >= 0) {
    const v = safeParseFloat(righe[rigaFinanziamenti]?.[colConsuntivo]);
    if (!Number.isNaN(v) && v !== 0) {
      mappa.set('FINANZIAMENTI (riga "ENTRATE DA ALTRI FINANZIAMENTI" nel riepilogo liquidita\')', v);
    }
  }
  return mappa;
}
// "incerta: true": l'importer storico mappa OGNI riga cliente su SAL, ma non e' detto che la somma
// del foglio corrisponda esattamente solo a questa categoria app nel 2026 (import automatico da
// PuntaNet, non piu' dall'Excel) — potrebbe includere anche cio' che oggi l'app distingue come
// "Saldo Finale Commessa" o "Anticipi da Clienti su Commessa". Questi ultimi, se presenti, compaiono
// comunque nell'elenco "APP senza corrispondenza Excel" qui sotto con il loro importo reale, per
// decidere a mano se vanno sommati alla stessa riga invece di lasciarli come mappatura separata.
// (MAPPATURA_ENTRATE importata in testa al file da mappaturaCategorieExcelApp.mjs.)

// --- Confronto ---
for (const meseIdx of MESI_RICHIESTI) {
  const appCat = appPerCategoria(meseIdx);
  const excelCat = excelPerCategoria(meseIdx);
  const appCategorieUsate = new Set();
  const excelCategorieUsate = new Set();

  console.log(`\n\n=== ${NOMI_MESE[meseIdx]} ${ANNO} — confronto categoria per categoria (consuntivo) ===`);
  const righeTabella = [];
  for (const [catExcel, { app: catsApp, incerta }] of Object.entries(MAPPATURA)) {
    if (!excelCat.has(catExcel) && catsApp.every(c => !appCat.has(c))) continue; // categoria assente da entrambi i lati questo mese
    excelCategorieUsate.add(catExcel);
    const valExcel = excelCat.get(catExcel) || 0;
    let valApp = 0;
    for (const c of catsApp) { valApp += appCat.get(c) || 0; appCategorieUsate.add(c); }
    const delta = valApp - valExcel;
    righeTabella.push({ catExcel, catsApp, incerta, valExcel, valApp, delta });
  }
  righeTabella.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  for (const r of righeTabella) {
    if (Math.abs(r.delta) < 1) continue;
    const dettaglio = r.catsApp.length === 0 ? '[NESSUNA MAPPATURA APP]' : (r.catsApp.length > 1 ? `[=${r.catsApp.join(' + ')}]` : '');
    const avviso = r.incerta ? '  ⚠️ MAPPATURA INCERTA' : '';
    console.log(`  Δ ${r.delta >= 0 ? '+' : ''}${r.delta.toFixed(2).padStart(12)} €   app=${r.valApp.toFixed(2).padStart(12)}  excel=${r.valExcel.toFixed(2).padStart(12)}   ${r.catExcel} ${dettaglio}${avviso}`);
  }

  // Categorie Excel presenti nel foglio ma assenti da MAPPATURA — altrimenti scomparirebbero nel
  // totale senza essere mai mostrate (trovato in review: Codex, 2026-10-21).
  const excelNonMappate = [...excelCat.entries()].filter(([c]) => !excelCategorieUsate.has(c));
  if (excelNonMappate.length > 0) {
    console.log(`  Categorie EXCEL senza corrispondenza nella mappatura dello script (da aggiungere a MAPPATURA):`);
    for (const [c, v] of excelNonMappate.sort((a, b) => b[1] - a[1])) {
      console.log(`    ${v.toFixed(2).padStart(12)} €   ${c}`);
    }
  }

  // Categorie APP presenti nel mese ma non coperte da nessuna mappatura sopra (costi "nuovi" rispetto all'Excel)
  const nonMappate = [...appCat.entries()].filter(([c]) => !appCategorieUsate.has(c));
  if (nonMappate.length > 0) {
    console.log(`  Categorie APP senza corrispondenza Excel (costi non presenti/non distinti nel vecchio tracciato):`);
    for (const [c, v] of nonMappate.sort((a, b) => b[1] - a[1])) {
      console.log(`    ${v.toFixed(2).padStart(12)} €   ${c}`);
    }
  }

  const totExcel = [...excelCat.values()].reduce((s, v) => s + v, 0);
  const totApp = [...appCat.values()].reduce((s, v) => s + v, 0);
  console.log(`  TOTALE — app: ${totApp.toFixed(2)} €   excel: ${totExcel.toFixed(2)} €   Δ: ${(totApp - totExcel).toFixed(2)} €`);

  // --- Confronto ENTRATE (stessa struttura; MAPPATURA_ENTRATE ancora da costruire — vedi nota sopra) ---
  const appCatE = appPerCategoriaEntrate(meseIdx);
  const excelCatE = excelPerCategoriaEntrate(meseIdx);
  const appCategorieUsateE = new Set();
  const excelCategorieUsateE = new Set();

  console.log(`\n--- ${NOMI_MESE[meseIdx]} ${ANNO} — confronto ENTRATE (consuntivo) ---`);
  const righeTabellaE = [];
  for (const [catExcel, { app: catsApp, incerta }] of Object.entries(MAPPATURA_ENTRATE)) {
    if (!excelCatE.has(catExcel) && catsApp.every(c => !appCatE.has(c))) continue;
    excelCategorieUsateE.add(catExcel);
    const valExcel = excelCatE.get(catExcel) || 0;
    let valApp = 0;
    for (const c of catsApp) { valApp += appCatE.get(c) || 0; appCategorieUsateE.add(c); }
    const delta = valApp - valExcel;
    righeTabellaE.push({ catExcel, catsApp, incerta, valExcel, valApp, delta });
  }
  righeTabellaE.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  for (const r of righeTabellaE) {
    if (Math.abs(r.delta) < 1) continue;
    const dettaglio = r.catsApp.length === 0 ? '[NESSUNA MAPPATURA APP]' : (r.catsApp.length > 1 ? `[=${r.catsApp.join(' + ')}]` : '');
    const avviso = r.incerta ? '  ⚠️ MAPPATURA INCERTA' : '';
    console.log(`  Δ ${r.delta >= 0 ? '+' : ''}${r.delta.toFixed(2).padStart(12)} €   app=${r.valApp.toFixed(2).padStart(12)}  excel=${r.valExcel.toFixed(2).padStart(12)}   ${r.catExcel} ${dettaglio}${avviso}`);
  }

  const excelNonMappateE = [...excelCatE.entries()].filter(([c]) => !excelCategorieUsateE.has(c));
  if (excelNonMappateE.length > 0) {
    console.log(`  Categorie EXCEL (entrate) senza mappatura (nomi reali del foglio, da verificare e aggiungere a MAPPATURA_ENTRATE):`);
    for (const [c, v] of excelNonMappateE.sort((a, b) => b[1] - a[1])) {
      console.log(`    ${v.toFixed(2).padStart(12)} €   ${c}`);
    }
  }

  const nonMappateE = [...appCatE.entries()].filter(([c]) => !appCategorieUsateE.has(c));
  if (nonMappateE.length > 0) {
    console.log(`  Categorie APP (entrate) senza corrispondenza Excel:`);
    for (const [c, v] of nonMappateE.sort((a, b) => b[1] - a[1])) {
      console.log(`    ${v.toFixed(2).padStart(12)} €   ${c}`);
    }
  }

  const totExcelE = [...excelCatE.values()].reduce((s, v) => s + v, 0);
  const totAppE = [...appCatE.values()].reduce((s, v) => s + v, 0);
  console.log(`  TOTALE ENTRATE — app: ${totAppE.toFixed(2)} €   excel: ${totExcelE.toFixed(2)} €   Δ: ${(totAppE - totExcelE).toFixed(2)} €`);
}

console.log('\n\n=== Fine confronto — nessun dato e\' stato modificato ===');
