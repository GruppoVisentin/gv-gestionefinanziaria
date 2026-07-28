'use strict';

const path = require('path');
const express = require('express');
const cron = require('node-cron');

const db = require('./lib/db');
const model = require('./lib/model');
const { runScrape } = require('./scrapers/run');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json({ limit: '10mb' }));
app.use(express.text({ type: ['text/csv', 'text/plain'], limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Costanti di dominio per la UI ──
app.get('/api/meta', (req, res) => {
  res.json({
    tribunali: model.TRIBUNALI_VENETO,
    tipologie: model.TIPOLOGIE,
    statiAsta: model.STATI_ASTA,
    tipiVendita: model.TIPI_VENDITA,
    tipiOperazione: model.TIPI_OPERAZIONE,
    statiOperazione: model.STATI_OPERAZIONE,
    fontiConcorrente: model.FONTI_CONCORRENTE,
    livelliRilevanza: model.LIVELLI_RILEVANZA
  });
});

// ─────────────── ASTE ───────────────
app.get('/api/aste', (req, res) => {
  const s = db.get();
  res.json({ aste: s.aste, scrape: s.scrape });
});

app.post('/api/aste', (req, res) => {
  const a = model.normalizeAsta(Object.assign({}, req.body, { fonte: req.body.fonte || 'MANUALE' }));
  db.update(s => { s.aste.unshift(a); });
  res.json(a);
});

app.put('/api/aste/:id', (req, res) => {
  let updated = null;
  db.update(s => {
    s.aste = s.aste.map(a => {
      if (a.id === req.params.id) {
        updated = model.normalizeAsta(Object.assign({}, a, req.body, { id: a.id, createdAt: a.createdAt }));
        return updated;
      }
      return a;
    });
  });
  if (!updated) return res.status(404).json({ error: 'non trovata' });
  res.json(updated);
});

app.delete('/api/aste/:id', (req, res) => {
  db.update(s => { s.aste = s.aste.filter(a => a.id !== req.params.id); });
  res.json({ ok: true });
});

// ─────────────── OPERAZIONI CONCORRENTI ───────────────
app.get('/api/operazioni', (req, res) => {
  res.json({ operazioni: db.get().operazioni });
});

app.post('/api/operazioni', (req, res) => {
  const o = model.normalizeOperazione(req.body);
  db.update(s => { s.operazioni.unshift(o); });
  res.json(o);
});

app.put('/api/operazioni/:id', (req, res) => {
  let updated = null;
  db.update(s => {
    s.operazioni = s.operazioni.map(o => {
      if (o.id === req.params.id) {
        updated = model.normalizeOperazione(Object.assign({}, o, req.body, { id: o.id, createdAt: o.createdAt }));
        return updated;
      }
      return o;
    });
  });
  if (!updated) return res.status(404).json({ error: 'non trovata' });
  res.json(updated);
});

app.delete('/api/operazioni/:id', (req, res) => {
  db.update(s => { s.operazioni = s.operazioni.filter(o => o.id !== req.params.id); });
  res.json({ ok: true });
});

// ─────────────── CONFIG ───────────────
app.get('/api/config', (req, res) => res.json(db.get().config));
app.put('/api/config', (req, res) => {
  db.update(s => { s.config = Object.assign({}, s.config, req.body); });
  res.json(db.get().config);
});

// ─────────────── SCRAPING ───────────────
app.post('/api/scrape/run', async (req, res) => {
  try {
    const r = await runScrape({ seedIfEmpty: true });
    res.json(r);
  } catch (e) {
    res.status(500).json({ ok: false, status: 'Errore: ' + e.message });
  }
});
app.get('/api/scrape/status', (req, res) => res.json(db.get().scrape));

// ─────────────── IMPORT CSV ───────────────
// CSV con intestazione. Colonne riconosciute (case-insensitive):
// tribunale, riferimentoProcedura/rge, lotto, tipologiaImmobile, comune,
// provincia, indirizzo, superficieMq, prezzoBase, offertaMinima, dataVendita,
// tipoVendita, valoreStimato, linkPVP, note
app.post('/api/import/csv', (req, res) => {
  try {
    const csv = typeof req.body === 'string' ? req.body : (req.body.csv || '');
    const target = (req.query.target || 'aste');
    const rows = parseCSV(csv);
    if (!rows.length) return res.status(400).json({ error: 'CSV vuoto o non valido' });

    let count = 0;
    if (target === 'operazioni') {
      db.update(s => {
        rows.forEach(r => { s.operazioni.unshift(model.normalizeOperazione(r)); count++; });
      });
    } else {
      const nuove = rows.map(r => model.normalizeAsta(Object.assign({ fonte: 'CSV' }, r)));
      const { mergeAste } = require('./scrapers/run');
      const merged = mergeAste(db.get().aste, nuove);
      db.update(s => { s.aste = merged.lista; });
      count = merged.aggiunte;
    }
    res.json({ ok: true, count, righe: rows.length });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

function parseCSV(text) {
  const lines = String(text).replace(/\r/g, '').split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const sep = lines[0].includes(';') ? ';' : ',';
  const headers = splitCSVLine(lines[0], sep).map(h => normHeader(h));
  return lines.slice(1).map(line => {
    const cells = splitCSVLine(line, sep);
    const obj = {};
    headers.forEach((h, i) => { if (h) obj[h] = (cells[i] || '').trim(); });
    return obj;
  });
}

function splitCSVLine(line, sep) {
  const out = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; continue; }
    if (c === sep && !inQ) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}

function normHeader(h) {
  const k = h.toLowerCase().trim().replace(/\s+/g, '');
  const map = {
    'rge': 'riferimentoProcedura', 'procedura': 'riferimentoProcedura', 'riferimentoprocedura': 'riferimentoProcedura',
    'tipologia': 'tipologiaImmobile', 'tipologiaimmobile': 'tipologiaImmobile',
    'superficie': 'superficieMq', 'mq': 'superficieMq', 'superficiemq': 'superficieMq',
    'baseasta': 'prezzoBase', 'based\'asta': 'prezzoBase', 'prezzobase': 'prezzoBase', 'prezzo': 'prezzoBase',
    'offertaminima': 'offertaMinima', 'minimo': 'offertaMinima',
    'datavendita': 'dataVendita', 'data': 'dataVendita',
    'tipovendita': 'tipoVendita', 'valorestimato': 'valoreStimato', 'stima': 'valoreStimato',
    'link': 'linkPVP', 'linkpvp': 'linkPVP',
    'concorrente': 'concorrente', 'operatore': 'concorrente',
    'tipooperazione': 'tipoOperazione'
  };
  return map[k] || h.trim().replace(/\s+(.)/g, (_, c) => c.toUpperCase()).replace(/\s/g, '');
}

// Fallback SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── SCHEDULER 2x/giorno ──
function scheduleScraping() {
  const cfg = db.get().config;
  if (!cfg.scrapeEnabled) { console.log('[cron] scraping disabilitato in config'); return; }
  const orari = cfg.scrapeOrari && cfg.scrapeOrari.length ? cfg.scrapeOrari : ['08:00', '20:00'];
  orari.forEach(hhmm => {
    const [h, m] = hhmm.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return;
    cron.schedule(`${m} ${h} * * *`, async () => {
      console.log(`[cron] avvio scraping schedulato (${hhmm})...`);
      const r = await runScrape({ seedIfEmpty: false });
      console.log('[cron]', r.status);
    }, { timezone: 'Europe/Rome' });
    console.log(`[cron] scraping programmato ogni giorno alle ${hhmm} (Europe/Rome)`);
  });
}

app.listen(PORT, '0.0.0.0', () => {
  db.get(); // inizializza archivio
  console.log('');
  console.log('  ╔══════════════════════════════════════════════════╗');
  console.log('  ║   GV RADAR ASTE — Gruppo Visentin                ║');
  console.log('  ╚══════════════════════════════════════════════════╝');
  console.log(`  ▶ App:   http://localhost:${PORT}`);
  console.log(`  ▶ Rete:  http://<IP-del-PC>:${PORT}  (per telefono su stessa WiFi)`);
  console.log('');
  scheduleScraping();
});
