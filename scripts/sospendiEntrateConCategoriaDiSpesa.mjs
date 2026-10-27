// Backfill UNA TANTUM (non fa parte del giro automatico quotidiano) — richiesto dall'utente il
// 2026-10-26/27 dopo aver confermato, via scripts/ispezionaAnomalieEntrate.mjs e
// scripts/confrontaFlussoCassaExcel.mjs, che 13 transazioni INCOME nell'app hanno una categoria di
// SPESA (es. "[FORNITORI] Fornitori Materiali", "[PERSONALE] Contributi Dipendenti Ufficio",
// "[COMPLIANCE] Assicurazioni Generali") invece di una categoria di entrata — sintomo dello stesso
// bug gia' corretto per il FUTURO in scripts/importaPuntaNet.mjs (c360d41, PR #42): il fallback
// classificaRiga/BUILTIN e' type-blind (non distingue INCOME da EXPENSE) e puo' assegnare una
// categoria di spesa per corrispondenza di nome fornitore anche a un'entrata (es. un rimborso da
// Enel Energia, Edilcassa, Unipol SAI). Quel fix impedisce che accada di nuovo, ma non tocca le
// righe gia' scritte in passato — questo script le sospende per la revisione manuale, stesso
// pattern di scripts/sospendiClassificazioneDubbia.mjs.
//
// Ogni riga sospesa ESCE da `transactions` ed ENTRA in `bozzaImportPuntaNet` con categoria=null e
// confermata=false — la stessa coda "da classificare" (banner arancione) che importaPuntaNet.mjs
// produce per le righe a bassa confidenza. L'utente la conferma con la categoria di entrata corretta
// in app, esattamente come farebbe con un nuovo movimento importato.
//
// Default: DRY-RUN, nessuna scrittura, solo un report di quante righe verrebbero sospese.
// Uso: npx tsx scripts/sospendiEntrateConCategoriaDiSpesa.mjs [--scrivi]

import fs from 'fs';
import path from 'path';
import { EXPENSE_CATEGORIES } from '../constants.ts';
import { estraiEntity } from '../utils/puntaNetImporter.ts';

const SCRIVI = process.argv.includes('--scrivi');

const NAS_DATI = String.raw`\\NAS\Ufficio Tecnico\GRUPPO VISENTIN\00_GESTIONE GV\35_APP GV ECOSISTEM\04-GV GestioneFINANZIARIA\DATI SALVATI`;
const GVCF_PATH = path.join(NAS_DATI, 'gv-cashflow_v2-import-puntanet-automatico.gvcf');
const BACKUP_DIR = path.join(NAS_DATI, 'BACKUP');

const CATEGORIE_SPESA = new Set(EXPENSE_CATEGORIES);

function importoLordo(t) {
  if (typeof t.grossAmount === 'number') return t.grossAmount;
  const vat = t.vatRate || 0;
  return (t.amount || 0) * (1 + vat / 100);
}

// Stessa individuazione di ispezionaAnomalieEntrate.mjs Parte 1: un'entrata con una categoria che
// esiste solo lato spesa — qualunque sia, non solo le poche gia' viste a mano.
function trovaCasoEntrataConCategoriaDiSpesa(t) {
  if (t.type !== 'INCOME' || t.isForecast) return null;
  if (!t.category || !CATEGORIE_SPESA.has(t.category)) return null;
  return { nota: `Entrata classificata con una categoria di spesa ("${t.category}") — probabile rimborso/accredito da un fornitore o un ente, non un ricavo operativo. Assegnare la categoria di entrata corretta.` };
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
    // applicherebbe piu' (stessa cautela di sospendiClassificazioneDubbia.mjs, Codex review PR #34).
    puntaNetIDDocumento: t.puntaNetIDDocumento ?? null,
    puntaNetIDRata: t.puntaNetIDRata ?? null,
    puntaNetIDMovimento: t.puntaNetIDMovimento ?? null,
    pagato: t.pagato,
    _puntaNetKey: puntaNetKey,
    _fonte: 'sospensione-entrata-con-categoria-di-spesa',
    // Transazione originale COMPLETA (non solo i campi sopra): "Annulla Import" in app la ripristina
    // com'era se l'utente annulla la revisione, invece di farla sparire insieme alle righe di
    // importazione davvero nuove e scartabili.
    _transazioneOriginale: t,
  };
}

function calcolaSospensioni(transactions) {
  const daSospendere = [];
  const senzaChiave = [];
  for (const t of transactions) {
    const caso = trovaCasoEntrataConCategoriaDiSpesa(t);
    if (!caso) continue;
    const bozza = costruisciBozzaSospesa(t, caso.nota);
    if (!bozza._puntaNetKey) {
      // Nessuna chiave PuntaNet (IDMovimento o IDDocumento+IDRata): non tracciabile a una riga
      // PuntaNet precisa — non si sospende alla cieca una riga che potrebbe essere stata inserita
      // a mano.
      senzaChiave.push(t);
      continue;
    }
    daSospendere.push({ id: t.id, date: t.date, amount: importoLordo(t), description: t.description, categoriaVecchia: t.category, nota: caso.nota, bozza });
  }
  return { daSospendere, senzaChiave };
}

console.log(`=== Sospendi entrate con categoria di spesa (${SCRIVI ? 'SCRITTURA' : 'dry-run'}) ===\n`);

const gvData = JSON.parse(fs.readFileSync(GVCF_PATH, 'utf8'));
const { daSospendere, senzaChiave } = calcolaSospensioni(gvData.transactions);

const totale = daSospendere.reduce((s, r) => s + r.amount, 0);
console.log(`Righe da sospendere in bozzaImportPuntaNet: ${daSospendere.length} (${totale.toFixed(2)} €)\n`);
for (const r of daSospendere.sort((a, b) => b.amount - a.amount)) {
  console.log(`  ${r.date} | ${r.amount.toFixed(2).padStart(12)} €   ${r.description}`);
  console.log(`      era: ${r.categoriaVecchia}`);
}

if (senzaChiave.length > 0) {
  console.log(`\n⚠ ${senzaChiave.length} righe corrispondono al caso ma NON hanno una chiave PuntaNet tracciabile (non sospese, verificare a mano):`);
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
const backupPath = path.join(BACKUP_DIR, `gv-cashflow_v2_PRE-sospendi-entrate-con-categoria-di-spesa_${stamp}.gvcf`);
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
// stesso identico pagamento e potrebbe confermarle entrambe, duplicando la transazione.
const chiaviNuove = new Set(nuoveBozze.map(b => b._puntaNetKey).filter(Boolean));
const bozzaEsistenteFiltrata = (gvDataFresh.bozzaImportPuntaNet || []).filter(b => !b._puntaNetKey || !chiaviNuove.has(b._puntaNetKey));
gvDataFresh.bozzaImportPuntaNet = [...bozzaEsistenteFiltrata, ...nuoveBozze];
gvDataFresh.timestamp = new Date().toISOString();

const tmpPath = `${GVCF_PATH}.tmp_${process.pid}`;
fs.writeFileSync(tmpPath, JSON.stringify(gvDataFresh, null, 2));
fs.renameSync(tmpPath, GVCF_PATH);

console.log(`\n✔ Sospese ${nuoveBozze.length} transazioni in bozzaImportPuntaNet (rilette fresche al momento della scrittura). Compariranno nel banner arancione "da classificare" al prossimo avvio dell'app. Backup pre-scrittura: ${backupPath}`);
