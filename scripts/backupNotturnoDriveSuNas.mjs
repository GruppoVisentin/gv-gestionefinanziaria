// Backup giornaliero: copia il file di lavoro (gv-cashflow_v2-import-puntanet-automatico.gvcf e
// gv-regole.json), ora su Google Drive, verso il NAS — indipendentemente da COME sono stati
// modificati. I backup gia' presenti negli altri script (BACKUP_DIR) scattano solo prima di una
// scrittura fatta da uno script Node: le modifiche fatte a mano nell'app via browser (il modo in
// cui si lavora la maggior parte del tempo) non passano mai da uno script, quindi senza questo non
// avrebbero mai un backup su NAS. Richiesto dall'utente il 2026-11-13, dopo lo spostamento del
// file di lavoro su Drive.
//
// Solo COPIA (mai scrittura sul file sorgente): sicuro da eseguire quante volte si vuole, anche
// mentre l'app e' aperta.
//
// Invocato automaticamente da run_import_automatico.ps1 (Attivita' Pianificata "GV_ImportaPuntaNet",
// ogni giorno alle 9:00) — nessuna Attivita' Pianificata separata da configurare a mano: l'utente
// non lancia mai script manualmente, tutto il giro (import PuntaNet + questo backup) deve attivarsi
// da solo col prossimo giro schedulato, senza alcun intervento.
//
// Uso: node scripts/backupNotturnoDriveSuNas.mjs
// Puro Node/fs, nessuna dipendenza del progetto: puo' girare anche senza `npm install` gia' fatto.

import fs from 'fs';
import path from 'path';

const DRIVE_DATI = String.raw`G:\Il mio Drive\GV GestioneFINANZIARIA`;
const NAS_DATI = String.raw`\\NAS\Ufficio Tecnico\GRUPPO VISENTIN\00_GESTIONE GV\35_APP GV ECOSISTEM\04-GV GestioneFINANZIARIA\DATI SALVATI`;
const BACKUP_DIR = path.join(NAS_DATI, 'BACKUP');

const OGGI = new Date().toISOString().slice(0, 10);
const STAMP = `${OGGI}_${Date.now()}`;

// { sorgente, prefissoBackup, obbligatorio }: gv-regole.json e' considerato opzionale (potrebbe
// non esistere ancora se nessuna regola PuntaNet e' mai stata salvata) — la sua assenza non deve
// far fallire il backup del file principale.
const FILE_DA_COPIARE = [
  { sorgente: path.join(DRIVE_DATI, 'gv-cashflow_v2-import-puntanet-automatico.gvcf'), prefissoBackup: 'gv-cashflow_v2_BACKUP-NOTTURNO', obbligatorio: true },
  { sorgente: path.join(DRIVE_DATI, 'gv-regole.json'), prefissoBackup: 'gv-regole_BACKUP-NOTTURNO', obbligatorio: false },
];

console.log(`=== Backup notturno Drive -> NAS (${new Date().toISOString()}) ===\n`);

fs.mkdirSync(BACKUP_DIR, { recursive: true });

let copiati = 0;
let errori = 0;
for (const { sorgente, prefissoBackup, obbligatorio } of FILE_DA_COPIARE) {
  if (!fs.existsSync(sorgente)) {
    const messaggio = `File non trovato: ${sorgente}`;
    if (obbligatorio) {
      console.error(`✖ ${messaggio} (OBBLIGATORIO — verifica che Google Drive for Desktop sia sincronizzato su questo PC)`);
      errori++;
    } else {
      console.log(`  (facoltativo, saltato) ${messaggio}`);
    }
    continue;
  }
  const estensione = path.extname(sorgente);
  const destinazione = path.join(BACKUP_DIR, `${prefissoBackup}_${STAMP}${estensione}`);
  try {
    fs.copyFileSync(sorgente, destinazione);
    console.log(`✔ ${path.basename(sorgente)} -> ${destinazione}`);
    copiati++;
  } catch (e) {
    console.error(`✖ Copia fallita per ${sorgente}: ${e.message}`);
    errori++;
  }
}

console.log(`\n${copiati} file copiati, ${errori} errori.`);
if (errori > 0) process.exit(1);
