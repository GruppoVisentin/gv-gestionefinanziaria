// Estrazione best-effort dell'anagrafica fornitori da PuntaNet (GRUPPO VISENTIN SRL),
// per popolare la tab "Anagrafica Fornitori" di Gestione Finanziaria.
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
//   3. Scrive SOLO report di sola lettura in DATI SALVATI/AUTO — non tocca mai
//      il file dati reale dell'app. Il file "fornitori-report_*.json" va poi
//      caricato a mano dalla tab Fornitori ("Importa report PuntaNet"), dove
//      resta comunque da rivedere/confermare riga per riga prima di salvare.
//
// Uso: npx tsx scripts/importaFornitoriPuntaNet.mjs
// Presuppone (come importaPuntaNet.mjs) che GC_Impresa2_RO esista gia'
// sull'istanza SQLEXPRESS locale (ripristinata dall'ultimo backup PuntaNet).

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const SQLCMD = String.raw`C:\Program Files\Microsoft SQL Server\Client SDK\ODBC\110\Tools\Binn\SQLCMD.EXE`;
const INSTANCE = String.raw`localhost\SQLEXPRESS`;
const DB_IMPRESA = 'GC_Impresa2_RO'; // GRUPPO VISENTIN SRL
const TABELLA = 'Clienti Fornitori';

const NAS_DATI = String.raw`\\NAS\Ufficio Tecnico\GRUPPO VISENTIN\00_GESTIONE GV\35_APP GV ECOSISTEM\04-GV GestioneFINANZIARIA\DATI SALVATI`;
const AUTO_DIR = path.join(NAS_DATI, 'AUTO');
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

console.log(`=== Estrazione anagrafica fornitori da PuntaNet (dry-run, sola lettura) ===\n`);

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

const fornitori = righe
  .map(r => {
    const out = {};
    for (const [campo, colonna] of Object.entries(mapping)) {
      const v = r[colonna];
      if (v !== null && v !== undefined && String(v).trim() !== '') out[campo] = typeof v === 'string' ? v.trim() : v;
    }
    return out;
  })
  .filter(f => f.ragioneSociale);

fs.writeFileSync(REPORT_PATH, JSON.stringify({ fornitori }, null, 2));
console.log(`\n${fornitori.length} fornitori estratti da [${TABELLA}].`);
console.log(`Report scritto in:\n  ${REPORT_PATH}`);
console.log(`\nProssimo passo: in Gestione Finanziaria, tab "Fornitori" -> "Importa report PuntaNet" -> seleziona questo file.`);
console.log(`Nessun dato e' stato scritto nel file reale dell'app: il report va sempre rivisto/confermato in UI.`);
