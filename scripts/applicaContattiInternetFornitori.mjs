// Applica all'anagrafica fornitori i contatti trovati su internet (ricerca una tantum del
// 2026-09-16, richiesta dall'utente perche' l'anagrafica PuntaNet e' quasi vuota).
//
// Input: uno o piu' file JSON (array) con voci
//   { id, ragioneSociale, trovati: { telefono?, email?, pec?, sitoInternet? }, fonte: [url], pIvaVerificata, confidenza }
// Regole:
//   - si scrive SOLO in campi vuoti: mai sovrascritto un dato gia' presente (PuntaNet o inserito a mano);
//   - mai IBAN (un IBAN preso dal web e' un rischio di frode sui bonifici), solo i 4 campi sopra;
//   - abbinamento per id interno dell'app (non per nome);
//   - backup del file reale, rilettura al momento della scrittura, scrittura atomica;
//   - report con la fonte di ogni dato scritto in DATI SALVATI/AUTO, per poterlo verificare.
// Gli import PuntaNet successivi riempiono anch'essi solo campi vuoti, quindi non cancellano
// questi dati.
//
// Uso: node scripts/applicaContattiInternetFornitori.mjs [--scrivi] risultati_0.json risultati_1.json ...

import fs from 'fs';
import path from 'path';

const SCRIVI = process.argv.includes('--scrivi');
const inputFiles = process.argv.slice(2).filter(a => a !== '--scrivi');

const NAS_DATI = String.raw`\\NAS\Ufficio Tecnico\GRUPPO VISENTIN\00_GESTIONE GV\35_APP GV ECOSISTEM\04-GV GestioneFINANZIARIA\DATI SALVATI`;
const AUTO_DIR = path.join(NAS_DATI, 'AUTO');
const BACKUP_DIR = path.join(NAS_DATI, 'BACKUP');
const GVCF_PATH = path.join(NAS_DATI, 'gv-cashflow_v2-import-puntanet-automatico.gvcf');
const OGGI = new Date().toISOString().slice(0, 10);
const CAMPI = ['telefono', 'email', 'pec', 'sitoInternet'];

const vuoto = v => v === undefined || v === null || String(v).trim() === '';
const validi = {
  telefono: v => /\d{6,}/.test(String(v).replace(/[\s./-]/g, '')),
  email: v => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v),
  pec: v => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v),
  sitoInternet: v => /^(https?:\/\/)?[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(v),
};

const risultati = inputFiles.flatMap(f => {
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); }
  catch (e) { console.log(`File ignorato (${f}): ${e.message}`); return []; }
});

const gvData = JSON.parse(fs.readFileSync(GVCF_PATH, 'utf8'));
const perId = new Map((gvData.fornitori || []).map(f => [f.id, f]));

const scritti = [];
const scartati = [];
for (const r of risultati) {
  const fornitore = perId.get(r.id);
  if (!fornitore) { scartati.push({ ...r, motivo: 'fornitore non trovato' }); continue; }
  for (const campo of CAMPI) {
    const valore = r.trovati?.[campo] != null ? String(r.trovati[campo]).trim() : '';
    if (!valore) continue;
    if (!validi[campo](valore)) { scartati.push({ id: r.id, ragioneSociale: fornitore.ragioneSociale, campo, valore, motivo: 'formato non valido' }); continue; }
    if (!vuoto(fornitore[campo])) continue;
    fornitore[campo] = valore;
    scritti.push({ id: r.id, ragioneSociale: fornitore.ragioneSociale, campo, valore, fonte: r.fonte, pIvaVerificata: r.pIvaVerificata, confidenza: r.confidenza });
  }
}

const perCampo = Object.fromEntries(CAMPI.map(c => [c, scritti.filter(s => s.campo === c).length]));
console.log(`Voci lette: ${risultati.length}. Valori da scrivere: ${scritti.length}`, perCampo, `Scartati: ${scartati.length}`);

const reportPath = path.join(AUTO_DIR, `fornitori-contatti-internet_${OGGI}.json`);
fs.writeFileSync(reportPath, JSON.stringify({ scritti, scartati }, null, 2));
console.log(`Report con le fonti: ${reportPath}`);

if (!SCRIVI) { console.log('Dry-run: nessun dato scritto (usa --scrivi).'); process.exit(0); }
if (scritti.length === 0) { console.log('Niente da scrivere.'); process.exit(0); }

fs.mkdirSync(BACKUP_DIR, { recursive: true });
const backupPath = path.join(BACKUP_DIR, `gv-cashflow_v2_PRE-contatti-internet_${OGGI}_${Date.now()}.gvcf`);
fs.copyFileSync(GVCF_PATH, backupPath);

// Rilettura al momento della scrittura: l'app potrebbe aver salvato nel frattempo.
const fresh = JSON.parse(fs.readFileSync(GVCF_PATH, 'utf8'));
const freshPerId = new Map((fresh.fornitori || []).map(f => [f.id, f]));
let applicati = 0;
for (const s of scritti) {
  const f = freshPerId.get(s.id);
  if (f && vuoto(f[s.campo])) { f[s.campo] = s.valore; applicati++; }
}
fresh.timestamp = new Date().toISOString();
const tmpPath = `${GVCF_PATH}.tmp_${process.pid}`;
fs.writeFileSync(tmpPath, JSON.stringify(fresh, null, 2));
fs.renameSync(tmpPath, GVCF_PATH);
console.log(`✔ Scritti ${applicati} valori. Backup pre-scrittura: ${backupPath}`);
