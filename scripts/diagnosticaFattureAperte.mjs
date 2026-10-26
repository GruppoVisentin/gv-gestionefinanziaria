// Diagnostica SOLA LETTURA (nessuna scrittura) — richiesta dall'utente il 2026-10-26 dopo aver
// visto in app fatture di gennaio ancora segnate come da pagare: serve capire se sono genuinamente
// ancora aperte secondo PuntaNet (dato vero, es. cliente/fornitore lento a pagare) o se l'app mostra
// qualcosa che PuntaNet ha gia' chiuso (un buco di riconciliazione da correggere).
//
// Confronta, per le rate di un mese/anno a scelta:
//   A) cosa dice PuntaNet OGGI (fonte di verita': [Documenti Scadenze].Pagato)
//   B) cosa c'e' scritto nel file dati dell'app per la STESSA rata (via puntaNetIDDocumento/IDRata)
// Una riga "PuntaNet dice pagato, app dice NON pagato" e' il sintomo di un buco di riconciliazione.
// Una riga "PuntaNet dice NON pagato" e' semplicemente ancora da pagare per davvero.
//
// Uso: npx tsx scripts/diagnosticaFattureAperte.mjs [anno] [mese]
//   anno: default anno corrente, mese: 1-12, default mese corrente

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const SQLCMD = String.raw`C:\Program Files\Microsoft SQL Server\Client SDK\ODBC\110\Tools\Binn\SQLCMD.EXE`;
const INSTANCE = String.raw`localhost\SQLEXPRESS`;
const DB_IMPRESA = 'GC_Impresa2_RO';

const NAS_DATI = String.raw`\\NAS\Ufficio Tecnico\GRUPPO VISENTIN\00_GESTIONE GV\35_APP GV ECOSISTEM\04-GV GestioneFINANZIARIA\DATI SALVATI`;
const GVCF_PATH = path.join(NAS_DATI, 'gv-cashflow_v2-import-puntanet-automatico.gvcf');

const oggi = new Date();
const ANNO = Number(process.argv[2]) || oggi.getFullYear();
const MESE = Number(process.argv[3]) || (oggi.getMonth() + 1); // 1-12

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

const meseStr = String(MESE).padStart(2, '0');
const dataInizio = `${ANNO}-${meseStr}-01`;
const meseSuccessivo = MESE === 12 ? `${ANNO + 1}-01-01` : `${ANNO}-${String(MESE + 1).padStart(2, '0')}-01`;

console.log(`=== Diagnostica fatture — ${meseStr}/${ANNO} (sola lettura) ===\n`);

// Tutte le rate del mese scelto, qualunque sia oggi il loro stato Pagato (non solo quelle aperte):
// cosi' vediamo sia quelle ancora aperte sia quelle gia' chiuse, per il confronto con l'app.
const rate = runSql(DB_IMPRESA, `SET NOCOUNT ON; SELECT d.IDDocumento, d.Tipo, ds.IDRata, ds.Pagato, ds.[Data Rata] AS DataRata, ds.[Importo Rata] AS Importo, cf.[Ragione Sociale] AS Controparte FROM [Documenti Scadenze] ds JOIN Documenti d ON d.IDDocumento = ds.IDDocumento LEFT JOIN [Clienti Fornitori] cf ON cf.IDCliFor = d.IDCliFor WHERE ds.[Data Rata] >= '${dataInizio}' AND ds.[Data Rata] < '${meseSuccessivo}' AND d.Tipo IN (0,1,2,3) ORDER BY ds.Pagato, ds.[Data Rata] FOR JSON PATH`);

const aperte = rate.filter(r => r.Pagato === 0 || r.Pagato === false);
const chiuse = rate.filter(r => r.Pagato === 1 || r.Pagato === true);

console.log(`Rate totali nel mese: ${rate.length} (${aperte.length} ancora aperte secondo PuntaNet, ${chiuse.length} gia' pagate secondo PuntaNet)\n`);

if (aperte.length > 0) {
  console.log('--- ANCORA APERTE secondo PuntaNet (dato vero: nessuno le ha ancora pagate/incassate) ---');
  for (const r of aperte) {
    console.log(`  ${r.DataRata.slice(0, 10)} | ${r.Importo.toFixed(2).padStart(10)} €  | ${r.Controparte || '(senza nome)'}  | doc ${r.IDDocumento} rata ${r.IDRata}`);
  }
  console.log('');
}

// Confronto con il file dati dell'app: per ogni rata CHIUSA secondo PuntaNet, l'app la segna
// correttamente come pagata? Una rata chiusa in PuntaNet ma ancora "pagato:false" nel file e'
// un buco di riconciliazione (bug), non un dato vero.
if (chiuse.length > 0 && fs.existsSync(GVCF_PATH)) {
  const gvData = JSON.parse(fs.readFileSync(GVCF_PATH, 'utf8'));
  const perChiave = new Map();
  for (const t of gvData.transactions) {
    if (t.puntaNetIDDocumento != null && t.puntaNetIDRata != null) {
      perChiave.set(`${t.puntaNetIDDocumento}|${t.puntaNetIDRata}`, t);
    }
  }
  const disallineate = [];
  for (const r of chiuse) {
    const chiave = `${r.IDDocumento}|${r.IDRata}`;
    const tx = perChiave.get(chiave);
    if (tx && tx.pagato === false) {
      disallineate.push({ r, tx });
    }
  }
  if (disallineate.length > 0) {
    console.log(`⚠ ${disallineate.length} rate che PuntaNet dice GIA' PAGATE, ma l'app segna ancora "da pagare" (buco di riconciliazione, non dato vero):`);
    for (const { r, tx } of disallineate) {
      console.log(`  ${r.DataRata.slice(0, 10)} | ${r.Importo.toFixed(2).padStart(10)} €  | ${r.Controparte || '(senza nome)'}  | doc ${r.IDDocumento} rata ${r.IDRata} | nell'app alla data ${tx.date}`);
    }
  } else {
    console.log('Nessuna rata disallineata trovata: tutte le rate che PuntaNet dice pagate sono segnate pagate anche nell\'app.');
  }
} else if (!fs.existsSync(GVCF_PATH)) {
  console.log(`(file dati non trovato in ${GVCF_PATH} — salto il confronto con l'app)`);
}

console.log(`\n=== Fine diagnostica ${meseStr}/${ANNO} ===`);
