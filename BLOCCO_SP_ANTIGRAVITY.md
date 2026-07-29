# BLOCCO SP — Ricostruzione Stato Patrimoniale 2025 da bilancio ufficiale
## Istruzioni per agente esecutore (Antigravity) — ESEGUIRE ALLA LETTERA

**Progetto:** GV GestioneFINANZIARIA v1.0 (React 19 + TypeScript, build Vite).
**File toccati:** `utils/gasCoreEngine.ts`, `components/SPView.tsx`, `App.tsx`.
**Numero di sostituzioni:** 4. Nessun altro file va modificato.

**Obiettivo:** sostituire lo snapshot di partenza dello Stato Patrimoniale al 31/12/2025 (che conteneva due valori "di quadratura" tarati a mano) con i **valori ufficiali del bilancio XBRL depositato**, azzerando ogni "plug". Aggiungere i due campi `creditiFinanziari`/`investimentiBT` (richiesti dal tipo `SPSnapshot`) e includerli nell'attivo circolante. Rendere robusta la migrazione degli snapshot salvati.

---

## ⛔ REGOLE VINCOLANTI (leggere prima di iniziare)
1. Applica **SOLO ed ESATTAMENTE** le 4 sostituzioni qui sotto. Nient'altro.
2. Ogni sostituzione è un **find/replace letterale**: il testo in `CERCA` deve essere trovato **identico carattere per carattere**, inclusi spazi, virgole e indentazione. Se non lo trovi identico → **FERMATI e segnala**. NON improvvisare.
3. **NON riformattare** il codice, non cambiare indentazione, non riordinare, non rinominare, non "migliorare" altro.
4. **NON modificare** file diversi dai tre indicati.
5. I numeri di riga sono indicativi; l'ancora vera è il testo in `CERCA`.
6. Al termine esegui la **VERIFICA** in fondo. Se fallisce, **ripristina** e segnala.
7. **Nessun commit, push o deploy** salvo istruzione esplicita separata.
8. Lingua del codice invariata (commenti in italiano). Non tradurre nulla.

> **Se stai applicando anche il file `FIX_SPEC_ANTIGRAVITY.md`:** questo BLOCCO SP **sostituisce** la sua "Modifica 3.2" (che si limitava ad aggiungere due campi a 0). Applica QUESTO per lo Stato Patrimoniale. Le altre modifiche del FIX_SPEC (Blocchi 1, 2 e le sue 3.1/3.3) restano valide; qui le 3.1 e 3.3 sono **incluse** (Modifiche 2 e 3 sotto), quindi se applichi questo BLOCCO non ripeterle.

---

## Modifica 1 di 4 — `utils/gasCoreEngine.ts` — ricostruzione del seed `generateDefault2025Snapshot`

CERCA (esatto):
```
    dataRiferimento: '2025-12-31',
    immImmateriali: 2689,
    immMateriali: 102035,
    immobiliTerreni: 0,
    partecipazioni: 698659, // Official (198,349) + VISMAN land loan (500,310)
    rimanenze: 1262318,
    creditiClienti: 394170, // Total credits minus collegate loan
    creditiTributari: 77841, // Sum of IRES, IRAP, and IVA credits
    liquidita: 832211, // Cash Flow matching starting liquidity
    capitaleSociale: 10400, // Official share capital
    riserve: 895770, // Recalculated to balance perfectly (balancing adjustment included)
    utileEsercizio: 173478, // Official 2025 Net Income
    mutuiLT: 194087, // Long term bank loan
    leasingLT: 0,
    tfr: 91618, // Employee severance provision (TFR)
    fidiRT: 0,
    debitiFornitori: 340346, // Accounts payable
    debitiTributari: 31149, // Taxes & Social Security liabilities
    accontiClienti: 1365000, // Customer advances (acconti)
    altriDebitiBT: 268075, // Other short term liabilities (adjusted to match balance - balancing plug)
    mutuiBT: 0
  };
```
SOSTITUISCI CON:
```
    // Valori ufficiali dal bilancio XBRL depositato al 31/12/2025. Nessun "plug": Attivo = Passivo = 3.373.480,19.
    dataRiferimento: '2025-12-31',
    immImmateriali: 2688.88,        // Totale immobilizzazioni immateriali
    immMateriali: 102034.78,        // Totale immobilizzazioni materiali
    immobiliTerreni: 0,             // i terreni edificabili sono a rimanenze, non immobilizzati
    partecipazioni: 198349.22,      // Totale immobilizzazioni finanziarie (partecipazioni 10.000 + titoli 170.000 + depositi cauzionali + crediti c/scissione 17.316,55)
    rimanenze: 1262318,             // materie prime 13.250 + lavori in corso 1.175.000 + terreni edificabili 74.068
    creditiClienti: 894480.26,      // clienti 278.744,70 + anticipi/cauzioni/note fornitori + cassa edile + risconti attivi 43.430,41 - f.do sval + credito v/collegate VISMAN 500.309,87
    creditiTributari: 77841.21,     // credito IRES 56.592,90 + IRAP 724,80 + IVA c/erario 20.523,51
    creditiFinanziari: 0,           // VISMAN è nei crediti v/clienti. Spostare qui 500.309,87 se lo si vuole trattare come credito finanziario (ridurrebbe la PFN).
    investimentiBT: 0,
    liquidita: 835767.84,           // Intesa 235.588,25 + Terre Venete 596.623,03 + prepagata 2.236,03 + cassa 1.320,53
    capitaleSociale: 10400,         // Capitale sociale
    riserve: 899326.78,             // riserva rivalutazione 112.230 + riserva legale 3.636 + riserva straordinaria 783.460,78
    utileEsercizio: 173478.02,      // Utile d'esercizio 2025
    mutuiLT: 194086.87,             // Finanziamento Intesa San Paolo (esigibile oltre l'esercizio)
    leasingLT: 0,
    tfr: 91617.84,                  // TFR 96.603,10 - anticipi TFR 4.985,26
    fidiRT: 0,
    debitiFornitori: 340346.34,     // fornitori ordinari 290.281,22 + fornitori fatture da ricevere 50.065,12
    debitiTributari: 39276.41,      // erario (ritenute/IRPEF/IRES/imposta sost.) + INPS/INAIL/cassa edile/contributi ferie
    accontiClienti: 1365000,        // acconti ricevuti da clienti su commesse
    altriDebitiBT: 259947.93,       // caparre confirmatorie ricevute 200.000 + dipendenti c/retrib. e ferie + carte credito + f.do rischi 16.000 + ratei/risconti passivi 2.307,14
    mutuiBT: 0
  };
```

---

## Modifica 2 di 4 — `components/SPView.tsx` — aggiungere i due campi a `EMPTY_SNAPSHOT`

CERCA (esatto):
```
  rimanenze: 0, creditiClienti: 0, creditiTributari: 0, liquidita: 0,
```
SOSTITUISCI CON:
```
  rimanenze: 0, creditiClienti: 0, creditiTributari: 0, creditiFinanziari: 0, investimentiBT: 0, liquidita: 0,
```

---

## Modifica 3 di 4 — `utils/gasCoreEngine.ts` — includere i due campi nell'attivo circolante (funzione `calcSPMetrics`)

CERCA (esatto):
```
  const totAttivoCirc = getVal(sp.rimanenze) + getVal(sp.creditiClienti) + getVal(sp.creditiTributari) + getVal(sp.liquidita);
```
SOSTITUISCI CON:
```
  const totAttivoCirc = getVal(sp.rimanenze) + getVal(sp.creditiClienti) + getVal(sp.creditiTributari) + getVal(sp.creditiFinanziari) + getVal(sp.investimentiBT) + getVal(sp.liquidita);
```

---

## Modifica 4 di 4 — `App.tsx` — migrazione robusta degli snapshot salvati

CERCA (esatto):
```
        if (s.dataRiferimento === '2025-12-31' && (s.capitaleSociale === 100000 || s.capitaleSociale === 0 || s.tfr === 0 || s.partecipazioni !== 698659 || s.liquidita !== 832211)) {
          return generateDefault2025Snapshot(txs, initData);
        }
```
SOSTITUISCI CON:
```
        // Migrazione una tantum: rigenera SOLO gli snapshot creati con il vecchio seed (con i due "plug"),
        // riconoscibili dalla firma dei vecchi valori. Gli snapshot già migrati o modificati a mano NON vengono toccati.
        if (s.dataRiferimento === '2025-12-31' && s.partecipazioni === 698659 && s.liquidita === 832211) {
          return generateDefault2025Snapshot(txs, initData);
        }
```
Perché: la vecchia condizione rigenerava lo snapshot ogni volta che i valori differivano dai vecchi numeri, **sovrascrivendo le modifiche manuali dell'utente**. La nuova rigenera **solo** il vecchio seed (firma `698659` + `832211`), migrandolo una volta ai valori ufficiali, e lascia intatto tutto il resto.

---

## ✅ VERIFICA (dopo le 4 modifiche)
1. Esegui:
```
npx tsc --noEmit
```
   **Atteso:** zero errori (questo blocco risolve anche i 2 errori su `creditiFinanziari`/`investimentiBT`).
2. Esegui:
```
npm run build
```
   **Atteso:** build completata senza errori.
3. **Controllo quadratura (decisivo):** con il nuovo seed, aprendo lo Stato Patrimoniale 2025 deve risultare **Attivo = Passivo = 3.373.480,19 €** (nessuno "Sbilancio Rilevato"). I singoli valori devono coincidere con quelli del bilancio ufficiale.

## NOTA (non è un'azione di codice)
La liquidità di partenza passa da 832.211 a **835.767,84** (valore ufficiale). Se il modulo Cash Flow parte da un saldo iniziale diverso, va allineato a 835.767,84 (o identificata la differenza di 3.556,84, tipicamente una posta bancaria esclusa). Verificare con l'operatore.

Fine Blocco SP.
