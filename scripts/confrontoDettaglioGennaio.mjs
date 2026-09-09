// Confronto riga per riga (gennaio 2026, GRUPPO VISENTIN SRL): per ogni movimento reale
// trovato da PuntaNet via SQL, verifica se esiste gia' un movimento con stessa data e stesso
// importo (tolleranza 1 centesimo) nel file dati vero. Se non lo trova, e' un candidato
// "mancante" dall'import Excel storico. Solo lettura, nessuna scrittura da nessuna parte.

import fs from 'fs';
import path from 'path';

const NAS_DATI = String.raw`\\NAS\Ufficio Tecnico\GRUPPO VISENTIN\00_GESTIONE GV\35_APP GV ECOSISTEM\04-GV GestioneFINANZIARIA\DATI SALVATI`;
const GVCF_PATH = path.join(NAS_DATI, 'gv-cashflow.gvcf');
const TEST_PATH = path.join(NAS_DATI, 'AUTO', 'TEST_gv-cashflow_confronto2026.gvcf');

const gvData = JSON.parse(fs.readFileSync(GVCF_PATH, 'utf8'));
const testData = JSON.parse(fs.readFileSync(TEST_PATH, 'utf8'));

// Le transazioni "nuove" sono quelle in testData ma non in gvData (per id, generati ora)
const idEsistenti = new Set(gvData.transactions.map(t => t.id));
const nuoveTransazioni = testData.transactions.filter(t => !idEsistenti.has(t.id));

const MESE = '2026-01';
const esistentiGennaio = gvData.transactions.filter(t => !t.isForecast && t.date?.startsWith(MESE));
const nuoveGennaio = nuoveTransazioni.filter(t => !t.isForecast && t.date?.startsWith(MESE));

function trovaMatch(nuova, esistenti, usati) {
  return esistenti.find((e, idx) => {
    if (usati.has(idx)) return false;
    if (e.type !== nuova.type) return false;
    if (e.date !== nuova.date) return false;
    const importoE = e.grossAmount ?? e.amount ?? 0;
    const importoN = nuova.grossAmount ?? nuova.amount ?? 0;
    return Math.abs(importoE - importoN) < 0.02;
  });
}

for (const tipo of ['EXPENSE', 'INCOME']) {
  const es = esistentiGennaio.filter(t => t.type === tipo);
  const nu = nuoveGennaio.filter(t => t.type === tipo);
  const usati = new Set();
  const mancanti = [];
  const trovati = [];

  const giorniDiff = (d1, d2) => Math.abs((new Date(d1) - new Date(d2)) / 86400000);

  for (const n of nu) {
    const idx = es.findIndex((e, i) => {
      if (usati.has(i) || e.type !== n.type) return false;
      if (giorniDiff(e.date, n.date) > 5) return false;
      // amount e' sempre il netto per definizione (vedi types.ts) — confronto solo su quello,
      // mai lordo contro netto.
      return Math.abs((e.amount ?? 0) - (n.amount ?? 0)) < 0.02;
    });
    if (idx >= 0) { usati.add(idx); trovati.push(n); }
    else mancanti.push(n);
  }

  const sommaMancanti = mancanti.reduce((s, t) => s + (t.grossAmount ?? t.amount ?? 0), 0);
  const sommaTrovati = trovati.reduce((s, t) => s + (t.grossAmount ?? t.amount ?? 0), 0);

  console.log(`\n=== GENNAIO 2026 — ${tipo} ===`);
  console.log(`Esistenti nel file: ${es.length} righe`);
  console.log(`Trovate da PuntaNet: ${nu.length} righe`);
  console.log(`Gia' presenti (stessa data+importo): ${trovati.length} righe, €${sommaTrovati.toFixed(2)}`);
  console.log(`MANCANTI dal file esistente: ${mancanti.length} righe, €${sommaMancanti.toFixed(2)}`);

  const sotto50 = mancanti.filter(t => Math.abs(t.grossAmount ?? t.amount) < 50);
  const sopra50 = mancanti.filter(t => Math.abs(t.grossAmount ?? t.amount) >= 50);
  console.log(`  di cui sotto 50 euro: ${sotto50.length} righe, €${sotto50.reduce((s,t)=>s+(t.grossAmount??t.amount),0).toFixed(2)}`);
  console.log(`  di cui 50 euro o più: ${sopra50.length} righe, €${sopra50.reduce((s,t)=>s+(t.grossAmount??t.amount),0).toFixed(2)}`);

  console.log(`\n  --- Dettaglio mancanti (>= 50 euro), ordinate per importo ---`);
  sopra50.sort((a,b) => (b.grossAmount??b.amount) - (a.grossAmount??a.amount)).forEach(t => {
    console.log(`  ${t.date} | €${(t.grossAmount??t.amount).toFixed(2).padStart(10)} | ${t.category} | ${t.description}`);
  });
}
