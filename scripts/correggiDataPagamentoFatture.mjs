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
//
//   1. Si cerca PRIMA un riscontro bancario pulito (un solo movimento, stesso documento/verso/
//      importo — l'importo viene filtrato PRIMA di richiedere unicita', cosi' una fattura pagata in
//      piu' rate di importo diverso non risulta "ambigua" solo perche' il documento ha piu' di un
//      movimento collegato): se trovato, la riga viene RICONCILIATA (data spostata al pagamento
//      reale, puntaNetIDMovimento agganciato) — sempre, indipendentemente da cosa risulta ancora
//      aperto sul documento. Questo e' l'unico modo per non confondere una fattura con piu' rate
//      ordinarie (una pagata, una no — gia' corretta dal vecchio codice) con una fattura davvero
//      ristrutturata (trovato in review: Codex, 2026-10-21).
//   2. Solo se NON si trova un riscontro bancario pulito, si controlla lo stato ESATTO della
//      singola rata originale (IDDocumento+IDRata) oggi su PuntaNet — non "il documento ha ancora
//      qualche rata aperta" (troppo impreciso: confonderebbe un'altra rata ordinaria ancora da
//      pagare con una ristrutturazione), ma la rata SPECIFICA che questa riga rappresenta:
//        - la rata esiste ancora ed e' Pagato=0 → prova diretta che e' ancora aperta: riportata a
//          `pagato:false` (data invariata);
//        - la rata esiste ancora ed e' Pagato=1 → combacia gia' con l'app, nessuna modifica;
//        - la rata non esiste piu' (sostituita da PuntaNet con rate nuove) → non c'e' modo di
//          sapere con certezza cosa e' successo a questo importo: nessuna modifica, segnalata come
//          AMBIGUA per revisione manuale (es. C.I. Coperture).
//
// Esclude dai movimenti candidati anche quelli gia' in coda in bozzaImportPuntaNet (non solo quelli
// gia' in transactions): altrimenti questo script potrebbe agganciare un movimento gia' proposto in
// bozza, e una successiva conferma manuale di quella bozza creerebbe un duplicato (trovato in
// review: Codex, 2026-10-21). Valida anche l'anno della data di riconciliazione (stesso controllo
// anti-corruzione di importaPuntaNet.mjs) prima di scriverla.
//
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
const ANNO_MIN = Number(DATA_INIZIO.slice(0, 4));
const ANNO_MAX = new Date().getUTCFullYear() + 1;

const NAS_DATI = String.raw`\\NAS\Ufficio Tecnico\GRUPPO VISENTIN\00_GESTIONE GV\35_APP GV ECOSISTEM\04-GV GestioneFINANZIARIA\DATI SALVATI`;
const GVCF_PATH = path.join(NAS_DATI, 'gv-cashflow_v2-import-puntanet-automatico.gvcf');
const BACKUP_DIR = path.join(NAS_DATI, 'BACKUP');

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
function importoLordoTx(t) {
  if (typeof t.grossAmount === 'number') return t.grossAmount;
  const vat = t.vatRate || 0;
  return (t.amount || 0) * (1 + vat / 100);
}
function importoMovimento(mv) { return mv.ImportoE > 0 ? mv.ImportoE : mv.ImportoU; }
function dataPlausibile(dataISO) {
  const anno = Number(dataISO.slice(0, 4));
  return Number.isFinite(anno) && anno >= ANNO_MIN && anno <= ANNO_MAX;
}

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

const gvData = JSON.parse(fs.readFileSync(GVCF_PATH, 'utf8'));

// Righe candidate: scritte come scadenza, gia' marcate pagate, mai riconciliate dal nuovo codice.
function candidate(transactions) {
  return transactions.filter(t => t.pagato === true && t.puntaNetIDDocumento != null && t.puntaNetIDRata != null && t.puntaNetIDMovimento == null);
}
const idDocumentiCoinvolti = [...new Set(candidate(gvData.transactions).map(t => t.puntaNetIDDocumento))];
console.log(`Righe candidate (pagato:true, mai riconciliate): ${candidate(gvData.transactions).length} su ${idDocumentiCoinvolti.length} documenti.\n`);

if (idDocumentiCoinvolti.length === 0) {
  console.log('Nulla da controllare — nessuna riga candidata.');
  process.exit(0);
}

console.log('--- Stato ESATTO di ogni rata (non solo "qualche rata aperta") per i documenti coinvolti ---');
const scadenzeTutte = runSql(DB_IMPRESA, `SET NOCOUNT ON; SELECT ds.IDDocumento, ds.IDRata, ds.Pagato FROM [Documenti Scadenze] ds JOIN Documenti d ON d.IDDocumento = ds.IDDocumento WHERE d.Tipo IN (0,1,2,3) AND ds.IDDocumento IN (${idDocumentiCoinvolti.join(',')}) FOR JSON PATH`);
const statoRata = new Map(scadenzeTutte.map(s => [`${s.IDDocumento}|${s.IDRata}`, s.Pagato]));
console.log(`Rate trovate su PuntaNet per questi documenti: ${scadenzeTutte.length}\n`);

console.log('--- Movimenti bancari (Conti Movimenti), per riconciliazione ---');
const movimenti = runSql(DB_IMPRESA, `SET NOCOUNT ON; SELECT IDMovimento, Data, IDDocumento, IDRata, ImportoE, ImportoU FROM [Conti Movimenti] WHERE Data >= '${DATA_INIZIO}' AND (ImportoE > 0 OR ImportoU > 0) FOR JSON PATH`);
console.log(`Movimenti trovati: ${movimenti.length}\n`);

// Calcola gli aggiornamenti da fare su un dato array di transazioni (usata sia per l'anteprima
// dry-run sul primo read, sia — se --scrivi — su una rilettura fresca subito prima di scrivere).
function calcolaAggiornamenti(transactions, bozzaImportPuntaNet) {
  const esistentiKeyMovimento = new Set();
  for (const t of transactions) if (t.puntaNetIDMovimento != null) esistentiKeyMovimento.add(t.puntaNetIDMovimento);
  // Movimenti gia' proposti in bozza (in attesa di conferma manuale in app): escluderli, altrimenti
  // questo script potrebbe agganciarli qui E lasciarli anche in bozza, creando un doppione quando
  // la bozza viene poi confermata (trovato in review: Codex, 2026-10-21).
  for (const b of (bozzaImportPuntaNet || [])) {
    if (b._puntaNetKey?.startsWith('mov:')) esistentiKeyMovimento.add(Number(b._puntaNetKey.slice(4)));
  }

  const riconciliati = [];
  const riportatiAperti = [];
  const ambigui = [];
  const movimentiUsati = new Set();

  for (const t of candidate(transactions)) {
    const importoAtteso = importoLordoTx(t);
    // 1. Riscontro bancario: filtra PRIMA per importo, poi richiede unicita' — cosi' una fattura
    // con piu' movimenti collegati allo stesso documento ma importi diversi non risulta ambigua
    // solo perche' ce ne sono piu' di uno (trovato in review: Codex, 2026-10-21). Nessun vincolo
    // sulla data rispetto alla scadenza: un pagamento anticipato e' legittimo (trovato in review:
    // Codex, 2026-10-21) — la plausibilita' della data si controlla a parte, sotto.
    const candidati = movimenti.filter(mv =>
      mv.IDDocumento === t.puntaNetIDDocumento
      && !esistentiKeyMovimento.has(mv.IDMovimento)
      && !movimentiUsati.has(mv.IDMovimento)
      && ((t.type === 'INCOME' && mv.ImportoE > 0) || (t.type === 'EXPENSE' && mv.ImportoU > 0))
      && Math.abs(importoMovimento(mv) - importoAtteso) < 0.5
    );

    if (candidati.length === 1 && dataPlausibile(candidati[0].Data.slice(0, 10))) {
      const match = candidati[0];
      movimentiUsati.add(match.IDMovimento);
      riconciliati.push({
        id: t.id, idDocumento: t.puntaNetIDDocumento, amount: importoAtteso, description: t.description,
        dataVecchia: t.date, dataNuova: match.Data.slice(0, 10),
        puntaNetIDMovimento: match.IDMovimento, puntaNetIDRata: match.IDRata ?? t.puntaNetIDRata,
      });
      continue;
    }

    // 2. Nessun riscontro bancario pulito: guarda lo stato ESATTO della rata originale (non
    // l'aggregato per documento, che confonderebbe un'altra rata ordinaria ancora da pagare con una
    // ristrutturazione — trovato in review: Codex, 2026-10-21).
    const pagatoOraSuPuntaNet = statoRata.get(`${t.puntaNetIDDocumento}|${t.puntaNetIDRata}`);
    if (pagatoOraSuPuntaNet === 0) {
      riportatiAperti.push({ id: t.id, idDocumento: t.puntaNetIDDocumento, date: t.date, amount: importoAtteso, description: t.description });
    } else if (pagatoOraSuPuntaNet === 1) {
      continue; // gia' corretto cosi', nessuna modifica necessaria
    } else {
      // la rata non esiste piu' su PuntaNet (sostituita da rate nuove) — non si puo' stabilire con
      // certezza cosa sia successo a questo importo specifico: nessuna modifica, solo segnalazione.
      ambigui.push({ id: t.id, idDocumento: t.puntaNetIDDocumento, date: t.date, amount: importoAtteso, description: t.description, candidatiBancari: candidati.length });
    }
  }
  return { riconciliati, riportatiAperti, ambigui };
}

const { riconciliati, riportatiAperti, ambigui } = calcolaAggiornamenti(gvData.transactions, gvData.bozzaImportPuntaNet);

console.log(`Fatture da RICONCILIARE (data spostata al pagamento reale): ${riconciliati.length}`);
for (const r of riconciliati.sort((a, b) => b.amount - a.amount)) {
  console.log(`  [${r.id?.slice(0, 8)}] ${r.dataVecchia} → ${r.dataNuova} — ${r.amount.toFixed(2)} € — "${r.description}" (IDDocumento ${r.idDocumento})`);
}
console.log(`\nFatture da RIPORTARE a "non pagata" (questa rata esatta risulta ancora Pagato=0 su PuntaNet oggi): ${riportatiAperti.length}`);
for (const r of riportatiAperti.sort((a, b) => b.amount - a.amount)) {
  console.log(`  [${r.id?.slice(0, 8)}] ${r.date} — ${r.amount.toFixed(2)} € — "${r.description}" (IDDocumento ${r.idDocumento})`);
}
console.log(`\nFatture AMBIGUE (la rata originale non esiste piu' su PuntaNet, nessun riscontro bancario pulito — da decidere a mano, NESSUNA modifica): ${ambigui.length}`);
for (const r of ambigui.sort((a, b) => b.amount - a.amount)) {
  console.log(`  [${r.id?.slice(0, 8)}] ${r.date} — ${r.amount.toFixed(2)} € — "${r.description}" (IDDocumento ${r.idDocumento}, ${r.candidatiBancari} movimenti candidati per importo)`);
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
const fresco = calcolaAggiornamenti(gvDataFresh.transactions, gvDataFresh.bozzaImportPuntaNet);
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
