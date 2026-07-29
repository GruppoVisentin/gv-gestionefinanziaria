# BLOCCO 1 — Eliminazione del DOPPIO CONTEGGIO della variazione rimanenze
## Istruzioni per agente esecutore (Antigravity) — ESEGUIRE ALLA LETTERA

**Progetto:** GV GestioneFINANZIARIA v1.0 (React 19 + TypeScript, build Vite).
**File toccati:** `utils/gasCoreEngine.ts`, `components/RatingView.tsx`, `components/CEView.tsx`.
**Numero di sostituzioni:** 4. Nessun altro file va modificato.

---

## ⛔ REGOLE VINCOLANTI (leggere prima di iniziare)
1. Applica **SOLO ed ESATTAMENTE** le 4 sostituzioni qui sotto. Nient'altro.
2. Ogni sostituzione è un **find/replace letterale**: il testo in `CERCA` deve essere trovato **identico carattere per carattere**, inclusi spazi e indentazione. Se non lo trovi identico → **FERMATI e segnala**. NON improvvisare, NON cercare testo "simile".
3. **NON riformattare** il codice, non cambiare indentazione, non riordinare import, non rinominare variabili, non "migliorare" nulla al di fuori delle sostituzioni indicate.
4. **NON modificare** file diversi dai tre indicati.
5. I numeri di riga sono **indicativi**; l'ancora vera è il testo in `CERCA`.
6. Al termine esegui la **VERIFICA** in fondo. Se fallisce, **ripristina** e segnala.
7. **Nessun commit, push o deploy** salvo istruzione esplicita separata.
8. Lingua del codice invariata (commenti in italiano). Non tradurre nulla.

**Contesto (perché è un bug):** la funzione `calcCEMetrics` incorpora **già** la variazione delle rimanenze nel valore della produzione, quindi i suoi totali `ebitdaTot`, `ebitTot`, `ebtTot`, `utileNettoTot` la contengono **una volta**. Alcuni consumatori la **ri-sommano**, contandola **due volte**, ma **solo nella vista consuntivo/YTD**. Nelle proiezioni (forecast) i totali `proiezione*` NON la contengono, quindi lì va aggiunta una volta (corretto — **NON toccare le proiezioni**).

**Regola d'oro:** si rimuove l'aggiunta della variazione rimanenze SOLO sui totali **YTD/consuntivo**; si LASCIA INTATTA sulle **proiezioni/forecast**.

---

## Modifica 1 di 4 — `utils/gasCoreEngine.ts` (≈ riga 857, funzione `calcPrevisioneFiscale`, base imponibile IRES)

CERCA (esatto):
```
  const baseImponibileIRES = Math.max(0, ebtCompetenza + straordinarioCompetenza + variazioneRimanenze - dividendiEsenti + straordinarioIndeducibile);
```
SOSTITUISCI CON:
```
  const baseImponibileIRES = Math.max(0, ebtCompetenza + straordinarioCompetenza + (includeForecast ? variazioneRimanenze : 0) - dividendiEsenti + straordinarioIndeducibile);
```
Perché: in vista YTD `ebtCompetenza = ceMetrics.ebtTot` che **già include** la variazione rimanenze; in forecast `ebtCompetenza = ceMetrics.proiezioneEbt` che **NON la include**. Aggiungerla solo se `includeForecast`.
**NON toccare** la "Base imponibile IRAP" subito sotto (righe ≈859-898): è già corretta e NON va modificata.

---

## Modifica 2 di 4 — `utils/gasCoreEngine.ts` (≈ righe 953-955, funzione `calcPrevisioneFiscale`, `utileDopoImposte`)

CERCA (esatto):
```
  const utileDopoImposte = includeForecast
    ? (ceMetrics.proiezioneEbt + ceMetrics.proiezioneStraordinario + variazioneRimanenze - totaleImposteStimate)
    : (ceMetrics.ebtTot + ceMetrics.straordinario + variazioneRimanenze - totaleImposteStimate);
```
SOSTITUISCI CON:
```
  const utileDopoImposte = includeForecast
    ? (ceMetrics.proiezioneEbt + ceMetrics.proiezioneStraordinario + variazioneRimanenze - totaleImposteStimate)
    : (ceMetrics.ebtTot + ceMetrics.straordinario - totaleImposteStimate);
```
Perché: nel ramo forecast (riga con `?`) si **LASCIA** `+ variazioneRimanenze` (corretto). Nel ramo YTD (riga con `:`) si **RIMUOVE** `+ variazioneRimanenze` perché `ebtTot` la contiene già. Unica differenza: sparisce `+ variazioneRimanenze` dalla riga del ramo `:`.

---

## Modifica 3 di 4 — `components/RatingView.tsx` (≈ riga 112)

CERCA (esatto):
```
    const ebitdaDiCompetenza = ceMetrics.ebitdaTot + varRim;
```
SOSTITUISCI CON:
```
    const ebitdaDiCompetenza = ceMetrics.ebitdaTot;
```
Perché: `ceMetrics.ebitdaTot` (da `calcCEMetrics` chiamato con le rimanenze) contiene già la variazione. La variabile `varRim` resterà definita ma non più usata in questo punto: **è innocua, NON rimuoverla** (nessun errore di compilazione). NON modificare `fatturatoCompetenza` (usa `deltaWip`, cosa diversa e corretta).

---

## Modifica 4 di 4 — `components/CEView.tsx` (≈ righe 152-155, blocco commentato "YTD Actuals (Consuntivo)")

CERCA (esatto):
```
    const ebitdaTot = rawMetrics.ebitdaTot + varRimEffettivo;
    const ebitTot = rawMetrics.ebitTot + varRimEffettivo;
    const ebtTot = rawMetrics.ebtTot + varRimEffettivo;
    const utileNettoTot = rawMetrics.utileNettoTot + varRimEffettivo;
```
SOSTITUISCI CON:
```
    const ebitdaTot = rawMetrics.ebitdaTot;
    const ebitTot = rawMetrics.ebitTot;
    const ebtTot = rawMetrics.ebtTot;
    const utileNettoTot = rawMetrics.utileNettoTot;
```
Perché: `rawMetrics.*Tot` contengono già la variazione (le rimanenze sono passate a `calcCEMetrics`). **NON toccare** le righe subito sopra (≈146-149, i `proiezione*` con `+ varRimEffettivo`): sono le PROIEZIONI e sono corrette così. `varRimEffettivo` resta usata nelle proiezioni → nessun errore.

---

## ✅ VERIFICA (dopo le 4 modifiche)
1. Esegui:
```
npx tsc --noEmit
```
   Il Blocco 1 **non deve introdurre errori nuovi**. (Nota: se sul repo sono presenti i 2 errori preesistenti su `SPView.tsx:51` e `gasCoreEngine.ts:1520` relativi a `creditiFinanziari`/`investimentiBT`, quelli appartengono a un altro blocco e restano finché non applichi quel blocco: NON tentare di risolverli qui.)
2. Controllo di coerenza: nella vista Conto Economico in modalità **competenza** con rimanenze valorizzate, la somma dei 12 valori mensili di EBITDA/EBIT/EBT/Utile deve ora **coincidere** con il rispettivo Totale YTD. In modalità cassa il comportamento resta invariato.
3. Controllo fiscale: nella previsione fiscale, in vista **consuntivo** (non previsionale), la Base imponibile IRES non deve più includere due volte la variazione rimanenze; la vista previsionale/forecast deve restare invariata.

Fine Blocco 1.
