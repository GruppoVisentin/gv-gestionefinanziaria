// Diagnostica + correzione di un collegamento Project.puntaNetCantiereId sospetto — richiesta
// dall'utente il 2026-11-11 per "Residence Living City", il cui registro condiviso fornitori
// (fornitori_registry.perCantiere, scritto da importaFornitoriPuntaNet.mjs) risultava confermato
// per ~580 fornitori diversi: un numero implausibile per un singolo cantiere residenziale,
// sintomo tipico di un IDCantiere PuntaNet troppo generico (es. un contenitore di spese comuni
// o un'altra commessa) abbinato per errore dal fuzzy matching di collegaCantieriPuntaNet.mjs.
//
// Perche' questo e' il punto giusto da correggere: statistichePuntaNet.perCantiere di OGNI
// fornitore e' calcolato in importaFornitoriPuntaNet.mjs direttamente da
// [Documenti Imponibili Cantiere].IDCantiere (chiave numerica reale, mai fuzzy — vedi commento
// lì) — quel dato e' sempre corretto. Il problema puo' essere SOLO nel collegamento
// Project.puntaNetCantiereId: se punta all'IDCantiere sbagliato, Direttore Cantiere (che importa
// i fornitori "confermati" per quell'IDCantiere) mostra i fornitori di un cantiere completamente
// diverso.
//
// Due modalita':
// - DIAGNOSI (default, sola lettura): per ogni progetto il cui nome contiene il frammento dato,
//   mostra il suo puntaNetCantiereId, la Descrizione reale di quell'IDCantiere in PuntaNet, quanti
//   fornitori distinti vi risultano "confermati", come si confronta con gli altri cantieri (per
//   capire se e' un valore anomalo/generico), ed eventuali altri progetti che condividono lo
//   stesso IDCantiere. Controlla anche l'ultimo report di collegaCantieriPuntaNet.mjs per
//   eventuali segnalazioni AMBIGUI/SCORE TROPPO BASSO su questo progetto.
// - CORREZIONE (--azzera): azzera puntaNetCantiereId SOLO per il progetto indicato (richiede un
//   solo progetto corrispondente al frammento, altrimenti si ferma — mai indovinare su quale dei
//   piu' progetti agire). Dopo l'azzeramento va rilanciato
//   scripts/importaFornitoriPuntaNet.mjs --scrivi per ricalcolare i nomi leggibili
//   (statistichePuntaNet.perCantiere[].nome) di tutti i fornitori — gli idCantiere stessi in
//   quell'elenco non cambiano mai (sono dati PuntaNet reali, non dipendono da questo
//   collegamento), cambia solo l'etichetta mostrata.
//
// Uso:
//   npx tsx scripts/correggiCollegamentoCantiereErrato.mjs "<frammento nome progetto>"
//   npx tsx scripts/correggiCollegamentoCantiereErrato.mjs "<frammento nome progetto>" --azzera
//
// Presuppone (come gli altri script PuntaNet) che GC_Impresa2_RO esista gia' sull'istanza
// SQLEXPRESS locale (ripristinata dall'ultimo backup PuntaNet).

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const [, , frammentoArg, ...resto] = process.argv;
const AZZERA = resto.includes('--azzera');

if (!frammentoArg) {
  console.error('Uso: npx tsx scripts/correggiCollegamentoCantiereErrato.mjs "<frammento nome progetto>" [--azzera]');
  process.exit(1);
}

const SQLCMD = String.raw`C:\Program Files\Microsoft SQL Server\Client SDK\ODBC\110\Tools\Binn\SQLCMD.EXE`;
const INSTANCE = String.raw`localhost\SQLEXPRESS`;
const DB_IMPRESA = 'GC_Impresa2_RO'; // GRUPPO VISENTIN SRL

const NAS_DATI = String.raw`\\NAS\Ufficio Tecnico\GRUPPO VISENTIN\00_GESTIONE GV\35_APP GV ECOSISTEM\04-GV GestioneFINANZIARIA\DATI SALVATI`;
const AUTO_DIR = path.join(NAS_DATI, 'AUTO');
const BACKUP_DIR = path.join(NAS_DATI, 'BACKUP');
const GVCF_PATH = path.join(NAS_DATI, 'gv-cashflow_v2-import-puntanet-automatico.gvcf');
const OGGI = new Date().toISOString().slice(0, 10);

function runSql(query) {
  const tmpFile = path.join(os.tmpdir(), `sqlout_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
  try {
    execFileSync(SQLCMD, ['-S', INSTANCE, '-d', DB_IMPRESA, '-E', '-y', '0', '-f', '65001', '-Q', query, '-o', tmpFile], { stdio: 'pipe' });
    if (!fs.existsSync(tmpFile)) return [];
    let raw;
    try { raw = fs.readFileSync(tmpFile, 'utf16le').replace(/\r?\n/g, '').trim(); JSON.parse(raw || '[]'); }
    catch { raw = fs.readFileSync(tmpFile, 'utf8').replace(/\r?\n/g, '').trim(); }
    return raw ? JSON.parse(raw) : [];
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
}

console.log(`=== Diagnostica collegamento cantiere PuntaNet per progetti che contengono "${frammentoArg}" ===\n`);

const gvData = JSON.parse(fs.readFileSync(GVCF_PATH, 'utf8'));
const progetti = gvData.projects || [];
const corrispondenti = progetti.filter(p => (p.name || '').toUpperCase().includes(frammentoArg.toUpperCase()));

if (corrispondenti.length === 0) {
  console.error(`Nessun progetto trovato con "${frammentoArg}" nel nome.`);
  process.exit(1);
}

console.log(`Progetti corrispondenti: ${corrispondenti.length}`);
corrispondenti.forEach(p => console.log(`  - "${p.name}"  puntaNetCantiereId=${p.puntaNetCantiereId ?? '(nessuno)'}`));
console.log('');

// ─── Statistiche globali: quanti fornitori distinti per ogni IDCantiere PuntaNet, per capire se
// l'ID collegato e' un valore anomalo/generico rispetto agli altri cantieri reali. ───────────
let fornitoriPerCantiere;
try {
  fornitoriPerCantiere = runSql(`SET NOCOUNT ON;
    SELECT dic.IDCantiere, COUNT(DISTINCT d.IDCliFor) AS NumeroFornitori
    FROM [Documenti Imponibili Cantiere] dic
    JOIN Documenti d ON d.IDDocumento = dic.IDDocumento
    WHERE d.IDCliFor IS NOT NULL
    GROUP BY dic.IDCantiere
    ORDER BY NumeroFornitori DESC
    FOR JSON PATH`);
} catch (e) {
  console.error(`Impossibile leggere [Documenti Imponibili Cantiere]: ${e.message}`);
  console.error(`Verifica che SQLCMD.EXE esista nel percorso atteso e che ${DB_IMPRESA} sia ripristinato su ${INSTANCE}.`);
  process.exit(1);
}
const mappaFornitoriPerCantiere = new Map(fornitoriPerCantiere.map(r => [r.IDCantiere, r.NumeroFornitori]));

console.log('=== Top 10 cantieri PuntaNet per numero di fornitori distinti (per contesto) ===');
const cantieriInfo = runSql(`SET NOCOUNT ON; SELECT IDCantiere, Descrizione FROM Cantieri FOR JSON PATH`);
const descrizionePerId = new Map(cantieriInfo.map(c => [c.IDCantiere, c.Descrizione]));
fornitoriPerCantiere.slice(0, 10).forEach((r, i) => {
  console.log(`  ${i + 1}. IDCantiere ${r.IDCantiere} ("${descrizionePerId.get(r.IDCantiere) ?? '(senza descrizione)'}"): ${r.NumeroFornitori} fornitori`);
});
const mediana = fornitoriPerCantiere.length > 0
  ? fornitoriPerCantiere.map(r => r.NumeroFornitori).sort((a, b) => a - b)[Math.floor(fornitoriPerCantiere.length / 2)]
  : 0;
console.log(`\nMediana fornitori/cantiere su ${fornitoriPerCantiere.length} cantieri PuntaNet: ${mediana}\n`);

// ─── Ultimo report di collegaCantieriPuntaNet.mjs, se presente, per vedere se questo progetto
// era segnalato come ambiguo o a punteggio troppo basso (spiegherebbe un abbinamento errato). ──
let reportCollegamento = null;
try {
  const reportFiles = fs.readdirSync(AUTO_DIR).filter(f => f.startsWith('collega-cantieri-report_')).sort();
  if (reportFiles.length > 0) {
    const ultimo = reportFiles[reportFiles.length - 1];
    reportCollegamento = { nome: ultimo, dati: JSON.parse(fs.readFileSync(path.join(AUTO_DIR, ultimo), 'utf8')) };
  }
} catch { /* nessun report disponibile, non blocca la diagnosi */ }

console.log('=== Diagnosi per progetto ===\n');
for (const p of corrispondenti) {
  console.log(`--- "${p.name}" ---`);
  if (p.puntaNetCantiereId == null) {
    console.log('  Nessun puntaNetCantiereId collegato: nulla da verificare.\n');
    continue;
  }
  const id = p.puntaNetCantiereId;
  const descrizioneReale = descrizionePerId.get(id);
  const numeroFornitori = mappaFornitoriPerCantiere.get(id) ?? 0;
  console.log(`  puntaNetCantiereId = ${id}`);
  console.log(`  Descrizione reale in PuntaNet [Cantieri]: ${descrizioneReale ? `"${descrizioneReale}"` : '(IDCantiere NON TROVATO in Cantieri — collegamento sicuramente invalido)'}`);
  console.log(`  Fornitori distinti confermati su questo IDCantiere: ${numeroFornitori} (mediana su tutti i cantieri: ${mediana})`);

  const altriProgetti = progetti.filter(p2 => p2 !== p && p2.puntaNetCantiereId === id);
  if (altriProgetti.length > 0) {
    console.log(`  ⚠ ALTRI progetti collegati allo STESSO IDCantiere: ${altriProgetti.map(p2 => `"${p2.name}"`).join(', ')} — un IDCantiere condiviso da piu' progetti e' quasi sempre un contenitore generico, non un cantiere specifico.`);
  }

  if (reportCollegamento) {
    const { ambigui, scoreBasso } = reportCollegamento.dati;
    const inAmbigui = (ambigui || []).find(a => a.progetto === p.name);
    const inScoreBasso = (scoreBasso || []).find(s => s.progetto === p.name);
    if (inAmbigui) console.log(`  ⚠ Presente tra gli AMBIGUI nell'ultimo report (${reportCollegamento.nome}): candidati ${JSON.stringify(inAmbigui.candidati)}`);
    if (inScoreBasso) console.log(`  ⚠ Presente tra gli SCORE TROPPO BASSO nell'ultimo report (${reportCollegamento.nome}): ${JSON.stringify(inScoreBasso.candidato)}`);
    if (!inAmbigui && !inScoreBasso) console.log(`  (Non presente tra gli ambigui/punteggio-basso nell'ultimo report ${reportCollegamento.nome} — se il collegamento e' comunque sbagliato, non e' stato fatto da quello script o e' stato corretto/modificato dopo.)`);
  } else {
    console.log('  (Nessun report collega-cantieri-report_*.json trovato in AUTO per un confronto.)');
  }

  const sospetto = numeroFornitori > mediana * 5 || !descrizioneReale || altriProgetti.length > 0;
  console.log(`  => ${sospetto ? 'SOSPETTO: numero fornitori molto sopra la mediana, IDCantiere non trovato, o condiviso con altri progetti.' : 'Non emergono segnali di anomalia da questi soli dati — verificare comunque a vista la Descrizione.'}`);
  console.log('');
}

if (!AZZERA) {
  console.log('Nessun dato e\' stato modificato (diagnosi, sola lettura). Rilancia con --azzera per correggere un singolo progetto confermato come errato.');
  process.exit(0);
}

if (corrispondenti.length !== 1) {
  console.error(`\n✖ --azzera richiede che il frammento corrisponda a UN SOLO progetto (ne corrispondono ${corrispondenti.length}): restringi il frammento. Mai indovinare su quale progetto agire.`);
  process.exit(1);
}

const progettoDaCorreggere = corrispondenti[0];
if (progettoDaCorreggere.puntaNetCantiereId == null) {
  console.log('\nIl progetto non ha alcun puntaNetCantiereId da azzerare.');
  process.exit(0);
}

// ─── Scrittura: azzera puntaNetCantiereId SOLO per questo progetto ────────────
const gvDataFresh = JSON.parse(fs.readFileSync(GVCF_PATH, 'utf8'));
const progettoFresco = (gvDataFresh.projects || []).find(p => p.name === progettoDaCorreggere.name);
if (!progettoFresco) {
  console.error(`\n✖ Progetto "${progettoDaCorreggere.name}" non trovato nella rilettura fresca del file — nessuna scrittura effettuata.`);
  process.exit(1);
}
const idPrecedente = progettoFresco.puntaNetCantiereId;
if (idPrecedente == null) {
  console.log('\nIl progetto risulta gia\' senza puntaNetCantiereId (probabile doppia esecuzione): nessuna scrittura necessaria.');
  process.exit(0);
}

fs.mkdirSync(BACKUP_DIR, { recursive: true });
const stamp = `${OGGI}_${Date.now()}`;
const backupPath = path.join(BACKUP_DIR, `gv-cashflow_v2_PRE-azzera-cantiere-errato_${stamp}.gvcf`);
fs.copyFileSync(GVCF_PATH, backupPath);

progettoFresco.puntaNetCantiereId = null;

const tmpPath = `${GVCF_PATH}.tmp_${process.pid}`;
fs.writeFileSync(tmpPath, JSON.stringify(gvDataFresh, null, 2));
fs.renameSync(tmpPath, GVCF_PATH);

console.log(`\n✔ Azzerato puntaNetCantiereId di "${progettoFresco.name}" (era ${idPrecedente}).`);
console.log(`  Backup pre-scrittura: ${backupPath}`);
console.log('\nProssimo passo: rilancia "npx tsx scripts/importaFornitoriPuntaNet.mjs --scrivi" per ricalcolare');
console.log('i nomi leggibili (statistichePuntaNet.perCantiere[].nome) di tutti i fornitori con questo nuovo stato.');
console.log('Poi, per ricollegare correttamente questo progetto, puoi rilanciare scripts/collegaCantieriPuntaNet.mjs');
console.log('(solo questo progetto verra\' riconsiderato, visto che ora non ha piu\' un collegamento) oppure collegarlo a mano.');
console.log('=== Fine ===');
