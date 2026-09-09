// Analisi sistematica IVA — solo 2026, tutte le categorie.
// Per ogni movimento reale trovato da PuntaNet (report dry-run gia' generato), cerca la
// transazione corrispondente nel file esistente per IDENTITA' (stesso fornitore/cliente nel
// testo + data vicina), non per importo — cosi' posso confrontare gli importi anche quando
// sono diversi, e capire SE e DI QUANTO differiscono, categoria per categoria.
// Solo lettura, nessuna scrittura da nessuna parte.

import fs from 'fs';
import path from 'path';

const NAS_DATI = String.raw`\\NAS\Ufficio Tecnico\GRUPPO VISENTIN\00_GESTIONE GV\35_APP GV ECOSISTEM\04-GV GestioneFINANZIARIA\DATI SALVATI`;
const gvData = JSON.parse(fs.readFileSync(path.join(NAS_DATI, 'gv-cashflow.gvcf'), 'utf8'));
const report = JSON.parse(fs.readFileSync(path.join(NAS_DATI, 'AUTO', 'dryrun_2026-09-09.json'), 'utf8'));

const giorniDiff = (d1, d2) => Math.abs((new Date(d1) - new Date(d2)) / 86400000);

// Estrae la "chiave identificativa" dalla descrizione: di solito il fornitore/cliente dopo l'ultimo " - "
function chiaveDa(desc) {
  if (!desc) return '';
  const parti = desc.split(' - ');
  const ultima = parti[parti.length - 1] || desc;
  return ultima.toUpperCase().replace(/[^A-Z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}
function paroleSignificative(chiave) {
  const stop = new Set(['SRL','SPA','SNC','SAS','SRLS','DI','DEL','DA','IN','CON','SU','PER','E','O','AND','C','SOCIETA','COOP']);
  return chiave.split(' ').filter(p => p.length >= 4 && !stop.has(p));
}

const esistenti2026 = gvData.transactions.filter(t => !t.isForecast && t.date?.startsWith('2026'));
const nuove2026 = report.consuntivo.filter(t => t.date?.startsWith('2026'));

const usati = new Set();
const risultatiPerCategoria = {}; // categoria -> {coincide, iva22, iva10, iva4, altroRapporto, nonTrovato}

function bucket(cat) {
  if (!risultatiPerCategoria[cat]) risultatiPerCategoria[cat] = { coincide: 0, iva22: 0, iva10: 0, iva4: 0, altroRapporto: 0, nonTrovato: 0, esempiAltro: [] };
  return risultatiPerCategoria[cat];
}

for (const n of nuove2026) {
  const chiaveN = chiaveDa(n.description);
  const paroleN = paroleSignificative(chiaveN);
  if (paroleN.length === 0) { bucket(n.category).nonTrovato++; continue; }

  const idx = esistenti2026.findIndex((e, i) => {
    if (usati.has(i) || e.type !== n.type) return false;
    if (giorniDiff(e.date, n.date) > 15) return false;
    const chiaveE = chiaveDa(e.description);
    return paroleN.some(p => chiaveE.includes(p));
  });

  const b = bucket(n.category);
  if (idx < 0) { b.nonTrovato++; continue; }

  usati.add(idx);
  const e = esistenti2026[idx];
  const rapporto = n.amount > 0 ? (e.amount ?? 0) / n.amount : null;

  if (rapporto == null) { b.nonTrovato++; continue; }
  if (Math.abs(rapporto - 1) < 0.01) b.coincide++;
  else if (Math.abs(rapporto - 1 / 1.22) < 0.01) b.iva22++;
  else if (Math.abs(rapporto - 1 / 1.10) < 0.01) b.iva10++;
  else if (Math.abs(rapporto - 1 / 1.04) < 0.01) b.iva4++;
  else { b.altroRapporto++; b.esempiAltro.push(`${n.date} rapporto=${rapporto.toFixed(3)} nuovo=€${n.amount.toFixed(2)} esistente=€${(e.amount??0).toFixed(2)} — ${n.description.slice(0,60)}`); }
}

console.log('=== ANALISI IVA SISTEMATICA — SOLO 2026, TUTTE LE CATEGORIE ===\n');
console.log('Categoria | Coincide | Problema IVA 22% | Problema IVA 10% | Problema IVA 4% | Altro rapporto | Non trovato');
const categorieOrdinate = Object.entries(risultatiPerCategoria).sort((a, b) => {
  const totA = Object.values(a[1]).filter(v => typeof v === 'number').reduce((s, v) => s + v, 0);
  const totB = Object.values(b[1]).filter(v => typeof v === 'number').reduce((s, v) => s + v, 0);
  return totB - totA;
});
let totCoincide = 0, totIva22 = 0, totIva10 = 0, totIva4 = 0, totAltro = 0, totNonTrovato = 0;
for (const [cat, r] of categorieOrdinate) {
  console.log(`${cat} | coincide=${r.coincide} | iva22%=${r.iva22} | iva10%=${r.iva10} | iva4%=${r.iva4} | altro=${r.altroRapporto} | non trovato=${r.nonTrovato}`);
  totCoincide += r.coincide; totIva22 += r.iva22; totIva10 += r.iva10; totIva4 += r.iva4; totAltro += r.altroRapporto; totNonTrovato += r.nonTrovato;
}

console.log('\n=== TOTALI 2026 ===');
console.log(`Coincidono esattamente: ${totCoincide}`);
console.log(`Problema IVA 22% (registrato netto invece di lordo): ${totIva22}`);
console.log(`Problema IVA 10%: ${totIva10}`);
console.log(`Problema IVA 4%: ${totIva4}`);
console.log(`Altro rapporto (da controllare caso per caso): ${totAltro}`);
console.log(`Non trovato nel file esistente: ${totNonTrovato}`);

console.log('\n=== Categorie con "altro rapporto" — esempi ===');
for (const [cat, r] of categorieOrdinate) {
  if (r.esempiAltro.length > 0) {
    console.log(`\n${cat}:`);
    r.esempiAltro.slice(0, 5).forEach(e => console.log(`  ${e}`));
  }
}
