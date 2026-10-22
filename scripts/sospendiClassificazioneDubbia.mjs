// Backfill UNA TANTUM (non fa parte del giro automatico quotidiano) — richiesto dall'utente dopo
// l'audit di scripts/auditDistribuzioneFornitori.mjs (2026-10-22): "mettimili in sospeso ... se hai
// dubbi nell'assegnazione dentro la app". Quando una regola dichiarata (lista "su Cantieri" o un
// pattern BUILTIN) e la categoria gia' scritta per un fornitore non sono d'accordo, la decisione
// finale spetta all'utente in app — questo script non sceglie quale lato ha ragione.
//
// Ogni riga sospesa ESCE da `transactions` ed ENTRA in `bozzaImportPuntaNet` con categoria=null e
// confermata=false — la stessa coda "da classificare" (banner arancione) che importaPuntaNet.mjs
// produce per le righe a bassa confidenza. L'utente la conferma o la corregge in app, esattamente
// come farebbe con un nuovo movimento importato.
//
// Lista CURATA (non tutto cio' che l'audit segnala dal vivo in un dato momento): solo i casi gia'
// controllati a mano in questa sessione (vedi report 2026-10-22). Non si riesegue l'audit dal vivo
// qui apposta, per non sospendere anche i suoi falsi positivi noti (es. il pattern "BERTON" che
// incrocia "Robelon", o "MESE DI GIUGNO" nella Verifica C — nomi di fantasia generati dall'estrazione
// entity su descrizioni che non sono affatto nomi di fornitore).
//
// Prerequisito (fatto nello stesso commit): importaPuntaNet.mjs ora riconosce una riga gia' in
// bozzaImportPuntaNet come "gia' gestita" — altrimenti il giro automatico di domani avrebbe
// ri-classificato da zero una riga appena sospesa e, se la confidenza fosse ancora alta, l'avrebbe
// riscritta direttamente in transactions: un doppione (una copia in bozza, una in transactions) che
// avrebbe vanificato la sospensione in silenzio.
//
// Default: DRY-RUN, nessuna scrittura, solo un report di quante righe verrebbero sospese.
// Uso: npx tsx scripts/sospendiClassificazioneDubbia.mjs [--scrivi]

import fs from 'fs';
import path from 'path';
import {
  isSubappaltoSuCantiere,
  matchesPattern,
  REGOLE_BUILTIN,
  estraiEntity,
  isSpesaBancaria,
} from '../utils/puntaNetImporter.ts';

const SCRIVI = process.argv.includes('--scrivi');

const NAS_DATI = String.raw`\\NAS\Ufficio Tecnico\GRUPPO VISENTIN\00_GESTIONE GV\35_APP GV ECOSISTEM\04-GV GestioneFINANZIARIA\DATI SALVATI`;
const GVCF_PATH = path.join(NAS_DATI, 'gv-cashflow_v2-import-puntanet-automatico.gvcf');
const BACKUP_DIR = path.join(NAS_DATI, 'BACKUP');

const CATEGORIA_MATERIALI = '[FORNITORI] Fornitori Materiali';

// Pattern BUILTIN gia' esaminati a mano con la sessione locale (report 2026-10-22): per ciascuno,
// un frammento che individua il pattern REGOLE_BUILTIN giusto (non il nome del fornitore — alcuni
// pattern includono anche il nome del titolare, es. "SERNAGIOTTO" puo' comparire dentro un pattern
// piu' lungo "SEMENZIN E SERNAGIOTTO").
const FRAMMENTI_PATTERN_DA_SOSPENDERE = [
  'TVM RENT',
  'VELLO',
  'STUDIO VISENTIN',
  'LONDERO MARIO',
  'SERNAGIOTTO',
  'GEOCONSULT',
  'NORMATEMPO',
];
// Ordinati per lunghezza decrescente, stessa precedenza di classificaRiga/auditDistribuzioneFornitori:
// un pattern piu' specifico e lungo (es. "SEMENZIN E SERNAGIOTTO") deve vincere su uno piu' corto
// e generico che lo contiene come sottostringa (es. "SERNAGIOTTO SRL"), altrimenti una riga gia'
// classificata correttamente dal pattern giusto risulterebbe erroneamente "in disaccordo" con quello
// sbagliato trovato per primo (Codex review, PR #34, 2026-10-22).
const patternDaSospendere = REGOLE_BUILTIN
  .filter(r => FRAMMENTI_PATTERN_DA_SOSPENDERE.some(f => r.pattern.toUpperCase().includes(f)))
  .sort((a, b) => b.pattern.length - a.pattern.length);

function importoLordo(t) {
  if (typeof t.grossAmount === 'number') return t.grossAmount;
  const vat = t.vatRate || 0;
  return (t.amount || 0) * (1 + vat / 100);
}

// Caso 1: fornitore gia' nella lista "su Cantieri" (verificata sulla ragione sociale reale in PR
// #29/#30), ma scritto in Fornitori Materiali invece che Manodopera — la correzione automatica
// (isSubappaltoSuCantiere) scatta oggi solo a partire da Manodopera, quindi non la copre.
function trovaCasoListaSuCantieri(t) {
  if (t.type !== 'EXPENSE' || t.isForecast) return null;
  if (t.category !== CATEGORIA_MATERIALI) return null;
  // Una riga di spesa bancaria (es. "SPESE PER BONIFICO - RIF.TO <fornitore>") nomina il fornitore
  // solo come riferimento del bonifico: e' gia' classificata giustamente, non e' affatto un dubbio
  // di categoria (stesso filtro usato dall'audit, Codex review PR #34, 2026-10-22).
  if (isSpesaBancaria(t.description || '')) return null;
  if (!isSubappaltoSuCantiere(t.description || '')) return null;
  return { nota: 'Fornitore in lista "su Cantieri" ma scritto in Fornitori Materiali — la correzione automatica copre solo le righe provenienti da Manodopera. Verificare e classificare manualmente.' };
}

// Caso 2: un pattern BUILTIN della lista curata sopra combacia con la descrizione, ma la categoria
// gia' scritta e' diversa da quella attesa dal pattern — non e' detto che il pattern abbia ragione
// (potrebbe essere lui stesso datato/sbagliato), quindi si sospende anziche' correggere alla cieca.
function trovaCasoBuiltin(t) {
  if (t.type !== 'EXPENSE' || t.isForecast) return null;
  if (isSpesaBancaria(t.description || '')) return null;
  const entity = estraiEntity(t.description || '');
  const regola = patternDaSospendere.find(r => matchesPattern(entity, r.pattern) || matchesPattern(t.description || '', r.pattern));
  if (!regola) return null;
  if (t.category === regola.categoria) return null; // gia' d'accordo, nessun dubbio
  return { nota: `Un pattern di classificazione automatica ("${regola.pattern}") si aspetta la categoria "${regola.categoria}", ma la riga e' scritta come "${t.category}". Verificare quale sia corretto e classificare manualmente.` };
}

function costruisciBozzaSospesa(t, nota) {
  const puntaNetKey = t.puntaNetIDMovimento != null
    ? `mov:${t.puntaNetIDMovimento}`
    : (t.puntaNetIDDocumento != null && t.puntaNetIDRata != null ? `doc:${t.puntaNetIDDocumento}|${t.puntaNetIDRata}` : null);
  return {
    riga: {
      data: new Date(t.date),
      descrizione: t.description || '',
      entity: estraiEntity(t.description || ''),
      importo: importoLordo(t),
      tipo: t.type,
      flagConto: 'B',
      tipoMovimento: 'ALTRO',
    },
    categoria: null,
    ceType: null,
    confidenza: null,
    matchKey: null,
    confermata: false,
    vatRateSuggerito: t.vatRate ?? null,
    vatRateNota: nota,
    vatRateConfermato: null,
    isDuplicato: false,
    livelloDuplicato: null,
    arricchitoDaFattura: t.puntaNetIDDocumento != null,
    cantiereSuggerito: t.project || null,
    cantiereScore: t.project ? 100 : 0,
    cantierePuntaNet: t.project || '',
    cantiereMatchFonte: null,
    tipoEntrata: null,
    dataDocumento: t.invoiceDate || null,
    // Ripristinati da ImportPuntaNetModal sulla Transaction finale alla conferma — senza questi,
    // il giro di import automatico successivo non riconoscerebbe piu' questa fattura/movimento come
    // "gia' gestito" (rischio di doppione) e la riconciliazione automatica del pagamento non si
    // applicherebbe piu' (Codex review, PR #34, 2026-10-22).
    puntaNetIDDocumento: t.puntaNetIDDocumento ?? null,
    puntaNetIDRata: t.puntaNetIDRata ?? null,
    puntaNetIDMovimento: t.puntaNetIDMovimento ?? null,
    pagato: t.pagato,
    _puntaNetKey: puntaNetKey,
    _fonte: 'sospensione-classificazione-dubbia-2026-10-22',
    // Transazione originale COMPLETA (non solo i campi sopra): "Annulla Import" in app la ripristina
    // com'era se l'utente annulla la revisione, invece di farla sparire insieme alle righe di
    // importazione davvero nuove e scartabili (Codex review, PR #34, 2026-10-22).
    _transazioneOriginale: t,
  };
}

function calcolaSospensioni(transactions) {
  const daSospendere = [];
  const senzaChiave = [];
  for (const t of transactions) {
    const caso = trovaCasoListaSuCantieri(t) || trovaCasoBuiltin(t);
    if (!caso) continue;
    const bozza = costruisciBozzaSospesa(t, caso.nota);
    if (!bozza._puntaNetKey) {
      // Nessuna chiave PuntaNet (IDMovimento o IDDocumento+IDRata): non tracciabile a una riga
      // PuntaNet precisa — non si sospende alla cieca una riga che potrebbe essere stata inserita
      // a mano (anche se, per il principio gia' confermato con l'utente, il 2026 e' sempre import
      // automatico; questo resta comunque un controllo di sicurezza).
      senzaChiave.push(t);
      continue;
    }
    daSospendere.push({ id: t.id, date: t.date, amount: importoLordo(t), description: t.description, categoriaVecchia: t.category, nota: caso.nota, bozza });
  }
  return { daSospendere, senzaChiave };
}

console.log(`=== Sospendi classificazione dubbia (${SCRIVI ? 'SCRITTURA' : 'dry-run'}) ===\n`);

const gvData = JSON.parse(fs.readFileSync(GVCF_PATH, 'utf8'));
const { daSospendere, senzaChiave } = calcolaSospensioni(gvData.transactions);

const totale = daSospendere.reduce((s, r) => s + r.amount, 0);
console.log(`Righe da sospendere in bozzaImportPuntaNet: ${daSospendere.length} (${totale.toFixed(2)} €)\n`);
for (const r of daSospendere.sort((a, b) => b.amount - a.amount)) {
  console.log(`  ${r.amount.toFixed(2).padStart(12)} €   ${r.description}`);
  console.log(`      era: ${r.categoriaVecchia}`);
  console.log(`      ${r.nota}`);
}

if (senzaChiave.length > 0) {
  console.log(`\n⚠ ${senzaChiave.length} righe corrispondono a un caso dubbio ma NON hanno una chiave PuntaNet tracciabile (non sospese, verificare a mano):`);
  for (const t of senzaChiave) console.log(`  ${t.date} | ${t.category} | ${t.description}`);
}

if (!SCRIVI) {
  console.log('\nNESSUNA scrittura — dry-run. Rilancia con --scrivi per applicare davvero.');
  process.exit(0);
}

if (daSospendere.length === 0) {
  console.log('\nNulla da sospendere.');
  process.exit(0);
}

fs.mkdirSync(BACKUP_DIR, { recursive: true });
const stamp = `${new Date().toISOString().slice(0, 10)}_${Date.now()}`;
const backupPath = path.join(BACKUP_DIR, `gv-cashflow_v2_PRE-sospendi-classificazione-dubbia_${stamp}.gvcf`);
fs.copyFileSync(GVCF_PATH, backupPath);

// Rilettura del file AL MOMENTO della scrittura (stessa convenzione degli altri script).
const gvDataFresh = JSON.parse(fs.readFileSync(GVCF_PATH, 'utf8'));
const { daSospendere: freschi } = calcolaSospensioni(gvDataFresh.transactions);
const perId = new Map(freschi.map(r => [r.id, r.bozza]));

const transazioniRimaste = [];
const nuoveBozze = [];
for (const t of gvDataFresh.transactions) {
  const bozza = perId.get(t.id);
  if (bozza) nuoveBozze.push(bozza);
  else transazioniRimaste.push(t);
}
gvDataFresh.transactions = transazioniRimaste;
// Se una bozza con la STESSA chiave PuntaNet esistesse gia' (anomalia pre-esistente: una
// transazione e una bozza per la stessa fattura/movimento), quella nuova appena costruita dalla
// transazione reale la sostituisce — non si accoda, altrimenti l'utente vedrebbe due righe per lo
// stesso identico pagamento e potrebbe confermarle entrambe, duplicando la transazione (Codex
// review, PR #34, 2026-10-22).
const chiaviNuove = new Set(nuoveBozze.map(b => b._puntaNetKey).filter(Boolean));
const bozzaEsistenteFiltrata = (gvDataFresh.bozzaImportPuntaNet || []).filter(b => !b._puntaNetKey || !chiaviNuove.has(b._puntaNetKey));
gvDataFresh.bozzaImportPuntaNet = [...bozzaEsistenteFiltrata, ...nuoveBozze];
gvDataFresh.timestamp = new Date().toISOString();

const tmpPath = `${GVCF_PATH}.tmp_${process.pid}`;
fs.writeFileSync(tmpPath, JSON.stringify(gvDataFresh, null, 2));
fs.renameSync(tmpPath, GVCF_PATH);

console.log(`\n✔ Sospese ${nuoveBozze.length} transazioni in bozzaImportPuntaNet (rilette fresche al momento della scrittura). Compariranno nel banner arancione "da classificare" al prossimo avvio dell'app. Backup pre-scrittura: ${backupPath}`);
