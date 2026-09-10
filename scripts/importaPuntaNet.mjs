// Script di estrazione + classificazione automatica movimenti PuntaNet (GRUPPO VISENTIN SRL).
// Legge dall'istanza SQL Server locale SQLEXPRESS (copia isolata, mai il database live PUNTANET),
// classifica categoria/cantiere con la stessa logica dell'app, e produce un report "dry run" —
// non scrive MAI nel file dati vero. Quello e' un passo separato, deliberato, successivo.
//
// Architettura (validata su dati reali 2026 il 2026-09-09):
// - CONSUNTIVO: da Conti Movimenti (tutto cio' che e' davvero successo in banca — fatture,
//   mutui, tasse, stipendi diretti, spese bancarie), arricchito con categoria/cantiere via
//   Documenti quando c'e' un documento collegato, altrimenti classificaRiga come fallback.
// - PREVISIONE: da Documenti Scadenze con Pagato=0 (rate non ancora incassate/pagate).
//
// REGOLA ASSOLUTA: le previsioni gia' presenti nel file (inserite manualmente dall'utente)
// non vengono MAI modificate ne' toccate — solo lette, per eventuale collegamento
// (linkedForecastId) su una riga NUOVA di consuntivo. Nessuna riga esistente viene alterata.
//
// Uso: npx tsx scripts/importaPuntaNet.mjs
// Presuppone che GC_Impresa2_RO / GC_Comune_RO esistano gia' sull'istanza SQLEXPRESS
// (ripristinate dall'ultimo backup automatico di PuntaNet).

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
const DB_IMPRESA = 'GC_Impresa2_RO'; // GRUPPO VISENTIN SRL
const DB_COMUNE = 'GC_Comune_RO';
const DATA_INIZIO = '2026-01-01'; // procedure automatiche partono dal 2026, mai prima

const NAS_DATI = String.raw`\\NAS\Ufficio Tecnico\GRUPPO VISENTIN\00_GESTIONE GV\35_APP GV ECOSISTEM\04-GV GestioneFINANZIARIA\DATI SALVATI`;
const GVCF_PATH = path.join(NAS_DATI, 'gv-cashflow.gvcf');
const REGOLE_PATH = path.join(NAS_DATI, 'gv-regole.json');
const REPORT_PATH = path.join(NAS_DATI, 'AUTO', `dryrun_${new Date().toISOString().slice(0, 10)}.json`);

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
function importoLordoTx(t) {
  if (typeof t.grossAmount === 'number') return t.grossAmount;
  const vat = t.vatRate || 0;
  return (t.amount || 0) * (1 + vat / 100);
}

console.log(`=== Estrazione PuntaNet — GRUPPO VISENTIN SRL — da ${DATA_INIZIO} ===\n`);

const gvData = JSON.parse(fs.readFileSync(GVCF_PATH, 'utf8'));
const cantiereToProject = new Map();
const projectMeta = new Map();
for (const p of gvData.projects) {
  if (p.puntaNetCantiereId != null) cantiereToProject.set(p.puntaNetCantiereId, p.name);
  projectMeta.set(p.name, p);
}
const regolePuntaNet = fs.existsSync(REGOLE_PATH) ? JSON.parse(fs.readFileSync(REGOLE_PATH, 'utf8')).regolePuntaNet : [];
const previsioniEsistenti = gvData.transactions.filter(t => t.isForecast); // solo lette, mai modificate

const esistentiKey = new Set();
for (const t of gvData.transactions) {
  if (t.puntaNetIDDocumento != null && t.puntaNetIDRata != null) esistentiKey.add(`${t.puntaNetIDDocumento}|${t.puntaNetIDRata}`);
}

// ─── Dati arricchimento fattura (categoria/cantiere), da giugno anno precedente in poi ──
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

function cantiereUPerDocLookup(idDoc) { const info = cantierePerDocU.get(idDoc); return info ? cantiereToProject.get(info.IDCantiere) : undefined; }
function cantiereEPerDocLookup(idDoc) { const info = cantierePerDocE.get(idDoc); return info ? cantiereToProject.get(info.IDCantiere) : undefined; }

const MAPPING_ENTRATA = {
  sal:      { categoria: '[CANTIERE] SAL — Stato Avanzamento Lavori', ceType: 'ricavo_core' },
  acconto:  { categoria: '[CANTIERE] Anticipi da Clienti su Commessa', ceType: 'solo_cashflow' },
  saldo:    { categoria: '[CANTIERE] Saldo Finale Commessa', ceType: 'ricavo_core' },
  immobile: { categoria: '[IMMOBILIARE] Vendita Immobili e Terreni', ceType: 'ricavo_immobiliare' },
  altro:    { categoria: '[CANTIERE] Manutenzioni e Piccoli Lavori', ceType: 'ricavo_altro' },
};

// ─── CONSUNTIVO: Conti Movimenti = tutto quello che e' davvero successo in banca ──
console.log('--- Consuntivo (Conti Movimenti) ---');
const movimenti = runSql(DB_IMPRESA, `SET NOCOUNT ON; SELECT Data, Causale, Descrizione, [Tipo Movimento] AS TipoMovimento, ImportoE, ImportoU, IDDocumento, IDRata FROM [Conti Movimenti] WHERE Data >= '${DATA_INIZIO}' AND (ImportoE > 0 OR ImportoU > 0) FOR JSON PATH`);
console.log(`Movimenti bancari trovati: ${movimenti.length}`);

const nuovoConsuntivo = [];

// Capienza residua di una previsione: totale meno quanto gia' collegato (sia nel file esistente
// sia nei consuntivi appena aggiunti in questo stesso giro) — permette di riconoscere piu'
// pagamenti/rate sulla stessa previsione nel tempo, invece di collegarne solo uno e basta.
function getResiduoPrevisione(f) {
  const totale = importoLordoTx(f);
  const coperturaEsistente = gvData.transactions
    .filter(t => t.type === f.type && !t.isForecast && (
      t.linkedForecastId === f.id || (f.loanSourceId && t.loanSourceId === f.loanSourceId)
    ))
    .reduce((sum, t) => sum + importoLordoTx(t), 0);
  const coperturaNuova = nuovoConsuntivo
    .filter(t => t.linkedForecastId === f.id)
    .reduce((sum, t) => sum + importoLordoTx(t), 0);
  return totale - coperturaEsistente - coperturaNuova;
}

for (const mv of movimenti) {
  const key = `${mv.IDDocumento}|${mv.IDRata}`;
  if (mv.IDDocumento && esistentiKey.has(key)) continue; // gia' importato in un giro precedente

  const isEntrata = mv.ImportoE > 0;
  const importo = isEntrata ? mv.ImportoE : mv.ImportoU;
  const tipo = isEntrata ? 'INCOME' : 'EXPENSE';
  let categoria = null, ceType = null, cantiereApp = undefined, vatRate = null;

  if (mv.IDDocumento) {
    const header = headerPerDoc.get(mv.IDDocumento);
    if (isEntrata) {
      const desc = descPerDoc.get(mv.IDDocumento) || '';
      let tipoEntrata = inferisciTipoEntrata(desc);
      cantiereApp = cantiereEPerDocLookup(mv.IDDocumento);
      if (!tipoEntrata && cantiereApp) {
        const meta = projectMeta.get(cantiereApp);
        if (meta?.metodoPagamento) tipoEntrata = meta.metodoPagamento;
      }
      const mapped = tipoEntrata ? MAPPING_ENTRATA[tipoEntrata] : null;
      if (mapped) { categoria = mapped.categoria; ceType = mapped.ceType; }
    } else {
      const tipologia = dominante(tipologiaPerDoc, mv.IDDocumento);
      if (tipologia) { categoria = mappaTipologiaACategoriaApp(tipologia, 'FEP'); ceType = categoria ? (CATEGORY_TO_CE_TYPE[categoria] ?? 'costo_variabile') : null; }
      cantiereApp = cantiereUPerDocLookup(mv.IDDocumento);
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

  // Collegamento a previsione ESISTENTE (solo lettura, mai modificata). Nessun vincolo di stesso
  // mese: un incasso puo' arrivare mesi dopo quello previsto. Una previsione puo' anche essere
  // incassata in piu' pagamenti (rate/acconti): si collega alla previsione, nello stesso
  // progetto+categoria, che ha ancora capienza residua sufficiente per questo importo,
  // preferendo il residuo piu' vicino (miglior fit, minimizza il sovraccoperto).
  let linkedForecastId = undefined;
  if (categoria) {
    const txProj = cantiereApp || 'Generale';
    const TOLLERANZA = 0.5; // arrotondamenti
    const candidati = previsioniEsistenti
      .filter(f => f.type === tipo && (f.project || 'Generale') === txProj && f.category === categoria)
      .map(f => ({ f, residuo: getResiduoPrevisione(f) }))
      .filter(c => c.residuo >= importo - TOLLERANZA)
      .sort((a, b) => a.residuo - b.residuo);
    if (candidati.length > 0) linkedForecastId = candidati[0].f.id;
  }

  const grossAmount = importo;
  const amount = vatRate ? Math.round((grossAmount / (1 + vatRate / 100)) * 100) / 100 : grossAmount;

  nuovoConsuntivo.push({
    id: crypto.randomUUID(),
    date: mv.Data.slice(0, 10),
    amount,
    grossAmount,
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
console.log(`Nuovo consuntivo (non ancora nel file): ${nuovoConsuntivo.length}`);
console.log(`  con categoria: ${nuovoConsuntivo.filter(t => t.category !== 'Altro / Non Classificato').length}/${nuovoConsuntivo.length}`);
console.log(`  con cantiere: ${nuovoConsuntivo.filter(t => t.project).length}/${nuovoConsuntivo.length}`);
console.log(`  collegato a previsione esistente: ${nuovoConsuntivo.filter(t => t.linkedForecastId).length}\n`);

// ─── PREVISIONE: Documenti Scadenze non ancora pagate ────────────────────
// Tipo 0=FEA (entrata), 1=FEP (uscita), 2=nota di credito ATTIVA (storna una FEA), 3=nota di
// credito PASSIVA (storna una FEP). Le note di credito vanno incluse col segno OPPOSTO alla
// fattura che stornano — altrimenti una fattura sbagliata gia' corretta da una nota di credito
// (stesso importo, stessa data) risulterebbe comunque "da pagare" per intero (bug verificato sui
// dati reali: 3 fatture FKF Costruzioni azzerate da 3 note di credito identiche, tipo 3).
console.log('--- Previsione (rate non ancora pagate) ---');
const scadenzeAperte = runSql(DB_IMPRESA, `SET NOCOUNT ON; SELECT d.IDDocumento, d.Tipo, ds.IDRata, ds.[Data Rata] AS DataRata, ds.[Importo Rata] AS ImportoRata, d.Imponibile, d.Imposte, d.Totale, cf.[Ragione Sociale] AS Controparte FROM [Documenti Scadenze] ds JOIN Documenti d ON d.IDDocumento = ds.IDDocumento LEFT JOIN [Clienti Fornitori] cf ON cf.IDCliFor = d.IDCliFor WHERE ds.Pagato = 0 AND d.Tipo IN (0,1,2,3) AND ds.[Data Rata] >= '${DATA_INIZIO}' FOR JSON PATH`);
console.log(`Rate non pagate trovate: ${scadenzeAperte.length}`);

const nuovaPrevisione = [];
for (const s of scadenzeAperte) {
  const key = `${s.IDDocumento}|${s.IDRata}`;
  if (esistentiKey.has(key)) continue;
  const isEntrata = s.Tipo === 0 || s.Tipo === 2;
  const isNotaCredito = s.Tipo === 2 || s.Tipo === 3;
  const tipo = isEntrata ? 'INCOME' : 'EXPENSE';
  let categoria = null, ceType = null, cantiereApp = undefined;

  if (isEntrata) {
    const desc = descPerDoc.get(s.IDDocumento) || '';
    let tipoEntrata = inferisciTipoEntrata(desc);
    cantiereApp = cantiereEPerDocLookup(s.IDDocumento);
    if (!tipoEntrata && cantiereApp) {
      const meta = projectMeta.get(cantiereApp);
      if (meta?.metodoPagamento) tipoEntrata = meta.metodoPagamento;
    }
    const mapped = tipoEntrata ? MAPPING_ENTRATA[tipoEntrata] : null;
    if (mapped) { categoria = mapped.categoria; ceType = mapped.ceType; }
  } else {
    const tipologia = dominante(tipologiaPerDoc, s.IDDocumento);
    if (tipologia) { categoria = mappaTipologiaACategoriaApp(tipologia, 'FEP'); ceType = categoria ? (CATEGORY_TO_CE_TYPE[categoria] ?? 'costo_variabile') : null; }
    cantiereApp = cantiereUPerDocLookup(s.IDDocumento);
  }
  if (!categoria && s.Controparte) {
    const riga = { data: new Date(s.DataRata), descrizione: s.Controparte, entity: s.Controparte, importo: s.ImportoRata, tipo, flagConto: 'B', tipoMovimento: 'ALTRO' };
    const cls = classificaRiga(riga, regolePuntaNet);
    if (cls.categoria) { categoria = cls.categoria; ceType = cls.ceType; }
  }

  const vatRate = calcolaVatRate(s.Imponibile, s.Imposte);
  const grossAmount = isNotaCredito ? -s.ImportoRata : s.ImportoRata;
  const amount = vatRate ? Math.round((grossAmount / (1 + vatRate / 100)) * 100) / 100 : grossAmount;

  nuovaPrevisione.push({
    id: crypto.randomUUID(),
    date: s.DataRata.slice(0, 10),
    amount, grossAmount, vatRate,
    type: tipo,
    category: categoria || 'Altro / Non Classificato',
    description: (isNotaCredito ? 'Nota di credito - ' : '') + (s.Controparte || '(non specificato)'),
    project: cantiereApp,
    ceType: ceType || 'solo_cashflow',
    isForecast: true,
    puntaNetIDDocumento: s.IDDocumento,
    puntaNetIDRata: s.IDRata,
  });
}
console.log(`Nuova previsione (non ancora nel file): ${nuovaPrevisione.length}\n`);

// ─── Output dry-run ─────────────────────────────────────────────
fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, JSON.stringify({ consuntivo: nuovoConsuntivo, previsione: nuovaPrevisione }, null, 2));
console.log(`=== Report dry-run salvato in: ${REPORT_PATH} ===`);
console.log('NESSUNA scrittura sul file dati vero — questo script legge e classifica soltanto.');
console.log('Le previsioni esistenti nel file NON sono state toccate — solo lette per il collegamento.');
