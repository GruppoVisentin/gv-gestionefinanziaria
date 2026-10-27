// Diagnostica SOLA LETTURA (nessuna scrittura) — richiesta dall'utente il 2026-10-27 dopo aver
// visto che l'elenco dei movimenti ENTRATE di agosto e settembre 2026 (elencaMovimentiPerCategoria.mjs)
// non lascia margine: i totali app di quei due mesi sono interamente spiegati dalle righe elencate,
// quindi lo scarto rispetto all'Excel (-7.027,28€ ad agosto, -8.996,00€ a settembre) non è un
// problema di categoria — o manca proprio un incasso nell'app, o un incasso Excel di quel mese è
// stato registrato nell'app con una data diversa (slittamento). Questo script cerca, su TUTTO
// l'anno (non solo i due mesi sospetti), transazioni INCOME il cui importo lordo è vicino a uno o
// più valori dati — se la stessa fattura è "slittata" di mese, qui si vede dove e' finita davvero.
//
// Uso: npx tsx scripts/cercaIncassoPerImporto.mjs <importo1,importo2,...> [tolleranza] [anno]
//   importo: valore in euro, es. 7027.28 — cerca importi vicini entro la tolleranza
//   tolleranza (opzionale, default 5): scarto massimo in euro accettato
//   anno (opzionale, default 2026)
//   Esempio: npx tsx scripts/cercaIncassoPerImporto.mjs 7027.28,8996.00

import fs from 'fs';
import path from 'path';

const [, , importiArg, tolleranzaArg, annoArg] = process.argv;
if (!importiArg) {
  console.error('Uso: npx tsx scripts/cercaIncassoPerImporto.mjs <importo1,importo2,...> [tolleranza] [anno]');
  process.exit(1);
}
const IMPORTI = importiArg.split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n));
if (IMPORTI.length === 0) {
  console.error('✖ Nessun importo valido indicato.');
  process.exit(1);
}
const TOLLERANZA = tolleranzaArg ? Number(tolleranzaArg) : 5;
const ANNO = annoArg ? Number(annoArg) : 2026;

const NAS_DATI = String.raw`\\NAS\Ufficio Tecnico\GRUPPO VISENTIN\00_GESTIONE GV\35_APP GV ECOSISTEM\04-GV GestioneFINANZIARIA\DATI SALVATI`;
const GVCF_PATH = path.join(NAS_DATI, 'gv-cashflow_v2-import-puntanet-automatico.gvcf');

function importoLordo(t) {
  if (typeof t.grossAmount === 'number') return t.grossAmount;
  const vat = t.vatRate || 0;
  return (t.amount || 0) * (1 + (vat || 0) / 100);
}

const gvData = JSON.parse(fs.readFileSync(GVCF_PATH, 'utf8'));
console.log(`App: dati letti da ${GVCF_PATH} (timestamp file: ${gvData.timestamp || '(assente)'})`);
console.log(`Cerco transazioni INCOME nell'anno ${ANNO} con importo vicino a: ${IMPORTI.join(', ')} € (tolleranza ±${TOLLERANZA}€)\n`);

for (const importoCercato of IMPORTI) {
  console.log(`=== Importo vicino a ${importoCercato.toFixed(2)} € ===`);
  const trovate = gvData.transactions.filter(t => {
    if (t.type !== 'INCOME' || t.isForecast) return false;
    if (!t.date || !t.date.startsWith(String(ANNO))) return false;
    return Math.abs(importoLordo(t) - importoCercato) <= TOLLERANZA;
  });
  if (trovate.length === 0) {
    console.log('  Nessuna transazione trovata con questo importo in nessun mese dell\'anno.\n');
    continue;
  }
  for (const t of trovate.sort((a, b) => a.date.localeCompare(b.date))) {
    console.log(`  ${t.date}  ${importoLordo(t).toFixed(2).padStart(12)} €   ${t.category}   ${t.description || '(senza descrizione)'}`);
  }
  console.log('');
}

console.log('=== Fine ricerca — nessun dato e\' stato modificato ===');
