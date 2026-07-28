'use strict';

/**
 * ADATTATORE PVP — Portale delle Vendite Pubbliche (pvp.giustizia.it)
 * ------------------------------------------------------------------
 * NOTA IMPORTANTE (leggere prima di usare in produzione):
 * Il PVP è un'applicazione stateful (JSF/PrimeFaces) e la pagina di
 * ricerca carica i risultati via JavaScript. Un semplice fetch HTTP
 * potrebbe NON restituire l'elenco degli annunci. Questo modulo:
 *   1) tenta comunque un fetch + parsing HTML (funziona se il portale
 *      espone i risultati in HTML statico o cambia struttura);
 *   2) se non trova nulla, NON sovrascrive i dati esistenti e segnala
 *      lo stato, così l'app resta utilizzabile con import CSV/manuale.
 *
 * CALIBRAZIONE: al primo avvio sul PC con rete aperta, se lo scraping
 * non estrae annunci, salva una pagina di risultati del PVP e adegua
 * SELECTORS / SEARCH_URL qui sotto (o passa a Playwright — vedi README).
 */

const cheerio = require('cheerio');
const { TRIBUNALI_VENETO, TIPOLOGIE, normalizeAsta } = require('../lib/model');

// Punto d'ingresso ricerca PVP (da calibrare al primo run reale)
const BASE = 'https://pvp.giustizia.it';
const SEARCH_URL = BASE + '/pvp/it/risultati_ricerca.page';

// Selettori CSS del risultato (da adeguare in fase di calibrazione)
const SELECTORS = {
  card: '.risultato, .card-vendita, li.vendita, .box-annuncio',
  titolo: '.titolo, h3, .tipologia',
  comune: '.comune, .localita',
  prezzo: '.prezzo, .base-asta, .importo',
  data: '.data-vendita, .data',
  link: 'a'
};

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'it-IT,it;q=0.9' },
    redirect: 'follow'
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return await res.text();
}

/**
 * Scraping reale (best-effort). Ritorna { ok, aste, reason }.
 * `config` contiene tribunali/comuni/tipologie di interesse.
 */
async function scrapeReal(config) {
  const tribunali = (config.tribunali && config.tribunali.length)
    ? config.tribunali
    : TRIBUNALI_VENETO;

  const aste = [];
  const errori = [];

  for (const trib of tribunali) {
    try {
      // Query best-effort: molti portali accettano un parametro testuale.
      const url = `${SEARCH_URL}?ricerca_libera=${encodeURIComponent('Tribunale di ' + trib)}`;
      const html = await fetchHtml(url);
      const $ = cheerio.load(html);
      const cards = $(SELECTORS.card);
      cards.each((_, el) => {
        const $el = $(el);
        const titolo = $el.find(SELECTORS.titolo).first().text().trim();
        const comune = $el.find(SELECTORS.comune).first().text().trim();
        const prezzo = $el.find(SELECTORS.prezzo).first().text().trim();
        const data = $el.find(SELECTORS.data).first().text().trim();
        let link = $el.find(SELECTORS.link).first().attr('href') || '';
        if (link && link.startsWith('/')) link = BASE + link;
        if (!titolo && !comune) return;
        aste.push(normalizeAsta({
          tribunale: trib,
          tipologiaImmobile: guessTipologia(titolo),
          comune,
          prezzoBase: prezzo,
          dataVendita: parseDataIT(data),
          linkPVP: link,
          note: titolo,
          fonte: 'PVP'
        }));
      });
      // ritmo gentile: una piccola pausa tra i tribunali
      await sleep(1500);
    } catch (e) {
      errori.push(`${trib}: ${e.message}`);
    }
  }

  if (aste.length === 0) {
    return {
      ok: false,
      aste: [],
      reason: 'Nessun annuncio estratto. Il PVP probabilmente richiede rendering JavaScript ' +
              '(vedi README → calibrazione/Playwright). Errori: ' + (errori.join('; ') || 'nessuno')
    };
  }
  return { ok: true, aste, reason: `Estratti ${aste.length} annunci da ${tribunali.length} tribunali.` };
}

function guessTipologia(txt) {
  const t = (txt || '').toLowerCase();
  if (/terren|agricol|edificabil/.test(t)) return 'Terreno';
  if (/capannon|industri|opificio/.test(t)) return 'Industriale';
  if (/negoz|commercial|ufficio|magazzino/.test(t)) return 'Commerciale';
  if (/box|garage|posto auto|autorimessa/.test(t)) return 'Box/Garage';
  if (/appartament|abitazion|villa|casa|residenz/.test(t)) return 'Residenziale';
  return 'Altro';
}

function parseDataIT(s) {
  if (!s) return '';
  const m = String(s).match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (!m) return '';
  let [_, d, mo, y] = m;
  if (y.length === 2) y = '20' + y;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─────────────────────────────────────────────────────────────
// DATI DI ESEMPIO — seed realistico Veneto per demo/prima prova.
// Chiaramente marcati fonte='SAMPLE' e cancellabili dall'app.
// ─────────────────────────────────────────────────────────────
function generateSampleAste() {
  const seed = [
    { tribunale: 'Vicenza', comune: 'Vicenza', indirizzo: 'Via Legione Gallieno 12', tipologiaImmobile: 'Residenziale', superficieMq: 95, prezzoBase: 78000, offertaMinima: 58500, valoreStimato: 135000, dataVendita: futureDate(21), tipoVendita: 'Telematica asincrona', lotto: '1', riferimentoProcedura: 'RGE 145/2024' },
    { tribunale: 'Vicenza', comune: 'Arzignano', indirizzo: 'Via Chiampo 4', tipologiaImmobile: 'Terreno', superficieMq: 1200, prezzoBase: 42000, offertaMinima: 31500, valoreStimato: 70000, dataVendita: futureDate(34), tipoVendita: 'Telematica sincrona', lotto: '2', riferimentoProcedura: 'RGE 88/2023' },
    { tribunale: 'Vicenza', comune: 'Bassano del Grappa', indirizzo: 'Via Museo 30', tipologiaImmobile: 'Commerciale', superficieMq: 140, prezzoBase: 165000, offertaMinima: 123750, valoreStimato: 240000, dataVendita: futureDate(12), tipoVendita: 'Telematica asincrona', lotto: '1', riferimentoProcedura: 'RGE 210/2024' },
    { tribunale: 'Verona', comune: 'San Bonifacio', indirizzo: 'Via Camporosolo 8', tipologiaImmobile: 'Residenziale', superficieMq: 120, prezzoBase: 112000, offertaMinima: 84000, valoreStimato: 175000, dataVendita: futureDate(45), tipoVendita: 'Mista', lotto: '1', riferimentoProcedura: 'RGE 77/2024' },
    { tribunale: 'Verona', comune: 'Legnago', indirizzo: 'Via Frattini 19', tipologiaImmobile: 'Industriale', superficieMq: 850, prezzoBase: 320000, offertaMinima: 240000, valoreStimato: 480000, dataVendita: futureDate(28), tipoVendita: 'Telematica asincrona', lotto: '3', riferimentoProcedura: 'RGE 302/2023' },
    { tribunale: 'Padova', comune: 'Cittadella', indirizzo: 'Via Borgo Padova 55', tipologiaImmobile: 'Residenziale', superficieMq: 85, prezzoBase: 69000, offertaMinima: 51750, valoreStimato: 118000, dataVendita: futureDate(9), tipoVendita: 'Telematica asincrona', lotto: '1', riferimentoProcedura: 'RGE 190/2024' },
    { tribunale: 'Padova', comune: 'Este', indirizzo: 'Via Principe Umberto 3', tipologiaImmobile: 'Box/Garage', superficieMq: 18, prezzoBase: 8500, offertaMinima: 6375, valoreStimato: 15000, dataVendita: futureDate(19), tipoVendita: 'Telematica sincrona', lotto: '4', riferimentoProcedura: 'RGE 51/2024' },
    { tribunale: 'Treviso', comune: 'Montebelluna', indirizzo: 'Via Piave 100', tipologiaImmobile: 'Commerciale', superficieMq: 210, prezzoBase: 145000, offertaMinima: 108750, valoreStimato: 210000, dataVendita: futureDate(38), tipoVendita: 'Mista', lotto: '2', riferimentoProcedura: 'RGE 133/2023' },
    { tribunale: 'Treviso', comune: 'Conegliano', indirizzo: 'Via XX Settembre 7', tipologiaImmobile: 'Residenziale', superficieMq: 105, prezzoBase: 98000, offertaMinima: 73500, valoreStimato: 160000, dataVendita: futureDate(52), tipoVendita: 'Telematica asincrona', lotto: '1', riferimentoProcedura: 'RGE 240/2024' },
    { tribunale: 'Vicenza', comune: 'Schio', indirizzo: 'Via Btg. Val Leogra 21', tipologiaImmobile: 'Residenziale', superficieMq: 130, prezzoBase: 88000, offertaMinima: 66000, valoreStimato: 155000, dataVendita: futureDate(6), tipoVendita: 'Telematica asincrona', lotto: '1', riferimentoProcedura: 'RGE 165/2024' }
  ];
  return seed.map(s => normalizeAsta(Object.assign({ provincia: provinciaDi(s.tribunale), fonte: 'SAMPLE' }, s)));
}

function provinciaDi(trib) {
  const m = { 'Vicenza': 'VI', 'Bassano del Grappa': 'VI', 'Verona': 'VR', 'Padova': 'PD', 'Treviso': 'TV', 'Venezia': 'VE', 'Rovigo': 'RO', 'Belluno': 'BL' };
  return m[trib] || '';
}

function futureDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

module.exports = { scrapeReal, generateSampleAste, guessTipologia, parseDataIT };
