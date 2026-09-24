// Diagnostica SOLA LETTURA (nessuna scrittura, nessuna modifica) per capire se la copia locale
// di PuntaNet (istanza SQLEXPRESS, database GC_Impresa2_RO/GC_Comune_RO) riceve ancora aggiornamenti
// dal ripristino periodico del backup PuntaNet, o se e' ferma.
//
// Richiesto dall'utente 2026-09-24: "Movimenti bancari trovati" e "Rate non pagate trovate" risultano
// identici (1451 e 192) in tre esecuzioni distinte dell'11, 15 e 21 settembre — segno che la copia
// locale non cambia da giorni, anche se in PuntaNet reale ci sono stati nuovi movimenti. Le impostazioni
// di PuntaNet non sono state toccate: il sospetto e' sul processo (esterno a questa app) che ripristina
// il backup di PuntaNet sull'istanza SQLEXPRESS locale.
//
// Uso: npx tsx scripts/diagnosticaAggiornamentoDB.mjs

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

console.log('=== 1) Storico dei ripristini (RESTORE DATABASE) registrati da SQL Server — indicatore AFFIDABILE ===\n');
try {
  const storico = runSql('msdb', `SET NOCOUNT ON; SELECT TOP 20 destination_database_name AS Database_, restore_date, [user_name] FROM msdb.dbo.restorehistory WHERE destination_database_name IN ('${DB_IMPRESA}','${DB_COMUNE}') ORDER BY restore_date DESC FOR JSON PATH`);
  if (storico.length === 0) {
    console.log('Nessun ripristino trovato nello storico msdb per questi due database (potrebbe non essere mai stato registrato, o l\'account usato per il ripristino non lo traccia qui).');
  } else {
    console.log(JSON.stringify(storico, null, 2));
  }
} catch (e) {
  console.error('Errore leggendo msdb.dbo.restorehistory:', e.message);
}

console.log('\n\n=== 2) sys.databases.create_date — SOLO INFORMATIVO, NON usare per giudicare la freschezza ===\n');
console.log('(verificato sui dati reali il 2026-09-24: un RESTORE ... WITH REPLACE su un database GIA\' ESISTENTE con lo stesso nome NON aggiorna create_date, che resta quello del primo ripristino per sempre — usarlo darebbe un falso allarme permanente anche a ripristino riuscito. L\'indicatore affidabile e\' il punto 1 sopra.)\n');
try {
  const info = runSql('master', `SET NOCOUNT ON; SELECT name, create_date, state_desc FROM sys.databases WHERE name IN ('${DB_IMPRESA}','${DB_COMUNE}') FOR JSON PATH`);
  console.log(JSON.stringify(info, null, 2));
} catch (e) {
  console.error('Errore leggendo sys.databases:', e.message);
}

console.log('\n\n=== 3) Ultimo movimento bancario e ultima fattura REALMENTE presenti nella copia locale ===\n');
console.log('(occhio: una singola riga con data corrotta — es. l\'anno "2232" trovato in Conti Movimenti — puo\' far risultare un MAX(Data) piu\' vecchio del vero, o comunque non rappresentativo; vale piu\' il confronto nel tempo di "TotaleRighe" che il MAX(Data) da solo)\n');
try {
  const ultimoMovimento = runSql(DB_IMPRESA, `SET NOCOUNT ON; SELECT MAX(Data) AS UltimaData, COUNT(*) AS TotaleRighe FROM [Conti Movimenti] FOR JSON PATH`);
  console.log('Conti Movimenti:', JSON.stringify(ultimoMovimento));
  const ultimoDocumento = runSql(DB_IMPRESA, `SET NOCOUNT ON; SELECT MAX(Data) AS UltimaData, COUNT(*) AS TotaleRighe FROM Documenti FOR JSON PATH`);
  console.log('Documenti (fatture):', JSON.stringify(ultimoDocumento));
} catch (e) {
  console.error('Errore leggendo ultimo movimento/documento:', e.message);
}

console.log('\n\n=== Fine diagnostica — nessun dato e\' stato modificato ===');
