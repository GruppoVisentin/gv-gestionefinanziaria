// Diagnostica SOLA LETTURA (nessuna scrittura, nessuna modifica) per capire perche' il "TOTALE
// USCITE" consuntivo mostrato in app (Cash Flow) non coincide con il flusso di cassa tenuto a
// mano in Excel dall'utente.
//
// Richiesto 2026-10-20: differenze di 12k-86k€ al mese (app sempre piu' alta di Excel per
// giugno/luglio/agosto, molto piu' bassa per settembre — quest'ultimo gia' spiegato dal ritardo
// di riconciliazione PuntaNet). Il tracciato Excel copre praticamente lo stesso universo di
// costi dell'app (IVA, rate finanziamenti, spese bancarie, stipendi, subappalti, professionisti,
// acquisizioni...), quindi non e' un problema di categorie escluse — il sospetto e' su
// transazioni specifiche: duplicati da percorsi di import diversi, o importi con segno errato.
//
// Esteso 2026-10-21 (su richiesta: "non puo' essere che ci siano fatture di mesi lontani tipo
// gennaio ancora da pagare?") a TUTTI i mesi dell'anno fino a quello corrente — non solo
// giugno-settembre — cosi' il "di cui non pagato" e il controllo duplicati coprono anche gennaio
// e gli altri mesi, non solo quelli originariamente sospettati.
//
// Replica la stessa logica di calcolo di ExpenseTimeline.tsx (getMonthlyTotal) — e' quel
// componente, non CashFlowTimeline, a disegnare la riga "TOTALE USCITE" mostrata in app: EXPENSE,
// isForecast=false, ceType !== 'ammortamento', importo lordo (grossAmount se presente, altrimenti
// amount*(1+vatRate/100)), raggruppato per mese di competenza = campo `date` (cassa) — E SOLO le
// categorie presenti in fixedCategories/variableCategories (personalizzabili in Config): una
// transazione con categoria "Altro / Non Classificato" o una categoria rimossa viene esclusa dal
// totale mostrato in app, quindi va esclusa anche qui per confrontare lo stesso numero.
//
// Uso: npx tsx scripts/diagnosticaScostamentoUscite.mjs

import fs from 'fs';
import path from 'path';
import { FIXED_COST_CATEGORIES, VARIABLE_COST_CATEGORIES } from '../constants.ts';

const NAS_DATI = String.raw`\\NAS\Ufficio Tecnico\GRUPPO VISENTIN\00_GESTIONE GV\35_APP GV ECOSISTEM\04-GV GestioneFINANZIARIA\DATI SALVATI`;
const GVCF_PATH = path.join(NAS_DATI, 'gv-cashflow_v2-import-puntanet-automatico.gvcf');

const ANNO = 2026;
const NOMI_MESE = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
// Da gennaio al mese corrente incluso (non solo giugno-settembre: vedi nota sopra). Se lo script
// viene eseguito in un anno successivo ad ANNO, quell'anno e' gia' tutto storico: copre tutti e 12
// i mesi invece di fermarsi al mese corrente di ESECUZIONE (trovato in review: Codex, 2026-10-21).
const oggi = new Date();
const ultimoMeseDaCoprire = oggi.getUTCFullYear() === ANNO ? oggi.getUTCMonth() : 11;
const MESI = NOMI_MESE.slice(0, ultimoMeseDaCoprire + 1).map((nome, idx) => ({ idx, nome }));

function importoLordo(t) {
  if (typeof t.grossAmount === 'number') return t.grossAmount;
  const vat = t.vatRate || 0;
  return (t.amount || 0) * (1 + vat / 100);
}

const gvData = JSON.parse(fs.readFileSync(GVCF_PATH, 'utf8'));
console.log(`=== Diagnostica scostamento USCITE — dati letti da: ${GVCF_PATH} ===`);
console.log(`Timestamp file: ${gvData.timestamp || '(assente)'}\n`);

// Come in App.tsx: usa le liste personalizzate nel file se presenti, altrimenti i default.
const fixedCategories = gvData.fixedCategories || [...FIXED_COST_CATEGORIES];
const variableCategories = gvData.variableCategories || [...VARIABLE_COST_CATEGORIES];
const categorieValide = new Set([...fixedCategories, ...variableCategories]);

const uscite = gvData.transactions.filter(t => {
  const d = new Date(`${t.date}T00:00:00Z`);
  return t.type === 'EXPENSE' && !t.isForecast && t.ceType !== 'ammortamento' && d.getUTCFullYear() === ANNO;
});

const fuoriCategoria = uscite.filter(t => !categorieValide.has(t.category));
if (fuoriCategoria.length > 0) {
  console.log(`⚠️  ${fuoriCategoria.length} uscite con categoria NON presente in fixedCategories/variableCategories (escluse dal "TOTALE USCITE" mostrato in app, es. "Altro / Non Classificato" o una categoria rimossa):`);
  for (const t of fuoriCategoria) {
    console.log(`    ${t.date} — ${importoLordo(t).toFixed(2)} €  —  categoria: "${t.category}"  —  "${t.description}"`);
  }
  console.log('');
}

const riepilogo = []; // { nome, totale, nonPagato, duplicati } — stampato in coda, dopo il dettaglio mese per mese

for (const mese of MESI) {
  const delMese = uscite.filter(t => new Date(`${t.date}T00:00:00Z`).getUTCMonth() === mese.idx && categorieValide.has(t.category));
  const totale = delMese.reduce((s, t) => s + importoLordo(t), 0);
  const nonPagato = delMese.filter(t => t.pagato === false).reduce((s, t) => s + importoLordo(t), 0);
  console.log(`\n=== ${mese.nome} 2026 — TOTALE USCITE (come in app): ${totale.toFixed(2)} € (${delMese.length} transazioni) ===`);
  if (nonPagato > 0) {
    console.log(`  di cui ${nonPagato.toFixed(2)} € non ancora pagati (fatture PuntaNet in attesa) — il resto, ${(totale - nonPagato).toFixed(2)} €, e' il confronto corretto con un flusso di cassa come l'Excel.`);
  }

  // --- Possibili duplicati: stessa data + stesso importo lordo (arrotondato al centesimo) ---
  const perChiave = new Map();
  for (const t of delMese) {
    const chiave = `${t.date}|${Math.round(importoLordo(t) * 100)}`;
    if (!perChiave.has(chiave)) perChiave.set(chiave, []);
    perChiave.get(chiave).push(t);
  }
  const sospetti = [...perChiave.values()].filter(list => list.length > 1);
  // Righe in eccesso per gruppo (list.length - 1), non il numero di gruppi: 3 righe identiche
  // sono 2 duplicati, non 1 (trovato in review: Codex, 2026-10-21).
  const righeInEccesso = sospetti.reduce((s, list) => s + (list.length - 1), 0);
  riepilogo.push({ nome: mese.nome, totale, nonPagato, duplicati: righeInEccesso });
  if (sospetti.length > 0) {
    console.log(`  ⚠️  Possibili DUPLICATI (stessa data + stesso importo lordo):`);
    for (const list of sospetti) {
      console.log(`    ${list[0].date} — ${importoLordo(list[0]).toFixed(2)} € — ${list.length} righe:`);
      for (const t of list) {
        console.log(`      [${t.id?.slice(0, 8)}] "${t.description}" — categoria: ${t.category} — sourceRef: ${t.sourceRef || '(nessuno)'}`);
      }
    }
  } else {
    console.log(`  Nessun possibile duplicato trovato (stessa data+importo).`);
  }

  // --- Segno anomalo: importo lordo negativo su una EXPENSE che NON sia una nota di credito
  // passiva legittima (importaPuntaNet.mjs le scrive apposta con grossAmount negativo per
  // stornare la fattura originale — descrizione sempre con prefisso "Nota di credito -") ---
  const segnoAnomalo = delMese.filter(t => importoLordo(t) < 0 && !t.description?.startsWith('Nota di credito'));
  const noteCredito = delMese.filter(t => importoLordo(t) < 0 && t.description?.startsWith('Nota di credito'));
  if (segnoAnomalo.length > 0) {
    console.log(`  ⚠️  USCITE con importo NEGATIVO e segno davvero anomalo (${segnoAnomalo.length} righe, escluse le note di credito legittime):`);
    for (const t of segnoAnomalo) {
      console.log(`      [${t.id?.slice(0, 8)}] ${t.date} — ${importoLordo(t).toFixed(2)} € — "${t.description}" — categoria: ${t.category}`);
    }
  }
  if (noteCredito.length > 0) {
    console.log(`  (${noteCredito.length} note di credito passive legittime, gia' nette nel totale sopra — ${noteCredito.reduce((s, t) => s + importoLordo(t), 0).toFixed(2)} €)`);
  }

  // --- Dettaglio per categoria, ordinato dal piu' grande ---
  const perCategoria = new Map();
  for (const t of delMese) {
    const tot = perCategoria.get(t.category) || { somma: 0, conteggio: 0 };
    tot.somma += importoLordo(t);
    tot.conteggio++;
    perCategoria.set(t.category, tot);
  }
  console.log(`  Dettaglio per categoria (dal piu' grande):`);
  for (const [cat, { somma, conteggio }] of [...perCategoria.entries()].sort((a, b) => b[1].somma - a[1].somma)) {
    console.log(`    ${somma.toFixed(2).padStart(12)} €  (${conteggio} righe)  —  ${cat}`);
  }
}

console.log('\n\n=== Riepilogo tutti i mesi (gennaio → mese corrente) ===');
console.log('  Mese'.padEnd(12) + 'Totale uscite'.padStart(16) + '  di cui da pagare'.padStart(20) + '  duplicati sospetti'.padStart(22));
for (const r of riepilogo) {
  console.log(`  ${r.nome.padEnd(10)}${r.totale.toFixed(2).padStart(16)} €${r.nonPagato.toFixed(2).padStart(16)} €${String(r.duplicati).padStart(12)}`);
}

console.log('\n\n=== Fine diagnostica — nessun dato e\' stato modificato ===');
