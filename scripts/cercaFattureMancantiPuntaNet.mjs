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

  // Ricerca per TESTO nei movimenti bancari 2026 — indipendente dal cliente in anagrafica: una
  // controparte puo' comparire nel movimento con un nome scritto diversamente da quello registrato
  // (o il movimento puo' non essere affatto collegato a un cliente in anagrafica). Girava solo
  // dentro il ramo "cliente trovato" e veniva saltata del tutto quando nessun cliente combaciava,
  // perdendo esattamente i movimenti non collegati che questa diagnostica deve scovare (trovato in
  // review: Codex, PR #50, 2026-10-27).
  const movimentiPerTesto = runSql(`SET NOCOUNT ON; SELECT IDMovimento, Data, Causale, Descrizione, ImportoE, ImportoU, IDDocumento FROM [Conti Movimenti] WHERE Data >= '2026-01-01' AND (Causale LIKE '%${frammento}%' OR Descrizione LIKE '%${frammento}%') FOR JSON PATH`);
  const movimentiVisti = new Set();
  function stampaMovimento(m) {
    if (movimentiVisti.has(m.IDMovimento)) return;
    movimentiVisti.add(m.IDMovimento);
    console.log(`    Movimento bancario ${m.IDMovimento}  Data=${m.Data}  Entrata=${m.ImportoE}  Uscita=${m.ImportoU}  IDDocumento=${m.IDDocumento ?? '(nessuno)'}  "${m.Descrizione || m.Causale || ''}"`);
  }

  // 1) Il cliente/fornitore esiste in anagrafica?
  const clienti = runSql(`SET NOCOUNT ON; SELECT IDCliFor, [Ragione Sociale] FROM [Clienti Fornitori] WHERE [Ragione Sociale] LIKE '%${frammento}%' FOR JSON PATH`);
  if (clienti.length === 0) {
    console.log('  Nessun cliente/fornitore in anagrafica con questo nome.');
  }
  for (const c of clienti) {
    console.log(`  Cliente: IDCliFor=${c.IDCliFor}  "${c['Ragione Sociale']}"`);

    // 2) TUTTI i documenti (fatture/note) di questo cliente, qualunque sia l'anno del documento:
    //    una fattura emessa prima del 2026 puo' avere una rata in scadenza o un pagamento proprio
    //    nel 2026 — filtrare qui per data documento l'avrebbe esclusa prima ancora di poter
    //    guardare le sue scadenze/movimenti (trovato in review: Codex, PR #50, 2026-10-27, stesso
    //    principio gia' seguito da importaPuntaNet.mjs: seleziona le rate per la LORO data, non per
    //    quella del documento).
    const documenti = runSql(`SET NOCOUNT ON; SELECT d.IDDocumento, d.Tipo, d.Data, d.Totale FROM Documenti d WHERE d.IDCliFor = ${c.IDCliFor} ORDER BY d.Data FOR JSON PATH`);
    if (documenti.length === 0) {
      console.log('    Nessun documento per questo cliente.');
    } else {
      for (const d of documenti) {
        console.log(`    Documento ${d.IDDocumento}  Tipo=${d.Tipo}  Data=${d.Data}  Totale=${d.Totale}`);
        const scadenze = runSql(`SET NOCOUNT ON; SELECT IDRata, [Data Rata], [Importo Rata], Pagato FROM [Documenti Scadenze] WHERE IDDocumento = ${d.IDDocumento} FOR JSON PATH`);
        for (const s of scadenze) {
          console.log(`      Rata ${s.IDRata}  scadenza=${s['Data Rata']}  importo=${s['Importo Rata']}  pagato=${s.Pagato}`);
        }
      }
    }

    // 3) Movimenti bancari collegati via IDDocumento ai documenti trovati sopra (qualunque sia la
    //    data del movimento, per lo stesso motivo del punto 2).
    const idDocumenti = documenti.map(d => d.IDDocumento);
    const movimentiPerDoc = idDocumenti.length > 0
      ? runSql(`SET NOCOUNT ON; SELECT IDMovimento, Data, Causale, Descrizione, ImportoE, ImportoU, IDDocumento FROM [Conti Movimenti] WHERE IDDocumento IN (${idDocumenti.join(',')}) FOR JSON PATH`)
      : [];
    for (const m of movimentiPerDoc) stampaMovimento(m);
  }

  for (const m of movimentiPerTesto) stampaMovimento(m);
  if (movimentiVisti.size === 0) {
    console.log('  Nessun movimento bancario 2026 trovato per questo frammento (né collegato a un documento né per testo in causale/descrizione).');
  }
  console.log('');
}

console.log('=== Fine ricerca — nessun dato e\' stato modificato (solo SELECT) ===');
