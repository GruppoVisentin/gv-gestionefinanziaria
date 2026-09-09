// Confronto completo e definitivo, gennaio-aprile 2026, riga per riga.
// Usa il report dry-run gia' generato dallo script di produzione (Conti Movimenti, logica
// corretta e validata) e lo confronta con quello che c'e' davvero nel file dati vero.
// Match: stesso tipo, importo NETTO uguale (tolleranza 2 centesimi), data entro 10 giorni
// (PuntaNet ha piu' concetti di "data" per lo stesso pagamento — data contabile vs valuta vs
// scadenza prevista — quindi qualche giorno di scarto e' normale, non un errore).
// Solo lettura, nessuna scrittura da nessuna parte.

import fs from 'fs';
import path from 'path';

const NAS_DATI = String.raw`\\NAS\Ufficio Tecnico\GRUPPO VISENTIN\00_GESTIONE GV\35_APP GV ECOSISTEM\04-GV GestioneFINANZIARIA\DATI SALVATI`;
const gvData = JSON.parse(fs.readFileSync(path.join(NAS_DATI, 'gv-cashflow.gvcf'), 'utf8'));
const report = JSON.parse(fs.readFileSync(path.join(NAS_DATI, 'AUTO', 'dryrun_2026-09-09.json'), 'utf8'));

const MESI = ['2026-01', '2026-02', '2026-03', '2026-04'];
const giorniDiff = (d1, d2) => Math.abs((new Date(d1) - new Date(d2)) / 86400000);

let totaleMancantiValore = 0;
let totaleMancantiRighe = 0;
let totaleRigheEsistenti = 0;

for (const mese of MESI) {
  console.log(`\n========== ${mese} ==========`);
  for (const tipo of ['EXPENSE', 'INCOME']) {
    const es = gvData.transactions.filter(t => !t.isForecast && t.type === tipo && t.date?.startsWith(mese));
    const nu = report.consuntivo.filter(t => t.type === tipo && t.date?.startsWith(mese));
    const usati = new Set();
    const mancanti = [];

    for (const n of nu) {
      const idx = es.findIndex((e, i) => {
        if (usati.has(i)) return false;
        if (giorniDiff(e.date, n.date) > 10) return false;
        return Math.abs((e.amount ?? 0) - (n.amount ?? 0)) < 0.02;
      });
      if (idx >= 0) usati.add(idx);
      else mancanti.push(n);
    }

    const sommaMancanti = mancanti.reduce((s, t) => s + (t.amount ?? 0), 0);
    totaleMancantiValore += sommaMancanti;
    totaleMancantiRighe += mancanti.length;
    totaleRigheEsistenti += es.length;

    console.log(`${tipo}: esistenti=${es.length} | trovate da PuntaNet=${nu.length} | abbinate=${usati.size} | NON trovate nel file=${mancanti.length} (€${sommaMancanti.toFixed(2)})`);
    if (mancanti.length > 0) {
      mancanti.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).slice(0, 10).forEach(t => {
        console.log(`    ${t.date} | €${t.amount.toFixed(2).padStart(10)} | ${t.category} | ${t.description}`);
      });
      if (mancanti.length > 10) console.log(`    ... e altre ${mancanti.length - 10} righe`);
    }
  }
}

console.log(`\n\n========== TOTALE GENNAIO-APRILE ==========`);
console.log(`Righe esistenti nel file: ${totaleRigheEsistenti}`);
console.log(`Righe trovate da PuntaNet ma NON presenti nel file: ${totaleMancantiRighe}`);
console.log(`Valore totale non trovato: €${totaleMancantiValore.toFixed(2)}`);
