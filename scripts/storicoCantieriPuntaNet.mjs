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

// ─── Quota di competenza per cantiere di ogni documento (via Documenti Imponibili Cantiere) ──
// Una fattura puo' essere condivisa fra piu' cantieri (es. materiali consegnati su piu' siti in
// un solo documento): dic.Imponibile e' la quota di QUEL cantiere, d.Imponibile e' il totale del
// documento. NON si fa il join diretto con Documenti Scadenze qui — un documento con sia piu'
// cantieri sia piu' rate produrrebbe un prodotto cartesiano che conta l'intera rata su ciascun
// cantiere invece che la sua quota (bug verificato su dati reali: stesso IDDocumento, stesso
// importo pieno, ripetuto su cantieri diversi — es. doc 5235 EDILSERRAJOTTO contato per intero
// sia su Trifamiliare Zogaj che su Borgo Gatto). Le rate si distribuiscono in proporzione piu' sotto.
const quoteCantiere = runSql(DB_IMPRESA, `SET NOCOUNT ON;
SELECT dic.IDDocumento, dic.IDCantiere, dic.Imponibile AS ImponibileCantiere,
       d.Tipo, d.Imponibile AS ImponibileDoc, d.Imposte, d.Totale,
       cf.[Ragione Sociale] AS Controparte
FROM [Documenti Imponibili Cantiere] dic
JOIN Documenti d ON d.IDDocumento = dic.IDDocumento
LEFT JOIN [Clienti Fornitori] cf ON cf.IDCliFor = d.IDCliFor
WHERE dic.IDCantiere IN (${idList})
FOR JSON PATH`);
console.log(`Quote cantiere trovate (documento x cantiere, tutti gli anni): ${quoteCantiere.length}`);

const idDocumenti = [...new Set(quoteCantiere.map(r => r.IDDocumento))];
const idDocList = idDocumenti.length > 0 ? idDocumenti.join(',') : '0';

// Rate (Documenti Scadenze) per TUTTI i documenti coinvolti, una query sola, poi distribuite
// in proporzione ad ogni cantiere in base alla sua quota.
const scadenzeRaw = runSql(DB_IMPRESA, `SET NOCOUNT ON;
SELECT ds.IDDocumento, ds.IDRata, ds.[Data Rata] AS DataRata, ds.[Importo Rata] AS ImportoRata, ds.Pagato
FROM [Documenti Scadenze] ds
WHERE ds.IDDocumento IN (${idDocList})
FOR JSON PATH`);
const scadenzePerDoc = new Map();
for (const s of scadenzeRaw) {
  if (!scadenzePerDoc.has(s.IDDocumento)) scadenzePerDoc.set(s.IDDocumento, []);
  scadenzePerDoc.get(s.IDDocumento).push(s);
}

// Ricostruisce l'elenco "righeCantiere" (una riga per documento x cantiere x rata), con l'importo
// della rata gia' ripartito in base alla quota di competenza del cantiere su quel documento.
// L'imponibile (netto) si calcola ripartendo DIRETTAMENTE dic.Imponibile (il valore netto esatto
// gia' fornito da PuntaNet per quel cantiere) in base alla quota della rata — non ricavandolo a
// ritroso da un'aliquota IVA indovinata (calcolaVatRate sceglie solo tra 4 aliquote fisse: su
// documenti con aliquote miste puo' sbagliare scaglione, accumulando un piccolo scarto).
// La quota di ogni rata si calcola sulla SOMMA DELLE RATE REGISTRATE per quel documento, non sul
// Totale nominale del documento: verificato su dati reali che alcuni documenti hanno rate che non
// coprono l'intero Totale (dato incompleto lato PuntaNet, es. doc 10207: rate per 37.408 su un
// Totale documento di 44.408) — usando il Totale nominale come divisore si perdeva la quota "non
// coperta" da nessuna rata. Cosi' invece tutto l'imponibile del cantiere viene sempre distribuito
// per intero fra le rate che esistono davvero, qualunque cosa sommino.
const righeCantiere = [];
for (const r of quoteCantiere) {
  const share = r.ImponibileDoc && r.ImponibileDoc > 0 ? (r.ImponibileCantiere / r.ImponibileDoc) : 1;
  const scadenze = scadenzePerDoc.get(r.IDDocumento) || [];
  const sommaRateDoc = scadenze.reduce((s, sc) => s + (sc.ImportoRata || 0), 0);
  for (const s of scadenze) {
    const rataFraction = sommaRateDoc !== 0 ? (s.ImportoRata / sommaRateDoc) : (1 / scadenze.length);
    righeCantiere.push({
      IDDocumento: r.IDDocumento,
      IDRata: s.IDRata,
      DataRata: s.DataRata,
      ImportoRata: Math.round(s.ImportoRata * share * 100) / 100,
      ImponibileDiretto: Math.round(r.ImponibileCantiere * rataFraction * 100) / 100,
      Pagato: s.Pagato,
      Tipo: r.Tipo,
      Imponibile: r.ImponibileDoc,
      Imposte: r.Imposte,
      Totale: r.Totale,
      IDCantiere: r.IDCantiere,
      Controparte: r.Controparte,
    });
  }
}
console.log(`Rate ripartite per i cantieri collegati (tutti gli anni): ${righeCantiere.length}`);

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

// Tipo Documenti: 0=FEA (fattura emessa attiva, entrata), 1=FEP (fattura passiva, uscita),
// 2=nota di credito ATTIVA (storna una FEA: riduce un'entrata), 3=nota di credito PASSIVA
// (storna una FEP: riduce un'uscita). Le note di credito vanno col segno OPPOSTO alla fattura
// che stornano, altrimenti si sommano come se fossero un secondo debito/credito invece di
// annullare quello sbagliato — bug reale verificato sui dati: 3 fatture FKF Costruzioni
// sbagliate (tipo 1) e le 3 note di credito che le annullavano per intero (tipo 3, stesso
// importo esatto, stessa data) venivano sommate come 6 debiti distinti invece di nettarsi a 0.
const storicoCantierePuntaNet = [];
for (const r of righeCantiere) {
  const isEntrata = r.Tipo === 0 || r.Tipo === 2;
  const isNotaCredito = r.Tipo === 2 || r.Tipo === 3;
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
    // Ogni riga qui e' gia' filtrata su un cantiere reale (WHERE dic.IDCantiere IN (idList) piu'
    // sopra) — quindi un'utenza (Duferco, Enel Energia, ecc.) mappata di default su "Utenze Sedi"
    // (fisso, pensato per la sede) e' sempre sbagliata in questo contesto: va sempre sul cantiere.
    if (categoria === '[STRUTTURA] Utenze Sedi') {
      categoria = '[CANTIERE] Utenze Cantiere';
      ceType = 'costo_variabile';
    }
  }

  const vatRate = calcolaVatRate(r.Imponibile, r.Imposte);
  const grossAmount = isNotaCredito ? -r.ImportoRata : r.ImportoRata;
  // Netto: dal valore diretto (dic.Imponibile ripartito), non ricavato a ritroso dall'aliquota
  // indovinata — piu' preciso, coerente col dato reale PuntaNet.
  const amount = isNotaCredito ? -r.ImponibileDiretto : r.ImponibileDiretto;

  storicoCantierePuntaNet.push({
    id: crypto.randomUUID(),
    date: r.DataRata.slice(0, 10),
    amount, grossAmount, vatRate,
    type: tipo,
    category: categoria || 'Altro / Non Classificato',
    description: (isNotaCredito ? 'Nota di credito - ' : '') + (r.Controparte || '(non specificato)'),
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
