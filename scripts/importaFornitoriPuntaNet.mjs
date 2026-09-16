// Estrazione dell'anagrafica fornitori da PuntaNet (GRUPPO VISENTIN SRL), per
// popolare la tab "Anagrafica Fornitori" di Gestione Finanziaria.
//
// A differenza di importaPuntaNet.mjs (che legge solo la Ragione Sociale da
// [Clienti Fornitori] per etichettare i movimenti), qui NON conosciamo i nomi
// reali delle colonne di quella tabella oltre a "Ragione Sociale" e "IDCliFor"
// (mai verificati prima d'ora) — quindi lo script:
//   1. Interroga INFORMATION_SCHEMA.COLUMNS per scoprire le colonne REALI della
//      tabella, senza mai assumerle a priori.
//   2. Prova a riconoscere colonne utili (P.IVA/CF, indirizzo, telefono, email,
//      PEC...) per somiglianza del nome colonna — quelle non riconosciute
//      vengono semplicemente ignorate, nessun errore.
//
// Due modalita', stesso schema di importaPuntaNet.mjs:
// - DRY-RUN (default, `npx tsx scripts/importaFornitoriPuntaNet.mjs`): scrive
//   SOLO un report di sola lettura in DATI SALVATI/AUTO — il file
//   "fornitori-report_*.json" va poi caricato a mano dalla tab Fornitori
//   ("Importa report PuntaNet"), dove resta da rivedere/confermare in UI.
// - SCRITTURA (`npx tsx scripts/importaFornitoriPuntaNet.mjs --scrivi`, pensata
//   per un task programmato/schedulato senza intervento manuale): scrive
//   direttamente nel file dati reale dell'app, con "auto-scrittura selettiva"
//   diversa da quella dei movimenti — qui il dato (nome/contatti/fatturato,
//   agganciato per IDCliFor reale) e' sempre affidabile al 100%, quindi:
//     - un fornitore NUOVO (IDCliFor non ancora presente) viene aggiunto con
//       macroCategoria "Da Categorizzare" — l'utente la assegna quando vuole,
//       in app, non e' mai bloccante;
//     - un fornitore GIA' PRESENTE viene aggiornato SOLO nei campi economici
//       (numero fatture, fatturato anno corrente/totale, ultima fattura): mai
//       nei contatti (potrebbero essere stati corretti a mano in app) ne' nella
//       categoria/nelle note (scelte dell'utente).
//   Prima di scrivere: backup del file reale (stessa convenzione di
//   importaPuntaNet.mjs), rilettura del file al momento della scrittura,
//   scrittura atomica (file temporaneo + rename).
//
// Uso: npx tsx scripts/importaFornitoriPuntaNet.mjs [--scrivi]
// Presuppone (come importaPuntaNet.mjs) che GC_Impresa2_RO esista gia'
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
const DB_COMUNE = 'GC_Comune_RO';
const DB_IMPRESA_SORELLA = 'GC_Impresa1_RO'; // VISENTIN COSTRUZIONI SRL (da GC_Comune_RO.TAB_Imprese)
const TABELLA = 'Clienti Fornitori';

const NAS_DATI = String.raw`\\NAS\Ufficio Tecnico\GRUPPO VISENTIN\00_GESTIONE GV\35_APP GV ECOSISTEM\04-GV GestioneFINANZIARIA\DATI SALVATI`;
const AUTO_DIR = path.join(NAS_DATI, 'AUTO');
const BACKUP_DIR = path.join(NAS_DATI, 'BACKUP');
const GVCF_PATH = path.join(NAS_DATI, 'gv-cashflow_v2-import-puntanet-automatico.gvcf');
const OGGI = new Date().toISOString().slice(0, 10);
const COLONNE_PATH = path.join(AUTO_DIR, `fornitori-colonne_${OGGI}.json`);
const REPORT_PATH = path.join(AUTO_DIR, `fornitori-report_${OGGI}.json`);

// -f 65001: output SQLCMD in UTF-8. Senza, la codepage OEM corrompe le lettere accentate (la
// colonna 'Città' arrivava come 'Citt?' e non poteva nemmeno essere riusata nella SELECT —
// verificato sui dati reali il 2026-09-16).
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

// Riconoscimento per somiglianza del nome colonna (case/spazi/underscore-insensitive).
// Ogni campo normalizzato prova piu' sinonimi plausibili in italiano/inglese; il primo
// che matcha una colonna realmente presente vince. Nessuna colonna e' mai assunta:
// se nessun sinonimo matcha, il campo resta vuoto (mai un errore, mai un dato inventato).
const SINONIMI = {
  puntaNetIdCliFor: ['idclifor'],
  ragioneSociale: ['ragionesociale', 'denominazione', 'nome'],
  // Partita IVA e Codice Fiscale sono DUE colonne distinte in PuntaNet — prima venivano
  // cercate come un unico sinonimo "pIvaCf", quindi la prima trovata (Partita Iva, che
  // precede Codice Fiscale nella tabella) vinceva sempre e il Codice Fiscale non veniva mai
  // letto: per una persona fisica (senza Partita IVA) il campo restava vuoto anche quando il
  // Codice Fiscale era presente (bug trovato in audit il 2026-09-16). Estratte separatamente,
  // ricombinate sotto con fallback Partita IVA -> Codice Fiscale.
  partitaIva: ['partitaiva'],
  codiceFiscale: ['codicefiscale'],
  indirizzo: ['indirizzo', 'via'],
  citta: ['citta'],
  provincia: ['provincia'],
  cap: ['cap'],
  telefono: ['telefono', 'tel'],
  cellulare: ['cellulare'],
  pec: ['pec'],
  email: ['email', 'mail'],
  sitoInternet: ['sitointernet', 'sito'],
  iban: ['iban'],
};

// NFD + rimozione dei segni diacritici (es. "Città" -> "citta") oltre a spazi/underscore/trattini:
// senza questo "Città" non avrebbe mai matchato il sinonimo "citta" (bug trovato in audit il
// 2026-09-16, mai notato prima perche' nessun campo con lettere accentate era ancora cercato).
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

console.log(`=== ${SCRIVI ? 'Scrittura' : 'Estrazione (dry-run)'} anagrafica fornitori da PuntaNet ===\n`);

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

fs.mkdirSync(AUTO_DIR, { recursive: true });
fs.writeFileSync(COLONNE_PATH, JSON.stringify(colonneReali, null, 2));
console.log(`Colonne reali di [${TABELLA}] (${colonneReali.length}) salvate in:\n  ${COLONNE_PATH}\n`);
console.log(colonneReali.join(', '), '\n');

const mapping = costruisciMapping(colonneReali);
console.log('Colonne riconosciute automaticamente:');
for (const [campo, colonna] of Object.entries(mapping)) console.log(`  ${campo} <- [${colonna}]`);
const nonRiconosciuti = Object.keys(SINONIMI).filter(c => !mapping[c]);
if (nonRiconosciuti.length > 0) {
  console.log(`\nNon riconosciuti automaticamente (controlla l'elenco colonne sopra e aggiorna SINONIMI se il nome e' diverso): ${nonRiconosciuti.join(', ')}`);
}

if (!mapping.ragioneSociale) {
  console.error(`\nNessuna colonna sembra contenere la ragione sociale: impossibile procedere senza. Controlla ${COLONNE_PATH} e aggiorna manualmente SINONIMI.ragioneSociale in questo script.`);
  process.exit(1);
}

// [CliFor] e [IDModPagamento] sono sempre selezionate esplicitamente (non fanno parte del
// riconoscimento per sinonimi sopra, sono nomi di colonna gia' verificati con la diagnostica
// scripts/diagnosticaFornitoriPuntaNet.mjs il 2026-09-16):
//   CliFor = 0 -> CLIENTE (incassa da GV, non e' un fornitore)
//   CliFor = 1 -> FORNITORE
//   CliFor = 2 -> FORNITORE (professionisti/erario: GV paga loro comunque)
// "Clienti Fornitori" e' un'anagrafica UNICA condivisa fra clienti e fornitori: senza questo
// filtro l'import scriveva anche gli acquirenti di immobili (es. BONAN GIANFRANCO, RAGUSO MIRKO)
// dentro l'Anagrafica Fornitori (bug segnalato dall'utente 2026-09-16, verificato sui dati reali:
// 129 clienti su 579 righe totali).
const colonneSelect = [...Object.values(mapping), 'CliFor', 'IDModPagamento'].map(c => `[${c}]`).join(', ');
const righeGrezze = runSql(DB_IMPRESA, `SET NOCOUNT ON; SELECT ${colonneSelect} FROM [${TABELLA}] FOR JSON PATH`);

const colonnaId = mapping.puntaNetIdCliFor;
const idClientiDaEscludere = new Set(
  righeGrezze.filter(r => r.CliFor === 0 && colonnaId).map(r => String(r[colonnaId]))
);
const righe = righeGrezze.filter(r => r.CliFor !== 0);
console.log(`\nEsclusi ${righeGrezze.length - righe.length} clienti (CliFor = 0) dall'anagrafica fornitori.`);

// Termini di pagamento leggibili (es. "BONIFICO", "30 Giorni D.F.") dalla tabella di lookup
// comune GC_Comune_RO.TAB_Modalita Pagamento, risolti per IDModPagamento — niente indovinato,
// niente ricerche su internet: e' un dato gia' presente nel gestionale (trovato con
// scripts/diagnosticaFornitoriPuntaNet.mjs il 2026-09-16).
let terminiPagamentoPerId = new Map();
try {
  const termini = runSql(DB_COMUNE, `SET NOCOUNT ON; SELECT IDModPagamento, Pagamento FROM [TAB_Modalita Pagamento] FOR JSON PATH`);
  terminiPagamentoPerId = new Map(termini.map(t => [t.IDModPagamento, t.Pagamento]));
} catch (e) {
  console.log(`\nImpossibile risolvere i termini di pagamento (${e.message}) — l'anagrafica includerà comunque tutto il resto.`);
}

// Condizione di pagamento dall'ULTIMA fattura fornitore (Documenti.IDModPagamento), usata solo
// se l'anagrafica non ne ha una: in GRUPPO VISENTIN SRL l'anagrafica ce l'ha per 15 fornitori su
// 450, le fatture per 447 (verificato 2026-09-16).
let modPagamentoUltimaFatturaPerId = new Map();
try {
  const ultime = runSql(
    DB_IMPRESA,
    `SET NOCOUNT ON; SELECT IDCliFor, IDModPagamento FROM (
       SELECT IDCliFor, IDModPagamento, ROW_NUMBER() OVER (PARTITION BY IDCliFor ORDER BY Data DESC, IDDocumento DESC) rn
       FROM Documenti WHERE Tipo = 1 AND IDModPagamento IS NOT NULL) x WHERE rn = 1 FOR JSON PATH`
  );
  modPagamentoUltimaFatturaPerId = new Map(ultime.map(u => [String(u.IDCliFor), u.IDModPagamento]));
} catch (e) {
  console.log(`\nImpossibile leggere la condizione di pagamento dalle fatture (${e.message}).`);
}

// Contatti dall'anagrafica di VISENTIN COSTRUZIONI SRL (GC_Impresa1_RO, societa' sorella, stessa
// struttura di tabella): l'anagrafica di GRUPPO VISENTIN SRL e' quasi vuota (telefono 4, email 1,
// PEC 0 su 450), quella di Visentin Costruzioni ha i contatti di molti degli STESSI fornitori.
// Abbinamento SOLO per Partita IVA / Codice Fiscale identici (mai per nome), usato SOLO per
// riempire campi vuoti — il dato di GRUPPO VISENTIN SRL, se presente, vince sempre.
const chiaveFiscale = (piva, cf) => String((piva && String(piva).trim()) || cf || '').toUpperCase().replace(/\s/g, '');
let contattiSorellaPerChiave = new Map();
try {
  const sorella = runSql(
    DB_IMPRESA_SORELLA,
    `SET NOCOUNT ON; SELECT [Partita Iva] AS piva, [Codice Fiscale] AS cf, Indirizzo, [Città] AS citta, Provincia, Cap,
       Telefono, Cellulare, [E-Mail] AS email, PEC, [Sito Internet] AS sito, IBAN
     FROM [${TABELLA}] WHERE ISNULL(Eliminato, 0) = 0 FOR JSON PATH`
  );
  for (const s of sorella) {
    const k = chiaveFiscale(s.piva, s.cf);
    if (k.length >= 11 && !contattiSorellaPerChiave.has(k)) contattiSorellaPerChiave.set(k, s);
  }
} catch (e) {
  console.log(`\nImpossibile leggere i contatti da ${DB_IMPRESA_SORELLA} (${e.message}) — si usa solo GRUPPO VISENTIN SRL.`);
}
let arricchitiDaSorella = 0;

// Riepilogo economico per fornitore, per le insight della tab "Mestieri Fornitori"
// di Direttore Cantiere (fatturato, numero fatture, ultimo utilizzo). A differenza
// dell'anagrafica sopra, qui l'aggregazione è per IDCliFor via chiave numerica reale
// (Documenti.IDCliFor = Clienti Fornitori.IDCliFor) — non serve alcun fuzzy match sui
// nomi, quindi il dato è affidabile al 100% per i soli fornitori con IDCliFor noto
// (cioè quelli già passati da PuntaNet, non quelli inseriti a mano in app).
// Tipo = 1 = FEP, fattura passiva (fornitore) — coerente con importaPuntaNet.mjs.
let riepilogoPerId = new Map();
if (mapping.puntaNetIdCliFor) {
  try {
    const riepilogo = runSql(
      DB_IMPRESA,
      `SET NOCOUNT ON; SELECT IDCliFor,
         COUNT(*) AS NumeroFatture,
         SUM(Totale) AS FatturatoTotale,
         SUM(CASE WHEN YEAR(Data) = YEAR(GETDATE()) THEN Totale ELSE 0 END) AS FatturatoAnnoCorrente,
         MAX(Data) AS UltimaFattura
       FROM Documenti WHERE Tipo = 1 GROUP BY IDCliFor FOR JSON PATH`
    );
    riepilogoPerId = new Map(riepilogo.map(r => [String(r.IDCliFor), r]));
  } catch (e) {
    console.log(`\nImpossibile calcolare il riepilogo economico (${e.message}) — il report includerà comunque l'anagrafica, senza fatturato/numero fatture.`);
  }
}

const fornitori = righe
  .map(r => {
    const out = {};
    for (const [campo, colonna] of Object.entries(mapping)) {
      const v = r[colonna];
      if (v !== null && v !== undefined && String(v).trim() !== '') out[campo] = typeof v === 'string' ? v.trim() : v;
    }

    const sorella = contattiSorellaPerChiave.get(chiaveFiscale(out.partitaIva, out.codiceFiscale));
    if (sorella) {
      const vuoto = v => v === undefined || v === null || String(v).trim() === '';
      const pulito = v => (vuoto(v) ? undefined : String(v).trim());
      let usato = false;
      const riempi = (campo, valore) => { if (vuoto(out[campo]) && pulito(valore)) { out[campo] = pulito(valore); usato = true; } };
      // L'indirizzo si prende in blocco (via+CAP+citta'+provincia) solo se manca la via: mai
      // mescolare via di una anagrafica con citta' dell'altra.
      if (vuoto(out.indirizzo)) {
        riempi('indirizzo', sorella.Indirizzo);
        riempi('citta', sorella.citta);
        riempi('provincia', sorella.Provincia);
        riempi('cap', sorella.Cap);
      }
      riempi('telefono', sorella.Telefono);
      riempi('cellulare', sorella.Cellulare);
      riempi('email', sorella.email);
      riempi('pec', sorella.PEC);
      riempi('sitoInternet', sorella.sito);
      riempi('iban', sorella.IBAN);
      if (usato) arricchitiDaSorella++;
    }

    // Partita IVA (aziende) con fallback su Codice Fiscale (persone fisiche, che non hanno
    // Partita IVA) — vedi nota sopra su SINONIMI.partitaIva/codiceFiscale.
    out.pIvaCf = out.partitaIva || out.codiceFiscale;
    delete out.partitaIva;
    delete out.codiceFiscale;

    // Indirizzo completo: via + CAP + citta' + provincia, tutti campi separati in PuntaNet ma
    // un solo campo libero "indirizzo" in Fornitore — prima veniva importata solo la via.
    const indirizzoCompleto = [
      out.indirizzo,
      [out.cap, out.citta].filter(Boolean).join(' '),
      out.provincia ? `(${out.provincia})` : undefined,
    ].filter(Boolean).join(', ');
    if (indirizzoCompleto) out.indirizzo = indirizzoCompleto; else delete out.indirizzo;
    delete out.citta;
    delete out.provincia;
    delete out.cap;

    // Telefono fisso + cellulare, entrambi in PuntaNet ma un solo campo "telefono" in
    // Fornitore — prima il cellulare non veniva mai letto (il sinonimo era condiviso con
    // "telefono" e la colonna Telefono vinceva sempre).
    const telefoni = [out.telefono, out.cellulare].filter(Boolean);
    if (telefoni.length > 0) out.telefono = [...new Set(telefoni)].join(' / '); else delete out.telefono;
    delete out.cellulare;

    if (out.puntaNetIdCliFor !== undefined) {
      const r2 = riepilogoPerId.get(String(out.puntaNetIdCliFor));
      if (r2) {
        out.numeroFatturePuntaNet = r2.NumeroFatture;
        out.fatturatoTotalePuntaNet = r2.FatturatoTotale;
        out.fatturatoAnnoCorrente = r2.FatturatoAnnoCorrente;
        out.ultimaFatturaPuntaNet = r2.UltimaFattura ? String(r2.UltimaFattura).slice(0, 10) : undefined;
      }
    }
    const idModPagamento = r.IDModPagamento ?? (out.puntaNetIdCliFor !== undefined ? modPagamentoUltimaFatturaPerId.get(String(out.puntaNetIdCliFor)) : undefined);
    if (idModPagamento != null && terminiPagamentoPerId.has(idModPagamento)) {
      out.condizionePagamentoPuntaNet = terminiPagamentoPerId.get(idModPagamento);
    }
    return out;
  })
  .filter(f => f.ragioneSociale);

fs.mkdirSync(AUTO_DIR, { recursive: true });
fs.writeFileSync(REPORT_PATH, JSON.stringify({ fornitori }, null, 2));
console.log(`\n${fornitori.length} fornitori estratti da [${TABELLA}].`);
console.log(`${arricchitiDaSorella} completati con contatti da VISENTIN COSTRUZIONI SRL (stessa P.IVA/CF).`);
console.log(`Report scritto in:\n  ${REPORT_PATH}`);

if (!SCRIVI) {
  console.log(`\nProssimo passo: in Gestione Finanziaria, tab "Fornitori" -> "Importa report PuntaNet" -> seleziona questo file.`);
  console.log(`Nessun dato e' stato scritto nel file reale dell'app (dry-run — usa --scrivi per scrivere davvero).`);
  process.exit(0);
}

// ─── Scrittura sul file dati vero (per il task programmato) ───────────────
// Rilettura del file AL MOMENTO della scrittura, stessa cautela di importaPuntaNet.mjs:
// minimizza la finestra in cui un'altra scrittura (l'app stessa, o l'import automatico
// dei movimenti) potrebbe andare persa con una sovrascrittura cieca.
const gvDataFresh = JSON.parse(fs.readFileSync(GVCF_PATH, 'utf8'));
const fornitoriEsistentiGrezzi = gvDataFresh.fornitori || [];

// Rimuove eventuali clienti finiti nell'anagrafica fornitori PRIMA che questo filtro esistesse
// (bug corretto il 2026-09-16 — vedi sopra): riconosciuti per puntaNetIdCliFor, mai per nome, cosi'
// non si tocca un fornitore inserito a mano con un nome simile a un cliente.
const rimossiClienti = fornitoriEsistentiGrezzi.filter(f => f.puntaNetIdCliFor != null && idClientiDaEscludere.has(String(f.puntaNetIdCliFor)));
const fornitoriEsistenti = fornitoriEsistentiGrezzi.filter(f => !(f.puntaNetIdCliFor != null && idClientiDaEscludere.has(String(f.puntaNetIdCliFor))));

const esistentiPerPuntaNetId = new Map(
  fornitoriEsistenti.filter(f => f.puntaNetIdCliFor != null).map(f => [String(f.puntaNetIdCliFor), f])
);
const esistentiPerNome = new Set(fornitoriEsistenti.map(f => (f.ragioneSociale || '').toLowerCase().trim()));

const nuovi = [];
const aggiornati = [];
const completati = [];
const CAMPI_ANAGRAFICI_COMPLETABILI = ['pIvaCf', 'indirizzo', 'telefono', 'pec', 'email', 'sitoInternet', 'iban', 'condizionePagamentoPuntaNet'];
for (const f of fornitori) {
  const chiaveId = f.puntaNetIdCliFor != null ? String(f.puntaNetIdCliFor) : null;
  const esistente = chiaveId ? esistentiPerPuntaNetId.get(chiaveId) : null;
  if (esistente) {
    // Fornitore gia' noto: aggiorna SOLO i campi economici, mai contatti/categoria/note
    // (potrebbero essere stati corretti o assegnati a mano in app).
    const cambiato =
      esistente.numeroFatturePuntaNet !== f.numeroFatturePuntaNet ||
      esistente.fatturatoAnnoCorrente !== f.fatturatoAnnoCorrente ||
      esistente.fatturatoTotalePuntaNet !== f.fatturatoTotalePuntaNet ||
      esistente.ultimaFatturaPuntaNet !== f.ultimaFatturaPuntaNet;
    if (cambiato) {
      Object.assign(esistente, {
        numeroFatturePuntaNet: f.numeroFatturePuntaNet,
        fatturatoAnnoCorrente: f.fatturatoAnnoCorrente,
        fatturatoTotalePuntaNet: f.fatturatoTotalePuntaNet,
        ultimaFatturaPuntaNet: f.ultimaFatturaPuntaNet,
      });
      aggiornati.push(esistente.ragioneSociale);
    }
    // Campi anagrafici estratti solo dopo il primo import (IBAN, sito, condizione pagamento,
    // indirizzo completo, cellulare, CF): i fornitori importati prima li avrebbero lasciati vuoti
    // per sempre. Si COMPLETANO senza mai sovrascrivere una scelta fatta a mano: un campo vuoto
    // viene riempito; un campo gia' valorizzato viene esteso solo se il nuovo valore PuntaNet
    // inizia esattamente con quello vecchio (es. "Via Roma 1" -> "Via Roma 1, 31100 Treviso (TV)"),
    // cioe' se e' ancora il dato parziale del vecchio import e non una correzione in app.
    // Un valore con il carattere di sostituzione U+FFFD viene dagli import fatti prima del fix
    // -f 65001 (lettere accentate corrotte, es. "Societ�"): nessuno lo scrive a mano, quindi si
    // sostituisce col valore corretto — ragioneSociale compresa, ma SOLO in questo caso.
    let completato = false;
    for (const campo of ['ragioneSociale', ...CAMPI_ANAGRAFICI_COMPLETABILI]) {
      const nuovo = f[campo];
      if (nuovo === undefined) continue;
      const attuale = esistente[campo];
      const vuoto = attuale === undefined || attuale === null || String(attuale).trim() === '';
      const corrotto = !vuoto && String(attuale).includes('�') && String(nuovo) !== String(attuale);
      // La condizione di pagamento e' modificabile a mano in scheda (es. "30" scritto dall'utente):
      // mai "estesa" col valore PuntaNet, solo riempita se vuota.
      const estendibile = campo !== 'ragioneSociale' && campo !== 'condizionePagamentoPuntaNet' && !vuoto && String(nuovo) !== String(attuale) && String(nuovo).startsWith(String(attuale));
      if ((vuoto && campo !== 'ragioneSociale') || corrotto || estendibile) {
        esistente[campo] = nuovo;
        completato = true;
      }
    }
    if (completato) completati.push(esistente.ragioneSociale);
  } else if (!chiaveId || !esistentiPerNome.has((f.ragioneSociale || '').toLowerCase().trim())) {
    // Fornitore nuovo: dato anagrafico/economico affidabile al 100% (chiave IDCliFor
    // reale, non un fuzzy match), quindi si scrive subito — solo la categoria resta
    // "Da Categorizzare" perche' PuntaNet non ha alcun concetto di Grezzo/Finiture.
    nuovi.push({
      id: crypto.randomUUID(),
      macroCategoria: 'non_categorizzato',
      ...f,
    });
  }
}

if (nuovi.length === 0 && aggiornati.length === 0 && completati.length === 0 && rimossiClienti.length === 0) {
  console.log('\nNessuna novita\' da scrivere (anagrafica e fatturato gia\' allineati — probabile doppia esecuzione nella stessa giornata).');
  process.exit(0);
}

fs.mkdirSync(BACKUP_DIR, { recursive: true });
const stamp = `${OGGI}_${Date.now()}`;
const backupPath = path.join(BACKUP_DIR, `gv-cashflow_v2_PRE-import-fornitori-automatico_${stamp}.gvcf`);
fs.copyFileSync(GVCF_PATH, backupPath);

gvDataFresh.fornitori = [...fornitoriEsistenti, ...nuovi];
gvDataFresh.timestamp = new Date().toISOString();
// Stesso log usato dal banner "N movimenti importati automaticamente" in app (App.tsx) —
// campi fornitoriNuovi/fornitoriAggiornati aggiunti qui, ignorati dalle voci piu' vecchie
// scritte solo da importaPuntaNet.mjs (che non li imposta).
gvDataFresh.logImportAutomatico = [
  ...(gvDataFresh.logImportAutomatico || []),
  { timestamp: new Date().toISOString(), autoScritti: 0, daRivedere: 0, fornitoriNuovi: nuovi.length, fornitoriAggiornati: aggiornati.length },
].slice(-60);

const tmpPath = `${GVCF_PATH}.tmp_${process.pid}`;
fs.writeFileSync(tmpPath, JSON.stringify(gvDataFresh, null, 2));
fs.renameSync(tmpPath, GVCF_PATH);

console.log(`\n✔ Aggiunti ${nuovi.length} fornitori nuovi (categoria "Da Categorizzare").`);
if (rimossiClienti.length > 0) {
  console.log(`✔ Rimossi ${rimossiClienti.length} clienti finiti per errore nell'anagrafica fornitori prima del filtro CliFor: ${rimossiClienti.map(f => f.ragioneSociale).join(', ')}`);
}
console.log(`✔ Aggiornato il fatturato/numero fatture di ${aggiornati.length} fornitori gia' presenti.`);
console.log(`✔ Completati i dati anagrafici mancanti (IBAN, sito, pagamento, indirizzo...) di ${completati.length} fornitori gia' presenti.`);
console.log(`  Backup pre-scrittura: ${backupPath}`);
console.log('=== Scrittura completata ===');
