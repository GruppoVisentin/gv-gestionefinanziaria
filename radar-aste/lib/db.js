'use strict';

const fs = require('fs');
const path = require('path');
const { DEFAULT_CONFIG } = require('./model');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const EMPTY = {
  aste: [],
  operazioni: [],
  config: DEFAULT_CONFIG,
  scrape: { lastRun: null, lastOk: null, lastStatus: 'mai eseguito', lastCount: 0, log: [] }
};

let cache = null;

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function load() {
  if (cache) return cache;
  ensureDir();
  if (fs.existsSync(DB_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      cache = Object.assign({}, EMPTY, parsed);
      cache.config = Object.assign({}, DEFAULT_CONFIG, parsed.config || {});
      cache.scrape = Object.assign({}, EMPTY.scrape, parsed.scrape || {});
    } catch (e) {
      console.error('[db] file corrotto, riparto vuoto:', e.message);
      cache = JSON.parse(JSON.stringify(EMPTY));
    }
  } else {
    cache = JSON.parse(JSON.stringify(EMPTY));
    save();
  }
  return cache;
}

function save() {
  ensureDir();
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2), 'utf8');
  fs.renameSync(tmp, DB_FILE); // scrittura atomica: evita file mezzo scritto
  return cache;
}

function get() { return load(); }

function update(mutator) {
  load();
  mutator(cache);
  return save();
}

module.exports = { get, update, save, DB_FILE };
