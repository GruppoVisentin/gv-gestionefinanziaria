# GV Radar Aste — Aste immobiliari & Monitoraggio Concorrenti

App locale per il **Gruppo Visentin** che:
- **Radar Aste** — monitora le aste immobiliari del Veneto (PVP), con base d'asta, data vendita, sconto vs mercato stimato e pipeline di valutazione interna.
- **Monitoraggio Concorrenti** — traccia le operazioni immobiliari degli operatori concorrenti (acquisti, sviluppi, ristrutturazioni, vendite).

È un'app **standalone**: un piccolo motore Node + un'interfaccia web responsive (PC e telefono).

---

## Requisiti
- [Node.js](https://nodejs.org) versione **18 o superiore** (include già `fetch`).

## Avvio (3 comandi)
```bash
cd radar-aste
npm install
npm start
```
Poi apri il browser su **http://localhost:4000**

### Dal telefono (stessa rete WiFi)
Al primo avvio il terminale mostra l'IP del PC. Sul telefono apri
`http://<IP-del-PC>:4000` (es. `http://192.168.1.20:4000`).
> Per accedere da fuori casa/ufficio servirà la pubblicazione online (fase successiva): il codice è già pronto.

---

## Come funziona

### Dati salvati localmente
Tutto è salvato in `radar-aste/data/db.json` (creato al primo avvio). È l'unico file da conservare/backuppare. Non viene inviato da nessuna parte.

### Scraping automatico (2 volte al giorno)
Con l'app avviata, il motore interroga il PVP alle **08:00** e alle **20:00** (fuso Europe/Rome). Puoi lanciare un aggiornamento manuale col pulsante **"Aggiorna adesso"** o con:
```bash
npm run scrape
```
I nuovi annunci si **uniscono** a quelli esistenti senza cancellare stati, note e stime che hai inserito a mano.

### Import CSV (dai portali o da Excel)
Nel radar → **CSV**: incolli o carichi un CSV esportato da un portale aste o da Excel. Colonne riconosciute (separatore `;` o `,`):
```
tribunale;rge;lotto;tipologia;comune;provincia;indirizzo;mq;baseAsta;offertaMinima;dataVendita;valoreStimato;link
```

### Inserimento manuale
Pulsante **"Nuova"** in ciascuna sezione, con calcolo automatico di sconto vs mercato, margine potenziale e ROI.

---

## ⚙️ Calibrazione dello scraping PVP (importante)

Il PVP (`pvp.giustizia.it`) è un portale che carica i risultati via JavaScript: un semplice
scaricamento HTML potrebbe **non** restituire gli annunci. In quel caso l'app **non si rompe**:
carica automaticamente alcuni annunci **DI ESEMPIO** (marcati "esempio") così puoi provarla subito,
e resta pienamente utilizzabile con **import CSV** e **inserimento manuale**.

Per attivare lo scraping reale hai due strade:

1. **Calibrare i selettori** — in `scrapers/pvp.js` trovi `SEARCH_URL` e `SELECTORS`.
   Salva una pagina di risultati del PVP e adegua i selettori CSS. (Posso farlo io: mandami
   una pagina di risultati salvata e la taro.)

2. **Usare un browser headless (Playwright)** — più robusto per siti JS. Installazione:
   ```bash
   npm install playwright
   npx playwright install chromium
   ```
   e si aggiorna l'adattatore per navigare la ricerca con il browser. Consigliato se il punto 1
   non basta.

3. **Connettore dati ufficiale/commerciale** — se in futuro avrete accesso BDAG (accreditamento)
   o un provider dati aste con API REST/CSV, il connettore è già predisposto: basta collegare la
   fonte in `scrapers/`.

---

## Struttura del progetto
```
radar-aste/
├── server.js            # API REST + scheduler 2x/giorno + serve l'app
├── lib/
│   ├── model.js         # modello dati, costanti (tribunali, tipologie, stati)
│   └── db.js            # archivio locale JSON (scrittura atomica)
├── scrapers/
│   ├── pvp.js           # adattatore PVP (best-effort) + dati di esempio
│   └── run.js           # orchestratore: merge senza duplicati
├── public/
│   ├── index.html
│   └── js/app.jsx       # interfaccia React (Radar Aste, Concorrenti, Impostazioni)
└── data/db.json         # dati (creato al primo avvio, NON versionato)
```

## Nota legale
Gli annunci del PVP sono pubblici e gratuiti da consultare. Uno scraping leggero (2x/giorno) per
uso interno è a basso impatto, ma i portali possono porre limiti nelle condizioni d'uso: la via
"blindata" per l'integrazione automatica dei dati è l'accreditamento **BDAG**.
