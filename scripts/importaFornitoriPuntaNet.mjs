// Estrazione dell'anagrafica fornitori da PuntaNet (GRUPPO VISENTIN SRL), per
// popolare la tab "Anagrafica Fornitori" di Gestione Finanziaria.
//
// A differenza di importaPuntaNet.mjs (che legge solo la Ragione Sociale da
// [Clienti Fornitori] per etichettare i movimenti), qui NON conosciamo i nomi
// reali delle colonne di quella tabella oltre a "Ragione Sociale" e "IDCliFor"
// (mai verificati prima d'ora) — quindi lo script:
//   1. Interroga INFORMATION_SCHEMA.COLUMNS per scoprire le colonne REALI della
//      tabella, senza mai assumerle a priori.
//   2. Prova a riconoscere colonne utili (P.IVA/CF, indirizzo, telefono, email,
//      PEC...) per somiglianza del nome colonna — quelle non riconosciute
//      vengono semplicemente ignorate, nessun errore.
//
// Due modalita', stesso schema di importaPuntaNet.mjs:
// - DRY-RUN (default, `npx tsx scripts/importaFornitoriPuntaNet.mjs`): scrive
//   SOLO un report di sola lettura in DATI SALVATI/AUTO — il file
//   "fornitori-report_*.json" va poi caricato a mano dalla tab Fornitori
//   ("Importa report PuntaNet"), dove resta da rivedere/confermare in UI.
// - SCRITTURA (`npx tsx scripts/importaFornitoriPuntaNet.mjs --scrivi`, pensata
//   per un task programmato/schedulato senza intervento manuale): scrive
//   direttamente nel file dati reale dell'app, con "auto-scrittura selettiva"
//   diversa da quella dei movimenti — qui il dato (nome/contatti/fatturato,
//   agganciato per IDCliFor reale) e' sempre affidabile al 100%, quindi:
//     - un fornitore NUOVO (IDCliFor non ancora presente) viene aggiunto con
//       macroCategoria "Da Categorizzare" — l'utente la assegna quando vuole,
//       in app, non e' mai bloccante;
//     - un fornitore GIA' PRESENTE viene aggiornato SOLO nei campi economici
//       (numero fatture, fatturato anno corrente/totale, ultima fattura): mai
//       nei contatti (potrebbero essere stati corretti a mano in app) ne' nella
//       categoria/nelle note (scelte dell'utente).
//   Prima di scrivere: backup del file reale (stessa convenzione di
//   importaPuntaNet.mjs), rilettura del file al momento della scrittura,
//   scrittura atomica (file temporaneo + rename).
//
// Uso: npx tsx scripts/importaFornitoriPuntaNet.mjs [--scrivi]
// Presuppone (come importaPuntaNet.mjs) che GC_Impresa2_RO esista gia'
// sull'istanza SQLEXPRESS locale (ripristinata dall'ultimo backup PuntaNet).

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

const SCRIVI = process.argv.includes('--scrivi');

const SQLCMD = String.raw`C:\Program Files\Microsoft SQL Server\Client SDK\ODBC\110\Tools\Binn\SQLCMD.EXE`;
const INSTANCE = String.raw`localhost\SQLEXPRESS`;
const DB_IMPRESA = 'GC_Impresa2_RO'; // GRUPPO VISENTIN SRL
const TABELLA = 'Clienti Fornitori';

const NAS_DATI = String.raw`\\NAS\Ufficio Tecnico\GRUPPO VISENTIN\00_GESTIONE GV\35_APP GV ECOSISTEM\04-GV GestioneFINANZIARIA\DATI SALVATI`;
const AUTO_DIR = path.join(NAS_DATI, 'AUTO');
const BACKUP_DIR = path.join(NAS_DATI, 'BACKUP');
const GVCF_PATH = path.join(NAS_DATI, 'gv-cashflow_v2-import-puntanet-automatico.gvcf');
const OGGI = new Date().toISOString().slice(0, 10);
const COLONNE_PATH = path.join(AUTO_DIR, `fornitori-colonne_${OGGI}.json`);
const REPORT_PATH = path.join(AUTO_DIR, `fornitori-report_${OGGI}.json`);

function runSql(database, query) {
  const tmpFile = path.join(os.tmpdir(), `sqlout_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
  try {
    execFileSync(SQLCMD, ['-S', INSTANCE, '-d', database, '-E', '-y', '0', '-Q', query, '-o', tmpFile], { stdio: 'pipe' });
    if (!fs.existsSync(tmpFile)) return [];
    let raw;
    try { raw = fs.readFileSync(tmpFile, 'utf16le').replace(/\r?\n/g, '').trim(); JSON.parse(raw || '[]'); }
    catch { raw = fs.readFileSync(tmpFile, 'utf8').replace(/\r?\n/g, '').trim(); }
    return raw ? JSON.parse(raw) : [];
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
}

// Riconoscimento per somiglianza del nome colonna (case/spazi/underscore-insensitive).
// Ogni campo normalizzato prova piu' sinonimi plausibili in italiano/inglese; il primo
// che matcha una colonna realmente presente vince. Nessuna colonna e' mai assunta:
// se nessun sinonimo matcha, il campo resta vuoto (mai un errore, mai un dato inventato).
const SINONIMI = {
  puntaNetIdCliFor: ['idclifor'],
  ragioneSociale: ['ragionesociale', 'denominazione', 'nome'],
  pIvaCf: ['partitaiva', 'piva', 'codicefiscale'],
  indirizzo: ['indirizzo', 'via'],
  telefono: ['telefono', 'cellulare', 'tel'],
  pec: ['pec'],
  email: ['email', 'mail'],
};

function normalizza(nome) {
  return nome.toLowerCase().replace(/[\s_]/g, '');
}

function costruisciMapping(colonneReali) {
  const normalizzate = colonneReali.map(c => ({ originale: c, norm: normalizza(c) }));
  const mapping = {};
  for (const [campo, sinonimi] of Object.entries(SINONIMI)) {
    const trovata = normalizzate.find(c => sinonimi.some(s => c.norm.includes(s)));
    if (trovata) mapping[campo] = trovata.originale;
  }
  return mapping;
}

console.log(`=== ${SCRIVI ? 'Scrittura' : 'Estrazione (dry-run)'} anagrafica fornitori da PuntaNet ===\n`);

let colonneReali;
try {
  const colInfo = runSql(
    DB_IMPRESA,
    `SET NOCOUNT ON; SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${TABELLA}' FOR JSON PATH`
  );
  colonneReali = colInfo.map(r => r.COLUMN_NAME);
} catch (e) {
  console.error(`Impossibile leggere le colonne di [${TABELLA}]: ${e.message}`);
  console.error(`Verifica che SQLCMD.EXE esista nel percorso atteso e che ${DB_IMPRESA} sia ripristinato su ${INSTANCE}.`);
  process.exit(1);
}

if (colonneReali.length === 0) {
  console.error(`La tabella [${TABELLA}] non e' stata trovata (o non ha colonne) su ${DB_IMPRESA}.`);
  process.exit(1);
}

fs.mkdirSync(AUTO_DIR, { recursive: true });
fs.writeFileSync(COLONNE_PATH, JSON.stringify(colonneReali, null, 2));
console.log(`Colonne reali di [${TABELLA}] (${colonneReali.length}) salvate in:\n  ${COLONNE_PATH}\n`);
console.log(colonneReali.join(', '), '\n');

const mapping = costruisciMapping(colonneReali);
console.log('Colonne riconosciute automaticamente:');
for (const [campo, colonna] of Object.entries(mapping)) console.log(`  ${campo} <- [${colonna}]`);
const nonRiconosciuti = Object.keys(SINONIMI).filter(c => !mapping[c]);
if (nonRiconosciuti.length > 0) {
  console.log(`\nNon riconosciuti automaticamente (controlla l'elenco colonne sopra e aggiorna SINONIMI se il nome e' diverso): ${nonRiconosciuti.join(', ')}`);
}

if (!mapping.ragioneSociale) {
  console.error(`\nNessuna colonna sembra contenere la ragione sociale: impossibile procedere senza. Controlla ${COLONNE_PATH} e aggiorna manualmente SINONIMI.ragioneSociale in questo script.`);
  process.exit(1);
}

const colonneSelect = Object.values(mapping).map(c => `[${c}]`).join(', ');
const righe = runSql(DB_IMPRESA, `SET NOCOUNT ON; SELECT ${colonneSelect} FROM [${TABELLA}] FOR JSON PATH`);

// Riepilogo economico per fornitore, per le insight della tab "Mestieri Fornitori"
// di Direttore Cantiere (fatturato, numero fatture, ultimo utilizzo). A differenza
// dell'anagrafica sopra, qui l'aggregazione è per IDCliFor via chiave numerica reale
// (Documenti.IDCliFor = Clienti Fornitori.IDCliFor) — non serve alcun fuzzy match sui
// nomi, quindi il dato è affidabile al 100% per i soli fornitori con IDCliFor noto
// (cioè quelli già passati da PuntaNet, non quelli inseriti a mano in app).
// Tipo = 1 = FEP, fattura passiva (fornitore) — coerente con importaPuntaNet.mjs.
let riepilogoPerId = new Map();
if (mapping.puntaNetIdCliFor) {
  try {
    const riepilogo = runSql(
      DB_IMPRESA,
      `SET NOCOUNT ON; SELECT IDCliFor,
         COUNT(*) AS NumeroFatture,
         SUM(Totale) AS FatturatoTotale,
         SUM(CASE WHEN YEAR(Data) = YEAR(GETDATE()) THEN Totale ELSE 0 END) AS FatturatoAnnoCorrente,
         MAX(Data) AS UltimaFattura
       FROM Documenti WHERE Tipo = 1 GROUP BY IDCliFor FOR JSON PATH`
    );
    riepilogoPerId = new Map(riepilogo.map(r => [String(r.IDCliFor), r]));
  } catch (e) {
    console.log(`\nImpossibile calcolare il riepilogo economico (${e.message}) — il report includerà comunque l'anagrafica, senza fatturato/numero fatture.`);
  }
}

const fornitori = righe
  .map(r => {
    const out = {};
    for (const [campo, colonna] of Object.entries(mapping)) {
      const v = r[colonna];
      if (v !== null && v !== undefined && String(v).trim() !== '') out[campo] = typeof v === 'string' ? v.trim() : v;
    }
    if (out.puntaNetIdCliFor !== undefined) {
      const r2 = riepilogoPerId.get(String(out.puntaNetIdCliFor));
      if (r2) {
        out.numeroFatturePuntaNet = r2.NumeroFatture;
        out.fatturatoTotalePuntaNet = r2.FatturatoTotale;
        out.fatturatoAnnoCorrente = r2.FatturatoAnnoCorrente;
        out.ultimaFatturaPuntaNet = r2.UltimaFattura ? String(r2.UltimaFattura).slice(0, 10) : undefined;
      }
    }
    return out;
  })
  .filter(f => f.ragioneSociale);

fs.mkdirSync(AUTO_DIR, { recursive: true });
fs.writeFileSync(REPORT_PATH, JSON.stringify({ fornitori }, null, 2));
console.log(`\n${fornitori.length} fornitori estratti da [${TABELLA}].`);
console.log(`Report scritto in:\n  ${REPORT_PATH}`);

if (!SCRIVI) {
  console.log(`\nProssimo passo: in Gestione Finanziaria, tab "Fornitori" -> "Importa report PuntaNet" -> seleziona questo file.`);
  console.log(`Nessun dato e' stato scritto nel file reale dell'app (dry-run — usa --scrivi per scrivere davvero).`);
  process.exit(0);
}

// ─── Scrittura sul file dati vero (per il task programmato) ───────────────
// Rilettura del file AL MOMENTO della scrittura, stessa cautela di importaPuntaNet.mjs:
// minimizza la finestra in cui un'altra scrittura (l'app stessa, o l'import automatico
// dei movimenti) potrebbe andare persa con una sovrascrittura cieca.
const gvDataFresh = JSON.parse(fs.readFileSync(GVCF_PATH, 'utf8'));
const fornitoriEsistenti = gvDataFresh.fornitori || [];
const esistentiPerPuntaNetId = new Map(
  fornitoriEsistenti.filter(f => f.puntaNetIdCliFor != null).map(f => [String(f.puntaNetIdCliFor), f])
);
const esistentiPerNome = new Set(fornitoriEsistenti.map(f => (f.ragioneSociale || '').toLowerCase().trim()));

const nuovi = [];
const aggiornati = [];
for (const f of fornitori) {
  const chiaveId = f.puntaNetIdCliFor != null ? String(f.puntaNetIdCliFor) : null;
  const esistente = chiaveId ? esistentiPerPuntaNetId.get(chiaveId) : null;
  if (esistente) {
    // Fornitore gia' noto: aggiorna SOLO i campi economici, mai contatti/categoria/note
    // (potrebbero essere stati corretti o assegnati a mano in app).
    const cambiato =
      esistente.numeroFatturePuntaNet !== f.numeroFatturePuntaNet ||
      esistente.fatturatoAnnoCorrente !== f.fatturatoAnnoCorrente ||
      esistente.fatturatoTotalePuntaNet !== f.fatturatoTotalePuntaNet ||
      esistente.ultimaFatturaPuntaNet !== f.ultimaFatturaPuntaNet;
    if (cambiato) {
      Object.assign(esistente, {
        numeroFatturePuntaNet: f.numeroFatturePuntaNet,
        fatturatoAnnoCorrente: f.fatturatoAnnoCorrente,
        fatturatoTotalePuntaNet: f.fatturatoTotalePuntaNet,
        ultimaFatturaPuntaNet: f.ultimaFatturaPuntaNet,
      });
      aggiornati.push(esistente.ragioneSociale);
    }
  } else if (!chiaveId || !esistentiPerNome.has((f.ragioneSociale || '').toLowerCase().trim())) {
    // Fornitore nuovo: dato anagrafico/economico affidabile al 100% (chiave IDCliFor
    // reale, non un fuzzy match), quindi si scrive subito — solo la categoria resta
    // "Da Categorizzare" perche' PuntaNet non ha alcun concetto di Grezzo/Finiture.
    nuovi.push({
      id: crypto.randomUUID(),
      macroCategoria: 'non_categorizzato',
      ...f,
    });
  }
}

if (nuovi.length === 0 && aggiornati.length === 0) {
  console.log('\nNessuna novita\' da scrivere (anagrafica e fatturato gia\' allineati — probabile doppia esecuzione nella stessa giornata).');
  process.exit(0);
}

fs.mkdirSync(BACKUP_DIR, { recursive: true });
const stamp = `${OGGI}_${Date.now()}`;
const backupPath = path.join(BACKUP_DIR, `gv-cashflow_v2_PRE-import-fornitori-automatico_${stamp}.gvcf`);
fs.copyFileSync(GVCF_PATH, backupPath);

gvDataFresh.fornitori = [...fornitoriEsistenti, ...nuovi];
gvDataFresh.timestamp = new Date().toISOString();
// Stesso log usato dal banner "N movimenti importati automaticamente" in app (App.tsx) —
// campi fornitoriNuovi/fornitoriAggiornati aggiunti qui, ignorati dalle voci piu' vecchie
// scritte solo da importaPuntaNet.mjs (che non li imposta).
gvDataFresh.logImportAutomatico = [
  ...(gvDataFresh.logImportAutomatico || []),
  { timestamp: new Date().toISOString(), autoScritti: 0, daRivedere: 0, fornitoriNuovi: nuovi.length, fornitoriAggiornati: aggiornati.length },
].slice(-60);

const tmpPath = `${GVCF_PATH}.tmp_${process.pid}`;
fs.writeFileSync(tmpPath, JSON.stringify(gvDataFresh, null, 2));
fs.renameSync(tmpPath, GVCF_PATH);

console.log(`\n✔ Aggiunti ${nuovi.length} fornitori nuovi (categoria "Da Categorizzare").`);
console.log(`✔ Aggiornato il fatturato/numero fatture di ${aggiornati.length} fornitori gia' presenti.`);
console.log(`  Backup pre-scrittura: ${backupPath}`);
console.log('=== Scrittura completata ===');
