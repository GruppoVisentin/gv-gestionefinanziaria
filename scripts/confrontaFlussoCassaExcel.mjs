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
// Capitale). La mappatura sotto e' presa dai commenti "era: ..." in constants.ts — dove non c'e'
// un commento esplicito la mappatura e' dedotta per nome e segnalata come tale nel report.
//
// Uso: npx tsx scripts/confrontaFlussoCassaExcel.mjs <percorso.xlsx> <mese1,mese2,...> [anno]
//   mese: numero 1-12 (1=Gennaio)
//   Esempio: npx tsx scripts/confrontaFlussoCassaExcel.mjs "C:\...\PIANIFICAZIONE_FLUSSO_DI_CASSA_ANNUALE.xlsx" 6,7,8

import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';

const [, , xlsxPathArg, mesiArg, annoArg] = process.argv;
if (!xlsxPathArg || !mesiArg) {
  console.error('Uso: npx tsx scripts/confrontaFlussoCassaExcel.mjs <percorso.xlsx> <mese1,mese2,...> [anno]');
  process.exit(1);
}
const ANNO = annoArg ? Number(annoArg) : 2026;
const MESI_RICHIESTI = mesiArg.split(',').map(s => Number(s.trim()) - 1); // 0-based

const NOMI_MESE = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

const NAS_DATI = String.raw`\\NAS\Ufficio Tecnico\GRUPPO VISENTIN\00_GESTIONE GV\35_APP GV ECOSISTEM\04-GV GestioneFINANZIARIA\DATI SALVATI`;
const GVCF_PATH = path.join(NAS_DATI, 'gv-cashflow_v2-import-puntanet-automatico.gvcf');

// Excel (nome vecchio) → categorie app corrispondenti (nomi nuovi, da constants.ts). Dove l'Excel
// aveva UNA voce e l'app l'ha splittata in piu' categorie, qui si sommano per tornare comparabili.
const MAPPATURA = {
  'RIPARAZIONI MACCHINARI E ATTREZZATURE': ['[MEZZI] Riparazioni Macchinari Programmate', '[MEZZI] Riparazioni Macchinari Urgenti'],
  'NUOVE ATTREZZATURE': ['[INVESTIMENTI] Acquisto Attrezzature e Macchinari'],
  'TASSE': ['[FISCO] Tasse e Tributi Aziendali (IMU, TARI, ecc.)', '[CANTIERE] Oneri Comunali, Abaco e Occupazioni'], // mappatura INCERTA: "Oneri Comunali" e' una categoria nuova, non ha un "era:" esplicito in constants.ts
  'SANZIONI': ['[STRAORDINARI] Sanzioni e Penali'],
  'VERSAMENTO IVA': ['[FISCO] Versamento IVA'],
  'RATE E INTERESSI FINANZIAMENTI': ['[FINANZA] Interessi Passivi Finanziamenti', '[FINANZA] Quota Capitale Rate Finanziamenti'],
  'SPESE BANCARIE': ['[FINANZA] Commissioni e Bolli Bancari'], // mappatura DEDOTTA per nome, non "era:" esplicito
  'ADDEBITO CARTE DI CREDITO': [], // NESSUNA mappatura trovata in constants.ts — da verificare a mano
  'RITENUTE SU BONIFICI': ["[FISCO] Ritenute su Bonifici (versate)"],
  'IMPREVISTI': ['[STRAORDINARI] Imprevisti Straordinari'],
  'REVISIONE MACCHINARI': ['[MEZZI] Revisione Macchinari'],
  "PUBBLICITA' E MARKETING": ['[MARKETING] Pubblicità e Marketing'],
  'AFFITTI SEDI': ['[STRUTTURA] Affitti Sedi'],
  'UTENZE SEDI': ['[STRUTTURA] Utenze Sedi', '[CANTIERE] Utenze Cantiere'], // mappatura INCERTA: Utenze Cantiere e' nuova
  'CANCELLERIA': ['[STRUTTURA] Cancelleria e Materiali Ufficio'],
  'SOFTWARE': ['[STRUTTURA] Software e Abbonamenti'],
  'ASSICURAZIONE MEZZI E BOLLI': ['[MEZZI] Assicurazione Mezzi e Bolli'],
  'ASSICURAZIONI GENERALI': ['[COMPLIANCE] Assicurazioni Generali'],
  'CORSI DIPENDENTI': ['[COMPLIANCE] Corsi Dipendenti'],
  'VISITE MEDICHE DIPENDENTI': ['[COMPLIANCE] Visite Mediche Dipendenti'],
  'STIPENDI DIPENDENTI UFFICIO': ['[PERSONALE] Stipendi Dipendenti Ufficio'],
  'CONTRIBUTI DIPENDENTI UFFICIO': ['[PERSONALE] Contributi Dipendenti Ufficio'],
  'COLLABORATORI FISSI': ['[PERSONALE] Collaboratori Fissi'],
  'CONSULENTI OPEX20': ['[CONSULENZE] Consulenti Fissi'],
  'SOA E ISO': ['[CONSULENZE] SOA e ISO'],
  'COMMERCIALISTA': ['[CONSULENZE] Commercialista'],
  'VOLONTARIATO': ['[STRAORDINARI] Volontariato e Donazioni'],
  'COMPENSO AMMINISTRATORI': ['[PERSONALE] Compenso Amministratori'],
  'PRELIEVO UTILE SOCI + RITENUTA': ['[SOCI] Prelievo Utile Soci', '[SOCI] Ritenuta su Prelievo Soci'],
  'CARBURANTI': ['[CANTIERE] Carburanti'],
  'NOLEGGI': ['[CANTIERE] Noleggi Attrezzature e Mezzi'],
  'ASSICURAZIONE CANTIERI': ['[CANTIERE] Assicurazione Cantieri'],
  "RITENUTE D'ACCONTO SU PROFESSIONISTI": ["[FISCO] Ritenute d'Acconto su Professionisti"],
  'PRANZI': ['[CANTIERE] Pranzi e Trasferte Cantiere'],
  'RIFIUTI E MACERIE': ['[CANTIERE] Rifiuti e Macerie'],
  'STIPENDI DIPENDENTI OPERATIVI': ['[PERSONALE] Stipendi Dipendenti Operativi'],
  'CONTRIBUTI DIPENDENTI OPERATIVI': ['[PERSONALE] Contributi Dipendenti Operativi'],
  'SUBAPPALTI MANODOPERA': ['[PERSONALE] Subappalti Manodopera'],
  'FORNITORI MATERIALI': ['[FORNITORI] Fornitori Materiali'],
  'SUBAPPALTI SU CANTIERI': ['[FORNITORI] Subappalti su Cantieri'],
  'PROFESSIONISTI ESTERNI': ['[CONSULENZE] Professionisti Esterni di Cantiere'],
  'ACQUISIZIONE TERRENI o IMMOBILI': ['[INVESTIMENTI] Acquisto Terreni per Sviluppo', '[INVESTIMENTI] Acquisto Immobili per Sviluppo'],
};

function importoLordo(t) {
  if (typeof t.grossAmount === 'number') return t.grossAmount;
  const vat = t.vatRate || 0;
  return (t.amount || 0) * (1 + vat / 100);
}

// --- Lato APP: somma per categoria, mese per mese ---
const gvData = JSON.parse(fs.readFileSync(GVCF_PATH, 'utf8'));
console.log(`App: dati letti da ${GVCF_PATH} (timestamp file: ${gvData.timestamp || '(assente)'})`);

function appPerCategoria(meseIdx) {
  const mappa = new Map();
  for (const t of gvData.transactions) {
    if (t.type !== 'EXPENSE' || t.isForecast || t.ceType === 'ammortamento') continue;
    const d = new Date(`${t.date}T00:00:00Z`);
    if (d.getUTCFullYear() !== ANNO || d.getUTCMonth() !== meseIdx) continue;
    mappa.set(t.category, (mappa.get(t.category) || 0) + importoLordo(t));
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
// a parte qualche connettivo italiano comune in minuscolo (es. "ACQUISIZIONE TERRENI o IMMOBILI").
const CONNETTIVI = new Set(['o', 'e', 'di', 'su', 'per', 'a', 'da', 'in', 'il', 'la']);
function eCategoria(valore) {
  if (typeof valore !== 'string') return false;
  const parole = valore.trim().split(/\s+/);
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
    const v = righe[i]?.[colConsuntivoUscite];
    if (typeof v === 'number') mappa.set(nome.trim(), v);
  }
  return mappa;
}

// --- Confronto ---
for (const meseIdx of MESI_RICHIESTI) {
  const appCat = appPerCategoria(meseIdx);
  const excelCat = excelPerCategoria(meseIdx);
  const appCategorieUsate = new Set();

  console.log(`\n\n=== ${NOMI_MESE[meseIdx]} ${ANNO} — confronto categoria per categoria (consuntivo) ===`);
  const righeTabella = [];
  for (const [catExcel, catsApp] of Object.entries(MAPPATURA)) {
    const valExcel = excelCat.get(catExcel) || 0;
    let valApp = 0;
    for (const c of catsApp) { valApp += appCat.get(c) || 0; appCategorieUsate.add(c); }
    const delta = valApp - valExcel;
    righeTabella.push({ catExcel, catsApp, valExcel, valApp, delta });
  }
  righeTabella.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  for (const r of righeTabella) {
    if (Math.abs(r.delta) < 1) continue;
    const incerta = r.catsApp.length === 0 ? '  [NESSUNA MAPPATURA APP]' : (r.catsApp.length > 1 ? `  [=${r.catsApp.join(' + ')}]` : '');
    console.log(`  Δ ${r.delta >= 0 ? '+' : ''}${r.delta.toFixed(2).padStart(12)} €   app=${r.valApp.toFixed(2).padStart(12)}  excel=${r.valExcel.toFixed(2).padStart(12)}   ${r.catExcel}${incerta}`);
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
