'use strict';

/**
 * Modello dati e costanti condivise (motore + app).
 * Nessuna dipendenza esterna: usato sia lato server sia servito al client.
 */

// ─────────────────────────────────────────────────────────────
// COSTANTI DI DOMINIO
// ─────────────────────────────────────────────────────────────

// Tribunali del Veneto (usati per targeting scraping e filtri app)
const TRIBUNALI_VENETO = [
  'Vicenza', 'Verona', 'Padova', 'Treviso', 'Venezia',
  'Rovigo', 'Belluno', 'Bassano del Grappa'
];

// Tipologie immobile normalizzate
const TIPOLOGIE = [
  'Residenziale',
  'Terreno',
  'Commerciale',
  'Industriale',
  'Box/Garage',
  'Altro'
];

// Stato di valutazione interna dell'asta (pipeline commerciale)
const STATI_ASTA = [
  { id: 'da_valutare',        label: 'Da valutare',        color: 'slate'   },
  { id: 'in_valutazione',     label: 'In valutazione',     color: 'amber'   },
  { id: 'interessante',       label: 'Interessante',       color: 'blue'    },
  { id: 'sopralluogo',        label: 'Sopralluogo',        color: 'violet'  },
  { id: 'offerta_presentata', label: 'Offerta presentata', color: 'cyan'    },
  { id: 'aggiudicata',        label: 'Aggiudicata',        color: 'emerald' },
  { id: 'persa',              label: 'Persa',              color: 'rose'    },
  { id: 'scartata',           label: 'Scartata',           color: 'gray'    }
];

// Tipo vendita (modalità PVP)
const TIPI_VENDITA = [
  'Telematica sincrona',
  'Telematica asincrona',
  'Mista',
  'Analogica',
  'Senza incanto',
  'Non specificato'
];

// ── Monitoraggio concorrenti ──
const TIPI_OPERAZIONE = [
  'Acquisto',
  'Sviluppo/Costruzione',
  'Ristrutturazione',
  'Vendita/Commercializzazione',
  'Permuta',
  'Aggiudicazione asta',
  'Altro'
];

const STATI_OPERAZIONE = [
  { id: 'individuata', label: 'Individuata', color: 'slate'   },
  { id: 'in_corso',    label: 'In corso',    color: 'amber'   },
  { id: 'completata',  label: 'Completata',  color: 'emerald' },
  { id: 'sospesa',     label: 'Sospesa',     color: 'rose'    }
];

const FONTI_CONCORRENTE = [
  'Annuncio agenzia',
  'Portale immobiliare',
  'Notizia/Stampa',
  'Sopralluogo',
  'Visura/Catasto',
  'Cartello di cantiere',
  'Passaparola',
  'Altro'
];

const LIVELLI_RILEVANZA = [
  { id: 'bassa', label: 'Bassa', color: 'slate'   },
  { id: 'media', label: 'Media', color: 'amber'   },
  { id: 'alta',  label: 'Alta',  color: 'rose'    }
];

// ─────────────────────────────────────────────────────────────
// UTILITY
// ─────────────────────────────────────────────────────────────

function uid(prefix) {
  return (prefix || 'id') + '_' +
    Date.now().toString(36) + '_' +
    Math.random().toString(36).slice(2, 8);
}

function toNumber(v) {
  if (v == null) return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  // gestisce formati "€ 123.456,78" / "123456.78" / "123.456" / "55.000" / "1.234.000"
  let s = String(v).replace(/[^\d,.-]/g, '').trim();
  if (!s) return null;
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    // l'ultimo separatore presente è quello decimale
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.'); // italiano: . migliaia, , decimali
    } else {
      s = s.replace(/,/g, '');                    // inglese: , migliaia, . decimali
    }
  } else if (hasComma) {
    s = s.replace(/\./g, '').replace(',', '.');   // solo virgola = decimale italiano
  } else if (hasDot) {
    // solo punto: se raggruppa a migliaia (55.000 / 1.234.000) è separatore migliaia
    if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    // altrimenti resta decimale (es. 55.5)
  }
  const n = parseFloat(s);
  return isFinite(n) ? n : null;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// Chiave di deduplica: procedura + lotto + tribunale
function astaKey(a) {
  const rif = (a.riferimentoProcedura || '').toString().toLowerCase().replace(/\s+/g, '');
  const lotto = (a.lotto || '').toString().toLowerCase().replace(/\s+/g, '');
  const trib = (a.tribunale || '').toString().toLowerCase().replace(/\s+/g, '');
  if (rif) return `${trib}|${rif}|${lotto}`;
  // fallback: comune + indirizzo + prezzo base
  return `${trib}|${(a.comune||'').toLowerCase()}|${(a.indirizzo||'').toLowerCase()}|${a.prezzoBase||''}`;
}

// Normalizza un record grezzo (da scraper / import / form) nel formato canonico
function normalizeAsta(raw) {
  const now = new Date().toISOString();
  return {
    id: raw.id || uid('asta'),
    riferimentoProcedura: raw.riferimentoProcedura || raw.rge || '',
    lotto: raw.lotto || '',
    tribunale: raw.tribunale || '',
    tipologiaImmobile: TIPOLOGIE.includes(raw.tipologiaImmobile) ? raw.tipologiaImmobile : (raw.tipologiaImmobile || 'Altro'),
    comune: raw.comune || '',
    provincia: raw.provincia || '',
    indirizzo: raw.indirizzo || '',
    superficieMq: toNumber(raw.superficieMq),
    prezzoBase: toNumber(raw.prezzoBase),
    offertaMinima: toNumber(raw.offertaMinima),
    rilancioMinimo: toNumber(raw.rilancioMinimo),
    dataVendita: raw.dataVendita || '',
    tipoVendita: raw.tipoVendita || 'Non specificato',
    // valutazione interna
    stato: raw.stato || 'da_valutare',
    valoreStimato: toNumber(raw.valoreStimato),          // valore di mercato stimato da noi
    costoRistrutturazione: toNumber(raw.costoRistrutturazione),
    valoreRivendita: toNumber(raw.valoreRivendita),
    referente: raw.referente || '',
    note: raw.note || '',
    // origine
    linkPVP: raw.linkPVP || '',
    linkPerizia: raw.linkPerizia || '',
    fonte: raw.fonte || 'MANUALE',                        // PVP | SAMPLE | CSV | MANUALE
    // meta
    createdAt: raw.createdAt || now,
    updatedAt: now
  };
}

// Campi calcolati (mai persistiti — ricalcolati a runtime lato client)
function derivedAsta(a) {
  const d = {};
  if (a.valoreStimato && a.prezzoBase) {
    d.scontoVsMercato = 1 - (a.prezzoBase / a.valoreStimato); // quanto costa meno del mercato
  }
  // margine potenziale = valoreRivendita - prezzoBase - costoRistrutturazione
  if (a.valoreRivendita != null && a.prezzoBase != null) {
    d.marginePotenziale = a.valoreRivendita - a.prezzoBase - (a.costoRistrutturazione || 0);
    if (a.prezzoBase) d.roiPotenziale = d.marginePotenziale / (a.prezzoBase + (a.costoRistrutturazione || 0));
  }
  if (a.dataVendita) {
    const gg = Math.ceil((new Date(a.dataVendita) - new Date()) / 86400000);
    d.giorniAllaVendita = gg;
  }
  return d;
}

function normalizeOperazione(raw) {
  const now = new Date().toISOString();
  return {
    id: raw.id || uid('op'),
    concorrente: raw.concorrente || '',
    tipoOperazione: raw.tipoOperazione || 'Altro',
    tipologiaImmobile: raw.tipologiaImmobile || 'Altro',
    comune: raw.comune || '',
    provincia: raw.provincia || '',
    indirizzo: raw.indirizzo || '',
    superficieMq: toNumber(raw.superficieMq),
    numeroUnita: toNumber(raw.numeroUnita),
    valoreStimato: toNumber(raw.valoreStimato),       // valore stimato dell'operazione
    prezzoRiferimento: toNumber(raw.prezzoRiferimento),
    stato: raw.stato || 'individuata',
    rilevanza: raw.rilevanza || 'media',
    fonte: raw.fonte || 'Altro',
    dataRilevazione: raw.dataRilevazione || todayISO(),
    dataInizio: raw.dataInizio || '',
    dataFinePrevista: raw.dataFinePrevista || '',
    link: raw.link || '',
    note: raw.note || '',
    createdAt: raw.createdAt || now,
    updatedAt: now
  };
}

const DEFAULT_CONFIG = {
  tribunali: [],            // vuoto = tutti i tribunali Veneto
  comuni: [],               // filtro comuni (vuoto = tutti)
  tipologie: [],            // vuoto = tutte
  prezzoMax: null,          // soglia base d'asta massima
  scrapeEnabled: true,
  scrapeOrari: ['08:00', '20:00'],  // 2x/giorno
  soglieAlert: { scontoMinimo: 0.30, giorniPreavviso: 15 }
};

module.exports = {
  TRIBUNALI_VENETO, TIPOLOGIE, STATI_ASTA, TIPI_VENDITA,
  TIPI_OPERAZIONE, STATI_OPERAZIONE, FONTI_CONCORRENTE, LIVELLI_RILEVANZA,
  DEFAULT_CONFIG,
  uid, toNumber, todayISO,
  astaKey, normalizeAsta, derivedAsta, normalizeOperazione
};
