// Diagnostica SOLA LETTURA (nessuna scrittura, nessuna modifica al file dati) per capire:
//   1. Come la colonna [CliFor] di [Clienti Fornitori] distingue clienti da fornitori,
//      cosi' l'import puo' escludere i clienti dall'anagrafica Fornitori (richiesto
//      dall'utente 2026-09-16: "Clienti Fornitori" e' un'anagrafica UNICA condivisa).
//   2. Se [IDModPagamento] si puo' risolvere in un termine di pagamento leggibile (es.
//      "30gg fine mese"), cercando la tabella di lookup nel database comune GC_Comune_RO
//      (stessa convenzione gia' usata per TAB_Tipi Voci in importaPuntaNet.mjs).
//
// Uso: npx tsx scripts/diagnosticaFornitoriPuntaNet.mjs
// Presuppone (come gli altri script) che GC_Impresa2_RO e GC_Comune_RO esistano gia'
// sull'istanza SQLEXPRESS locale.

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const SQLCMD = String.raw`C:\Program Files\Microsoft SQL Server\Client SDK\ODBC\110\Tools\Binn\SQLCMD.EXE`;
const INSTANCE = String.raw`localhost\SQLEXPRESS`;
const DB_IMPRESA = 'GC_Impresa2_RO';
const DB_COMUNE = 'GC_Comune_RO';

function runSql(database, query) {
  const tmpFile = path.join(os.tmpdir(), `sqlout_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
  try {
    execFileSync(SQLCMD, ['-S', INSTANCE, '-d', database, '-E', '-y', '0', '-Q', query, '-o', tmpFile], { stdio: 'pipe' });
    if (!fs.existsSync(tmpFile)) return [];
    let raw;
    try { raw = fs.readFileSync(tmpFile, 'utf16le').replace(/\r?\n/g, '').trim(); JSON.parse(raw || '[]'); }
    catch { raw = fs.readFileSync(tmpFile, 'utf8').replace(/\r?\n/g, '').trim(); }
    return raw ? JSON.parse(raw) : [];
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
}

console.log('=== 1) Colonna [CliFor] — distribuzione valori (chi e\' cliente, chi fornitore) ===\n');
try {
  const cliFor = runSql(DB_IMPRESA,
    `SET NOCOUNT ON; SELECT CliFor, COUNT(*) AS Conteggio FROM [Clienti Fornitori] GROUP BY CliFor ORDER BY Conteggio DESC FOR JSON PATH`);
  console.log(JSON.stringify(cliFor, null, 2));
  console.log('\nUn esempio di ragione sociale per ciascun valore trovato:');
  for (const row of cliFor) {
    const valore = row.CliFor === null ? 'NULL' : `'${row.CliFor}'`;
    const filtro = row.CliFor === null ? 'CliFor IS NULL' : `CliFor = ${typeof row.CliFor === 'number' ? row.CliFor : `'${row.CliFor}'`}`;
    const esempi = runSql(DB_IMPRESA,
      `SET NOCOUNT ON; SELECT TOP 3 [Ragione Sociale] FROM [Clienti Fornitori] WHERE ${filtro} FOR JSON PATH`);
    console.log(`  CliFor = ${valore}: ${esempi.map(e => e['Ragione Sociale']).join(' | ')}`);
  }
} catch (e) {
  console.error('Errore leggendo CliFor:', e.message);
}

console.log('\n\n=== 2) Colonna [IDModPagamento] — quanti valori distinti, e quali ===\n');
try {
  const modPag = runSql(DB_IMPRESA,
    `SET NOCOUNT ON; SELECT IDModPagamento, COUNT(*) AS Conteggio FROM [Clienti Fornitori] GROUP BY IDModPagamento ORDER BY Conteggio DESC FOR JSON PATH`);
  console.log(JSON.stringify(modPag, null, 2));
} catch (e) {
  console.error('Errore leggendo IDModPagamento:', e.message);
}

console.log(`\n\n=== 3) Ricerca tabella di lookup per i termini di pagamento in [${DB_COMUNE}] ===\n`);
let tabellaPagamenti = null;
try {
  const tabelle = runSql(DB_COMUNE,
    `SET NOCOUNT ON; SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE '%agament%' OR TABLE_NAME LIKE '%Pagam%' FOR JSON PATH`);
  console.log('Tabelle trovate con nome simile a "pagamento":', tabelle.map(t => t.TABLE_NAME));
  if (tabelle.length > 0) {
    tabellaPagamenti = tabelle[0].TABLE_NAME;
    const colonne = runSql(DB_COMUNE,
      `SET NOCOUNT ON; SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${tabellaPagamenti}' FOR JSON PATH`);
    console.log(`\nColonne di [${tabellaPagamenti}]:`, colonne.map(c => c.COLUMN_NAME));
    const righe = runSql(DB_COMUNE, `SET NOCOUNT ON; SELECT * FROM [${tabellaPagamenti}] FOR JSON PATH`);
    console.log(`\nContenuto di [${tabellaPagamenti}] (${righe.length} righe):`);
    console.log(JSON.stringify(righe, null, 2));
  } else {
    console.log('Nessuna tabella con quel nome trovata — provo un elenco completo delle tabelle di GC_Comune_RO per cercare a occhio.');
    const tutte = runSql(DB_COMUNE, `SET NOCOUNT ON; SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES ORDER BY TABLE_NAME FOR JSON PATH`);
    console.log(tutte.map(t => t.TABLE_NAME).join(', '));
  }
} catch (e) {
  console.error(`Errore cercando la tabella pagamenti in ${DB_COMUNE}:`, e.message);
}

console.log('\n\n=== Fine diagnostica — nessun dato e\' stato modificato ===');
