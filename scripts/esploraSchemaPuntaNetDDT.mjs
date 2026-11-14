// Diagnostica SOLA LETTURA (nessuna scrittura, nessuna modifica) per capire se e dove PuntaNet
// tiene i DDT (documenti di trasporto) e dati di attrezzature/noleggi (es. installazione gru,
// verifiche periodiche) — nessuno script esistente in questo repo interroga questa parte dello
// schema: tutti gli script PuntaNet toccano solo Documenti/Documenti Articoli/Documenti Scadenze/
// Documenti Imponibili Cantiere/Clienti Fornitori/Cantieri (tutte fatture, Tipo IN (0,1,2,3)).
//
// Richiesto per capire se Direttore Cantiere puo' avere un registro automatico delle scadenze di
// verifica attrezzature di sollevamento (FUNI trimestrale, verifica periodica annuale) ancorato
// alla data del DDT di installazione — prima tappa: scoprire se il dato esiste in PuntaNet e con
// che nome di tabella/colonne, senza toccare nulla.
//
// Uso: npx tsx scripts/esploraSchemaPuntaNetDDT.mjs

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const SQLCMD = String.raw`C:\Program Files\Microsoft SQL Server\Client SDK\ODBC\110\Tools\Binn\SQLCMD.EXE`;
const INSTANCE = String.raw`localhost\SQLEXPRESS`;
const DB_IMPRESA = 'GC_Impresa2_RO'; // GRUPPO VISENTIN SRL
const DB_COMUNE = 'GC_Comune_RO';

// Parole chiave per segnalare le tabelle potenzialmente rilevanti tra tutte quelle dello schema.
// Volutamente larghe: meglio qualche falso positivo che perdere la tabella giusta per un nome
// imprevisto.
const PAROLE_CHIAVE = /ddt|bolla|trasport|consegna|attrezzatur|noleggi|\bgru\b|sollevament|certificaz|\bverific|manutenzion|collaud|scaden/i;

function runSql(database, query) {
  const tmpFile = path.join(os.tmpdir(), `sqlout_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
  try {
    execFileSync(SQLCMD, ['-S', INSTANCE, '-d', database, '-E', '-y', '0', '-f', '65001', '-Q', query, '-o', tmpFile], { stdio: 'pipe' });
    if (!fs.existsSync(tmpFile)) return [];
    let raw;
    try { raw = fs.readFileSync(tmpFile, 'utf16le').replace(/\r?\n/g, '').trim(); JSON.parse(raw || '[]'); }
    catch { raw = fs.readFileSync(tmpFile, 'utf8').replace(/\r?\n/g, '').trim(); }
    return raw ? JSON.parse(raw) : [];
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
}

function elencaTabelle(database) {
  return runSql(database, `SET NOCOUNT ON; SELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME FOR JSON PATH`);
}

function elencaColonne(database, tableSchema, tableName) {
  return runSql(database, `SET NOCOUNT ON; SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = '${tableSchema}' AND TABLE_NAME = '${tableName}' ORDER BY ORDINAL_POSITION FOR JSON PATH`);
}

for (const database of [DB_IMPRESA, DB_COMUNE]) {
  console.log(`\n\n=== ${database}: elenco tabelle ===\n`);
  let tabelle;
  try {
    tabelle = elencaTabelle(database);
  } catch (e) {
    console.error(`Impossibile leggere INFORMATION_SCHEMA.TABLES su ${database}: ${e.message}`);
    console.error(`Verifica che SQLCMD.EXE esista nel percorso atteso e che ${database} sia ripristinato su ${INSTANCE}.`);
    continue;
  }
  console.log(`${tabelle.length} tabelle totali.`);

  const segnalate = tabelle.filter(t => PAROLE_CHIAVE.test(t.TABLE_NAME));
  if (segnalate.length === 0) {
    console.log('\nNessuna tabella con nome riconducibile a DDT/attrezzature/verifiche/scadenze.');
  } else {
    console.log(`\n${segnalate.length} tabelle segnalate (nome riconducibile a DDT/attrezzature/verifiche/scadenze):`);
    for (const t of segnalate) {
      console.log(`\n--- [${t.TABLE_SCHEMA}].[${t.TABLE_NAME}] ---`);
      try {
        const colonne = elencaColonne(database, t.TABLE_SCHEMA, t.TABLE_NAME);
        console.log(colonne.map(c => `  ${c.COLUMN_NAME} (${c.DATA_TYPE})`).join('\n'));
      } catch (e) {
        console.error(`  Errore leggendo le colonne: ${e.message}`);
      }
    }
  }

  console.log(`\nElenco completo delle ${tabelle.length} tabelle di ${database} (per controllo manuale, in caso il nome giusto non rientri nelle parole chiave sopra):`);
  console.log(tabelle.map(t => `[${t.TABLE_SCHEMA}].[${t.TABLE_NAME}]`).join(', '));
}

console.log('\n\n=== Fine esplorazione — nessun dato e\' stato modificato ===');
