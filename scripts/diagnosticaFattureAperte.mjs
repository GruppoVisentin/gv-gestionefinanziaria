// Diagnostica SOLA LETTURA (nessuna scrittura) — richiesta dall'utente il 2026-10-26 dopo aver
// visto in app fatture di gennaio ancora segnate come da pagare: serve capire se sono genuinamente
// ancora aperte secondo PuntaNet (dato vero, es. cliente/fornitore lento a pagare) o se l'app mostra
// qualcosa che PuntaNet ha gia' chiuso (un buco di riconciliazione da correggere).
//
// Due verifiche indipendenti:
//
// A) Per le RATE del mese scelto: cosa dice PuntaNet OGGI ([Documenti Scadenze].Pagato) vs cosa
//    c'e' scritto nel file dell'app per la STESSA rata (via puntaNetIDDocumento/IDRata).
//
// B) Per le TRANSAZIONI dell'app datate nel mese scelto con pagato:false: controllo a livello di
//    DOCUMENTO (qualunque rata, qualunque mese), non solo sulla rata che la Verifica A vede in
//    questo mese. PuntaNet puo' "ristrutturare" le rate di una fattura dopo un pagamento parziale
//    (nuove rate con ID diversi, magari con una data fuori da questo mese): in quel caso la vecchia
//    rata sparisce semplicemente dal mese e la Verifica A da sola non la vede (stesso principio gia'
//    trovato per C.I. Coperture Innovative in importaPuntaNet.mjs).
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

if (!fs.existsSync(GVCF_PATH)) {
  console.log(`(file dati non trovato in ${GVCF_PATH} — salto i confronti con l'app)`);
  console.log(`\n=== Fine diagnostica ${meseStr}/${ANNO} ===`);
  process.exit(0);
}
const gvData = JSON.parse(fs.readFileSync(GVCF_PATH, 'utf8'));

// --- VERIFICA A: confronto con il file dati dell'app, rata per rata (vedi testata del file) ---
console.log('--- VERIFICA A: per ogni rata CHIUSA secondo PuntaNet, l\'app la segna correttamente come pagata? ---');
if (chiuse.length > 0) {
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
} else {
  console.log('(nessuna rata chiusa in questo mese da confrontare)');
}

// --- VERIFICA B: transazioni dell'app datate in questo mese e segnate "da pagare", controllate a
// livello di DOCUMENTO (qualunque rata, qualunque mese) — vedi nota in testata del file. ---
console.log(`\n--- VERIFICA B: transazioni dell'app datate ${meseStr}/${ANNO} e segnate "da pagare", verificate sul DOCUMENTO intero (qualunque rata/mese) ---`);
const nonPagateDelMese = gvData.transactions.filter(t =>
  t.date && t.date.startsWith(`${ANNO}-${meseStr}`) && t.pagato === false && t.puntaNetIDDocumento != null
);
if (nonPagateDelMese.length === 0) {
  console.log('Nessuna transazione trovata (nessuna con pagato:false e un documento PuntaNet collegato in questo mese).');
} else {
  const idDocumenti = [...new Set(nonPagateDelMese.map(t => t.puntaNetIDDocumento))];
  const scadenzeDocumenti = runSql(DB_IMPRESA, `SET NOCOUNT ON; SELECT ds.IDDocumento, ds.IDRata, ds.Pagato, ds.[Data Rata] AS DataRata, ds.[Importo Rata] AS Importo FROM [Documenti Scadenze] ds WHERE ds.IDDocumento IN (${idDocumenti.join(',')}) FOR JSON PATH`);
  for (const t of nonPagateDelMese) {
    const righeDoc = scadenzeDocumenti.filter(r => r.IDDocumento === t.puntaNetIDDocumento);
    const righeAperte = righeDoc.filter(r => r.Pagato === 0 || r.Pagato === false);
    if (righeDoc.length === 0) {
      console.log(`  ? documento ${t.puntaNetIDDocumento} non trovato in Documenti Scadenze — verificare a mano | ${t.description} | app: ${t.date}, ${t.amount}€`);
    } else if (righeAperte.length > 0) {
      console.log(`  ✓ genuinamente ancora aperta | ${t.description} | app: ${t.date}, ${t.amount}€ | PuntaNet: ${righeAperte.length} rata/e aperta/e (${righeAperte.map(r => `${r.DataRata.slice(0, 10)}: ${r.Importo}€`).join(', ')})`);
    } else {
      console.log(`  ⚠ PuntaNet la dice GIA' CHIUSA (tutte le rate pagate, forse ristrutturata) ma l'app la segna ancora "da pagare" — buco di riconciliazione | ${t.description} | app: ${t.date}, ${t.amount}€ | doc ${t.puntaNetIDDocumento}`);
    }
  }
}

console.log(`\n=== Fine diagnostica ${meseStr}/${ANNO} ===`);
