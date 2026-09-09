// Test di validazione v2: architettura corretta.
// - CONSUNTIVO: da Conti Movimenti (tutto cio' che e' davvero successo in banca), arricchito
//   con Documenti/Cantiere/Tipologia quando c'e' un documento collegato, altrimenti classificaRiga
//   (mutui, tasse, stipendi diretti, spese bancarie...).
// - PREVISIONE: da Documenti Scadenze con Pagato=0 (rate non ancora pagate).
// Scrive su una COPIA separata del file dati — mai il file vero.
// REGOLA ASSOLUTA: le previsioni gia' presenti nel file (inserite manualmente) non vengono
// MAI modificate ne' toccate — solo lette, per eventuale collegamento (linkedForecastId) su
// una riga NUOVA di consuntivo. Nessuna riga esistente viene scritta o alterata.

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import {
  classificaRiga,
  mappaTipologiaACategoriaApp,
  inferisciTipoEntrata,
  estraiEntity,
} from '../utils/puntaNetImporter.ts';
import { CATEGORY_TO_CE_TYPE } from '../constants.ts';

const SQLCMD = String.raw`C:\Program Files\Microsoft SQL Server\Client SDK\ODBC\110\Tools\Binn\SQLCMD.EXE`;
const INSTANCE = String.raw`localhost\SQLEXPRESS`;
const DB_IMPRESA = 'GC_Impresa2_RO';
const DB_COMUNE = 'GC_Comune_RO';
const DATA_INIZIO = '2026-01-01';

const NAS_DATI = String.raw`\\NAS\Ufficio Tecnico\GRUPPO VISENTIN\00_GESTIONE GV\35_APP GV ECOSISTEM\04-GV GestioneFINANZIARIA\DATI SALVATI`;
const GVCF_PATH = path.join(NAS_DATI, 'gv-cashflow.gvcf');
const REGOLE_PATH = path.join(NAS_DATI, 'gv-regole.json');
const TEST_OUTPUT = path.join(NAS_DATI, 'AUTO', 'TEST_gv-cashflow_confronto2026.gvcf');

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
function dominante(map, idDoc) {
  const m = map.get(idDoc);
  if (!m || m.size === 0) return null;
  let best = null, bestVal = -Infinity;
  for (const [k, v] of m) if (v > bestVal) { best = k; bestVal = v; }
  return best;
}
function calcolaVatRate(imponibile, imposte) {
  if (!(imponibile > 0)) return null;
  const percent = Math.round((imposte / imponibile) * 100);
  if (percent >= 20) return 22; if (percent >= 8) return 10; if (percent >= 3) return 4; return 0;
}

console.log(`=== TEST v2 confronto import 2026 (GRUPPO VISENTIN SRL) — NON tocca il file vero ===\n`);

const gvData = JSON.parse(fs.readFileSync(GVCF_PATH, 'utf8'));
const cantiereToProject = new Map();
const projectMeta = new Map();
for (const p of gvData.projects) {
  if (p.puntaNetCantiereId != null) cantiereToProject.set(p.puntaNetCantiereId, p.name);
  projectMeta.set(p.name, p);
}
const regolePuntaNet = fs.existsSync(REGOLE_PATH) ? JSON.parse(fs.readFileSync(REGOLE_PATH, 'utf8')).regolePuntaNet : [];
// Previsioni ESISTENTI: solo lette per eventuale collegamento, mai modificate.
const previsioniEsistenti = gvData.transactions.filter(t => t.isForecast);

// ─── Dati arricchimento fattura (uscite: tipologia; entrate: descrizione), per TUTTO il 2026 ──
const docCantiereU = runSql(DB_IMPRESA, `SET NOCOUNT ON; SELECT dic.IDDocumento, dic.IDCantiere, dic.Imponibile FROM [Documenti Imponibili Cantiere] dic JOIN Documenti d ON d.IDDocumento = dic.IDDocumento WHERE d.Tipo = 1 AND d.Data >= '2025-06-01' FOR JSON PATH`);
const docTipologiaU = runSql(DB_IMPRESA, `SET NOCOUNT ON; SELECT da.IDDocumento, da.Prezzo, da.Qta, tv.Tipologia FROM [Documenti Articoli] da JOIN Documenti d ON d.IDDocumento = da.IDDocumento LEFT JOIN ${DB_COMUNE}.dbo.[TAB_Tipi Voci] tv ON tv.IDTipologia = da.IDTipologia WHERE d.Tipo = 1 AND d.Data >= '2025-06-01' FOR JSON PATH`);
const docCantiereE = runSql(DB_IMPRESA, `SET NOCOUNT ON; SELECT dic.IDDocumento, dic.IDCantiere, dic.Imponibile FROM [Documenti Imponibili Cantiere] dic JOIN Documenti d ON d.IDDocumento = dic.IDDocumento WHERE d.Tipo = 0 AND d.Data >= '2025-06-01' FOR JSON PATH`);
const docDescrizioniE = runSql(DB_IMPRESA, `SET NOCOUNT ON; SELECT da.IDDocumento, da.Descrizione FROM [Documenti Articoli] da JOIN Documenti d ON d.IDDocumento = da.IDDocumento WHERE d.Tipo = 0 AND d.Data >= '2025-06-01' FOR JSON PATH`);
const docHeader = runSql(DB_IMPRESA, `SET NOCOUNT ON; SELECT IDDocumento, Imponibile, Imposte, Totale FROM Documenti WHERE Data >= '2025-06-01' FOR JSON PATH`);

const cantierePerDocU = new Map();
for (const r of docCantiereU) { const c = cantierePerDocU.get(r.IDDocumento); if (!c || r.Imponibile > c.somma) cantierePerDocU.set(r.IDDocumento, { IDCantiere: r.IDCantiere, somma: r.Imponibile }); }
const cantierePerDocE = new Map();
for (const r of docCantiereE) { const c = cantierePerDocE.get(r.IDDocumento); if (!c || r.Imponibile > c.somma) cantierePerDocE.set(r.IDDocumento, { IDCantiere: r.IDCantiere, somma: r.Imponibile }); }
const tipologiaPerDoc = new Map();
for (const r of docTipologiaU) {
  if (!r.Tipologia) continue;
  const importo = (r.Prezzo || 0) * (r.Qta || 1);
  if (!tipologiaPerDoc.has(r.IDDocumento)) tipologiaPerDoc.set(r.IDDocumento, new Map());
  const m = tipologiaPerDoc.get(r.IDDocumento);
  m.set(r.Tipologia, (m.get(r.Tipologia) || 0) + importo);
}
const descPerDoc = new Map();
for (const r of docDescrizioniE) descPerDoc.set(r.IDDocumento, (descPerDoc.get(r.IDDocumento) || '') + ' ' + (r.Descrizione || ''));
const headerPerDoc = new Map();
for (const r of docHeader) headerPerDoc.set(r.IDDocumento, r);

const MAPPING_ENTRATA = {
  sal:      { categoria: '[CANTIERE] SAL — Stato Avanzamento Lavori', ceType: 'ricavo_core' },
  acconto:  { categoria: '[CANTIERE] Anticipi da Clienti su Commessa', ceType: 'solo_cashflow' },
  saldo:    { categoria: '[CANTIERE] Saldo Finale Commessa', ceType: 'ricavo_core' },
  immobile: { categoria: '[IMMOBILIARE] Vendita Immobili e Terreni', ceType: 'ricavo_immobiliare' },
  altro:    { categoria: '[CANTIERE] Manutenzioni e Piccoli Lavori', ceType: 'ricavo_altro' },
};

const nuoveTransazioni = [];

// ─── CONSUNTIVO: Conti Movimenti (tutto quello che e' davvero successo) ────
console.log('--- Consuntivo: Conti Movimenti ---');
const movimenti = runSql(DB_IMPRESA, `SET NOCOUNT ON; SELECT Data, Causale, Descrizione, [Tipo Movimento] AS TipoMovimento, ImportoE, ImportoU, IDDocumento, IDRata FROM [Conti Movimenti] WHERE Data >= '${DATA_INIZIO}' AND (ImportoE > 0 OR ImportoU > 0) FOR JSON PATH`);
console.log(`Movimenti bancari 2026: ${movimenti.length}`);

for (const mv of movimenti) {
  const isEntrata = mv.ImportoE > 0;
  const importo = isEntrata ? mv.ImportoE : mv.ImportoU;
  const tipo = isEntrata ? 'INCOME' : 'EXPENSE';
  let categoria = null, ceType = null, cantiereApp = undefined, vatRate = null;

  if (mv.IDDocumento) {
    const header = headerPerDoc.get(mv.IDDocumento);
    if (isEntrata) {
      const desc = descPerDoc.get(mv.IDDocumento) || '';
      let tipoEntrata = inferisciTipoEntrata(desc);
      const cInfo = cantiereEPerDocLookup(mv.IDDocumento);
      cantiereApp = cInfo;
      if (!tipoEntrata && cantiereApp) {
        const meta = projectMeta.get(cantiereApp);
        if (meta?.metodoPagamento) tipoEntrata = meta.metodoPagamento;
      }
      const mapped = tipoEntrata ? MAPPING_ENTRATA[tipoEntrata] : null;
      if (mapped) { categoria = mapped.categoria; ceType = mapped.ceType; }
    } else {
      const tipologia = dominante(tipologiaPerDoc, mv.IDDocumento);
      if (tipologia) { categoria = mappaTipologiaACategoriaApp(tipologia, 'FEP'); ceType = categoria ? (CATEGORY_TO_CE_TYPE[categoria] ?? 'costo_variabile') : null; }
      const cInfo = cantiereUPerDocLookup(mv.IDDocumento);
      cantiereApp = cInfo;
    }
    if (header) vatRate = calcolaVatRate(header.Imponibile, header.Imposte);
  }

  if (!categoria) {
    // Fallback: classificaRiga sul testo del movimento bancario (mutui, tasse, stipendi, spese bancarie...)
    const descrizioneBanca = `${mv.Descrizione} - ${mv.TipoMovimento}`;
    const entity = estraiEntity(descrizioneBanca);
    const riga = { data: new Date(mv.Data), descrizione: descrizioneBanca, entity, importo, tipo, flagConto: 'B', tipoMovimento: /FEP|FEA|NEP/i.test(mv.Descrizione) ? mv.Descrizione.match(/FEP|FEA|NEP/i)[0].toUpperCase() : 'ALTRO' };
    const cls = classificaRiga(riga, regolePuntaNet);
    if (cls.categoria) { categoria = cls.categoria; ceType = cls.ceType; if (vatRate == null) vatRate = cls.vatRateSuggerito; }
  }

  // Collegamento a previsione ESISTENTE (solo lettura, mai modificata): stesso mese+progetto+categoria+tipo,
  // stessa identica logica gia' usata dall'app (ImportPuntaNetModal.tsx).
  let linkedForecastId = undefined;
  const txMonth = mv.Data.slice(0, 7);
  const txProj = cantiereApp || 'Generale';
  if (categoria) {
    const match = previsioniEsistenti.find(f =>
      f.date && f.date.slice(0, 7) === txMonth &&
      f.type === tipo && (f.project || 'Generale') === txProj && f.category === categoria &&
      !nuoveTransazioni.some(n => n.linkedForecastId === f.id) // non collegare due volte la stessa previsione
    );
    if (match) linkedForecastId = match.id;
  }

  nuoveTransazioni.push({
    id: crypto.randomUUID(),
    date: mv.Data.slice(0, 10),
    amount: null, // impostato sotto se vatRate noto
    grossAmount: importo,
    vatRate,
    type: tipo,
    category: categoria || 'Altro / Non Classificato',
    description: (mv.Descrizione || '').slice(0, 120),
    project: cantiereApp,
    ceType: ceType || 'solo_cashflow',
    isForecast: false,
    linkedForecastId,
    puntaNetIDDocumento: mv.IDDocumento || undefined,
    puntaNetIDRata: mv.IDRata || undefined,
  });
}
for (const t of nuoveTransazioni) {
  t.amount = t.vatRate ? Math.round((t.grossAmount / (1 + t.vatRate / 100)) * 100) / 100 : t.grossAmount;
}

function cantiereUPerDocLookup(idDoc) {
  const info = cantierePerDocU.get(idDoc);
  return info ? cantiereToProject.get(info.IDCantiere) : undefined;
}
function cantiereEPerDocLookup(idDoc) {
  const info = cantierePerDocE.get(idDoc);
  return info ? cantiereToProject.get(info.IDCantiere) : undefined;
}

const consuntivoConCategoria = nuoveTransazioni.filter(t => t.category !== 'Altro / Non Classificato');
console.log(`Consuntivo classificato: ${consuntivoConCategoria.length}/${nuoveTransazioni.length}`);
console.log(`Consuntivo collegato a una previsione esistente: ${nuoveTransazioni.filter(t => t.linkedForecastId).length}\n`);

// ─── Report finale ──────────────────────────────────────────────
console.log(`Transazioni consuntivo generate: ${nuoveTransazioni.length}`);

const copiaTest = JSON.parse(JSON.stringify(gvData));
copiaTest.transactions = [...copiaTest.transactions, ...nuoveTransazioni];
fs.mkdirSync(path.dirname(TEST_OUTPUT), { recursive: true });
fs.writeFileSync(TEST_OUTPUT, JSON.stringify(copiaTest, null, 2));
console.log(`\nCopia di test scritta in: ${TEST_OUTPUT}`);
console.log('Le previsioni esistenti nel file NON sono state toccate — solo lette per il collegamento.\n');

function aggregaPerMese(transazioni, soloConsuntivo = true) {
  const agg = {};
  for (const t of transazioni) {
    if (soloConsuntivo && t.isForecast) continue;
    if (!t.date || !t.date.startsWith('2026')) continue;
    const key = `${t.date.slice(0, 7)}|${t.type}`;
    agg[key] = (agg[key] || 0) + (t.grossAmount ?? t.amount ?? 0);
  }
  return agg;
}
const esistentiAgg = aggregaPerMese(gvData.transactions, true);
const nuoviAgg = aggregaPerMese(nuoveTransazioni, true);
const mesi = [...new Set([...Object.keys(esistentiAgg), ...Object.keys(nuoviAgg)])].sort();
console.log('=== CONFRONTO MENSILE (consuntivo, GRUPPO VISENTIN SRL, 2026) ===');
console.log('Mese     | Tipo    | Esistente      | Nuovo metodo   | Differenza');
for (const key of mesi) {
  const [mese, tipo] = key.split('|');
  const es = esistentiAgg[key] || 0, nu = nuoviAgg[key] || 0, diff = nu - es;
  const flag = Math.abs(diff) > 1 ? '  <-- DIVERSO' : '  OK';
  console.log(`${mese} | ${tipo.padEnd(7)} | €${es.toFixed(2).padStart(12)} | €${nu.toFixed(2).padStart(12)} | €${diff.toFixed(2).padStart(10)}${flag}`);
}
