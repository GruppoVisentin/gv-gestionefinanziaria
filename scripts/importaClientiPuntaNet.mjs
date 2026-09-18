// Estrazione dell'anagrafica clienti (committenti) da PuntaNet (GRUPPO VISENTIN SRL),
// per popolare l'Anagrafica Clienti condivisa con l'ecosistema GV (letta anche da
// Direttore Cantiere tramite il registro condiviso).
//
// Stessa tabella di importaFornitoriPuntaNet.mjs ([Clienti Fornitori], anagrafica
// UNICA condivisa fra clienti e fornitori), stesso riconoscimento colonne per
// somiglianza (mai colonne assunte a priori), ma:
//   - filtro opposto: CliFor = 0 -> CLIENTE (qui e' quello che vogliamo), invece
//     di essere escluso come in importaFornitoriPuntaNet.mjs;
//   - solo ragione sociale e P.IVA/Codice Fiscale: l'Anagrafica Clienti di questa
//     app non ha campi contatto (indirizzo/telefono/email) come i fornitori.
//
// Due modalita', stesso schema di importaFornitoriPuntaNet.mjs:
// - DRY-RUN (default): scrive solo un report di sola lettura in DATI SALVATI/AUTO.
// - SCRITTURA (--scrivi, per il task programmato): scrive direttamente in
//   data.clients del file reale dell'app, merge per IDCliFor (puntaNetIdCliFor) —
//   un cliente nuovo viene aggiunto, uno gia' presente viene aggiornato solo se il
//   nome PuntaNet e' diverso (es. correzione di ragione sociale a monte), mai
//   toccato se e' stato creato o rinominato a mano in app (senza puntaNetIdCliFor).
//
// Una volta scritto in data.clients, la pubblicazione periodica gia' esistente
// verso il registro condiviso (vedi App.tsx, pushClientsToRegistry) lo propaga da
// sola entro 2 minuti, senza altro intervento.
//
// Uso: npx tsx scripts/importaClientiPuntaNet.mjs [--scrivi]
// Presuppone (come importaFornitoriPuntaNet.mjs) che GC_Impresa2_RO esista gia'
// sull'istanza SQLEXPRESS locale (ripristinata dall'ultimo backup PuntaNet).

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

const SCRIVI = process.argv.includes('--scrivi');

const SQLCMD = String.raw`C:\Program Files\Microsoft SQL Server\Client SDK\ODBC\110\Tools\Binn\SQLCMD.EXE`;
const INSTANCE = String.raw`localhost\SQLEXPRESS`;
const DB_IMPRESA = 'GC_Impresa2_RO'; // GRUPPO VISENTIN SRL
const TABELLA = 'Clienti Fornitori';

const NAS_DATI = String.raw`\\NAS\Ufficio Tecnico\GRUPPO VISENTIN\00_GESTIONE GV\35_APP GV ECOSISTEM\04-GV GestioneFINANZIARIA\DATI SALVATI`;
const AUTO_DIR = path.join(NAS_DATI, 'AUTO');
const BACKUP_DIR = path.join(NAS_DATI, 'BACKUP');
const GVCF_PATH = path.join(NAS_DATI, 'gv-cashflow_v2-import-puntanet-automatico.gvcf');
const OGGI = new Date().toISOString().slice(0, 10);
const REPORT_PATH = path.join(AUTO_DIR, `clienti-report_${OGGI}.json`);

// -f 65001: output SQLCMD in UTF-8 (vedi importaFornitoriPuntaNet.mjs per il perche').
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

const SINONIMI = {
  puntaNetIdCliFor: ['idclifor'],
  ragioneSociale: ['ragionesociale', 'denominazione', 'nome'],
  partitaIva: ['partitaiva'],
  codiceFiscale: ['codicefiscale'],
};

function normalizza(nome) {
  return nome
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[\s_-]/g, '');
}

function costruisciMapping(colonneReali) {
  const normalizzate = colonneReali.map(c => ({ originale: c, norm: normalizza(c) }));
  const mapping = {};
  for (const [campo, sinonimi] of Object.entries(SINONIMI)) {
    const trovata = normalizzate.find(c => sinonimi.some(s => c.norm.includes(s)));
    if (trovata) mapping[campo] = trovata.originale;
  }
  return mapping;
}

console.log(`=== ${SCRIVI ? 'Scrittura' : 'Estrazione (dry-run)'} anagrafica clienti da PuntaNet ===\n`);

let colonneReali;
try {
  const colInfo = runSql(
    DB_IMPRESA,
    `SET NOCOUNT ON; SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${TABELLA}' FOR JSON PATH`
  );
  colonneReali = colInfo.map(r => r.COLUMN_NAME);
} catch (e) {
  console.error(`Impossibile leggere le colonne di [${TABELLA}]: ${e.message}`);
  console.error(`Verifica che SQLCMD.EXE esista nel percorso atteso e che ${DB_IMPRESA} sia ripristinato su ${INSTANCE}.`);
  process.exit(1);
}

if (colonneReali.length === 0) {
  console.error(`La tabella [${TABELLA}] non e' stata trovata (o non ha colonne) su ${DB_IMPRESA}.`);
  process.exit(1);
}

const mapping = costruisciMapping(colonneReali);
console.log('Colonne riconosciute automaticamente:');
for (const [campo, colonna] of Object.entries(mapping)) console.log(`  ${campo} <- [${colonna}]`);

if (!mapping.ragioneSociale) {
  console.error(`\nNessuna colonna sembra contenere la ragione sociale: impossibile procedere. Controlla le colonne di [${TABELLA}] (vedi anche l'output di importaFornitoriPuntaNet.mjs) e aggiorna manualmente SINONIMI.ragioneSociale in questo script.`);
  process.exit(1);
}

// CliFor = 0 -> CLIENTE (incassa da GV): l'opposto del filtro di
// importaFornitoriPuntaNet.mjs, stessa colonna gia' verificata il 2026-09-16.
const colonneSelect = [...Object.values(mapping), 'CliFor'].map(c => `[${c}]`).join(', ');
const righeGrezze = runSql(DB_IMPRESA, `SET NOCOUNT ON; SELECT ${colonneSelect} FROM [${TABELLA}] FOR JSON PATH`);
const righe = righeGrezze.filter(r => r.CliFor === 0);
console.log(`\n${righe.length} clienti (CliFor = 0) su ${righeGrezze.length} righe totali in [${TABELLA}].`);

const clienti = righe
  .map(r => {
    const out = {};
    for (const [campo, colonna] of Object.entries(mapping)) {
      const v = r[colonna];
      if (v !== null && v !== undefined && String(v).trim() !== '') out[campo] = typeof v === 'string' ? v.trim() : v;
    }
    out.pIva = out.partitaIva || out.codiceFiscale;
    delete out.partitaIva;
    delete out.codiceFiscale;
    return out;
  })
  .filter(c => c.ragioneSociale);

fs.mkdirSync(AUTO_DIR, { recursive: true });
fs.writeFileSync(REPORT_PATH, JSON.stringify({ clienti }, null, 2));
console.log(`\n${clienti.length} clienti estratti da [${TABELLA}].`);
console.log(`Report scritto in:\n  ${REPORT_PATH}`);

if (!SCRIVI) {
  console.log(`\nNessun dato e' stato scritto nel file reale dell'app (dry-run — usa --scrivi per scrivere davvero).`);
  process.exit(0);
}

// ─── Scrittura sul file dati vero (per il task programmato) ───────────────
const gvDataFresh = JSON.parse(fs.readFileSync(GVCF_PATH, 'utf8'));
const clientiEsistenti = gvDataFresh.clients || [];

const esistentiPerPuntaNetId = new Map(
  clientiEsistenti.filter(c => c.puntaNetIdCliFor != null).map(c => [String(c.puntaNetIdCliFor), c])
);
const esistentiPerNome = new Set(clientiEsistenti.map(c => (c.nome || '').toLowerCase().trim()));

const nuovi = [];
const aggiornati = [];
for (const c of clienti) {
  const chiaveId = c.puntaNetIdCliFor != null ? String(c.puntaNetIdCliFor) : null;
  const esistente = chiaveId ? esistentiPerPuntaNetId.get(chiaveId) : null;
  if (esistente) {
    // Cliente gia' noto per IDCliFor: aggiorna nome/P.IVA solo se PuntaNet li ha
    // cambiati (es. correzione ragione sociale a monte) — mai per un cliente
    // creato o corretto a mano qui (che non ha puntaNetIdCliFor).
    if (esistente.nome !== c.ragioneSociale || (c.pIva && esistente.pIva !== c.pIva)) {
      esistente.nome = c.ragioneSociale;
      if (c.pIva) esistente.pIva = c.pIva;
      aggiornati.push(esistente.nome);
    }
  } else if (!chiaveId || !esistentiPerNome.has((c.ragioneSociale || '').toLowerCase().trim())) {
    // Cliente nuovo: dato affidabile al 100% (chiave IDCliFor reale).
    nuovi.push({
      id: crypto.randomUUID(),
      nome: c.ragioneSociale,
      pIva: c.pIva,
      puntaNetIdCliFor: c.puntaNetIdCliFor,
    });
  }
}

if (nuovi.length === 0 && aggiornati.length === 0) {
  console.log('\nNessuna novita\' da scrivere (anagrafica gia\' allineata — probabile doppia esecuzione nella stessa giornata).');
  process.exit(0);
}

fs.mkdirSync(BACKUP_DIR, { recursive: true });
const stamp = `${OGGI}_${Date.now()}`;
const backupPath = path.join(BACKUP_DIR, `gv-cashflow_v2_PRE-import-clienti-automatico_${stamp}.gvcf`);
fs.copyFileSync(GVCF_PATH, backupPath);

gvDataFresh.clients = [...clientiEsistenti, ...nuovi];
gvDataFresh.timestamp = new Date().toISOString();

const tmpPath = `${GVCF_PATH}.tmp_${process.pid}`;
fs.writeFileSync(tmpPath, JSON.stringify(gvDataFresh, null, 2));
fs.renameSync(tmpPath, GVCF_PATH);

console.log(`\n✔ Aggiunti ${nuovi.length} clienti nuovi.`);
console.log(`✔ Aggiornati ${aggiornati.length} clienti gia' presenti (nome/P.IVA cambiati su PuntaNet).`);
console.log(`  Backup pre-scrittura: ${backupPath}`);
console.log('=== Scrittura completata ===');
