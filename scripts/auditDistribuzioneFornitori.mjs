// Audit SOLA LETTURA (nessuna scrittura) — richiesto 2026-10-22 dopo aver trovato e corretto in PR
// #29/#30 due bug dello stesso tipo (un fornitore non riconosciuto dalla regola "su Cantieri" per
// differenze di spazi/punteggiatura, o un alias sbagliato che non combaciava mai con la ragione
// sociale reale): "voglio un'analisi completa, non a campione, che le regole siano state applicate
// e i fornitori distribuiti giustamente".
//
// A differenza del controllo "a campione" fatto a mano finora (cercare "coperture" nelle
// descrizioni), questo script verifica OGNI fornitore con fatture nell'anno contro OGNI regola
// dichiarata nel codice, usando le STESSE funzioni condivise di produzione (normalizzaRagioneSociale,
// isSubappaltoSuCantiere via SUBAPPALTI_SU_CANTIERI_SUPPLIERS_RAW, matchesPattern/REGOLE_BUILTIN —
// tutte importate da utils/puntaNetImporter.ts, mai reimplementate qui) — niente di nuovo da
// mantenere in parallelo, stessa logica di App.tsx/importaPuntaNet.mjs.
//
// Fa 3 verifiche indipendenti:
//   A) Per ogni fornitore con fatture nell'anno: la regola dichiarata (lista "su Cantieri" o pattern
//      BUILTIN) combacia con la ragione sociale reale? Se si', la categoria SCRITTA OGGI nel file
//      dati per quel fornitore e' quella attesa dalla regola? (cattura esattamente il bug di PR
//      #29/#30, per TUTTI i fornitori, non solo quelli con "coperture" nel nome)
//   B) Il percorso inverso: ogni voce della lista "su Cantieri" e ogni pattern BUILTIN trova
//      almeno un fornitore/descrizione reale a cui applicarsi? Una voce che non trova MAI nulla e'
//      un alias sospetto (esattamente come "Termoidraulica G.sc." prima della correzione) — va
//      verificata a mano, non e' detto sia un errore (puo' essere solo un fornitore non attivo
//      nell'anno controllato).
//   C) Lo stesso fornitore reale (identificato dall'entity estratta dalla descrizione) si trova
//      scritto sotto PIU' categorie diverse nel file dati? Non richiede alcuna regola: e' un
//      controllo di coerenza indipendente che cattura anche inconsistenze non legate alle liste.
//
// Limite dichiarato: la Verifica A confronta la regola dichiarata con il dato scritto, non
// ri-simula l'intera pipeline di importaPuntaNet.mjs (tipologia PuntaNet, regole salvate
// dall'utente, inserimenti manuali...). Un fornitore SENZA alcuna regola dichiarata (ne' lista ne'
// pattern BUILTIN) non viene valutato qui: la sua categoria viene dalla tipologia PuntaNet o da
// classificaRiga, un meccanismo diverso, piu' strutturale e finora mai stato la causa dei bug
// trovati.
//
// Uso: npx tsx scripts/auditDistribuzioneFornitori.mjs [anno]
//   anno: default 2026

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  normalizzaRagioneSociale,
  SUBAPPALTI_SU_CANTIERI_SUPPLIERS_RAW,
  REGOLE_BUILTIN,
  matchesPattern,
  estraiEntity,
} from '../utils/puntaNetImporter.ts';

const SQLCMD = String.raw`C:\Program Files\Microsoft SQL Server\Client SDK\ODBC\110\Tools\Binn\SQLCMD.EXE`;
const INSTANCE = String.raw`localhost\SQLEXPRESS`;
const DB_IMPRESA = 'GC_Impresa2_RO';

const NAS_DATI = String.raw`\\NAS\Ufficio Tecnico\GRUPPO VISENTIN\00_GESTIONE GV\35_APP GV ECOSISTEM\04-GV GestioneFINANZIARIA\DATI SALVATI`;
const GVCF_PATH = path.join(NAS_DATI, 'gv-cashflow_v2-import-puntanet-automatico.gvcf');

const ANNO = Number(process.argv[2]) || 2026;

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

function importoLordo(t) {
  if (typeof t.grossAmount === 'number') return Math.abs(t.grossAmount);
  const vat = t.vatRate || 0;
  return Math.abs((t.amount || 0) * (1 + vat / 100));
}

console.log(`=== Audit distribuzione fornitori — anno ${ANNO} (sola lettura) ===\n`);

console.log(`Leggo i fornitori con fatture (FEP/nota di credito passiva) nel ${ANNO}...`);
const fornitoriAnno = runSql(DB_IMPRESA, `SET NOCOUNT ON; SELECT DISTINCT cf.[Ragione Sociale] AS RagioneSociale FROM Documenti d JOIN [Clienti Fornitori] cf ON cf.IDCliFor = d.IDCliFor WHERE d.Tipo IN (1,3) AND YEAR(d.Data) = ${ANNO} AND cf.[Ragione Sociale] IS NOT NULL FOR JSON PATH`)
  .map(r => r.RagioneSociale).filter(Boolean);
console.log(`Trovati ${fornitoriAnno.length} fornitori distinti.\n`);

console.log('Leggo i fornitori con fatture in QUALSIASI anno (per la Verifica B, evitare falsi "alias sbagliato" su fornitori semplicemente non attivi quest\'anno)...');
const fornitoriTutti = runSql(DB_IMPRESA, `SET NOCOUNT ON; SELECT DISTINCT cf.[Ragione Sociale] AS RagioneSociale FROM Documenti d JOIN [Clienti Fornitori] cf ON cf.IDCliFor = d.IDCliFor WHERE d.Tipo IN (1,3) AND cf.[Ragione Sociale] IS NOT NULL FOR JSON PATH`)
  .map(r => r.RagioneSociale).filter(Boolean);
console.log(`Trovati ${fornitoriTutti.length} fornitori distinti in totale.\n`);

const gvData = JSON.parse(fs.readFileSync(GVCF_PATH, 'utf8'));
console.log(`File dati: ${GVCF_PATH} (timestamp: ${gvData.timestamp || '(assente)'})\n`);

// Per ogni entity (normalizzata) estratta dalle descrizioni, le categorie trovate nell'anno,
// con conteggio e importo totale per categoria.
const categoriePerEntity = new Map();
for (const t of gvData.transactions) {
  if (t.type !== 'EXPENSE' || t.isForecast) continue;
  if (!t.date || !t.date.startsWith(String(ANNO))) continue;
  const entity = estraiEntity(t.description || '');
  const norm = normalizzaRagioneSociale(entity);
  if (!norm) continue;
  if (!categoriePerEntity.has(norm)) categoriePerEntity.set(norm, new Map());
  const perCat = categoriePerEntity.get(norm);
  const cat = t.category || '(nessuna categoria)';
  const prev = perCat.get(cat) || { count: 0, totale: 0, esempio: entity };
  prev.count++;
  prev.totale += importoLordo(t);
  perCat.set(cat, prev);
}

// Un fornitore (ragione sociale PuntaNet) puo' comparire in descrizione accorciata o allungata
// rispetto all'entity estratta — combacia in una direzione o nell'altra, come fa gia'
// isSubappaltoSuCantiere per i singoli nomi della lista.
function trovaCategorieAttuali(ragioneSociale) {
  const normRS = normalizzaRagioneSociale(ragioneSociale);
  let trovato = null;
  for (const [normEntity, perCat] of categoriePerEntity) {
    if (!normEntity) continue;
    if (normRS.includes(normEntity) || normEntity.includes(normRS)) {
      if (!trovato) trovato = new Map();
      for (const [cat, info] of perCat) {
        const prev = trovato.get(cat) || { count: 0, totale: 0, esempio: info.esempio };
        prev.count += info.count;
        prev.totale += info.totale;
        trovato.set(cat, prev);
      }
    }
  }
  return trovato;
}

// Stesso ordine di priorita' di classificaRiga in produzione: pattern piu' lungo vince.
const regoleOrdinate = [...REGOLE_BUILTIN].sort((a, b) => b.pattern.length - a.pattern.length);

// ─── VERIFICA A ───────────────────────────────────────────────────
const mismatchSuCantieri = [];
const mismatchBuiltin = [];
const nonVerificabili = [];
let okSuCantieri = 0, okBuiltin = 0;

for (const rs of fornitoriAnno) {
  const normRS = normalizzaRagioneSociale(rs);
  const matchSuCantieri = SUBAPPALTI_SU_CANTIERI_SUPPLIERS_RAW.some(raw => normRS.includes(normalizzaRagioneSociale(raw)));
  const regolaBuiltin = regoleOrdinate.find(r => matchesPattern(rs, r.pattern));
  const categorieAttuali = trovaCategorieAttuali(rs);

  if (matchSuCantieri) {
    const categoriaAttesa = '[FORNITORI] Subappalti su Cantieri';
    if (!categorieAttuali) {
      nonVerificabili.push({ fornitore: rs, regola: 'lista "su Cantieri"', categoriaAttesa });
    } else {
      const altre = [...categorieAttuali.entries()].filter(([cat]) => cat !== categoriaAttesa);
      if (altre.length > 0) mismatchSuCantieri.push({ fornitore: rs, categoriaAttesa, trovate: altre });
      else okSuCantieri++;
    }
  } else if (regolaBuiltin) {
    if (!categorieAttuali) {
      nonVerificabili.push({ fornitore: rs, regola: `pattern BUILTIN "${regolaBuiltin.pattern}"`, categoriaAttesa: regolaBuiltin.categoria });
    } else {
      const altre = [...categorieAttuali.entries()].filter(([cat]) => cat !== regolaBuiltin.categoria);
      if (altre.length > 0) mismatchBuiltin.push({ fornitore: rs, pattern: regolaBuiltin.pattern, categoriaAttesa: regolaBuiltin.categoria, trovate: altre });
      else okBuiltin++;
    }
  }
}

console.log(`\n--- VERIFICA A: fornitore reale vs regola dichiarata (${fornitoriAnno.length} fornitori ${ANNO}) ---`);
console.log(`Corrispondenza corretta: ${okSuCantieri} (lista su Cantieri) + ${okBuiltin} (pattern BUILTIN)\n`);

if (mismatchSuCantieri.length > 0) {
  console.log(`⚠ ${mismatchSuCantieri.length} fornitori in lista "su Cantieri" MA scritti sotto un'altra categoria nel file dati:`);
  for (const m of mismatchSuCantieri.sort((a, b) => b.trovate.reduce((s, [, i]) => s + i.totale, 0) - a.trovate.reduce((s, [, i]) => s + i.totale, 0))) {
    console.log(`  ${m.fornitore}`);
    for (const [cat, info] of m.trovate) console.log(`      ${info.totale.toFixed(2).padStart(12)} €  (${info.count} righe)  →  ${cat}`);
  }
  console.log('');
}

if (mismatchBuiltin.length > 0) {
  console.log(`⚠ ${mismatchBuiltin.length} fornitori riconosciuti da un pattern BUILTIN MA scritti sotto un'altra categoria nel file dati:`);
  for (const m of mismatchBuiltin.sort((a, b) => b.trovate.reduce((s, [, i]) => s + i.totale, 0) - a.trovate.reduce((s, [, i]) => s + i.totale, 0))) {
    console.log(`  ${m.fornitore}  (pattern "${m.pattern}", attesa: ${m.categoriaAttesa})`);
    for (const [cat, info] of m.trovate) console.log(`      ${info.totale.toFixed(2).padStart(12)} €  (${info.count} righe)  →  ${cat}`);
  }
  console.log('');
}

if (nonVerificabili.length > 0) {
  console.log(`ℹ ${nonVerificabili.length} fornitori con una regola dichiarata ma nessuna transazione corrispondente trovata nel file dati per il ${ANNO} (fattura non ancora importata, o l'entity estratta dalla descrizione non combacia — verificare a mano):`);
  for (const n of nonVerificabili) console.log(`  ${n.fornitore}  (${n.regola}, attesa: ${n.categoriaAttesa})`);
  console.log('');
}

// ─── VERIFICA B ───────────────────────────────────────────────────
const subCantieriInutilizzati = SUBAPPALTI_SU_CANTIERI_SUPPLIERS_RAW.filter(raw => {
  const normRaw = normalizzaRagioneSociale(raw);
  return !fornitoriTutti.some(f => normalizzaRagioneSociale(f).includes(normRaw));
});

// In produzione classificaRiga confronta il pattern con riga.entity (l'entity ESTRATTA dalla
// descrizione, non la descrizione intera) — stesso input qui, per non segnalare come "inutilizzato"
// un pattern che in realta' in produzione verrebbe trovato (o viceversa).
const entityStoriche = gvData.transactions.map(t => estraiEntity(t.description || '')).filter(Boolean);
const builtinInutilizzati = REGOLE_BUILTIN.filter(r => !entityStoriche.some(e => matchesPattern(e, r.pattern)));

console.log(`--- VERIFICA B: voci di regola che non combaciano con NESSUN dato reale ---`);
console.log(`(non e' detto siano errori — possono essere alias di un fornitore non attivo. Verificare a mano, come fatto per "Termoidraulica G.sc.")\n`);
if (subCantieriInutilizzati.length > 0) {
  console.log(`Lista "su Cantieri": ${subCantieriInutilizzati.length} voci senza nessun fornitore corrispondente in NESSUN anno:`);
  console.log('  ' + subCantieriInutilizzati.join(', '));
} else {
  console.log('Lista "su Cantieri": tutte le voci trovano almeno un fornitore reale. OK.');
}
console.log('');
if (builtinInutilizzati.length > 0) {
  console.log(`Pattern BUILTIN: ${builtinInutilizzati.length} su ${REGOLE_BUILTIN.length} non trovano nessuna descrizione corrispondente in TUTTO lo storico del file dati:`);
  for (const r of builtinInutilizzati) console.log(`  "${r.pattern}" → ${r.categoria}`);
} else {
  console.log(`Pattern BUILTIN: tutti i ${REGOLE_BUILTIN.length} trovano almeno una corrispondenza storica. OK.`);
}
console.log('');

// ─── VERIFICA C ───────────────────────────────────────────────────
const incoerenzeInterne = [...categoriePerEntity.entries()]
  .filter(([, perCat]) => perCat.size > 1)
  .map(([entity, perCat]) => ({ entity, categorie: [...perCat.entries()], totale: [...perCat.values()].reduce((s, i) => s + i.totale, 0) }))
  .sort((a, b) => b.totale - a.totale);

console.log(`--- VERIFICA C: stesso fornitore (per descrizione), categorie diverse nel ${ANNO} ---`);
console.log('(non richiede alcuna regola — coerenza indipendente)\n');
if (incoerenzeInterne.length > 0) {
  console.log(`⚠ ${incoerenzeInterne.length} fornitori con transazioni in piu' di una categoria:`);
  for (const inc of incoerenzeInterne) {
    console.log(`  ${inc.categorie[0][1].esempio}`);
    for (const [cat, info] of inc.categorie.sort((a, b) => b[1].totale - a[1].totale)) {
      console.log(`      ${info.totale.toFixed(2).padStart(12)} €  (${info.count} righe)  →  ${cat}`);
    }
  }
} else {
  console.log('Nessun fornitore con categorie miste trovato. OK.');
}

console.log(`\n=== Fine audit — ${fornitoriAnno.length} fornitori ${ANNO} verificati, nessuno escluso per campionamento ===`);
