// Backfill UNA TANTUM (non fa parte del giro automatico quotidiano) per il campo `pagato`
// introdotto il 2026-10-20 (PR #20): le fatture PuntaNet scritte come consuntivo PRIMA di quella
// data non hanno il campo, quindi restano invisibili come "da pagare" anche se non sono mai state
// saldate — questo script le mette in pari con un solo confronto contro PuntaNet oggi.
//
// Per ogni transazione con puntaNetIDDocumento+puntaNetIDRata, SENZA puntaNetIDMovimento (cioe'
// proveniente da "Documenti Scadenze", non da un movimento bancario reale — vedi piu' sotto), e
// con campo `pagato` ASSENTE (mai tocca una transazione gia' taggata dal giro automatico, per non
// sovrascrivere un aggiornamento piu' recente): se la coppia IDDocumento/IDRata risulta ancora tra
// le scadenze aperte di oggi, imposta pagato:false; altrimenti pagato:true (gia' risolta). Le
// transazioni con puntaNetIDMovimento (movimenti bancari REALI, importati da Conti Movimenti) sono
// sempre pagato:true a prescindere da apertiOggi: sono gia' soldi usciti dal conto, anche se la
// stessa fattura ha altre rate ancora aperte altrove (trovato in review: Codex, 2026-10-21).
// Non tocca MAI importo, data, categoria, progetto — solo il flag.
//
// Default: DRY-RUN, nessuna scrittura, solo un report di quante righe verrebbero toccate.
// Uso: npx tsx scripts/backfillStatoPagamento.mjs [--scrivi]

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const SCRIVI = process.argv.includes('--scrivi');

const SQLCMD = String.raw`C:\Program Files\Microsoft SQL Server\Client SDK\ODBC\110\Tools\Binn\SQLCMD.EXE`;
const INSTANCE = String.raw`localhost\SQLEXPRESS`;
const DB_IMPRESA = 'GC_Impresa2_RO';
const DATA_INIZIO = '2026-01-01';

const NAS_DATI = String.raw`\\NAS\Ufficio Tecnico\GRUPPO VISENTIN\00_GESTIONE GV\35_APP GV ECOSISTEM\04-GV GestioneFINANZIARIA\DATI SALVATI`;
const GVCF_PATH = path.join(NAS_DATI, 'gv-cashflow_v2-import-puntanet-automatico.gvcf');
const BACKUP_DIR = path.join(NAS_DATI, 'BACKUP');

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

console.log(`=== Backfill stato pagamento (${SCRIVI ? 'SCRITTURA' : 'dry-run'}) ===\n`);

// ─── Controllo di freschezza della copia locale — OBBLIGATORIO qui ──────────────────────
// A differenza di importaPuntaNet.mjs (che si limita ad avvisare nel log), questo script decide
// "pagato:true" in modo permanente per cio' che non trova tra le scadenze aperte — e il giro
// automatico poi non lo correggerebbe mai piu' (la sua logica rivede solo le righe gia' marcate
// pagato:false). Su una copia locale ferma, una fattura davvero ancora aperta verrebbe marcata
// "pagata" per sbaglio e restrebbe cosi' per sempre (trovato in review: Codex, 2026-10-21; stesso
// problema reale gia' scoperto il 2026-09-24 — 15 giorni di copia locale congelata). Meglio
// fermarsi che rischiare un dato sbagliato permanente.
const [storicoRestore] = runSql('msdb', `SET NOCOUNT ON; SELECT TOP 1 restore_date FROM msdb.dbo.restorehistory WHERE destination_database_name = '${DB_IMPRESA}' ORDER BY restore_date DESC FOR JSON PATH`);
if (!storicoRestore?.restore_date) {
  console.error(`\n✖ Nessun ripristino mai registrato per ${DB_IMPRESA} in msdb.dbo.restorehistory — non posso fidarmi della copia locale. Esegui prima scripts\\aggiornaCopiaLocale.ps1.`);
  process.exit(1);
}
const oreDaUltimoRipristino = (Date.now() - new Date(storicoRestore.restore_date).getTime()) / 3600000;
if (oreDaUltimoRipristino > 20) {
  console.error(`\n✖ La copia locale di PuntaNet (${DB_IMPRESA}) non viene ripristinata da ${Math.round(oreDaUltimoRipristino)} ore (ultimo ripristino: ${storicoRestore.restore_date}). Mi fermo: eseguire scripts\\aggiornaCopiaLocale.ps1 prima di questo backfill, altrimenti rischio di marcare "pagate" fatture che non lo sono.`);
  process.exit(1);
}
console.log(`Copia locale aggiornata ${Math.round(oreDaUltimoRipristino)} ore fa — procedo.\n`);

console.log('--- Scadenze aperte OGGI (stessa query di importaPuntaNet.mjs) ---');
const scadenzeAperte = runSql(DB_IMPRESA, `SET NOCOUNT ON; SELECT d.IDDocumento, ds.IDRata FROM [Documenti Scadenze] ds JOIN Documenti d ON d.IDDocumento = ds.IDDocumento WHERE ds.Pagato = 0 AND d.Tipo IN (0,1,2,3) AND ds.[Data Rata] >= '${DATA_INIZIO}' FOR JSON PATH`);
const apertiOggi = new Set(scadenzeAperte.map(s => `${s.IDDocumento}|${s.IDRata}`));
console.log(`Scadenze ancora aperte: ${apertiOggi.size}\n`);

// Calcola gli aggiornamenti da fare su un dato array di transazioni (usata sia per l'anteprima
// dry-run sul primo read, sia — se --scrivi — su una rilettura fresca subito prima di scrivere).
function calcolaAggiornamenti(transactions) {
  const daTaggare = []; // { id, pagato, date, amount, description, category } — per il solo report
  for (const t of transactions) {
    if (t.pagato !== undefined) continue; // gia' taggato dal giro automatico, non toccare
    if (t.puntaNetIDDocumento == null || t.puntaNetIDRata == null) continue;
    // Movimento bancario reale (Conti Movimenti): soldi gia' usciti dal conto, sempre pagato,
    // a prescindere da eventuali altre rate della stessa fattura ancora aperte altrove.
    if (t.puntaNetIDMovimento != null) {
      daTaggare.push({ id: t.id, pagato: true });
      continue;
    }
    const key = `${t.puntaNetIDDocumento}|${t.puntaNetIDRata}`;
    const nonPagata = apertiOggi.has(key);
    daTaggare.push({
      id: t.id, pagato: !nonPagata,
      date: t.date, amount: t.grossAmount ?? t.amount, description: t.description, category: t.category,
    });
  }
  return daTaggare;
}

const gvData = JSON.parse(fs.readFileSync(GVCF_PATH, 'utf8'));
const anteprima = calcolaAggiornamenti(gvData.transactions);
const nonPagate = anteprima.filter(r => r.pagato === false);
const giaPagate = anteprima.filter(r => r.pagato === true);

console.log(`Transazioni da taggare "non pagata" (ancora aperte in PuntaNet): ${nonPagate.length}`);
console.log(`Transazioni da taggare "pagata" (gia' risolte, o movimenti bancari reali): ${giaPagate.length}`);
if (nonPagate.length > 0) {
  console.log('\nDettaglio delle "non pagate" trovate:');
  for (const r of nonPagate.sort((a, b) => b.amount - a.amount)) {
    console.log(`  ${r.date} — ${r.amount.toFixed(2)} € — ${r.description} — ${r.category}`);
  }
}

if (!SCRIVI) {
  console.log('\nNESSUNA scrittura — dry-run. Rilancia con --scrivi per applicare davvero.');
  process.exit(0);
}

if (anteprima.length === 0) {
  console.log('\nNulla da aggiornare.');
  process.exit(0);
}

fs.mkdirSync(BACKUP_DIR, { recursive: true });
const stamp = `${new Date().toISOString().slice(0, 10)}_${Date.now()}`;
const backupPath = path.join(BACKUP_DIR, `gv-cashflow_v2_PRE-backfill-pagato_${stamp}.gvcf`);
fs.copyFileSync(GVCF_PATH, backupPath);

// Rilettura del file AL MOMENTO della scrittura (stessa convenzione di importaPuntaNet.mjs): se
// nel frattempo l'app o un altro processo ha salvato qualcosa, applichiamo gli aggiornamenti sulla
// versione piu' recente invece di sovrascriverla alla cieca con lo snapshot letto a inizio script.
const gvDataFresh = JSON.parse(fs.readFileSync(GVCF_PATH, 'utf8'));
const aggiornamentiFreschi = calcolaAggiornamenti(gvDataFresh.transactions);
const perId = new Map(aggiornamentiFreschi.map(r => [r.id, r.pagato]));
let applicati = 0;
for (const t of gvDataFresh.transactions) {
  if (perId.has(t.id)) { t.pagato = perId.get(t.id); applicati++; }
}

gvDataFresh.timestamp = new Date().toISOString();

const tmpPath = `${GVCF_PATH}.tmp_${process.pid}`;
fs.writeFileSync(tmpPath, JSON.stringify(gvDataFresh, null, 2));
fs.renameSync(tmpPath, GVCF_PATH);

console.log(`\n✔ Backfill completato: ${applicati} transazioni aggiornate (rilette fresche al momento della scrittura). Backup pre-scrittura: ${backupPath}`);
