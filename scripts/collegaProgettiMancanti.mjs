// Trova transazioni (qualunque anno) senza "project" assegnato, e prova ad abbinarle a un
// progetto usando la stessa funzione di fuzzy matching gia' presente nell'app
// (abbinaCantiereDaProgetto). Applica SOLO gli abbinamenti ad alta confidenza (score >= 80);
// quelli piu' incerti vengono solo segnalati, non applicati.
// Lavora sul file v2 (gia' in uso per la revisione) — mai sull'originale.

import fs from 'fs';
import path from 'path';
import { abbinaCantiereDaProgetto } from '../utils/puntaNetImporter.ts';

const NAS_DATI = String.raw`\\NAS\Ufficio Tecnico\GRUPPO VISENTIN\00_GESTIONE GV\35_APP GV ECOSISTEM\04-GV GestioneFINANZIARIA\DATI SALVATI`;
const FILE_PATH = path.join(NAS_DATI, 'gv-cashflow_v2-import-puntanet-automatico.gvcf');

const gvData = JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));

// ─── Collegamento esplicito gia' confermato dall'utente (Bombarda-Diva SAS 2025) ──
let bombardaCollegate = 0;
for (const t of gvData.transactions) {
  if (t.description === 'BOMBARDA - DIVA SAS' && (!t.project || t.project.trim() === '')) {
    t.project = 'Casa Bombarda';
    bombardaCollegate++;
  }
}
console.log(`Collegamento esplicito confermato — Bombarda-Diva SAS: ${bombardaCollegate} righe collegate a "Casa Bombarda"\n`);

const senzaProgetto = gvData.transactions.filter(t => !t.project || t.project.trim() === '');
console.log(`Transazioni totali: ${gvData.transactions.length}`);
console.log(`Senza progetto assegnato: ${senzaProgetto.length}\n`);

let collegateAlta = 0, daRivedere = 0;
const dettaglioAlta = [];
const dettaglioRivedere = [];

for (const t of gvData.transactions) {
  if (t.project && t.project.trim() !== '') continue;
  if (!t.description) continue;

  const match = abbinaCantiereDaProgetto(t.description, gvData.projects, t.type === 'EXPENSE');
  if (!match) continue;

  if (match.score >= 80) {
    t.project = match.cantiere;
    collegateAlta++;
    dettaglioAlta.push(`${t.date} | €${(t.grossAmount ?? t.amount ?? 0).toFixed(2)} | "${t.description}" -> ${match.cantiere} (score ${match.score})`);
  } else {
    daRivedere++;
    dettaglioRivedere.push(`${t.date} | €${(t.grossAmount ?? t.amount ?? 0).toFixed(2)} | "${t.description}" -> ${match.cantiere}? (score ${match.score})`);
  }
}

console.log(`=== COLLEGATE AUTOMATICAMENTE (score >= 80) ===`);
console.log(`Totale: ${collegateAlta}\n`);
dettaglioAlta.forEach(d => console.log(`  ${d}`));

console.log(`\n=== DA RIVEDERE A MANO (score piu' basso, non toccate) ===`);
console.log(`Totale: ${daRivedere}\n`);
dettaglioRivedere.slice(0, 40).forEach(d => console.log(`  ${d}`));
if (dettaglioRivedere.length > 40) console.log(`  ... e altre ${dettaglioRivedere.length - 40}`);

const ancoraSenzaProgetto = gvData.transactions.filter(t => !t.project || t.project.trim() === '').length;
console.log(`\n=== RIEPILOGO ===`);
console.log(`Prima: ${senzaProgetto.length} senza progetto`);
console.log(`Collegate ora: ${collegateAlta}`);
console.log(`Ancora senza progetto (nessun match trovato o score troppo basso): ${ancoraSenzaProgetto}`);

fs.writeFileSync(FILE_PATH, JSON.stringify(gvData, null, 2));
console.log(`\nFile v2 aggiornato: ${FILE_PATH}`);
