// Diagnostica SOLA LETTURA (nessuna scrittura, solo SELECT) — richiesta dall'utente il 2026-10-27
// dopo aver confermato via Excel (PIANIFICAZIONE FLUSSO DI CASSA ANNUALE) che mancano nell'app 4
// incassi precisi:
//   Agosto:    RESIDENCE HOP - DE ROSSI ZORZETTO   1.300,00 €
//              RESIDENCE HOP - BALDISSERA           5.727,28 €
//   Settembre: RAGUSO                               8.000,00 €
//              FRASSON ROTTAMI                        996,00 €
// (i totali combaciano esattamente con gli scarti ENTRATE di agosto/settembre trovati da
// confrontaFlussoCassaExcel.mjs — non sono fatture "slittate" di mese, ne' un problema di
// categoria: mancano proprio nell'app.)
//
// Questo script interroga PuntaNet (stessa istanza SQLEXPRESS locale di importaPuntaNet.mjs) per
// capire DOVE sono questi 4 clienti/incassi: se esistono come Documenti/Scadenze ancora aperti (non
// ancora incassati e quindi mai arrivati a Conti Movimenti, da cui importaPuntaNet.mjs legge il
// consuntivo), se sono gia' in Conti Movimenti ma con un nome diverso da quello cercato, o se non
// esistono affatto nel database locale (nel qual caso vanno controllati nel gestionale PuntaNet
// vero, non nella copia RO).
//
// Uso: npx tsx scripts/cercaFattureMancantiPuntaNet.mjs

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const SQLCMD = String.raw`C:\Program Files\Microsoft SQL Server\Client SDK\ODBC\110\Tools\Binn\SQLCMD.EXE`;
const INSTANCE = String.raw`localhost\SQLEXPRESS`;
const DB_IMPRESA = 'GC_Impresa2_RO'; // GRUPPO VISENTIN SRL — stesso database di importaPuntaNet.mjs

function runSql(query) {
  const tmpFile = path.join(os.tmpdir(), `sqlout_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
  try {
    execFileSync(SQLCMD, ['-S', INSTANCE, '-d', DB_IMPRESA, '-E', '-y', '0', '-f', '65001', '-Q', query, '-o', tmpFile], { stdio: 'pipe' });
    if (!fs.existsSync(tmpFile)) return [];
    let raw;
    try { raw = fs.readFileSync(tmpFile, 'utf16le').replace(/\r?\n/g, '').trim(); JSON.parse(raw || '[]'); }
    catch { raw = fs.readFileSync(tmpFile, 'utf8').replace(/\r?\n/g, '').trim(); }
    return raw ? JSON.parse(raw) : [];
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
}

// Frammenti di nome da cercare — presi dalle etichette Excel, ripuliti dal prefisso di cantiere
// ("RESIDENCE HOP - ") dove presente.
const FRAMMENTI = ['ZORZETTO', 'BALDISSERA', 'RAGUSO', 'FRASSON'];

console.log(`=== Ricerca PuntaNet (${DB_IMPRESA}) per 4 incassi mancanti nell'app ===\n`);

for (const frammento of FRAMMENTI) {
  console.log(`--- Frammento: "${frammento}" ---`);

  // 1) Il cliente/fornitore esiste in anagrafica?
  const clienti = runSql(`SET NOCOUNT ON; SELECT IDCliFor, [Ragione Sociale] FROM [Clienti Fornitori] WHERE [Ragione Sociale] LIKE '%${frammento}%' FOR JSON PATH`);
  if (clienti.length === 0) {
    console.log('  Nessun cliente/fornitore in anagrafica con questo nome.\n');
    continue;
  }
  for (const c of clienti) {
    console.log(`  Cliente: IDCliFor=${c.IDCliFor}  "${c['Ragione Sociale']}"`);

    // 2) Documenti (fatture/note) collegati a questo cliente nel 2026
    const documenti = runSql(`SET NOCOUNT ON; SELECT d.IDDocumento, d.Tipo, d.Data, d.Totale FROM Documenti d WHERE d.IDCliFor = ${c.IDCliFor} AND d.Data >= '2026-01-01' ORDER BY d.Data FOR JSON PATH`);
    if (documenti.length === 0) {
      console.log('    Nessun documento 2026 per questo cliente.');
    } else {
      for (const d of documenti) {
        console.log(`    Documento ${d.IDDocumento}  Tipo=${d.Tipo}  Data=${d.Data}  Totale=${d.Totale}`);
        const scadenze = runSql(`SET NOCOUNT ON; SELECT IDRata, [Data Rata], [Importo Rata], Pagato FROM [Documenti Scadenze] WHERE IDDocumento = ${d.IDDocumento} FOR JSON PATH`);
        for (const s of scadenze) {
          console.log(`      Rata ${s.IDRata}  scadenza=${s['Data Rata']}  importo=${s['Importo Rata']}  pagato=${s.Pagato}`);
        }
      }
    }

    // 3) Movimenti bancari (Conti Movimenti) collegati a questo cliente nel 2026, via IDDocumento
    //    dei documenti trovati sopra, O per descrizione/causale che contiene il frammento (nel caso
    //    il movimento non sia collegato a nessun documento).
    const idDocumenti = documenti.map(d => d.IDDocumento);
    const movimentiPerDoc = idDocumenti.length > 0
      ? runSql(`SET NOCOUNT ON; SELECT IDMovimento, Data, Causale, Descrizione, ImportoE, ImportoU, IDDocumento FROM [Conti Movimenti] WHERE IDDocumento IN (${idDocumenti.join(',')}) FOR JSON PATH`)
      : [];
    const movimentiPerTesto = runSql(`SET NOCOUNT ON; SELECT IDMovimento, Data, Causale, Descrizione, ImportoE, ImportoU, IDDocumento FROM [Conti Movimenti] WHERE Data >= '2026-01-01' AND (Causale LIKE '%${frammento}%' OR Descrizione LIKE '%${frammento}%') FOR JSON PATH`);
    const movimentiVisti = new Set();
    for (const m of [...movimentiPerDoc, ...movimentiPerTesto]) {
      if (movimentiVisti.has(m.IDMovimento)) continue;
      movimentiVisti.add(m.IDMovimento);
      console.log(`    Movimento bancario ${m.IDMovimento}  Data=${m.Data}  Entrata=${m.ImportoE}  Uscita=${m.ImportoU}  IDDocumento=${m.IDDocumento ?? '(nessuno)'}  "${m.Descrizione || m.Causale || ''}"`);
    }
    if (movimentiVisti.size === 0) {
      console.log('    Nessun movimento bancario 2026 trovato per questo cliente (né collegato a documento né per testo).');
    }
  }
  console.log('');
}

console.log('=== Fine ricerca — nessun dato e\' stato modificato (solo SELECT) ===');
