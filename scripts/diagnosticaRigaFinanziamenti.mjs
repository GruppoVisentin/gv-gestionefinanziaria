// Diagnostica SOLA LETTURA (nessuna scrittura) — richiesta il 2026-10-26 dopo che il confronto
// ENTRATE post-fix (PR #42) ha mostrato ancora "excel=0.00" per FINANZIAMENTI a gennaio 2026,
// nonostante trovaRigaFinanziamenti() in confrontaFlussoCassaExcel.mjs sia stato corretto per
// cercare "ENTRATE DA ALTRI FINANZIAMENTI" su colonna A o B, su tutto il foglio, e superi tutti i
// test con dati sintetici che replicano la struttura confermata dallo screenshot dell'utente.
//
// Possibili cause non ancora escluse:
//   1) Celle unite (merge) in colonna B: XLSX.utils.sheet_to_json con {header:1} restituisce il
//      valore SOLO nella cella in alto a sinistra di un intervallo unito — le altre letture
//      risultano null, anche se visivamente il testo sembra occupare piu' celle/righe.
//   2) Spazi non separabili (NBSP,  ) o altri caratteri invisibili nell'etichetta reale, che
//      fanno fallire il regex /ENTRATE\s+DA\s+ALTRI\s+FINANZIAMENTI/i pur sembrando identica a
//      occhio nudo.
//   3) Un foglio/nome diverso da quello assunto ("FLUSSO DI CASSA {anno}").
//   4) La colonna del valore (4+m*5 per gennaio = colonna indice 4, cioe' "E" 0-based... verificare
//      anche questo con l'indirizzo cella reale).
//
// Questo script NON assume nulla: stampa il contenuto RAW (via ws[address], non sheet_to_json) di
// un intorno di righe attorno a qualunque riga contenga il testo "FINANZIAMENTI" in colonna A o B,
// elenca i merge del foglio che intersecano quelle righe, e mostra i codici carattere di eventuali
// match parziali del testo per scovare spazi/caratteri invisibili.
//
// Uso: npx tsx scripts/diagnosticaRigaFinanziamenti.mjs "<percorso.xlsx>" [anno]

import XLSX from 'xlsx';

const [, , xlsxPathArg, annoArg] = process.argv;
if (!xlsxPathArg) {
  console.error('Uso: npx tsx scripts/diagnosticaRigaFinanziamenti.mjs "<percorso.xlsx>" [anno]');
  process.exit(1);
}
const ANNO = annoArg ? Number(annoArg) : 2026;

const wb = XLSX.readFile(xlsxPathArg);
const nomeFoglio = `FLUSSO DI CASSA ${ANNO}`;
console.log(`Fogli disponibili nel file: ${wb.SheetNames.join(', ')}`);
const ws = wb.Sheets[nomeFoglio];
if (!ws) {
  console.error(`✖ Foglio "${nomeFoglio}" non trovato.`);
  process.exit(1);
}
console.log(`Foglio usato: "${nomeFoglio}"\n`);

// --- 1) Elenca TUTTI i merge del foglio (se ce ne sono) ---
const merges = ws['!merges'] || [];
console.log(`=== Celle unite (merge) nel foglio: ${merges.length} ===`);
for (const m of merges) {
  const addr = `${XLSX.utils.encode_cell(m.s)}:${XLSX.utils.encode_cell(m.e)}`;
  console.log(`  ${addr}`);
}
console.log('');

// --- 2) Mostra i codici carattere di una stringa, per scovare NBSP/caratteri invisibili ---
function mostraCodici(s) {
  return [...s].map(c => {
    const code = c.codePointAt(0);
    const visibile = code >= 32 && code < 127;
    return visibile ? c : `[U+${code.toString(16).padStart(4, '0')}]`;
  }).join('');
}

// --- 3) Cerca ovunque nel foglio (tramite sheet_to_json, come fa lo script di confronto) righe
//     che contengano "FINANZIAMENT" in colonna A o B (sotto-stringa piu' larga del regex esatto,
//     per non perdere match imperfetti) ---
const righe = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
console.log(`=== Righe (via sheet_to_json) con "FINANZIAMENT" in colonna A o B: ===`);
let trovateViaJson = 0;
for (let i = 0; i < righe.length; i++) {
  const a = righe[i]?.[0];
  const b = righe[i]?.[1];
  for (const [col, val] of [['A', a], ['B', b]]) {
    if (typeof val === 'string' && /FINANZIAMENT/i.test(val)) {
      trovateViaJson++;
      console.log(`  riga ${i} (1-based: ${i + 1}), colonna ${col}: "${mostraCodici(val)}"`);
    }
  }
}
if (trovateViaJson === 0) console.log('  (nessuna trovata — vedi parte 4 sotto per il raw diretto)');
console.log('');

// --- 4) Scansione RAW diretta delle celle del foglio (bypassa sheet_to_json del tutto) per lo
//     stesso testo, su un range ampio di righe e colonne A-H. Questo e' il controllo decisivo per
//     il sospetto "cella unita": se sheet_to_json non trova nulla ma la scansione raw sì, il
//     problema e' quasi certamente un merge o un'opzione di sheet_to_json che maschera la cella. ---
const range = XLSX.utils.decode_range(ws['!ref']);
console.log(`=== Scansione RAW diretta (ws[address]) di tutte le celle del foglio, colonne A-H, con "FINANZIAMENT": ===`);
console.log(`Range foglio: ${ws['!ref']}`);
let trovateRaw = 0;
for (let r = range.s.r; r <= range.e.r; r++) {
  for (let c = 0; c <= 7; c++) { // A..H
    const addr = XLSX.utils.encode_cell({ r, c });
    const cell = ws[addr];
    if (!cell) continue;
    const val = cell.v;
    if (typeof val === 'string' && /FINANZIAMENT/i.test(val)) {
      trovateRaw++;
      console.log(`  ${addr} (riga 1-based ${r + 1}): tipo cella="${cell.t}" valore="${mostraCodici(val)}"`);
    }
  }
}
if (trovateRaw === 0) console.log('  (nessuna cella con "FINANZIAMENT" trovata in tutto il foglio, colonne A-H)');
console.log('');

// --- 5) Se e' stata trovata almeno una riga (via raw o via json), stampa un dump completo di
//     quella riga e delle 2 sopra/sotto, per colonne A-H, sia raw (indirizzo cella + valore + tipo)
//     sia via sheet_to_json, per confrontare i due metodi riga per riga ---
const righeTrovate = new Set();
for (let r = range.s.r; r <= range.e.r; r++) {
  for (let c = 0; c <= 7; c++) {
    const addr = XLSX.utils.encode_cell({ r, c });
    const cell = ws[addr];
    if (cell && typeof cell.v === 'string' && /FINANZIAMENT/i.test(cell.v)) righeTrovate.add(r);
  }
}

if (righeTrovate.size > 0) {
  for (const rTrovata of [...righeTrovate].sort((a, b) => a - b)) {
    console.log(`=== Dump dettagliato attorno alla riga trovata (0-based ${rTrovata}, 1-based ${rTrovata + 1}) ===`);
    for (let r = rTrovata - 2; r <= rTrovata + 2; r++) {
      if (r < 0) continue;
      const celle = [];
      for (let c = 0; c <= 7; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = ws[addr];
        const viaJson = righe[r]?.[c];
        celle.push(`${addr}=${cell ? JSON.stringify(cell.v) : 'undefined'}(json:${JSON.stringify(viaJson)})`);
      }
      console.log(`  riga 1-based ${r + 1}: ${celle.join('  ')}`);
    }
    console.log('');
  }
} else {
  console.log('Nessuna riga con "FINANZIAMENT" trovata in tutto il foglio (colonne A-H) — il testo potrebbe essere in una colonna oltre H, o scritto diversamente (verificare a mano la riga del riepilogo liquidita\' nel foglio aperto).\n');
}

console.log('=== Fine diagnostica — nessun dato e\' stato modificato ===');
