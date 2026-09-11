// Script di estrazione + classificazione automatica movimenti PuntaNet (GRUPPO VISENTIN SRL).
// Legge dall'istanza SQL Server locale SQLEXPRESS (copia isolata, mai il database live PUNTANET),
// classifica categoria/cantiere con la stessa logica dell'app.
//
// Due modalita':
// - DRY-RUN (default, `npx tsx scripts/importaPuntaNet.mjs`): NON scrive mai sul file dati vero,
//   produce solo un report leggibile in DATI SALVATI/AUTO — sicuro da far girare quante volte si vuole.
// - SCRITTURA (`npx tsx scripts/importaPuntaNet.mjs --scrivi`): scrive davvero sul file dati vero,
//   con "auto-scrittura selettiva":
//     - i movimenti classificati con ALTA confidenza (dato di fattura strutturato, o regola/pattern
//       affidabile, e — per le uscite — un'aliquota IVA reale non indovinata) vengono aggiunti
//       direttamente a `transactions`, gia' definitivi;
//     - tutti gli altri (categoria non riconosciuta, confidenza media/bassa, IVA non determinabile,
//       o un possibile duplicato di una transazione gia' presente) vengono aggiunti a
//       `bozzaImportPuntaNet`, la coda "da classificare" che l'app segnala col banner giallo —
//       revisione manuale in app prima di diventare definitivi.
//   Prima di scrivere: backup del file reale (stessa convenzione di DATI SALVATI/BACKUP), rilettura
//   del file al momento della scrittura (per non perdere modifiche fatte nel frattempo da altri),
//   scrittura atomica (file temporaneo + rename).
//
// Architettura (validata su dati reali 2026 il 2026-09-09):
// - CONSUNTIVO: da Conti Movimenti (tutto cio' che e' davvero successo in banca — fatture,
//   mutui, tasse, stipendi diretti, spese bancarie), arricchito con categoria/cantiere via
//   Documenti quando c'e' un documento collegato, altrimenti classificaRiga come fallback.
// - PREVISIONE: da Documenti Scadenze con Pagato=0 (rate non ancora incassate/pagate).
//
// REGOLA ASSOLUTA: le previsioni gia' presenti nel file (inserite manualmente dall'utente)
// non vengono MAI modificate ne' toccate — solo lette, per eventuale collegamento
// (linkedForecastId) su una riga NUOVA di consuntivo. Nessuna riga esistente viene alterata o rimossa.
//
// Uso: npx tsx scripts/importaPuntaNet.mjs [--scrivi]
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
  isDuplicato,
} from '../utils/puntaNetImporter.ts';
import { CATEGORY_TO_CE_TYPE } from '../constants.ts';

const SCRIVI = process.argv.includes('--scrivi');

const SQLCMD = String.raw`C:\Program Files\Microsoft SQL Server\Client SDK\ODBC\110\Tools\Binn\SQLCMD.EXE`;
const INSTANCE = String.raw`localhost\SQLEXPRESS`;
const DB_IMPRESA = 'GC_Impresa2_RO'; // GRUPPO VISENTIN SRL
const DB_COMUNE = 'GC_Comune_RO';
const DATA_INIZIO = '2026-01-01'; // procedure automatiche partono dal 2026, mai prima

const NAS_DATI = String.raw`\\NAS\Ufficio Tecnico\GRUPPO VISENTIN\00_GESTIONE GV\35_APP GV ECOSISTEM\04-GV GestioneFINANZIARIA\DATI SALVATI`;
// File dati REALE in uso dall'app (verificato 2026-09-11 — "gv-cashflow.gvcf" e' una copia
// vecchia/ferma al 09/09, NON quella sincronizzata dall'app ogni giorno).
const GVCF_PATH = path.join(NAS_DATI, 'gv-cashflow_v2-import-puntanet-automatico.gvcf');
const REGOLE_PATH = path.join(NAS_DATI, 'gv-regole.json');
const BACKUP_DIR = path.join(NAS_DATI, 'BACKUP');
const REPORT_PATH = path.join(NAS_DATI, 'AUTO', `${SCRIVI ? 'scrittura' : 'dryrun'}_${new Date().toISOString().slice(0, 10)}.json`);

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
function tipoMovimentoDa(descrizione) {
  const m = descrizione.match(/FEP|FEA|NEP/i);
  return m ? m[0].toUpperCase() : 'ALTRO';
}
// Sanity check sulla data: PuntaNet puo' contenere date corrotte (es. un anno "2232" invece di
// "2026" per un refuso di battitura) — trovato su dati reali il 2026-09-11 (una riga da 0,75€ di
// "SPESE PER BONIFICO" datata 6 maggio 2232). Una riga del genere non va MAI scritta come
// definitiva: finisce sempre in bozza per una correzione manuale, indipendentemente dalla confidenza.
const ANNO_MIN = Number(DATA_INIZIO.slice(0, 4));
const ANNO_MAX = new Date().getUTCFullYear() + 1;
function dataPlausibile(dataISO) {
  const anno = Number(dataISO.slice(0, 4));
  return Number.isFinite(anno) && anno >= ANNO_MIN && anno <= ANNO_MAX;
}
function notaRevisione(dataOk) {
  return dataOk ? null : 'Data implausibile nel dato PuntaNet (anno fuori range) — correggere prima di confermare';
}

// Costruisce una riga in formato "bozza" (RigaClassificata) da mettere in bozzaImportPuntaNet,
// per revisione manuale in app — stessa forma che produce la modalita' interattiva del modale.
function costruisciBozza({ dataISO, descrizione, entity, importo, tipo, tipoMovimento, categoria, ceType, confidenza, matchKey, vatRateSuggerito, vatRateNota, cantiereApp, idDocumento, idRata, idMovimento }) {
  return {
    riga: { data: new Date(dataISO), descrizione, entity, importo, tipo, flagConto: 'B', tipoMovimento },
    categoria: categoria || null,
    ceType: ceType || null,
    confidenza: confidenza || null,
    matchKey: matchKey || null,
    confermata: false,
    vatRateSuggerito: vatRateSuggerito ?? null,
    vatRateNota: vatRateNota || (categoria ? null : 'Nessuna categoria riconosciuta automaticamente — da classificare manualmente'),
    vatRateConfermato: null,
    isDuplicato: false,
    livelloDuplicato: null,
    arricchitoDaFattura: idDocumento != null,
    cantiereSuggerito: cantiereApp || null,
    cantiereScore: cantiereApp ? 100 : 0,
    cantierePuntaNet: cantiereApp || '',
    cantiereMatchFonte: cantiereApp ? (tipo === 'INCOME' ? 'cliente_fea' : 'fornitore_fep') : null,
    tipoEntrata: null,
    dataDocumento: null,
    // Campi extra (non nello schema RigaClassificata dell'app, ignorati dalla UI) — servono solo
    // a questo script per non riproporre la stessa riga in bozza il giorno dopo. Preferisce
    // IDMovimento (sempre presente per i movimenti bancari) a IDDocumento|IDRata (spesso assente
    // per i movimenti senza fattura collegata).
    _puntaNetKey: idMovimento != null ? `mov:${idMovimento}` : ((idDocumento != null && idRata != null) ? `doc:${idDocumento}|${idRata}` : null),
    _fonte: 'import-automatico',
  };
}

console.log(`=== ${SCRIVI ? 'Scrittura' : 'Estrazione (dry-run)'} PuntaNet — GRUPPO VISENTIN SRL — da ${DATA_INIZIO} ===\n`);

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
// Chiave primaria per i movimenti di Conti Movimenti (IDMovimento): a differenza di IDDocumento/
// IDRata, e' sempre presente anche per i movimenti bancari "puri" senza fattura collegata
// (stipendi, spese bancarie, interessi, affitti...) — la maggioranza dei movimenti reali. Senza
// questa chiave quei movimenti non erano MAI riconosciuti come "gia' importati" e venivano
// riscritti ogni giorno come nuovi duplicati (bug trovato e corretto il 2026-09-11, prima di
// attivare la scrittura automatica — vedi cronologia).
const esistentiKeyMovimento = new Set();
for (const t of gvData.transactions) {
  if (t.puntaNetIDMovimento != null) esistentiKeyMovimento.add(t.puntaNetIDMovimento);
}
const bozzaKeyEsistenti = new Set();
for (const b of (gvData.bozzaImportPuntaNet || [])) {
  if (b._puntaNetKey) bozzaKeyEsistenti.add(b._puntaNetKey);
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
const movimenti = runSql(DB_IMPRESA, `SET NOCOUNT ON; SELECT IDMovimento, Data, Causale, Descrizione, [Tipo Movimento] AS TipoMovimento, ImportoE, ImportoU, IDDocumento, IDRata FROM [Conti Movimenti] WHERE Data >= '${DATA_INIZIO}' AND (ImportoE > 0 OR ImportoU > 0) FOR JSON PATH`);
console.log(`Movimenti bancari trovati: ${movimenti.length}`);

const autoConsuntivo = [];
let duplicatiPerContenutoConsuntivo = 0;
const revisioneConsuntivo = [];

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
  const coperturaNuova = autoConsuntivo
    .filter(t => t.linkedForecastId === f.id)
    .reduce((sum, t) => sum + importoLordoTx(t), 0);
  return totale - coperturaEsistente - coperturaNuova;
}

for (const mv of movimenti) {
  if (esistentiKeyMovimento.has(mv.IDMovimento)) continue; // gia' importato in un giro precedente (per IDMovimento)
  const key = `${mv.IDDocumento}|${mv.IDRata}`;
  if (mv.IDDocumento && esistentiKey.has(key)) continue; // gia' importato in un giro precedente (per IDDocumento/IDRata)

  const isEntrata = mv.ImportoE > 0;
  const importo = isEntrata ? mv.ImportoE : mv.ImportoU;
  const tipo = isEntrata ? 'INCOME' : 'EXPENSE';
  const descrizioneBanca = `${mv.Descrizione} - ${mv.TipoMovimento}`;
  const entity = estraiEntity(descrizioneBanca);
  const tipoMovimento = tipoMovimentoDa(mv.Descrizione);

  let categoria = null, ceType = null, cantiereApp = undefined, vatRate = null, confidenza = null, matchKey = null;

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
      if (mapped) { categoria = mapped.categoria; ceType = mapped.ceType; confidenza = 'alta'; matchKey = `entrata:${tipoEntrata}`; }
    } else {
      const tipologia = dominante(tipologiaPerDoc, mv.IDDocumento);
      if (tipologia) { categoria = mappaTipologiaACategoriaApp(tipologia, 'FEP'); ceType = categoria ? (CATEGORY_TO_CE_TYPE[categoria] ?? 'costo_variabile') : null; if (categoria) { confidenza = 'alta'; matchKey = `tipologia:${tipologia}`; } }
      cantiereApp = cantiereUPerDocLookup(mv.IDDocumento);
      // Utenze "doppio uso" (Duferco, Enel Energia, ecc.): se il documento e' attribuito a un
      // cantiere reale (non Costi Generali/Magazzino/nessuna attribuzione), la spesa e' di quel
      // cantiere (variabile), non della sede (fisso) — a differenza di storicoCantieriPuntaNet.mjs
      // qui il dataset non e' pre-filtrato su cantieri collegati, quindi va controllato caso per caso.
      if (categoria === '[STRUTTURA] Utenze Sedi' && cantiereApp) {
        categoria = '[CANTIERE] Utenze Cantiere';
        ceType = 'costo_variabile';
      }
    }
    if (header) vatRate = calcolaVatRate(header.Imponibile, header.Imposte);
  }

  if (!categoria) {
    // Fallback: classificaRiga sul testo del movimento bancario (mutui, tasse, stipendi, spese bancarie...)
    const riga = { data: new Date(mv.Data), descrizione: descrizioneBanca, entity, importo, tipo, flagConto: 'B', tipoMovimento };
    const cls = classificaRiga(riga, regolePuntaNet, cantiereApp);
    if (cls.categoria) {
      categoria = cls.categoria; ceType = cls.ceType; confidenza = cls.confidenza; matchKey = cls.matchKey;
      if (vatRate == null) vatRate = cls.vatRateSuggerito;
    }
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

  const descrizioneSalvata = (mv.Descrizione || '').slice(0, 120);

  // Controllo incrociato anti-duplicato per contenuto (data+importo+descrizione, sulla STESSA
  // descrizione che viene salvata) — rete di sicurezza in piu' rispetto al controllo per ID sopra,
  // perche' l'import interattivo dal modale (e le altre vie con cui questi dati sono gia' entrati
  // nel file negli import precedenti) non timbra puntaNetIDDocumento/IDRata/IDMovimento, quindi
  // quel controllo da solo non li vedrebbe. Se il contenuto corrisponde gia' a una transazione
  // presente, la riga e' gia' rappresentata nei dati: si salta del tutto (ne' scritta ne' in
  // bozza — altrimenti la bozza si riempirebbe di "duplicati" che non sono davvero nuovi dati,
  // solo rumore da rivedere per niente). (Va confrontata la descrizione effettivamente salvata,
  // non quella con suffisso "- TipoMovimento" usata solo per estraiEntity: usarla qui avrebbe
  // fatto fallire sempre il confronto — bug trovato e corretto il 2026-09-11, prima di attivare
  // la scrittura automatica.)
  const dupCheck = isDuplicato({ data: new Date(mv.Data), descrizione: descrizioneSalvata, entity, importo, tipo, flagConto: 'B', tipoMovimento }, gvData.transactions);
  if (dupCheck.duplicato) { duplicatiPerContenutoConsuntivo++; continue; }

  const dataISO = mv.Data.slice(0, 10);
  const dataOk = dataPlausibile(dataISO);
  const alta = categoria && confidenza === 'alta' && (tipo === 'INCOME' || vatRate !== null) && dataOk;

  const base = {
    id: crypto.randomUUID(),
    date: dataISO,
    amount,
    grossAmount,
    vatRate,
    type: tipo,
    category: categoria || 'Altro / Non Classificato',
    description: descrizioneSalvata,
    project: cantiereApp,
    ceType: ceType || 'solo_cashflow',
    isForecast: false,
    linkedForecastId,
    sourceRef: `Punta Net (automatico) - IDMovimento ${mv.IDMovimento}`,
    puntaNetIDMovimento: mv.IDMovimento,
    puntaNetIDDocumento: mv.IDDocumento || undefined,
    puntaNetIDRata: mv.IDRata || undefined,
  };

  if (alta) {
    autoConsuntivo.push(base);
  } else {
    revisioneConsuntivo.push(costruisciBozza({
      dataISO, descrizione: mv.Descrizione || '', entity, importo, tipo, tipoMovimento,
      categoria, ceType, confidenza, matchKey, vatRateSuggerito: vatRate, vatRateNota: notaRevisione(dataOk),
      cantiereApp, idDocumento: mv.IDDocumento, idRata: mv.IDRata, idMovimento: mv.IDMovimento,
    }));
  }
}
console.log(`Nuovo consuntivo (non ancora nel file per ID): ${autoConsuntivo.length + revisioneConsuntivo.length + duplicatiPerContenutoConsuntivo}`);
console.log(`  gia' presenti per contenuto (data+importo+descrizione) — saltati: ${duplicatiPerContenutoConsuntivo}`);
console.log(`  auto-scrivibili (alta confidenza): ${autoConsuntivo.length}`);
console.log(`  da rivedere in bozza: ${revisioneConsuntivo.length}`);
console.log(`  con cantiere: ${[...autoConsuntivo, ...revisioneConsuntivo.map(b => ({ project: b.cantiereSuggerito }))].filter(t => t.project).length}`);
console.log(`  collegato a previsione esistente: ${autoConsuntivo.filter(t => t.linkedForecastId).length}\n`);

// ─── PREVISIONE: Documenti Scadenze non ancora pagate ────────────────────
// Tipo 0=FEA (entrata), 1=FEP (uscita), 2=nota di credito ATTIVA (storna una FEA), 3=nota di
// credito PASSIVA (storna una FEP). Le note di credito vanno incluse col segno OPPOSTO alla
// fattura che stornano — altrimenti una fattura sbagliata gia' corretta da una nota di credito
// (stesso importo, stessa data) risulterebbe comunque "da pagare" per intero (bug verificato sui
// dati reali: 3 fatture FKF Costruzioni azzerate da 3 note di credito identiche, tipo 3).
console.log('--- Previsione (rate non ancora pagate) ---');
const scadenzeAperte = runSql(DB_IMPRESA, `SET NOCOUNT ON; SELECT d.IDDocumento, d.Tipo, ds.IDRata, ds.[Data Rata] AS DataRata, ds.[Importo Rata] AS ImportoRata, d.Imponibile, d.Imposte, d.Totale, cf.[Ragione Sociale] AS Controparte FROM [Documenti Scadenze] ds JOIN Documenti d ON d.IDDocumento = ds.IDDocumento LEFT JOIN [Clienti Fornitori] cf ON cf.IDCliFor = d.IDCliFor WHERE ds.Pagato = 0 AND d.Tipo IN (0,1,2,3) AND ds.[Data Rata] >= '${DATA_INIZIO}' FOR JSON PATH`);
console.log(`Rate non pagate trovate: ${scadenzeAperte.length}`);

const autoPrevisione = [];
const revisionePrevisione = [];
let duplicatiPerContenutoPrevisione = 0;
for (const s of scadenzeAperte) {
  const key = `${s.IDDocumento}|${s.IDRata}`;
  if (esistentiKey.has(key)) continue;
  const isEntrata = s.Tipo === 0 || s.Tipo === 2;
  const isNotaCredito = s.Tipo === 2 || s.Tipo === 3;
  const tipo = isEntrata ? 'INCOME' : 'EXPENSE';
  const descrizione = (isNotaCredito ? 'Nota di credito - ' : '') + (s.Controparte || '(non specificato)');
  const entity = s.Controparte || '(non specificato)';
  const tipoMovimento = tipoMovimentoDa(descrizione);
  let categoria = null, ceType = null, cantiereApp = undefined, confidenza = null, matchKey = null;

  if (isEntrata) {
    const desc = descPerDoc.get(s.IDDocumento) || '';
    let tipoEntrata = inferisciTipoEntrata(desc);
    cantiereApp = cantiereEPerDocLookup(s.IDDocumento);
    if (!tipoEntrata && cantiereApp) {
      const meta = projectMeta.get(cantiereApp);
      if (meta?.metodoPagamento) tipoEntrata = meta.metodoPagamento;
    }
    const mapped = tipoEntrata ? MAPPING_ENTRATA[tipoEntrata] : null;
    if (mapped) { categoria = mapped.categoria; ceType = mapped.ceType; confidenza = 'alta'; matchKey = `entrata:${tipoEntrata}`; }
  } else {
    const tipologia = dominante(tipologiaPerDoc, s.IDDocumento);
    if (tipologia) { categoria = mappaTipologiaACategoriaApp(tipologia, 'FEP'); ceType = categoria ? (CATEGORY_TO_CE_TYPE[categoria] ?? 'costo_variabile') : null; if (categoria) { confidenza = 'alta'; matchKey = `tipologia:${tipologia}`; } }
    cantiereApp = cantiereUPerDocLookup(s.IDDocumento);
    // Utenze "doppio uso" (Duferco, Enel Energia, ecc.): vedi nota identica piu' sopra.
    if (categoria === '[STRUTTURA] Utenze Sedi' && cantiereApp) {
      categoria = '[CANTIERE] Utenze Cantiere';
      ceType = 'costo_variabile';
    }
  }
  if (!categoria && s.Controparte) {
    const riga = { data: new Date(s.DataRata), descrizione: s.Controparte, entity: s.Controparte, importo: s.ImportoRata, tipo, flagConto: 'B', tipoMovimento: 'ALTRO' };
    const cls = classificaRiga(riga, regolePuntaNet, cantiereApp);
    if (cls.categoria) { categoria = cls.categoria; ceType = cls.ceType; confidenza = cls.confidenza; matchKey = cls.matchKey; }
  }

  const vatRate = calcolaVatRate(s.Imponibile, s.Imposte);
  const grossAmount = isNotaCredito ? -s.ImportoRata : s.ImportoRata;
  const amount = vatRate ? Math.round((grossAmount / (1 + vatRate / 100)) * 100) / 100 : grossAmount;

  const dupCheck = isDuplicato({ data: new Date(s.DataRata), descrizione, entity, importo: s.ImportoRata, tipo, flagConto: 'B', tipoMovimento }, gvData.transactions);
  if (dupCheck.duplicato) { duplicatiPerContenutoPrevisione++; continue; }

  const dataISO = s.DataRata.slice(0, 10);
  const dataOk = dataPlausibile(dataISO);
  const alta = categoria && confidenza === 'alta' && (tipo === 'INCOME' || vatRate !== null) && dataOk;

  const base = {
    id: crypto.randomUUID(),
    date: dataISO,
    amount, grossAmount, vatRate,
    type: tipo,
    category: categoria || 'Altro / Non Classificato',
    description: descrizione,
    project: cantiereApp,
    ceType: ceType || 'solo_cashflow',
    isForecast: true,
    sourceRef: `Punta Net (automatico) - IDDocumento ${s.IDDocumento} / IDRata ${s.IDRata}`,
    puntaNetIDDocumento: s.IDDocumento,
    puntaNetIDRata: s.IDRata,
  };

  if (alta) {
    autoPrevisione.push(base);
  } else {
    revisionePrevisione.push(costruisciBozza({
      dataISO, descrizione, entity, importo: s.ImportoRata, tipo, tipoMovimento,
      categoria, ceType, confidenza, matchKey, vatRateSuggerito: vatRate, vatRateNota: notaRevisione(dataOk),
      cantiereApp, idDocumento: s.IDDocumento, idRata: s.IDRata,
    }));
  }
}
console.log(`Nuova previsione (non ancora nel file per ID): ${autoPrevisione.length + revisionePrevisione.length + duplicatiPerContenutoPrevisione}`);
console.log(`  gia' presenti per contenuto (data+importo+descrizione) — saltate: ${duplicatiPerContenutoPrevisione}`);
console.log(`  auto-scrivibili (alta confidenza): ${autoPrevisione.length}`);
console.log(`  da rivedere in bozza: ${revisionePrevisione.length}\n`);

// ─── Output report (sempre, sia dry-run che scrittura) ─────────────────────────────────
fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, JSON.stringify({ autoConsuntivo, revisioneConsuntivo, autoPrevisione, revisionePrevisione }, null, 2));
console.log(`=== Report salvato in: ${REPORT_PATH} ===`);

if (!SCRIVI) {
  console.log('NESSUNA scrittura sul file dati vero — questo e\' un dry-run (usa --scrivi per scrivere davvero).');
  console.log('Le previsioni esistenti nel file NON sono state toccate — solo lette per il collegamento.');
  process.exit(0);
}

// ─── Scrittura sul file dati vero ─────────────────────────────────
// Rilettura del file AL MOMENTO della scrittura (non quella di inizio script, che puo' risalire a
// minuti prima per via delle query SQL): minimizza la finestra in cui un'altra scrittura (l'app
// stessa, o un altro processo) potrebbe essere andata persa con una sovrascrittura cieca.
const gvDataFresh = JSON.parse(fs.readFileSync(GVCF_PATH, 'utf8'));
const esistentiKeyFresh = new Set();
for (const t of gvDataFresh.transactions) {
  if (t.puntaNetIDDocumento != null && t.puntaNetIDRata != null) esistentiKeyFresh.add(`${t.puntaNetIDDocumento}|${t.puntaNetIDRata}`);
}
const bozzaKeyFresh = new Set();
for (const b of (gvDataFresh.bozzaImportPuntaNet || [])) {
  if (b._puntaNetKey) bozzaKeyFresh.add(b._puntaNetKey);
}

const daScrivere = [...autoConsuntivo, ...autoPrevisione].filter(t => {
  const k = `${t.puntaNetIDDocumento}|${t.puntaNetIDRata}`;
  return !esistentiKeyFresh.has(k);
});
const daMettereInBozza = [...revisioneConsuntivo, ...revisionePrevisione].filter(b => {
  if (!b._puntaNetKey) return true;
  return !esistentiKeyFresh.has(b._puntaNetKey) && !bozzaKeyFresh.has(b._puntaNetKey);
});

if (daScrivere.length === 0 && daMettereInBozza.length === 0) {
  console.log('\nNessun movimento nuovo da scrivere (tutto gia\' presente nel file — probabile doppia esecuzione nella stessa giornata).');
  process.exit(0);
}

fs.mkdirSync(BACKUP_DIR, { recursive: true });
const stamp = `${new Date().toISOString().slice(0, 10)}_${Date.now()}`;
const backupPath = path.join(BACKUP_DIR, `gv-cashflow_v2_PRE-import-automatico_${stamp}.gvcf`);
fs.copyFileSync(GVCF_PATH, backupPath);

gvDataFresh.transactions = [...gvDataFresh.transactions, ...daScrivere];
gvDataFresh.bozzaImportPuntaNet = [...(gvDataFresh.bozzaImportPuntaNet || []), ...daMettereInBozza];
gvDataFresh.timestamp = new Date().toISOString();

const tmpPath = `${GVCF_PATH}.tmp_${process.pid}`;
fs.writeFileSync(tmpPath, JSON.stringify(gvDataFresh, null, 2));
fs.renameSync(tmpPath, GVCF_PATH);

console.log(`\n✔ Scritti ${daScrivere.length} movimenti direttamente in transactions (alta confidenza, gia' definitivi).`);
console.log(`✔ Aggiunti ${daMettereInBozza.length} movimenti in bozzaImportPuntaNet (da rivedere in app — banner giallo).`);
console.log(`  Backup pre-scrittura: ${backupPath}`);
console.log('=== Scrittura completata ===');
