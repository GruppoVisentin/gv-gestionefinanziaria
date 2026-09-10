// Collegamento retroattivo previsione <-> consuntivo sulle ENTRATE gia' presenti nel file v2.
// Criterio: stesso progetto (o entrambi senza progetto), stessa categoria, stesso importo netto
// (tolleranza 1 centesimo). Un match viene applicato SOLO se e' univoco in entrambe le direzioni
// (quella previsione ha un solo consuntivo candidato, e quel consuntivo ha una sola previsione
// candidata) — nessun abbinamento "indovinato" quando ci sono piu' candidati possibili.
// Crea prima uno snapshot di sicurezza datato, non tocca nulla se non nel file v2.

import fs from 'fs';
import path from 'path';

const NAS_DATI = String.raw`\\NAS\Ufficio Tecnico\GRUPPO VISENTIN\00_GESTIONE GV\35_APP GV ECOSISTEM\04-GV GestioneFINANZIARIA\DATI SALVATI`;
const FILE_PATH = path.join(NAS_DATI, 'gv-cashflow_v2-import-puntanet-automatico.gvcf');
const SNAPSHOT_PATH = path.join(NAS_DATI, 'AUTO', `gv-cashflow_v2_PRE-collega-entrate-prev-cons_${new Date().toISOString().slice(0, 10)}_${Date.now()}.gvcf`);

const gvData = JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
fs.mkdirSync(path.dirname(SNAPSHOT_PATH), { recursive: true });
fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(gvData, null, 2));
console.log(`Snapshot di sicurezza salvato: ${SNAPSHOT_PATH}\n`);

const chiaveProgetto = t => (t.project ? t.project.trim() : '');
const stessoImporto = (a, b) => Math.abs((a.amount ?? 0) - (b.amount ?? 0)) < 0.01;

const income = gvData.transactions.filter(t => t.type === 'INCOME');
const previsioni = income.filter(t => t.isForecast === true);
const consuntivi = income.filter(t => t.isForecast !== true && !t.linkedForecastId);

let collegati = 0;
const ambiguiSaltati = [];

for (const prev of previsioni) {
  // Se questa previsione e' gia' chiusa da un consuntivo esistente (dei 4 gia' collegati), salta.
  const giaChiusa = income.some(t => t.isForecast !== true && t.linkedForecastId === prev.id);
  if (giaChiusa) continue;

  const candidatiConsuntivo = consuntivi.filter(c =>
    !c.linkedForecastId &&
    chiaveProgetto(c) === chiaveProgetto(prev) &&
    c.category === prev.category &&
    stessoImporto(c, prev)
  );

  if (candidatiConsuntivo.length !== 1) {
    if (candidatiConsuntivo.length > 1) {
      ambiguiSaltati.push({
        previsione: `${prev.date} | ${prev.description} | €${prev.amount} | ${prev.category} | progetto: ${chiaveProgetto(prev) || '(nessuno)'}`,
        candidati: candidatiConsuntivo.map(c => `${c.date} | ${c.description} | €${c.amount}`),
      });
    }
    continue;
  }

  const candidato = candidatiConsuntivo[0];

  // Verifica reciproca: quel consuntivo deve avere UNA sola previsione candidata (questa).
  const candidatiPrevisione = previsioni.filter(p =>
    !income.some(t => t.isForecast !== true && t.linkedForecastId === p.id) &&
    chiaveProgetto(p) === chiaveProgetto(candidato) &&
    p.category === candidato.category &&
    stessoImporto(p, candidato)
  );

  if (candidatiPrevisione.length !== 1) continue; // ambiguo anche dall'altro lato, salta

  candidato.linkedForecastId = prev.id;
  collegati += 1;
  console.log(`OK  ${prev.date} -> ${candidato.date} | €${prev.amount} | ${prev.category} | ${chiaveProgetto(prev) || '(nessun progetto)'} | ${prev.description} => ${candidato.description}`);
}

console.log(`\nCollegamenti applicati: ${collegati}`);
console.log(`Casi ambigui saltati (piu' di un candidato, nessun collegamento automatico): ${ambiguiSaltati.length}`);
if (ambiguiSaltati.length > 0) {
  console.log('\n--- Dettaglio casi ambigui saltati ---');
  ambiguiSaltati.forEach(a => {
    console.log(`\nPrevisione: ${a.previsione}`);
    a.candidati.forEach(c => console.log(`   candidato consuntivo: ${c}`));
  });
}

fs.writeFileSync(FILE_PATH, JSON.stringify(gvData, null, 2));
console.log(`\nFile aggiornato: ${FILE_PATH}`);
