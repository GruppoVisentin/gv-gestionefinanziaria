import fs from 'fs';
import path from 'path';

const NAS_DATI = String.raw`\\NAS\Ufficio Tecnico\GRUPPO VISENTIN\00_GESTIONE GV\35_APP GV ECOSISTEM\04-GV GestioneFINANZIARIA\DATI SALVATI`;
const FILE_PATH = path.join(NAS_DATI, 'gv-cashflow_v2-import-puntanet-automatico.gvcf');

const gvData = JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));

let collegate = 0;
for (const t of gvData.transactions) {
  if (t.description === 'ROSSANESE DANIELE' && (!t.project || t.project.trim() === '')) {
    t.project = 'Casa Pontello';
    collegate++;
    console.log(`Collegata: ${t.date} | €${(t.amount ?? 0).toFixed(2)} | "${t.description}" -> Casa Pontello`);
  }
}
console.log(`\nTotale collegate: ${collegate}`);

fs.writeFileSync(FILE_PATH, JSON.stringify(gvData, null, 2));
console.log('File v2 aggiornato.');
