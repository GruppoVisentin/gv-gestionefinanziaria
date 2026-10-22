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
const MAPPATURA = {
  'RIPARAZIONI MACCHINARI E ATTREZZATURE': { app: ['[MEZZI] Riparazioni Macchinari Programmate', '[MEZZI] Riparazioni Macchinari Urgenti'], incerta: true },
  'NUOVE ATTREZZATURE': { app: ['[INVESTIMENTI] Acquisto Attrezzature e Macchinari'], incerta: false },
  'TASSE': { app: ['[FISCO] Tasse e Tributi Aziendali (IMU, TARI, ecc.)', '[CANTIERE] Oneri Comunali, Abaco e Occupazioni'], incerta: true },
  'SANZIONI': { app: ['[STRAORDINARI] Sanzioni e Penali'], incerta: false },
  'VERSAMENTO IVA': { app: ['[FISCO] Versamento IVA'], incerta: false },
  'RATE E INTERESSI FINANZIAMENTI': { app: ['[FINANZA] Interessi Passivi Finanziamenti', '[FINANZA] Quota Capitale Rate Finanziamenti'], incerta: true },
  'SPESE BANCARIE': { app: ['[FINANZA] Commissioni e Bolli Bancari'], incerta: false },
  'ADDEBITO CARTE DI CREDITO': { app: [], incerta: true }, // NESSUNA mappatura trovata ne' in CATEGORY_MIGRATION_MAP ne' in MAPPA_USCITE di ImportStoricoModal.tsx
  'RITENUTE SU BONIFICI': { app: ["[FISCO] Ritenute su Bonifici (versate)"], incerta: false },
  'IMPREVISTI': { app: ['[STRAORDINARI] Imprevisti Straordinari'], incerta: false },
  'REVISIONE MACCHINARI': { app: ['[MEZZI] Revisione Macchinari'], incerta: false },
  "PUBBLICITA' E MARKETING": { app: ['[MARKETING] Pubblicità e Marketing'], incerta: false },
  'AFFITTI SEDI': { app: ['[STRUTTURA] Affitti Sedi'], incerta: false },
  'UTENZE SEDI': { app: ['[STRUTTURA] Utenze Sedi', '[CANTIERE] Utenze Cantiere'], incerta: true },
  'CANCELLERIA': { app: ['[STRUTTURA] Cancelleria e Materiali Ufficio'], incerta: false },
  'SOFTWARE': { app: ['[STRUTTURA] Software e Abbonamenti'], incerta: false },
  'ASSICURAZIONE MEZZI E BOLLI': { app: ['[MEZZI] Assicurazione Mezzi e Bolli'], incerta: false },
  'ASSICURAZIONI GENERALI': { app: ['[COMPLIANCE] Assicurazioni Generali'], incerta: false },
  'CORSI DIPENDENTI': { app: ['[COMPLIANCE] Corsi Dipendenti'], incerta: false },
  'VISITE MEDICHE DIPENDENTI': { app: ['[COMPLIANCE] Visite Mediche Dipendenti'], incerta: false },
  'STIPENDI DIPENDENTI UFFICIO': { app: ['[PERSONALE] Stipendi Dipendenti Ufficio'], incerta: false },
  'CONTRIBUTI DIPENDENTI UFFICIO': { app: ['[PERSONALE] Contributi Dipendenti Ufficio'], incerta: false },
  'COLLABORATORI FISSI': { app: ['[PERSONALE] Collaboratori Fissi'], incerta: false },
  'CONSULENTI OPEX20': { app: ['[CONSULENZE] Consulenti Fissi'], incerta: false },
  'SOA E ISO': { app: ['[CONSULENZE] SOA e ISO'], incerta: false },
  'COMMERCIALISTA': { app: ['[CONSULENZE] Commercialista'], incerta: false },
  'VOLONTARIATO': { app: ['[STRAORDINARI] Volontariato e Donazioni'], incerta: false },
  'COMPENSO AMMINISTRATORI': { app: ['[PERSONALE] Compenso Amministratori'], incerta: false },
  'PRELIEVO UTILE SOCI + RITENUTA': { app: ['[SOCI] Prelievo Utile Soci', '[SOCI] Ritenuta su Prelievo Soci'], incerta: true },
  'CARBURANTI': { app: ['[CANTIERE] Carburanti'], incerta: false },
  'NOLEGGI': { app: ['[CANTIERE] Noleggi Attrezzature e Mezzi'], incerta: false },
  'ASSICURAZIONE CANTIERI': { app: ['[CANTIERE] Assicurazione Cantieri'], incerta: false },
  "RITENUTE D'ACCONTO SU PROFESSIONISTI": { app: ["[FISCO] Ritenute d'Acconto su Professionisti"], incerta: false },
  'PRANZI': { app: ['[CANTIERE] Pranzi e Trasferte Cantiere'], incerta: false },
  'RIFIUTI E MACERIE': { app: ['[CANTIERE] Rifiuti e Macerie'], incerta: false },
  'STIPENDI DIPENDENTI OPERATIVI': { app: ['[PERSONALE] Stipendi Dipendenti Operativi'], incerta: false },
  'CONTRIBUTI DIPENDENTI OPERATIVI': { app: ['[PERSONALE] Contributi Dipendenti Operativi'], incerta: false },
  'SUBAPPALTI MANODOPERA': { app: ['[PERSONALE] Subappalti Manodopera'], incerta: false },
  'FORNITORI MATERIALI': { app: ['[FORNITORI] Fornitori Materiali'], incerta: false },
  'SUBAPPALTI SU CANTIERI': { app: ['[FORNITORI] Subappalti su Cantieri'], incerta: false },
  'PROFESSIONISTI ESTERNI': { app: ['[CONSULENZE] Professionisti Esterni di Cantiere'], incerta: false },
  'ACQUISIZIONE TERRENI o IMMOBILI': { app: ['[INVESTIMENTI] Acquisto Terreni per Sviluppo', '[INVESTIMENTI] Acquisto Immobili per Sviluppo'], incerta: true },
  "NUOVA SOCIETA'": { app: ['[INVESTIMENTI] Investimento in Nuova Società'], incerta: false }, // mancava: trovato in review, Codex 2026-10-21
};

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
}

console.log('\n\n=== Fine confronto — nessun dato e\' stato modificato ===');
