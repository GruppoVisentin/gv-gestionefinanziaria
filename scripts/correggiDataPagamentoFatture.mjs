// Backfill UNA TANTUM (non fa parte del giro automatico quotidiano) per correggere le fatture che
// l'aggiornamento pagamenti ha gia' marcato `pagato:true` PRIMA del fix del 2026-10-21
// (scripts/importaPuntaNet.mjs, commit b315b24): quella versione controllava solo la singola rata,
// non l'intero documento, quindi una fattura ristrutturata da PuntaNet dopo un pagamento parziale
// (es. C.I. Coperture Innovative: 95.170€ scritti a luglio, pagati con rate nuove sotto IDRata
// diversi) poteva risultare marcata "pagata" per intero anche se in realta' ne resta una parte
// ancora aperta, E restava comunque sulla VECCHIA data di scadenza invece che sul pagamento reale.
//
// Per ogni transazione con `pagato: true`, puntaNetIDDocumento+IDRata, e SENZA puntaNetIDMovimento
// (cioe' mai riconciliata dal nuovo codice — una riga gia' riconciliata ha sempre puntaNetIDMovimento
// stampato, quindi questo script e' idempotente: ri-eseguirlo dopo un giro riuscito non trova piu'
// nulla da correggere):
//   - se il documento ha ancora QUALUNQUE rata aperta oggi → era stata marcata "pagata" per errore:
//     riportata a `pagato: false` (la data resta quella di scadenza, invariata: non sappiamo quale
//     pagamento parziale attribuirle, meglio lasciarla come "ancora da pagare" che sbagliata);
//   - se il documento e' chiuso e c'e' UN SOLO movimento bancario che combacia per importo → la
//     stessa riga viene riconciliata: `date` spostata al pagamento reale, `puntaNetIDMovimento` e
//     `puntaNetIDRata` aggiornati (stessa logica di importaPuntaNet.mjs, commit b315b24);
//   - se il documento e' chiuso ma non c'e' un riscontro bancario pulito (zero o piu' movimenti
//     candidati — es. C.I. Coperture, pagata in piu' rate diverse dall'importo originale) → NON
//     tocca nulla, la riga resta cosi' com'e' e va decisa a mano (serve eventualmente spezzare la
//     riga in piu' importi, cosa che questo script non fa mai).
// Non tocca MAI importo, categoria, progetto — solo pagato/date/puntaNetIDMovimento/puntaNetIDRata.
//
// Default: DRY-RUN, nessuna scrittura, solo un report di quante righe verrebbero toccate.
// Uso: npx tsx scripts/correggiDataPagamentoFatture.mjs [--scrivi]

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
function importoLordoTx(t) {
  if (typeof t.grossAmount === 'number') return t.grossAmount;
  const vat = t.vatRate || 0;
  return (t.amount || 0) * (1 + vat / 100);
}
function importoMovimento(mv) { return mv.ImportoE > 0 ? mv.ImportoE : mv.ImportoU; }

console.log(`=== Correggi data pagamento fatture (${SCRIVI ? 'SCRITTURA' : 'dry-run'}) ===\n`);

// ─── Controllo di freschezza della copia locale — OBBLIGATORIO qui ──────────────────────
// Stessa ragione di backfillStatoPagamento.mjs: questo script decide in modo permanente se una
// fattura e' davvero chiusa (per riportarla a "non pagata" o per riconciliarla) — il giro
// automatico quotidiano non ripassa mai su una riga gia' marcata pagato:true, quindi un errore
// qui non si auto-correggerebbe mai. Controlla l'eta' del BACKUP (backupset.backup_finish_date),
// non quella del ripristino: vedi scripts/backfillStatoPagamento.mjs per il motivo.
const [storicoRestore] = runSql('msdb', `SET NOCOUNT ON; SELECT TOP 1 bs.backup_finish_date FROM msdb.dbo.restorehistory rh JOIN msdb.dbo.backupset bs ON bs.backup_set_id = rh.backup_set_id WHERE rh.destination_database_name = '${DB_IMPRESA}' ORDER BY rh.restore_date DESC FOR JSON PATH`);
if (!storicoRestore?.backup_finish_date) {
  console.error(`\n✖ Nessun ripristino mai registrato per ${DB_IMPRESA} in msdb.dbo.restorehistory — non posso fidarmi della copia locale. Esegui prima scripts\\aggiornaCopiaLocale.ps1.`);
  process.exit(1);
}
const oreDalBackup = (Date.now() - new Date(storicoRestore.backup_finish_date).getTime()) / 3600000;
if (oreDalBackup > 20) {
  console.error(`\n✖ Il backup PuntaNet piu' recente ripristinato su ${DB_IMPRESA} risale a ${Math.round(oreDalBackup)} ore fa (backup_finish_date: ${storicoRestore.backup_finish_date}). Mi fermo: verificare che PuntaNet stia ancora producendo backup nuovi prima di questo script.`);
  process.exit(1);
}
console.log(`Backup PuntaNet piu' recente ripristinato risale a ${Math.round(oreDalBackup)} ore fa — procedo.\n`);

console.log('--- Scadenze aperte OGGI (qualunque rata, per documento) ---');
const scadenzeAperte = runSql(DB_IMPRESA, `SET NOCOUNT ON; SELECT d.IDDocumento, ds.IDRata FROM [Documenti Scadenze] ds JOIN Documenti d ON d.IDDocumento = ds.IDDocumento WHERE ds.Pagato = 0 AND d.Tipo IN (0,1,2,3) AND ds.[Data Rata] >= '${DATA_INIZIO}' FOR JSON PATH`);
const scadenzeAperteDocIds = new Set(scadenzeAperte.map(s => s.IDDocumento));
console.log(`Documenti con almeno una rata ancora aperta: ${scadenzeAperteDocIds.size}\n`);

console.log('--- Movimenti bancari (Conti Movimenti), per riconciliazione ---');
const movimenti = runSql(DB_IMPRESA, `SET NOCOUNT ON; SELECT IDMovimento, Data, IDDocumento, IDRata, ImportoE, ImportoU FROM [Conti Movimenti] WHERE Data >= '${DATA_INIZIO}' AND (ImportoE > 0 OR ImportoU > 0) FOR JSON PATH`);
console.log(`Movimenti trovati: ${movimenti.length}\n`);

// Calcola gli aggiornamenti da fare su un dato array di transazioni (usata sia per l'anteprima
// dry-run sul primo read, sia — se --scrivi — su una rilettura fresca subito prima di scrivere).
function calcolaAggiornamenti(transactions) {
  const esistentiKeyMovimento = new Set();
  for (const t of transactions) if (t.puntaNetIDMovimento != null) esistentiKeyMovimento.add(t.puntaNetIDMovimento);

  const riconciliati = []; // { id, azione: 'riconciliata', date, puntaNetIDMovimento, puntaNetIDRata }
  const riportatiAperti = []; // { id, azione: 'riportata a non pagata', ... }
  const ambigui = []; // solo per il report — nessuna modifica
  const movimentiUsati = new Set();

  for (const t of transactions) {
    if (t.pagato !== true || t.puntaNetIDDocumento == null || t.puntaNetIDRata == null || t.puntaNetIDMovimento != null) continue;

    if (scadenzeAperteDocIds.has(t.puntaNetIDDocumento)) {
      riportatiAperti.push({ id: t.id, idDocumento: t.puntaNetIDDocumento, date: t.date, amount: importoLordoTx(t), description: t.description });
      continue;
    }

    const candidati = movimenti.filter(mv =>
      mv.IDDocumento === t.puntaNetIDDocumento
      && !esistentiKeyMovimento.has(mv.IDMovimento)
      && !movimentiUsati.has(mv.IDMovimento)
      && ((t.type === 'INCOME' && mv.ImportoE > 0) || (t.type === 'EXPENSE' && mv.ImportoU > 0))
      && mv.Data.slice(0, 10) >= t.date
    );
    const match = candidati.length === 1 && Math.abs(importoMovimento(candidati[0]) - importoLordoTx(t)) < 0.5 ? candidati[0] : null;

    if (match) {
      movimentiUsati.add(match.IDMovimento);
      riconciliati.push({
        id: t.id, idDocumento: t.puntaNetIDDocumento, amount: importoLordoTx(t), description: t.description,
        dataVecchia: t.date, dataNuova: match.Data.slice(0, 10),
        puntaNetIDMovimento: match.IDMovimento, puntaNetIDRata: match.IDRata ?? t.puntaNetIDRata,
      });
    } else {
      ambigui.push({ id: t.id, idDocumento: t.puntaNetIDDocumento, date: t.date, amount: importoLordoTx(t), description: t.description, candidati: candidati.length });
    }
  }
  return { riconciliati, riportatiAperti, ambigui };
}

const gvData = JSON.parse(fs.readFileSync(GVCF_PATH, 'utf8'));
const { riconciliati, riportatiAperti, ambigui } = calcolaAggiornamenti(gvData.transactions);

console.log(`Fatture da RICONCILIARE (data spostata al pagamento reale): ${riconciliati.length}`);
for (const r of riconciliati.sort((a, b) => b.amount - a.amount)) {
  console.log(`  [${r.id?.slice(0, 8)}] ${r.dataVecchia} → ${r.dataNuova} — ${r.amount.toFixed(2)} € — "${r.description}" (IDDocumento ${r.idDocumento})`);
}
console.log(`\nFatture da RIPORTARE a "non pagata" (documento ha ancora rate aperte, marcata pagata per errore): ${riportatiAperti.length}`);
for (const r of riportatiAperti.sort((a, b) => b.amount - a.amount)) {
  console.log(`  [${r.id?.slice(0, 8)}] ${r.date} — ${r.amount.toFixed(2)} € — "${r.description}" (IDDocumento ${r.idDocumento})`);
}
console.log(`\nFatture AMBIGUE (documento chiuso ma nessun riscontro bancario pulito — da decidere a mano, NESSUNA modifica): ${ambigui.length}`);
for (const r of ambigui.sort((a, b) => b.amount - a.amount)) {
  console.log(`  [${r.id?.slice(0, 8)}] ${r.date} — ${r.amount.toFixed(2)} € — "${r.description}" (IDDocumento ${r.idDocumento}, ${r.candidati} movimenti candidati)`);
}

if (!SCRIVI) {
  console.log('\nNESSUNA scrittura — dry-run. Rilancia con --scrivi per applicare davvero.');
  process.exit(0);
}

if (riconciliati.length === 0 && riportatiAperti.length === 0) {
  console.log('\nNulla da aggiornare.');
  process.exit(0);
}

fs.mkdirSync(BACKUP_DIR, { recursive: true });
const stamp = `${new Date().toISOString().slice(0, 10)}_${Date.now()}`;
const backupPath = path.join(BACKUP_DIR, `gv-cashflow_v2_PRE-correggi-data-pagamento_${stamp}.gvcf`);
fs.copyFileSync(GVCF_PATH, backupPath);

// Rilettura del file AL MOMENTO della scrittura (stessa convenzione degli altri script): applica
// gli aggiornamenti sulla versione piu' recente invece di sovrascriverla alla cieca.
const gvDataFresh = JSON.parse(fs.readFileSync(GVCF_PATH, 'utf8'));
const fresco = calcolaAggiornamenti(gvDataFresh.transactions);
const riconciliatiPerId = new Map(fresco.riconciliati.map(r => [r.id, r]));
const riportatiPerId = new Set(fresco.riportatiAperti.map(r => r.id));

let applicati = 0;
for (const t of gvDataFresh.transactions) {
  const rec = riconciliatiPerId.get(t.id);
  if (rec) {
    t.date = rec.dataNuova;
    t.puntaNetIDMovimento = rec.puntaNetIDMovimento;
    t.puntaNetIDRata = rec.puntaNetIDRata;
    applicati++;
    continue;
  }
  if (riportatiPerId.has(t.id)) {
    t.pagato = false;
    applicati++;
  }
}

gvDataFresh.timestamp = new Date().toISOString();

const tmpPath = `${GVCF_PATH}.tmp_${process.pid}`;
fs.writeFileSync(tmpPath, JSON.stringify(gvDataFresh, null, 2));
fs.renameSync(tmpPath, GVCF_PATH);

console.log(`\n✔ Corrette ${applicati} transazioni (rilette fresche al momento della scrittura). Backup pre-scrittura: ${backupPath}`);
