import fs from 'fs';
import path from 'path';

const NAS_DATI = String.raw`\\NAS\Ufficio Tecnico\GRUPPO VISENTIN\00_GESTIONE GV\35_APP GV ECOSISTEM\04-GV GestioneFINANZIARIA\DATI SALVATI`;
const FILE_PATH = path.join(NAS_DATI, 'gv-cashflow_v2-import-puntanet-automatico.gvcf');

const gvData = JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));

const daCollegare = [
  { date: '2025-07-28', amount: 66000.00, desc: 'BONAN GIANFRANCO', project: 'Casa Bonan' },
  { date: '2025-11-28', amount: 220000.00, desc: 'BONAN GIANFRANCO', project: 'Casa Bonan' },
  { date: '2026-04-16', amount: 81.00, desc: null, project: 'Residence Living City', descMatch: 'ABACO' },
];

let collegate = 0;
for (const t of gvData.transactions) {
  for (const target of daCollegare) {
    if (t.date !== target.date) continue;
    const amt = t.grossAmount ?? t.amount ?? 0;
    if (Math.abs(amt - target.amount) > 0.02) continue;
    if (target.desc && !t.description?.includes(target.desc)) continue;
    if (target.descMatch && !t.description?.toUpperCase().includes(target.descMatch)) continue;
    if (t.project && t.project.trim() !== '') continue; // gia' collegata, non toccare
    t.project = target.project;
    collegate++;
    console.log(`Collegata: ${t.date} | €${amt.toFixed(2)} | "${t.description}" -> ${target.project}`);
  }
}
console.log(`\nTotale collegate: ${collegate}`);

fs.writeFileSync(FILE_PATH, JSON.stringify(gvData, null, 2));
console.log(`File v2 aggiornato.`);
