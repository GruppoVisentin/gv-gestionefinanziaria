// Script di estrazione + classificazione automatica movimenti PuntaNet (GRUPPO VISENTIN SRL).
// Legge dall'istanza SQL Server locale SQLEXPRESS (copia isolata, mai il database live PUNTANET),
// classifica categoria/cantiere con la stessa logica dell'app, e produce un report "dry run" —
// non scrive MAI nel file dati vero. Quello è un passo separato, deliberato, successivo.
//
// Uso: npx tsx scripts/importaPuntaNet.mjs
//
// Presuppone che GC_Impresa2_RO / GC_Comune_RO esistano già sull'istanza SQLEXPRESS
// (ripristinate dall'ultimo backup automatico di PuntaNet).

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  classificaRiga,
  mappaTipologiaACategoriaApp,
  inferisciTipoEntrata,
  estraiEntity,
} from '../utils/puntaNetImporter.ts';
import { CATEGORY_TO_CE_TYPE } from '../constants.ts';

const SQLCMD = String.raw`C:\Program Files\Microsoft SQL Server\Client SDK\ODBC\110\Tools\Binn\SQLCMD.EXE`;
const INSTANCE = String.raw`localhost\SQLEXPRESS`;
const DB_IMPRESA = 'GC_Impresa2_RO'; // GRUPPO VISENTIN SRL
const DB_COMUNE = 'GC_Comune_RO';
const DATA_INIZIO = '2026-01-01'; // procedure automatiche partono dal 2026, mai prima

const NAS_DATI = String.raw`\\NAS\Ufficio Tecnico\GRUPPO VISENTIN\00_GESTIONE GV\35_APP GV ECOSISTEM\04-GV GestioneFINANZIARIA\DATI SALVATI`;
const GVCF_PATH = path.join(NAS_DATI, 'gv-cashflow.gvcf');
const REGOLE_PATH = path.join(NAS_DATI, 'gv-regole.json');

// ─── Helper: esegue una query SQL e ritorna il risultato come oggetto JS ──────
function runSql(database, query) {
  const tmpFile = path.join(os.tmpdir(), `sqlout_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
  try {
    execFileSync(SQLCMD, ['-S', INSTANCE, '-d', database, '-E', '-y', '0', '-Q', query, '-o', tmpFile], { stdio: 'pipe' });
    if (!fs.existsSync(tmpFile)) return [];
    const raw = fs.readFileSync(tmpFile, 'utf16le').replace(/\r?\n/g, '').trim();
    // sqlcmd puo' scrivere in utf16le o utf8 a seconda della configurazione locale; se il parse fallisce, ritenta come utf8
    try {
      return raw ? JSON.parse(raw) : [];
    } catch {
      const raw8 = fs.readFileSync(tmpFile, 'utf8').replace(/\r?\n/g, '').trim();
      return raw8 ? JSON.parse(raw8) : [];
    }
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
}

console.log(`=== Estrazione PuntaNet — GRUPPO VISENTIN SRL — da ${DATA_INIZIO} ===\n`);

// ─── Dati app: progetti (mappa cantiere) e transazioni esistenti (dedup) ──────
const gvData = JSON.parse(fs.readFileSync(GVCF_PATH, 'utf8'));
const cantiereToProject = new Map();
const projectMeta = new Map();
for (const p of gvData.projects) {
  if (p.puntaNetCantiereId != null) cantiereToProject.set(p.puntaNetCantiereId, p.name);
  projectMeta.set(p.name, p);
}
const regolePuntaNet = fs.existsSync(REGOLE_PATH) ? JSON.parse(fs.readFileSync(REGOLE_PATH, 'utf8')).regolePuntaNet : [];

const esistentiKey = new Set();
for (const t of gvData.transactions) {
  if (t.puntaNetIDDocumento != null && t.puntaNetIDRata != null) {
    esistentiKey.add(`${t.puntaNetIDDocumento}|${t.puntaNetIDRata}`);
  }
}
console.log(`Transazioni esistenti con riferimento PuntaNet tracciato: ${esistentiKey.size}`);
console.log(`(Le transazioni importate prima di oggi non hanno questo riferimento — al primo giro risulterà tutto "nuovo": è atteso, non un errore.)\n`);

function dominante(map, idDoc) {
  const m = map.get(idDoc);
  if (!m || m.size === 0) return null;
  let best = null, bestVal = -Infinity;
  for (const [k, v] of m) if (v > bestVal) { best = k; bestVal = v; }
  return best;
}

function calcolaVatRate(imponibile, imposte) {
  if (!(imponibile > 0)) return 0;
  const percent = Math.round((imposte / imponibile) * 100);
  if (percent >= 20) return 22; if (percent >= 8) return 10; if (percent >= 3) return 4; return 0;
}

// ─── USCITE (FEP, Tipo=1) ──────────────────────────────────────────────────
console.log('--- Uscite (FEP) ---');
const scadenzeUscite = runSql(DB_IMPRESA, `SET NOCOUNT ON; SELECT d.IDDocumento, ds.IDRata, ds.[Data Rata] AS DataRata, ds.[Importo Rata] AS ImportoRata, ds.Pagato, d.Imponibile, d.Imposte, d.Totale, cf.[Ragione Sociale] AS Fornitore FROM [Documenti Scadenze] ds JOIN Documenti d ON d.IDDocumento = ds.IDDocumento LEFT JOIN [Clienti Fornitori] cf ON cf.IDCliFor = d.IDCliFor WHERE d.Tipo = 1 AND ds.[Data Rata] >= '${DATA_INIZIO}' FOR JSON PATH`);
const docCantiereU = runSql(DB_IMPRESA, `SET NOCOUNT ON; SELECT dic.IDDocumento, dic.IDCantiere, dic.Imponibile FROM [Documenti Imponibili Cantiere] dic WHERE dic.IDDocumento IN (SELECT d.IDDocumento FROM Documenti d JOIN [Documenti Scadenze] ds ON ds.IDDocumento = d.IDDocumento WHERE d.Tipo = 1 AND ds.[Data Rata] >= '${DATA_INIZIO}') FOR JSON PATH`);
const docTipologiaU = runSql(DB_IMPRESA, `SET NOCOUNT ON; SELECT da.IDDocumento, da.Prezzo, da.Qta, tv.Tipologia FROM [Documenti Articoli] da LEFT JOIN ${DB_COMUNE}.dbo.[TAB_Tipi Voci] tv ON tv.IDTipologia = da.IDTipologia WHERE da.IDDocumento IN (SELECT d.IDDocumento FROM Documenti d JOIN [Documenti Scadenze] ds ON ds.IDDocumento = d.IDDocumento WHERE d.Tipo = 1 AND ds.[Data Rata] >= '${DATA_INIZIO}') FOR JSON PATH`);

const cantierePerDocU = new Map();
for (const r of docCantiereU) {
  const cur = cantierePerDocU.get(r.IDDocumento);
  if (!cur || r.Imponibile > cur.somma) cantierePerDocU.set(r.IDDocumento, { IDCantiere: r.IDCantiere, somma: r.Imponibile });
}
const tipologiaPerDoc = new Map();
for (const r of docTipologiaU) {
  if (!r.Tipologia) continue;
  const importo = (r.Prezzo || 0) * (r.Qta || 1);
  if (!tipologiaPerDoc.has(r.IDDocumento)) tipologiaPerDoc.set(r.IDDocumento, new Map());
  const m = tipologiaPerDoc.get(r.IDDocumento);
  m.set(r.Tipologia, (m.get(r.Tipologia) || 0) + importo);
}

const nuoveUscite = [];
for (const s of scadenzeUscite) {
  const key = `${s.IDDocumento}|${s.IDRata}`;
  if (esistentiKey.has(key)) continue; // già importata, salta

  const tipologia = dominante(tipologiaPerDoc, s.IDDocumento);
  let categoria = tipologia ? mappaTipologiaACategoriaApp(tipologia, 'FEP') : null;
  let ceType = categoria ? (CATEGORY_TO_CE_TYPE[categoria] ?? 'costo_variabile') : null;
  let confidenza = categoria ? 'alta' : null;

  if (!categoria && s.Fornitore) {
    // fallback: classificaRiga sul nome fornitore (pattern bancari + regole apprese)
    const riga = { data: new Date(s.DataRata), descrizione: s.Fornitore, entity: s.Fornitore, importo: s.ImportoRata, tipo: 'EXPENSE', flagConto: 'B', tipoMovimento: 'FEP' };
    const cls = classificaRiga(riga, regolePuntaNet);
    if (cls.categoria) { categoria = cls.categoria; ceType = cls.ceType; confidenza = cls.confidenza; }
  }

  const cantiereInfo = cantierePerDocU.get(s.IDDocumento);
  const idCantiere = cantiereInfo ? cantiereInfo.IDCantiere : null;
  const progettoApp = idCantiere != null ? cantiereToProject.get(idCantiere) : undefined; // undefined = generale, atteso

  nuoveUscite.push({
    date: s.DataRata.slice(0, 10),
    amount: s.Imponibile > 0 ? Math.round((s.ImportoRata / s.Totale) * s.Imponibile * 100) / 100 : s.ImportoRata,
    grossAmount: s.ImportoRata,
    vatRate: calcolaVatRate(s.Imponibile, s.Imposte),
    type: 'EXPENSE',
    category: categoria,
    description: s.Fornitore || '(fornitore non specificato)',
    project: progettoApp,
    ceType,
    confidenza,
    puntaNetIDDocumento: s.IDDocumento,
    puntaNetIDRata: s.IDRata,
  });
}

console.log(`Nuove rate uscite (non ancora in gv-cashflow.gvcf): ${nuoveUscite.length}`);
const usciteConCategoria = nuoveUscite.filter(t => t.category);
console.log(`Con categoria: ${usciteConCategoria.length}/${nuoveUscite.length}`);
console.log(`Con cantiere specifico: ${nuoveUscite.filter(t => t.project).length}/${nuoveUscite.length}\n`);

// ─── ENTRATE (FEA, Tipo=0) ─────────────────────────────────────────────────
console.log('--- Entrate (FEA) ---');
const scadenzeEntrate = runSql(DB_IMPRESA, `SET NOCOUNT ON; SELECT d.IDDocumento, ds.IDRata, ds.[Data Rata] AS DataRata, ds.[Importo Rata] AS ImportoRata, ds.Pagato, d.Imponibile, d.Imposte, d.Totale, cf.[Ragione Sociale] AS Cliente FROM [Documenti Scadenze] ds JOIN Documenti d ON d.IDDocumento = ds.IDDocumento LEFT JOIN [Clienti Fornitori] cf ON cf.IDCliFor = d.IDCliFor WHERE d.Tipo = 0 AND ds.[Data Rata] >= '${DATA_INIZIO}' FOR JSON PATH`);
const docCantiereE = runSql(DB_IMPRESA, `SET NOCOUNT ON; SELECT dic.IDDocumento, dic.IDCantiere, dic.Imponibile FROM [Documenti Imponibili Cantiere] dic WHERE dic.IDDocumento IN (SELECT d.IDDocumento FROM Documenti d JOIN [Documenti Scadenze] ds ON ds.IDDocumento = d.IDDocumento WHERE d.Tipo = 0 AND ds.[Data Rata] >= '${DATA_INIZIO}') FOR JSON PATH`);
const docDescrizioniE = runSql(DB_IMPRESA, `SET NOCOUNT ON; SELECT da.IDDocumento, da.Descrizione FROM [Documenti Articoli] da WHERE da.IDDocumento IN (SELECT d.IDDocumento FROM Documenti d JOIN [Documenti Scadenze] ds ON ds.IDDocumento = d.IDDocumento WHERE d.Tipo = 0 AND ds.[Data Rata] >= '${DATA_INIZIO}') FOR JSON PATH`);

const cantierePerDocE = new Map();
for (const r of docCantiereE) {
  const cur = cantierePerDocE.get(r.IDDocumento);
  if (!cur || r.Imponibile > cur.somma) cantierePerDocE.set(r.IDDocumento, { IDCantiere: r.IDCantiere, somma: r.Imponibile });
}
const descPerDoc = new Map();
for (const r of docDescrizioniE) {
  descPerDoc.set(r.IDDocumento, (descPerDoc.get(r.IDDocumento) || '') + ' ' + (r.Descrizione || ''));
}
const MAPPING_ENTRATA = {
  sal:      { categoria: '[CANTIERE] SAL — Stato Avanzamento Lavori', ceType: 'ricavo_core' },
  acconto:  { categoria: '[CANTIERE] Anticipi da Clienti su Commessa', ceType: 'solo_cashflow' },
  saldo:    { categoria: '[CANTIERE] Saldo Finale Commessa', ceType: 'ricavo_core' },
  immobile: { categoria: '[IMMOBILIARE] Vendita Immobili e Terreni', ceType: 'ricavo_immobiliare' },
  altro:    { categoria: '[CANTIERE] Manutenzioni e Piccoli Lavori', ceType: 'ricavo_altro' },
};

const nuoveEntrate = [];
for (const s of scadenzeEntrate) {
  const key = `${s.IDDocumento}|${s.IDRata}`;
  if (esistentiKey.has(key)) continue;

  const desc = descPerDoc.get(s.IDDocumento) || '';
  let tipoEntrata = inferisciTipoEntrata(desc);
  const cantiereInfo = cantierePerDocE.get(s.IDDocumento);
  const idCantiere = cantiereInfo ? cantiereInfo.IDCantiere : null;
  const progettoApp = idCantiere != null ? cantiereToProject.get(idCantiere) : undefined;

  if (!tipoEntrata && progettoApp) {
    const meta = projectMeta.get(progettoApp);
    if (meta?.metodoPagamento) tipoEntrata = meta.metodoPagamento;
  }
  const mapped = tipoEntrata ? MAPPING_ENTRATA[tipoEntrata] : null;

  nuoveEntrate.push({
    date: s.DataRata.slice(0, 10),
    amount: s.Imponibile > 0 ? Math.round((s.ImportoRata / s.Totale) * s.Imponibile * 100) / 100 : s.ImportoRata,
    grossAmount: s.ImportoRata,
    vatRate: calcolaVatRate(s.Imponibile, s.Imposte),
    type: 'INCOME',
    category: mapped?.categoria ?? null,
    description: s.Cliente || '(cliente non specificato)',
    project: progettoApp,
    ceType: mapped?.ceType ?? null,
    puntaNetIDDocumento: s.IDDocumento,
    puntaNetIDRata: s.IDRata,
  });
}

console.log(`Nuove rate entrate (non ancora in gv-cashflow.gvcf): ${nuoveEntrate.length}`);
const entrateConCategoria = nuoveEntrate.filter(t => t.category);
console.log(`Con categoria: ${entrateConCategoria.length}/${nuoveEntrate.length}`);
console.log(`Con cantiere specifico: ${nuoveEntrate.filter(t => t.project).length}/${nuoveEntrate.length}\n`);

// ─── Output dry-run ─────────────────────────────────────────────────────────
const reportPath = path.join(NAS_DATI, 'AUTO', `dryrun_${new Date().toISOString().slice(0,10)}.json`);
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify({ uscite: nuoveUscite, entrate: nuoveEntrate }, null, 2));
console.log(`=== Report dry-run salvato in: ${reportPath} ===`);
console.log('NESSUNA scrittura sul file dati vero — questo script legge e classifica soltanto.');
