// Collega ogni commessa (di questa app o importata da Direttore Cantiere) al suo id
// numerico PuntaNet (Cantieri.IDCantiere), riusando la stessa funzione di fuzzy
// matching gia' in produzione per abbinare le transazioni ai progetti
// (abbinaCantiereDaProgetto — vedi anche scripts/collegaProgettiMancanti.mjs).
//
// A cosa serve: Direttore Cantiere usa questo collegamento (Project.puntaNetCantiereId,
// pubblicato sul registro condiviso) per mostrare, nella scheda Fornitori del Gantt di
// un cantiere, SOLO i fornitori che secondo PuntaNet vi hanno davvero fatturato — senza
// questo collegamento quella lista resta vuota (a parte le assegnazioni manuali), anche
// se PuntaNet ha i dati.
//
// Direzione dell'abbinamento: per ogni riga [Cantieri] di PuntaNet (IDCantiere,
// Descrizione), si cerca il progetto di questa app il cui nome/cliente/intestatari
// corrispondono meglio a quella Descrizione — la stessa funzione usata altrove per
// abbinare una descrizione PuntaNet a un progetto, qui applicata alla descrizione del
// cantiere invece che a quella di una transazione.
//
// Mai sovrascritto un collegamento gia' presente (fatto a mano o da un'esecuzione
// precedente): solo i progetti senza puntaNetCantiereId vengono considerati. Un
// punteggio >= 80 (stessa soglia di collegaProgettiMancanti.mjs) viene applicato in
// automatico; sotto quella soglia, o se lo stesso progetto ha due candidati con
// punteggio troppo vicino (ambiguo), il collegamento va solo nel report per revisione
// manuale — mai indovinato.
//
// Due modalita': DRY-RUN (default, solo report) e SCRITTURA (--scrivi).
//
// Uso: npx tsx scripts/collegaCantieriPuntaNet.mjs [--scrivi]
// Presuppone (come gli altri script PuntaNet) che GC_Impresa2_RO esista gia'
// sull'istanza SQLEXPRESS locale (ripristinata dall'ultimo backup PuntaNet).

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { abbinaCantiereDaProgetto } from '../utils/puntaNetImporter.ts';

const SCRIVI = process.argv.includes('--scrivi');

const SQLCMD = String.raw`C:\Program Files\Microsoft SQL Server\Client SDK\ODBC\110\Tools\Binn\SQLCMD.EXE`;
const INSTANCE = String.raw`localhost\SQLEXPRESS`;
const DB_IMPRESA = 'GC_Impresa2_RO'; // GRUPPO VISENTIN SRL

const NAS_DATI = String.raw`\\NAS\Ufficio Tecnico\GRUPPO VISENTIN\00_GESTIONE GV\35_APP GV ECOSISTEM\04-GV GestioneFINANZIARIA\DATI SALVATI`;
const AUTO_DIR = path.join(NAS_DATI, 'AUTO');
const BACKUP_DIR = path.join(NAS_DATI, 'BACKUP');
const GVCF_PATH = path.join(NAS_DATI, 'gv-cashflow_v2-import-puntanet-automatico.gvcf');
const OGGI = new Date().toISOString().slice(0, 10);
const REPORT_PATH = path.join(AUTO_DIR, `collega-cantieri-report_${OGGI}.json`);

// SOGLIA_AUTO: stessa di collegaProgettiMancanti.mjs. SOGLIA_AMBIGUO: se il secondo
// miglior candidato per lo stesso progetto è a meno di questa distanza dal primo, il
// caso è ambiguo (due cantieri PuntaNet con nomi simili che puntano allo stesso
// progetto) e va solo segnalato, mai applicato a caso.
const SOGLIA_AUTO = 80;
const SOGLIA_AMBIGUO = 10;

function runSql(database, query) {
  const tmpFile = path.join(os.tmpdir(), `sqlout_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
  try {
    execFileSync(SQLCMD, ['-S', INSTANCE, '-d', database, '-E', '-y', '0', '-f', '65001', '-Q', query, '-o', tmpFile], { stdio: 'pipe' });
    if (!fs.existsSync(tmpFile)) return [];
    let raw;
    try { raw = fs.readFileSync(tmpFile, 'utf16le').replace(/\r?\n/g, '').trim(); JSON.parse(raw || '[]'); }
    catch { raw = fs.readFileSync(tmpFile, 'utf8').replace(/\r?\n/g, '').trim(); }
    return raw ? JSON.parse(raw) : [];
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
}

console.log(`=== ${SCRIVI ? 'Scrittura' : 'Estrazione (dry-run)'} collegamento commesse <-> Cantieri PuntaNet ===\n`);

let cantieriPuntaNet;
try {
  cantieriPuntaNet = runSql(DB_IMPRESA, `SET NOCOUNT ON; SELECT IDCantiere, Descrizione FROM Cantieri FOR JSON PATH`);
} catch (e) {
  console.error(`Impossibile leggere [Cantieri]: ${e.message}`);
  console.error(`Verifica che SQLCMD.EXE esista nel percorso atteso e che ${DB_IMPRESA} sia ripristinato su ${INSTANCE}.`);
  process.exit(1);
}
console.log(`${cantieriPuntaNet.length} cantieri letti da PuntaNet.`);

const gvData = JSON.parse(fs.readFileSync(GVCF_PATH, 'utf8'));
const progetti = gvData.projects || [];
const daCollegare = progetti.filter(p => p.puntaNetCantiereId == null);
console.log(`${progetti.length} commesse totali, ${daCollegare.length} senza collegamento PuntaNet.\n`);

// Per ogni progetto senza collegamento, tiene il miglior candidato e il secondo
// migliore (per rilevare ambiguita'), esplorando tutte le righe [Cantieri].
const candidatiPerProgetto = new Map(); // nome progetto -> [{idCantiere, descrizione, score}, ...] ordinati per score desc
for (const c of cantieriPuntaNet) {
  if (!c.Descrizione) continue;
  const match = abbinaCantiereDaProgetto(c.Descrizione, daCollegare, false);
  if (!match) continue;
  const lista = candidatiPerProgetto.get(match.cantiere) || [];
  lista.push({ idCantiere: c.IDCantiere, descrizione: c.Descrizione, score: match.score });
  candidatiPerProgetto.set(match.cantiere, lista);
}

const applicati = [];
const ambigui = [];
const scoreBasso = [];

for (const p of daCollegare) {
  const candidati = (candidatiPerProgetto.get(p.name) || []).sort((a, b) => b.score - a.score);
  if (candidati.length === 0) continue;
  const primo = candidati[0];
  const secondo = candidati[1];

  if (primo.score < SOGLIA_AUTO) {
    scoreBasso.push({ progetto: p.name, candidato: primo });
    continue;
  }
  if (secondo && (primo.score - secondo.score) < SOGLIA_AMBIGUO) {
    ambigui.push({ progetto: p.name, candidati: candidati.slice(0, 3) });
    continue;
  }
  p.puntaNetCantiereId = primo.idCantiere;
  applicati.push({ progetto: p.name, idCantiere: primo.idCantiere, descrizionePuntaNet: primo.descrizione, score: primo.score });
}

console.log(`=== COLLEGATI AUTOMATICAMENTE (score >= ${SOGLIA_AUTO}, non ambigui) ===`);
console.log(`Totale: ${applicati.length}\n`);
applicati.forEach(a => console.log(`  "${a.progetto}" -> IDCantiere ${a.idCantiere} ("${a.descrizionePuntaNet}", score ${a.score})`));

console.log(`\n=== AMBIGUI (piu' cantieri PuntaNet con punteggio simile per lo stesso progetto — da rivedere a mano) ===`);
console.log(`Totale: ${ambigui.length}\n`);
ambigui.forEach(a => {
  console.log(`  "${a.progetto}":`);
  a.candidati.forEach(c => console.log(`    - IDCantiere ${c.idCantiere} ("${c.descrizione}", score ${c.score})`));
});

console.log(`\n=== SCORE TROPPO BASSO (< ${SOGLIA_AUTO} — da rivedere a mano) ===`);
console.log(`Totale: ${scoreBasso.length}\n`);
scoreBasso.slice(0, 40).forEach(s => console.log(`  "${s.progetto}" -> "${s.candidato.descrizione}"? (score ${s.candidato.score})`));
if (scoreBasso.length > 40) console.log(`  ... e altre ${scoreBasso.length - 40}`);

const senzaAlcunCandidato = daCollegare.filter(p => !candidatiPerProgetto.has(p.name)).map(p => p.name);
console.log(`\n=== NESSUN CANDIDATO TROVATO IN PUNTANET ===`);
console.log(`Totale: ${senzaAlcunCandidato.length}\n`);
senzaAlcunCandidato.slice(0, 40).forEach(n => console.log(`  "${n}"`));

fs.mkdirSync(AUTO_DIR, { recursive: true });
fs.writeFileSync(REPORT_PATH, JSON.stringify({ applicati, ambigui, scoreBasso, senzaAlcunCandidato }, null, 2));
console.log(`\nReport scritto in:\n  ${REPORT_PATH}`);

if (applicati.length === 0) {
  console.log('\nNessun collegamento automatico da scrivere.');
  process.exit(0);
}

if (!SCRIVI) {
  console.log(`\nNessun dato e' stato scritto nel file reale dell'app (dry-run — usa --scrivi per scrivere davvero).`);
  process.exit(0);
}

// ─── Scrittura sul file dati vero ───────────────
// Rilettura al momento della scrittura, stessa cautela degli altri script di import.
const gvDataFresh = JSON.parse(fs.readFileSync(GVCF_PATH, 'utf8'));
const progettiFreschi = gvDataFresh.projects || [];
const idPerNome = new Map(applicati.map(a => [a.progetto, a.idCantiere]));
let scritti = 0;
for (const p of progettiFreschi) {
  if (p.puntaNetCantiereId != null) continue; // mai sovrascrivere (anche se impostato nel frattempo)
  const id = idPerNome.get(p.name);
  if (id != null) { p.puntaNetCantiereId = id; scritti++; }
}

if (scritti === 0) {
  console.log('\nNessuna novita\' da scrivere (probabile doppia esecuzione, i progetti risultano gia\' collegati).');
  process.exit(0);
}

fs.mkdirSync(BACKUP_DIR, { recursive: true });
const stamp = `${OGGI}_${Date.now()}`;
const backupPath = path.join(BACKUP_DIR, `gv-cashflow_v2_PRE-collega-cantieri-automatico_${stamp}.gvcf`);
fs.copyFileSync(GVCF_PATH, backupPath);

const tmpPath = `${GVCF_PATH}.tmp_${process.pid}`;
fs.writeFileSync(tmpPath, JSON.stringify(gvDataFresh, null, 2));
fs.renameSync(tmpPath, GVCF_PATH);

console.log(`\n✔ Collegati ${scritti} progetti al loro IDCantiere PuntaNet.`);
console.log(`  Backup pre-scrittura: ${backupPath}`);
console.log('=== Scrittura completata ===');
