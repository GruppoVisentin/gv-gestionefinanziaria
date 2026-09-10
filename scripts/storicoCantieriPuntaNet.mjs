// Estrae TUTTO lo storico PuntaNet (qualunque anno) per i cantieri collegati (puntaNetCantiereId),
// usando il collegamento ESATTO per IDCantiere (non piu' fuzzy matching sul testo).
// Serve a due cose:
//  1) Verificare le transazioni gia' collegate a mano in "transactions" (confronto, non sovrascrittura)
//  2) Produrre un elenco separato "storicoCantierePuntaNet" per Vista Cantiere, per quello che manca
// NON scrive mai su "transactions" — il file v2 resta come e', si aggiunge solo un nuovo campo separato.

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import {
  mappaTipologiaACategoriaApp,
  inferisciTipoEntrata,
} from '../utils/puntaNetImporter.ts';
import { CATEGORY_TO_CE_TYPE } from '../constants.ts';

const SQLCMD = String.raw`C:\Program Files\Microsoft SQL Server\Client SDK\ODBC\110\Tools\Binn\SQLCMD.EXE`;
const INSTANCE = String.raw`localhost\SQLEXPRESS`;
const DB_IMPRESA = 'GC_Impresa2_RO';
const DB_COMUNE = 'GC_Comune_RO';

const NAS_DATI = String.raw`\\NAS\Ufficio Tecnico\GRUPPO VISENTIN\00_GESTIONE GV\35_APP GV ECOSISTEM\04-GV GestioneFINANZIARIA\DATI SALVATI`;
const FILE_PATH = path.join(NAS_DATI, 'gv-cashflow_v2-import-puntanet-automatico.gvcf');

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

const gvData = JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
const cantiereToProject = new Map();
const projectMeta = new Map();
for (const p of gvData.projects) {
  if (p.puntaNetCantiereId != null) cantiereToProject.set(p.puntaNetCantiereId, p.name);
  projectMeta.set(p.name, p);
}
const idCantieriCollegati = [...cantiereToProject.keys()];
console.log(`Cantieri collegati: ${idCantieriCollegati.join(', ')}\n`);
const idList = idCantieriCollegati.join(',');

// ─── Scadenze (tutte le date, tutti i tipi 0/1) per questi cantieri, via Documenti Imponibili Cantiere ──
const righeCantiere = runSql(DB_IMPRESA, `SET NOCOUNT ON;
SELECT ds.IDDocumento, ds.IDRata, ds.[Data Rata] AS DataRata, ds.[Importo Rata] AS ImportoRata, ds.Pagato,
       d.Tipo, d.Imponibile, d.Imposte, d.Totale, dic.IDCantiere,
       cf.[Ragione Sociale] AS Controparte
FROM [Documenti Imponibili Cantiere] dic
JOIN Documenti d ON d.IDDocumento = dic.IDDocumento
JOIN [Documenti Scadenze] ds ON ds.IDDocumento = d.IDDocumento
LEFT JOIN [Clienti Fornitori] cf ON cf.IDCliFor = d.IDCliFor
WHERE dic.IDCantiere IN (${idList})
FOR JSON PATH`);
console.log(`Rate trovate per i cantieri collegati (tutti gli anni): ${righeCantiere.length}`);

const idDocumenti = [...new Set(righeCantiere.map(r => r.IDDocumento))];
const idDocList = idDocumenti.length > 0 ? idDocumenti.join(',') : '0';

const docTipologia = runSql(DB_IMPRESA, `SET NOCOUNT ON; SELECT da.IDDocumento, da.Prezzo, da.Qta, tv.Tipologia FROM [Documenti Articoli] da LEFT JOIN ${DB_COMUNE}.dbo.[TAB_Tipi Voci] tv ON tv.IDTipologia = da.IDTipologia WHERE da.IDDocumento IN (${idDocList}) FOR JSON PATH`);
const docDescrizioni = runSql(DB_IMPRESA, `SET NOCOUNT ON; SELECT da.IDDocumento, da.Descrizione FROM [Documenti Articoli] da WHERE da.IDDocumento IN (${idDocList}) FOR JSON PATH`);

const tipologiaPerDoc = new Map();
for (const r of docTipologia) {
  if (!r.Tipologia) continue;
  const importo = (r.Prezzo || 0) * (r.Qta || 1);
  if (!tipologiaPerDoc.has(r.IDDocumento)) tipologiaPerDoc.set(r.IDDocumento, new Map());
  const m = tipologiaPerDoc.get(r.IDDocumento);
  m.set(r.Tipologia, (m.get(r.Tipologia) || 0) + importo);
}
const descPerDoc = new Map();
for (const r of docDescrizioni) descPerDoc.set(r.IDDocumento, (descPerDoc.get(r.IDDocumento) || '') + ' ' + (r.Descrizione || ''));

const MAPPING_ENTRATA = {
  sal:      { categoria: '[CANTIERE] SAL — Stato Avanzamento Lavori', ceType: 'ricavo_core' },
  acconto:  { categoria: '[CANTIERE] Anticipi da Clienti su Commessa', ceType: 'solo_cashflow' },
  saldo:    { categoria: '[CANTIERE] Saldo Finale Commessa', ceType: 'ricavo_core' },
  immobile: { categoria: '[IMMOBILIARE] Vendita Immobili e Terreni', ceType: 'ricavo_immobiliare' },
  altro:    { categoria: '[CANTIERE] Manutenzioni e Piccoli Lavori', ceType: 'ricavo_altro' },
};

const storicoCantierePuntaNet = [];
for (const r of righeCantiere) {
  const isEntrata = r.Tipo === 0;
  const tipo = isEntrata ? 'INCOME' : 'EXPENSE';
  const progettoApp = cantiereToProject.get(r.IDCantiere);
  let categoria = null, ceType = null;

  if (isEntrata) {
    const desc = descPerDoc.get(r.IDDocumento) || '';
    let tipoEntrata = inferisciTipoEntrata(desc);
    if (!tipoEntrata && progettoApp) {
      const meta = projectMeta.get(progettoApp);
      if (meta?.metodoPagamento) tipoEntrata = meta.metodoPagamento;
    }
    const mapped = tipoEntrata ? MAPPING_ENTRATA[tipoEntrata] : null;
    if (mapped) { categoria = mapped.categoria; ceType = mapped.ceType; }
  } else {
    const tipologia = dominante(tipologiaPerDoc, r.IDDocumento);
    if (tipologia) { categoria = mappaTipologiaACategoriaApp(tipologia, 'FEP'); ceType = categoria ? (CATEGORY_TO_CE_TYPE[categoria] ?? 'costo_variabile') : null; }
  }

  const vatRate = calcolaVatRate(r.Imponibile, r.Imposte);
  const grossAmount = r.ImportoRata;
  const amount = vatRate ? Math.round((grossAmount / (1 + vatRate / 100)) * 100) / 100 : grossAmount;

  storicoCantierePuntaNet.push({
    id: crypto.randomUUID(),
    date: r.DataRata.slice(0, 10),
    amount, grossAmount, vatRate,
    type: tipo,
    category: categoria || 'Altro / Non Classificato',
    description: r.Controparte || '(non specificato)',
    project: progettoApp,
    ceType: ceType || 'solo_cashflow',
    isForecast: r.Pagato !== 1,
    puntaNetIDDocumento: r.IDDocumento,
    puntaNetIDRata: r.IDRata,
  });
}

console.log(`Righe storico ricostruite: ${storicoCantierePuntaNet.length}`);
console.log(`  con categoria: ${storicoCantierePuntaNet.filter(t => t.category !== 'Altro / Non Classificato').length}`);

// ─── Confronto con quello che e' gia' in transactions (project taggato) ────
console.log(`\n=== CONFRONTO per cantiere (somma netto, consuntivo, tutti gli anni) ===`);
console.log('Cantiere | Tipo | Gia in transactions | Trovato da PuntaNet | Differenza');
for (const [idCantiere, nomeProgetto] of cantiereToProject) {
  for (const tipo of ['INCOME', 'EXPENSE']) {
    const esistenti = gvData.transactions.filter(t => t.project === nomeProgetto && t.type === tipo && !t.isForecast);
    const nuovi = storicoCantierePuntaNet.filter(t => t.project === nomeProgetto && t.type === tipo && !t.isForecast);
    const sommaEsistenti = esistenti.reduce((s, t) => s + (t.amount ?? 0), 0);
    const sommaNuovi = nuovi.reduce((s, t) => s + (t.amount ?? 0), 0);
    if (esistenti.length === 0 && nuovi.length === 0) continue;
    console.log(`${nomeProgetto.padEnd(22)} | ${tipo.padEnd(7)} | €${sommaEsistenti.toFixed(2).padStart(12)} (${esistenti.length}) | €${sommaNuovi.toFixed(2).padStart(12)} (${nuovi.length}) | €${(sommaNuovi-sommaEsistenti).toFixed(2)}`);
  }
}

// Salva il nuovo elenco separato dentro il file v2, come campo a parte — non tocca "transactions"
gvData.storicoCantierePuntaNet = storicoCantierePuntaNet;
fs.writeFileSync(FILE_PATH, JSON.stringify(gvData, null, 2));
console.log(`\nSalvato campo "storicoCantierePuntaNet" (${storicoCantierePuntaNet.length} righe) nel file v2 — "transactions" non toccato.`);
