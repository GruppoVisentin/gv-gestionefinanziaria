// Backfill UNA TANTUM (non fa parte del giro automatico quotidiano) per il campo `pagato`
// introdotto il 2026-10-20 (PR #20): le fatture PuntaNet scritte come consuntivo PRIMA di quella
// data non hanno il campo, quindi restano invisibili come "da pagare" anche se non sono mai state
// saldate — questo script le mette in pari con un solo confronto contro PuntaNet oggi.
//
// Per ogni transazione con puntaNetIDDocumento+puntaNetIDRata e campo `pagato` ASSENTE (mai tocca
// una transazione gia' taggata dal giro automatico, per non sovrascrivere un aggiornamento piu'
// recente): se la coppia IDDocumento/IDRata risulta ancora tra le scadenze aperte di oggi, imposta
// pagato:false; altrimenti pagato:true (gia' risolta/pagata, o si tratta di un movimento bancario
// gia' reale). Non tocca MAI importo, data, categoria, progetto — solo il flag.
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

console.log('--- Scadenze aperte OGGI (stessa query di importaPuntaNet.mjs) ---');
const scadenzeAperte = runSql(DB_IMPRESA, `SET NOCOUNT ON; SELECT d.IDDocumento, ds.IDRata FROM [Documenti Scadenze] ds JOIN Documenti d ON d.IDDocumento = ds.IDDocumento WHERE ds.Pagato = 0 AND d.Tipo IN (0,1,2,3) AND ds.[Data Rata] >= '${DATA_INIZIO}' FOR JSON PATH`);
const apertiOggi = new Set(scadenzeAperte.map(s => `${s.IDDocumento}|${s.IDRata}`));
console.log(`Scadenze ancora aperte: ${apertiOggi.size}\n`);

const gvData = JSON.parse(fs.readFileSync(GVCF_PATH, 'utf8'));

let daTaggareNonPagate = 0;
let daTaggareGiaPagate = 0;
const dettaglioNonPagate = [];

for (const t of gvData.transactions) {
  if (t.pagato !== undefined) continue; // gia' taggato dal giro automatico, non toccare
  if (t.puntaNetIDDocumento == null || t.puntaNetIDRata == null) continue;
  const key = `${t.puntaNetIDDocumento}|${t.puntaNetIDRata}`;
  if (apertiOggi.has(key)) {
    t.pagato = false;
    daTaggareNonPagate++;
    dettaglioNonPagate.push({ date: t.date, amount: t.grossAmount ?? t.amount, description: t.description, category: t.category });
  } else {
    t.pagato = true;
    daTaggareGiaPagate++;
  }
}

console.log(`Transazioni da taggare "non pagata" (ancora aperte in PuntaNet): ${daTaggareNonPagate}`);
console.log(`Transazioni da taggare "pagata" (gia' risolte o movimenti bancari reali): ${daTaggareGiaPagate}`);
if (dettaglioNonPagate.length > 0) {
  console.log('\nDettaglio delle "non pagate" trovate:');
  for (const r of dettaglioNonPagate.sort((a, b) => b.amount - a.amount)) {
    console.log(`  ${r.date} — ${r.amount.toFixed(2)} € — ${r.description} — ${r.category}`);
  }
}

if (!SCRIVI) {
  console.log('\nNESSUNA scrittura — dry-run. Rilancia con --scrivi per applicare davvero.');
  process.exit(0);
}

if (daTaggareNonPagate === 0 && daTaggareGiaPagate === 0) {
  console.log('\nNulla da aggiornare.');
  process.exit(0);
}

fs.mkdirSync(BACKUP_DIR, { recursive: true });
const stamp = `${new Date().toISOString().slice(0, 10)}_${Date.now()}`;
const backupPath = path.join(BACKUP_DIR, `gv-cashflow_v2_PRE-backfill-pagato_${stamp}.gvcf`);
fs.copyFileSync(GVCF_PATH, backupPath);

const tmpPath = `${GVCF_PATH}.tmp_${process.pid}`;
fs.writeFileSync(tmpPath, JSON.stringify(gvData, null, 2));
fs.renameSync(tmpPath, GVCF_PATH);

console.log(`\n✔ Backfill completato. Backup pre-scrittura: ${backupPath}`);
