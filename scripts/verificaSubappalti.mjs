// Verifica mirata: per ogni documento "sub appalti" 2026 (IVA zero reale da PuntaNet),
// cerca nel file esistente la transazione corrispondente usando il nome COMPLETO del
// fornitore (non parole singole — evita gli abbinamenti sbagliati del tentativo precedente)
// + finestra di data stretta. Confronta l'importo per confermare o smentire il pattern IVA 22%.
// Solo lettura, nessuna scrittura da nessuna parte.

import fs from 'fs';
import path from 'path';

const NAS_DATI = String.raw`\\NAS\Ufficio Tecnico\GRUPPO VISENTIN\00_GESTIONE GV\35_APP GV ECOSISTEM\04-GV GestioneFINANZIARIA\DATI SALVATI`;
const gvData = JSON.parse(fs.readFileSync(path.join(NAS_DATI, 'gv-cashflow.gvcf'), 'utf8'));
const documenti = JSON.parse(fs.readFileSync(String.raw`E:\Direzione\Desktop\gv_subappalti_2026.json`, 'utf8').replace(/\r?\n/g, ''));

console.log(`Documenti "sub appalti" 2026 trovati in PuntaNet: ${documenti.length}\n`);

const esistenti2026 = gvData.transactions.filter(t => !t.isForecast && t.type === 'EXPENSE' && t.date?.startsWith('2026'));
const giorniDiff = (d1, d2) => Math.abs((new Date(d1) - new Date(d2)) / 86400000);
const norm = s => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, ' ').replace(/\s+/g, ' ').trim();

const usati = new Set();
let coincideEsatto = 0, confermatoIva22 = 0, altroRapporto = 0, nonTrovato = 0;
const dettagliAltro = [];
const dettagliNonTrovato = [];
let sommaImponibilePuntaNet = 0, sommaEsistenteTrovati = 0;

for (const doc of documenti) {
  if (!doc.Fornitore || !doc.DataPagamento) { nonTrovato++; continue; }
  sommaImponibilePuntaNet += doc.Imponibile;
  const fornitoreNorm = norm(doc.Fornitore);

  const idx = esistenti2026.findIndex((e, i) => {
    if (usati.has(i)) return false;
    if (giorniDiff(e.date, doc.DataPagamento) > 10) return false;
    return norm(e.description).includes(fornitoreNorm);
  });

  if (idx < 0) {
    nonTrovato++;
    dettagliNonTrovato.push(`${doc.DataPagamento.slice(0,10)} | €${doc.Imponibile.toFixed(2)} | ${doc.Fornitore}`);
    continue;
  }
  usati.add(idx);
  const e = esistenti2026[idx];
  sommaEsistenteTrovati += (e.amount ?? 0);
  const rapporto = doc.Imponibile > 0 ? (e.amount ?? 0) / doc.Imponibile : null;

  if (rapporto != null && Math.abs(rapporto - 1) < 0.015) coincideEsatto++;
  else if (rapporto != null && Math.abs(rapporto - 1/1.22) < 0.015) confermatoIva22++;
  else { altroRapporto++; dettagliAltro.push(`${doc.DataPagamento.slice(0,10)} | rapporto=${rapporto?.toFixed(3)} | PuntaNet=€${doc.Imponibile.toFixed(2)} esistente=€${(e.amount??0).toFixed(2)} | ${doc.Fornitore}`); }
}

console.log(`=== RISULTATO — ${documenti.length} documenti sub appalti 2026 ===`);
console.log(`Trovati nel file esistente e coincidono esattamente: ${coincideEsatto}`);
console.log(`Trovati ma con rapporto 1,22 (probabile errore IVA storico): ${confermatoIva22}`);
console.log(`Trovati con altro rapporto (da capire caso per caso): ${altroRapporto}`);
console.log(`NON trovati nel file esistente: ${nonTrovato}`);
console.log(`\nImponibile totale PuntaNet: €${sommaImponibilePuntaNet.toFixed(2)}`);
console.log(`Somma importi esistenti (per i trovati): €${sommaEsistenteTrovati.toFixed(2)}`);
console.log(`Differenza: €${(sommaImponibilePuntaNet - sommaEsistenteTrovati).toFixed(2)}`);

if (dettagliAltro.length > 0) {
  console.log(`\n--- Dettaglio "altro rapporto" ---`);
  dettagliAltro.forEach(d => console.log(`  ${d}`));
}
if (dettagliNonTrovato.length > 0) {
  console.log(`\n--- Dettaglio "non trovato" (prime 15) ---`);
  dettagliNonTrovato.slice(0, 15).forEach(d => console.log(`  ${d}`));
}
