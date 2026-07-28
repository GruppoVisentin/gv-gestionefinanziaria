'use strict';

/**
 * Orchestratore scraping: unisce i nuovi annunci a quelli esistenti
 * senza duplicati e senza cancellare il lavoro fatto (stati, note, stime).
 */

const db = require('../lib/db');
const { astaKey, normalizeAsta } = require('../lib/model');
const pvp = require('./pvp');

function mergeAste(esistenti, nuove) {
  const byKey = new Map();
  for (const a of esistenti) byKey.set(astaKey(a), a);

  let aggiunte = 0, aggiornate = 0;
  for (const n of nuove) {
    const k = astaKey(n);
    const old = byKey.get(k);
    if (!old) {
      byKey.set(k, n);
      aggiunte++;
    } else {
      // conserva SEMPRE i campi curati manualmente; aggiorna solo i dati "di portale"
      const merged = Object.assign({}, old, {
        prezzoBase: n.prezzoBase != null ? n.prezzoBase : old.prezzoBase,
        offertaMinima: n.offertaMinima != null ? n.offertaMinima : old.offertaMinima,
        dataVendita: n.dataVendita || old.dataVendita,
        tipoVendita: n.tipoVendita || old.tipoVendita,
        linkPVP: n.linkPVP || old.linkPVP,
        updatedAt: new Date().toISOString()
      });
      byKey.set(k, merged);
      aggiornate++;
    }
  }
  return { lista: Array.from(byKey.values()), aggiunte, aggiornate };
}

/**
 * Esegue un ciclo di scraping.
 * @param {object} opts { seedIfEmpty?: boolean }
 */
async function runScrape(opts = {}) {
  const store = db.get();
  const config = store.config;
  const ts = new Date().toISOString();
  let status, count = 0, ok = false;

  let result;
  try {
    result = await pvp.scrapeReal(config);
  } catch (e) {
    result = { ok: false, aste: [], reason: 'Errore scraper: ' + e.message };
  }

  let nuove = result.aste || [];

  // Se lo scraping reale non ha prodotto nulla e l'archivio è vuoto,
  // inseriamo dati di esempio così l'app è subito dimostrabile.
  let usedSample = false;
  if (!result.ok && store.aste.length === 0 && opts.seedIfEmpty !== false) {
    nuove = pvp.generateSampleAste();
    usedSample = true;
  }

  if (nuove.length > 0) {
    const { lista, aggiunte, aggiornate } = mergeAste(store.aste, nuove);
    count = aggiunte;
    ok = result.ok || usedSample;
    status = usedSample
      ? `Rete PVP non raggiungibile in scraping HTML — caricati ${aggiunte} annunci DI ESEMPIO per la demo. ${result.reason}`
      : `${aggiunte} nuovi, ${aggiornate} aggiornati. ${result.reason}`;
    db.update(s => {
      s.aste = lista;
      s.scrape = {
        lastRun: ts,
        lastOk: ok ? ts : s.scrape.lastOk,
        lastStatus: status,
        lastCount: aggiunte,
        log: [{ ts, status, source: usedSample ? 'SAMPLE' : 'PVP' }, ...(s.scrape.log || [])].slice(0, 30)
      };
    });
  } else {
    status = result.reason || 'Nessun nuovo annuncio.';
    db.update(s => {
      s.scrape = {
        lastRun: ts,
        lastOk: s.scrape.lastOk,
        lastStatus: status,
        lastCount: 0,
        log: [{ ts, status, source: 'PVP' }, ...(s.scrape.log || [])].slice(0, 30)
      };
    });
  }

  return { ok, count, status, usedSample };
}

module.exports = { runScrape, mergeAste };

// Esecuzione da riga di comando: `node scrapers/run.js`
if (require.main === module) {
  runScrape().then(r => {
    console.log('[scrape]', r.status);
    process.exit(0);
  }).catch(e => {
    console.error('[scrape] errore fatale:', e);
    process.exit(1);
  });
}
