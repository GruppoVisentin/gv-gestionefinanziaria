// Diagnostica SOLA LETTURA — richiesta dall'utente il 2026-10-27 dopo che
// sospendiEntrateConCategoriaDiSpesa.mjs ha segnalato 3 transazioni "senza chiave PuntaNet
// tracciabile" (quindi NON sospese automaticamente): i due "Contributi Dipendenti Ufficio" di
// marzo/aprile 2026 e l'"Assicurazioni Generali" di aprile. L'utente conferma di non aver mai
// inserito nulla a mano sul consuntivo — quindi la mancanza di puntaNetIDMovimento/
// puntaNetIDDocumento+IDRata non è dovuta a un inserimento manuale, va capito il motivo reale.
//
// Questo script stampa l'oggetto transazione COMPLETO (tutti i campi, non solo quelli riassunti da
// ispezionaAnomalieEntrate.mjs) per le 3 righe in questione, individuate per data+importo, cosi' si
// vede esattamente quali campi PuntaNet sono presenti/assenti e con quale sourceRef/importSessionId.
//
// Uso: npx tsx scripts/ispezionaTransazioniSenzaChiave.mjs

import fs from 'fs';
import path from 'path';

const NAS_DATI = String.raw`\\NAS\Ufficio Tecnico\GRUPPO VISENTIN\00_GESTIONE GV\35_APP GV ECOSISTEM\04-GV GestioneFINANZIARIA\DATI SALVATI`;
const GVCF_PATH = path.join(NAS_DATI, 'gv-cashflow_v2-import-puntanet-automatico.gvcf');

const BERSAGLI = [
  { date: '2026-03-16', amountLike: 288 },
  { date: '2026-04-07', amountLike: 369.60 },
  { date: '2026-04-10', amountLike: 3500 },
];

function importoLordo(t) {
  if (typeof t.grossAmount === 'number') return t.grossAmount;
  const vat = t.vatRate || 0;
  return (t.amount || 0) * (1 + (vat || 0) / 100);
}

const gvData = JSON.parse(fs.readFileSync(GVCF_PATH, 'utf8'));

for (const bersaglio of BERSAGLI) {
  console.log(`\n=== Cerco transazione: ${bersaglio.date}, importo ~${bersaglio.amountLike}€ ===`);
  const trovate = gvData.transactions.filter(t => {
    if (t.date !== bersaglio.date) return false;
    const imp = importoLordo(t);
    return Math.abs(imp - bersaglio.amountLike) < 1;
  });
  if (trovate.length === 0) {
    console.log('  Nessuna transazione trovata con questi criteri.');
    continue;
  }
  for (const t of trovate) {
    console.log(JSON.stringify(t, null, 2));
  }
}

// Confronto: stampa anche UNA transazione normale (con puntaNetIDMovimento valorizzato) dello
// stesso periodo, per vedere la differenza di struttura.
console.log('\n=== Per confronto: una transazione EXPENSE qualsiasi di marzo 2026 con chiave PuntaNet valorizzata ===');
const esempio = gvData.transactions.find(t => t.type === 'EXPENSE' && t.date && t.date.startsWith('2026-03') && (t.puntaNetIDMovimento != null || (t.puntaNetIDDocumento != null && t.puntaNetIDRata != null)));
console.log(esempio ? JSON.stringify(esempio, null, 2) : '(nessuna trovata)');

console.log('\n=== Fine ispezione — nessun dato e\' stato modificato ===');
