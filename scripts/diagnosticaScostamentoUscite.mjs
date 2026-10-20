// Diagnostica SOLA LETTURA (nessuna scrittura, nessuna modifica) per capire perche' il "TOTALE
// USCITE" consuntivo mostrato in app (Cash Flow) non coincide con il flusso di cassa tenuto a
// mano in Excel dall'utente, per i mesi di giugno-settembre 2026.
//
// Richiesto 2026-10-20: differenze di 12k-86k€ al mese (app sempre piu' alta di Excel per
// giugno/luglio/agosto, molto piu' bassa per settembre — quest'ultimo gia' spiegato dal ritardo
// di riconciliazione PuntaNet). Il tracciato Excel copre praticamente lo stesso universo di
// costi dell'app (IVA, rate finanziamenti, spese bancarie, stipendi, subappalti, professionisti,
// acquisizioni...), quindi non e' un problema di categorie escluse — il sospetto e' su
// transazioni specifiche: duplicati da percorsi di import diversi, o importi con segno errato.
//
// Replica la stessa logica di calcolo di components/CashFlowTimeline.tsx (calculateMonthlyFlow):
// EXPENSE, isForecast=false, ceType !== 'ammortamento', importo lordo (grossAmount se presente,
// altrimenti amount*(1+vatRate/100)), raggruppato per mese di competenza = campo `date` (cassa).
//
// Uso: npx tsx scripts/diagnosticaScostamentoUscite.mjs

import fs from 'fs';
import path from 'path';

const NAS_DATI = String.raw`\\NAS\Ufficio Tecnico\GRUPPO VISENTIN\00_GESTIONE GV\35_APP GV ECOSISTEM\04-GV GestioneFINANZIARIA\DATI SALVATI`;
const GVCF_PATH = path.join(NAS_DATI, 'gv-cashflow_v2-import-puntanet-automatico.gvcf');

const ANNO = 2026;
// Indici mese (0=gennaio) — giugno=5 ... settembre=8
const MESI = [
  { idx: 5, nome: 'Giugno' },
  { idx: 6, nome: 'Luglio' },
  { idx: 7, nome: 'Agosto' },
  { idx: 8, nome: 'Settembre' },
];

function importoLordo(t) {
  if (typeof t.grossAmount === 'number') return t.grossAmount;
  const vat = t.vatRate || 0;
  return (t.amount || 0) * (1 + vat / 100);
}

const gvData = JSON.parse(fs.readFileSync(GVCF_PATH, 'utf8'));
console.log(`=== Diagnostica scostamento USCITE — dati letti da: ${GVCF_PATH} ===`);
console.log(`Timestamp file: ${gvData.timestamp || '(assente)'}\n`);

const uscite = gvData.transactions.filter(t => {
  const d = new Date(`${t.date}T00:00:00Z`);
  return t.type === 'EXPENSE' && !t.isForecast && t.ceType !== 'ammortamento' && d.getUTCFullYear() === ANNO;
});

for (const mese of MESI) {
  const delMese = uscite.filter(t => new Date(`${t.date}T00:00:00Z`).getUTCMonth() === mese.idx);
  const totale = delMese.reduce((s, t) => s + importoLordo(t), 0);
  console.log(`\n=== ${mese.nome} 2026 — TOTALE USCITE (come in app): ${totale.toFixed(2)} € (${delMese.length} transazioni) ===`);

  // --- Possibili duplicati: stessa data + stesso importo lordo (arrotondato al centesimo) ---
  const perChiave = new Map();
  for (const t of delMese) {
    const chiave = `${t.date}|${Math.round(importoLordo(t) * 100)}`;
    if (!perChiave.has(chiave)) perChiave.set(chiave, []);
    perChiave.get(chiave).push(t);
  }
  const sospetti = [...perChiave.values()].filter(list => list.length > 1);
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

  // --- Segno anomalo: importo lordo negativo su una EXPENSE (dovrebbe sempre essere positivo) ---
  const segnoAnomalo = delMese.filter(t => importoLordo(t) < 0);
  if (segnoAnomalo.length > 0) {
    console.log(`  ⚠️  USCITE con importo NEGATIVO (segno anomalo, ${segnoAnomalo.length} righe):`);
    for (const t of segnoAnomalo) {
      console.log(`      [${t.id?.slice(0, 8)}] ${t.date} — ${importoLordo(t).toFixed(2)} € — "${t.description}" — categoria: ${t.category}`);
    }
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

console.log('\n\n=== Fine diagnostica — nessun dato e\' stato modificato ===');
