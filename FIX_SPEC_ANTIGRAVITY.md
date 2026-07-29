# SPECIFICA FIX ESEGUIBILE — GV GestioneFINANZIARIA v1.0
## Documento operativo per agente esecutore (Antigravity) — ESEGUIRE ALLA LETTERA

**Autore analisi:** audit fiscale-tecnico del 27/07/2026 (vedi `REPORT_AUDIT_FINANZIARIO_3.md`).
**Destinatario:** agente di sviluppo automatico.
**Progetto:** React 19 + TypeScript, build Vite. Root: `E:\Direzione\Desktop\gv-gestionefinanziaria-1.0`.

---

## ⛔ REGOLE VINCOLANTI PER L'ESECUTORE (leggere prima di toccare qualsiasi file)

1. **Applica SOLO ed ESATTAMENTE le modifiche descritte nei BLOCCO 1 e BLOCCO 2 di questo file, più il file separato `BLOCCO_SP_ANTIGRAVITY.md`.** Nient'altro.
2. Ogni modifica è un **find/replace letterale**. Il testo in `CERCA` deve essere trovato **identico carattere per carattere**, inclusi spazi e indentazione. Se non lo trovi identico → **FERMATI e segnala**, NON improvvisare, NON cercare "qualcosa di simile".
3. **NON riformattare** il codice, non cambiare indentazione, non riordinare import, non rinominare variabili, non "migliorare" nulla al di fuori delle sostituzioni indicate.
4. **NON modificare** file diversi da: `utils/gasCoreEngine.ts`, `components/RatingView.tsx`, `components/CEView.tsx` (questo file) — più `components/SPView.tsx` e `App.tsx` (solo tramite il file `BLOCCO_SP_ANTIGRAVITY.md`).
5. **NON toccare** nulla di ciò che è elencato in fondo (§ "FUORI PERIMETRO").
6. I numeri di riga sono **indicativi** (possono variare di poco): l'ancora vera è il testo in `CERCA`.
7. Dopo OGNI blocco esegui la verifica del blocco. Alla fine esegui la **verifica globale**. Se una verifica fallisce, **ripristina il blocco** e segnala.
8. **Non eseguire commit, push, deploy** salvo istruzione esplicita separata.
9. Lingua del codice invariata (italiano nei commenti). Non tradurre nulla.

**Ordine di esecuzione obbligatorio:** `BLOCCO_SP_ANTIGRAVITY.md` → BLOCCO 2 → BLOCCO 1.
(Prima si ripristina la compilazione + Stato Patrimoniale, poi le classificazioni, poi il fix di calcolo. Ogni blocco è comunque indipendente.)

---

# BLOCCO SP — Stato Patrimoniale (in FILE SEPARATO: `BLOCCO_SP_ANTIGRAVITY.md`)
**Priorità: ALTA (senza questo blocco il progetto NON compila). Eseguilo per PRIMO.**

⚠️ Questo blocco **SOSTITUISCE** integralmente quello che nelle versioni precedenti era il "Blocco 3". **NON** applicare qui alcuna modifica allo Stato Patrimoniale: apri e applica il file dedicato **`BLOCCO_SP_ANTIGRAVITY.md`**, che contiene 4 sostituzioni (`utils/gasCoreEngine.ts`, `components/SPView.tsx`, `App.tsx`):
- ricostruisce il seed 2025 con i **valori ufficiali del bilancio XBRL** (elimina i due "plug");
- aggiunge i campi `creditiFinanziari`/`investimentiBT` a `EMPTY_SNAPSHOT` e all'attivo circolante (ripristino compilazione + simmetria PFN);
- rende robusta la migrazione degli snapshot in `App.tsx` (non sovrascrive più le modifiche manuali).

Verifica del blocco: `npx tsc --noEmit` a zero errori **e** quadratura Attivo = Passivo = 3.373.480,19 €.

---

# BLOCCO 2 — Anticipi da Clienti = debito, non ricavo
**Priorità: CRITICA (classificazione). 1 modifica. Rischio: basso.**

**Contesto:** in `getDynamicCEType` gli "Anticipi da Clienti su Commessa" vengono forzati a ricavo per le commesse a SAL o senza metodo di pagamento, sovrascrivendo il mapping statico corretto (`solo_cashflow`). Gli acconti da clienti sono **debiti** (art. 2425 c.c., voce D.6), mai ricavi finché non maturano via SAL/rimanenze. Si rimuove la riga che li tratta come ricavo operativo: così tornano a `solo_cashflow` (già garantito dal fall-through della funzione e da `constants.ts:200`).

### Modifica 2.1 — `utils/gasCoreEngine.ts` (≈ righe 59-64, dentro `getDynamicCEType`)
CERCA:
```
      const isOperationalRevenue = type === 'ricavo_core' || type === 'ricavo_immobiliare' || 
        tx.category === '[CANTIERE] SAL — Stato Avanzamento Lavori' ||
        tx.category === '[CANTIERE] Saldo Finale Commessa' ||
        tx.category === '[CANTIERE] Manutenzioni e Piccoli Lavori' ||
        tx.category === '[IMMOBILIARE] Vendita Immobili e Terreni' ||
        tx.category === '[CANTIERE] Anticipi da Clienti su Commessa';
```
SOSTITUISCI CON:
```
      const isOperationalRevenue = type === 'ricavo_core' || type === 'ricavo_immobiliare' || 
        tx.category === '[CANTIERE] SAL — Stato Avanzamento Lavori' ||
        tx.category === '[CANTIERE] Saldo Finale Commessa' ||
        tx.category === '[CANTIERE] Manutenzioni e Piccoli Lavori' ||
        tx.category === '[IMMOBILIARE] Vendita Immobili e Terreni';
```
> Effetto: rimossa **solo** l'ultima condizione (la riga degli Anticipi) e il `||` che la precedeva. Le altre 4 condizioni restano identiche. **ATTENZIONE:** il carattere dopo `ricavo_immobiliare ||` sulla prima riga è uno spazio finale — mantienilo.

### ✅ Verifica BLOCCO 2
1. `npx tsc --noEmit` → zero errori.
2. Controllo logico: la stringa `'[CANTIERE] Anticipi da Clienti su Commessa'` **non deve più comparire** dentro la funzione `getDynamicCEType` (deve restare invece in `constants.ts`). Verifica con una ricerca: la categoria compare ancora in `constants.ts` (riga ~163 e ~200) ma NON più in `getDynamicCEType`.

---

# BLOCCO 1 — Eliminazione del DOPPIO CONTEGGIO della variazione rimanenze
**Priorità: CRITICA (bug di calcolo ad alto impatto fiscale). 4 modifiche su 3 file. Rischio: medio — leggere con attenzione.**

**Contesto (perché è un bug):** la funzione `calcCEMetrics` incorpora **già** la variazione delle rimanenze nel valore della produzione, quindi i suoi totali `ebitdaTot`, `ebitTot`, `ebtTot`, `utileNettoTot` la contengono **una volta**. Alcuni consumatori la **ri-sommano**, contandola **due volte**, ma **solo nella vista consuntivo/YTD**. Nelle proiezioni (forecast) i totali `proiezione*` NON la contengono, quindi lì va aggiunta una volta (corretto — NON toccare le proiezioni).

**Regola d'oro del blocco:** si rimuove l'aggiunta della variazione rimanenze SOLO sui totali **YTD/consuntivo**; si LASCIA INTATTA sulle **proiezioni/forecast**.

### Modifica 1.1 — `utils/gasCoreEngine.ts` (≈ riga 857, `calcPrevisioneFiscale`, base IRES)
CERCA:
```
  const baseImponibileIRES = Math.max(0, ebtCompetenza + straordinarioCompetenza + variazioneRimanenze - dividendiEsenti + straordinarioIndeducibile);
```
SOSTITUISCI CON:
```
  const baseImponibileIRES = Math.max(0, ebtCompetenza + straordinarioCompetenza + (includeForecast ? variazioneRimanenze : 0) - dividendiEsenti + straordinarioIndeducibile);
```
> Perché: in vista YTD `ebtCompetenza = ceMetrics.ebtTot` che **già include** la variazione rimanenze; in forecast `ebtCompetenza = ceMetrics.proiezioneEbt` che **NON la include**. Aggiungerla solo se `includeForecast`.
> **NON toccare** la "Base imponibile IRAP" subito sotto (righe ≈859-898): è già corretta (usa `fatturato`, non `ebtTot`) e NON deve essere modificata.

### Modifica 1.2 — `utils/gasCoreEngine.ts` (≈ righe 953-955, `calcPrevisioneFiscale`, `utileDopoImposte`)
CERCA:
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
> Perché: nel ramo forecast (prima riga) si LASCIA `+ variazioneRimanenze` (corretto). Nel ramo YTD (seconda riga) si RIMUOVE `+ variazioneRimanenze` perché `ebtTot` la contiene già. **Unica differenza:** sparisce `+ variazioneRimanenze` dalla riga del ramo `:` (YTD). Il ramo `?` (forecast) resta IDENTICO.

### Modifica 1.3 — `components/RatingView.tsx` (≈ riga 112)
CERCA:
```
    const ebitdaDiCompetenza = ceMetrics.ebitdaTot + varRim;
```
SOSTITUISCI CON:
```
    const ebitdaDiCompetenza = ceMetrics.ebitdaTot;
```
> Perché: `ceMetrics.ebitdaTot` (da `calcCEMetrics` chiamato con le rimanenze, riga ≈76) contiene già la variazione. La variabile `varRim` resterà definita ma non più usata in questo punto: **è innocua, NON rimuoverla** (nessun errore di compilazione — `noUnusedLocals` non è attivo). NON modificare `fatturatoCompetenza` (che usa `deltaWip`, cosa diversa e corretta).

### Modifica 1.4 — `components/CEView.tsx` (≈ righe 152-155, blocco "YTD Actuals (Consuntivo)")
CERCA:
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
> Perché: `rawMetrics.*Tot` contengono già la variazione (le rimanenze sono passate a `calcCEMetrics` alla riga ≈111). **NON toccare** le righe subito sopra (≈146-149, i `proiezione*` con `+ varRimEffettivo`): quelle sono le PROIEZIONI e sono corrette così. `varRimEffettivo` resta usata nelle proiezioni → nessun errore.

### ✅ Verifica BLOCCO 1
1. `npx tsc --noEmit` → zero errori.
2. **Controllo di coerenza (il test decisivo):** aprendo la vista Conto Economico in modalità **competenza** con rimanenze valorizzate, la somma dei 12 valori mensili di EBITDA/EBIT/EBT/Utile deve ora **coincidere** con il rispettivo Totale YTD (prima differivano esattamente della variazione rimanenze). In modalità cassa il comportamento resta invariato.
3. **Controllo fiscale:** nella vista Analisi → previsione fiscale, selezionando la vista **consuntivo** (non previsionale), la Base imponibile IRES non deve più includere due volte la variazione rimanenze. La vista previsionale/forecast deve restare invariata rispetto a prima.

---

## ✅ VERIFICA GLOBALE FINALE (dopo tutti e 3 i blocchi)
```
npx tsc --noEmit
```
**Atteso:** nessun errore.
```
npm run build
```
**Atteso:** build completata senza errori.

Riepilogo file toccati e numero modifiche:
Contenuto di QUESTO file (Blocchi 1 e 2):

| File | N. sostituzioni | Modifiche |
|---|---|---|
| `utils/gasCoreEngine.ts` | 3 | 2.1, 1.1, 1.2 |
| `components/RatingView.tsx` | 1 | 1.3 |
| `components/CEView.tsx` | 1 | 1.4 |

(Totale QUESTO file: **5 sostituzioni**.) Più il file separato **`BLOCCO_SP_ANTIGRAVITY.md`**: **4 sostituzioni** su `utils/gasCoreEngine.ts`, `components/SPView.tsx`, `App.tsx`.
**Totale complessivo: 9 sostituzioni.** Nessun altro file va modificato.

---

## ⛔ FUORI PERIMETRO — NON MODIFICARE IN QUESTA ESECUZIONE
I seguenti rilievi dell'audit **NON vanno toccati** da questa esecuzione automatica: richiedono decisioni contabili/fiscali o del regime IVA reale dell'azienda, oppure una progettazione a parte. Ignorarli completamente qui.

1. **Reverse charge IVA edile** (`utils/puntaNetImporter.ts`, `utils/ivaPdfExport.ts`) — dipende dal regime IVA reale.
2. **IVA per cassa vs esigibilità / periodicità mensile-trimestrale** (`utils/gasCoreEngine.ts` modulo IVA) — dipende dal regime.
3. **Cuneo IRAP dipendenti a tempo indeterminato / deduzione IRAP-da-IRES** — decisione fiscale.
4. ~~Doppio "balancing plug" e riclassifica VISMAN nel seed SP~~ — ✅ **GIÀ RISOLTO** dal file `BLOCCO_SP_ANTIGRAVITY.md` con i valori ufficiali del bilancio XBRL (plug eliminati; VISMAN tenuto tra i crediti come da bilancio). Non è più fuori perimetro.
5. **Unificazione delle definizioni di DSCR / fallback `|| 1`** (`components/Dashboard.tsx`, `utils/cashFlowPdfExport.ts`, `content/glossary.ts`) — richiede scelta metodologica.
6. **Denominatore DPO e mismatch IVA su DSO/DPO** — richiede scelta metodologica.
7. **Riga "Risultato Straordinario" nel layout CE / variazione rimanenze materiali in B11** — presentazione, decisione a parte.
8. **Aggiunta di campi di input UI** per `creditiFinanziari` / `investimentiBT` — estensione facoltativa separata.
9. **Modalità cassa: riga "EBITDA di competenza (OIC)"** (`components/CEView.tsx` ≈1328-1337) — issue distinto dal Blocco 1, richiede decisione sul significato dell'EBITDA in vista cassa. NON toccare.

> **NOTA sui fix già applicati nella copia locale (non ancora messi in forma di blocco Antigravity):** oltre ai Blocchi 1/2/SP, nella cartella locale sono state applicate anche: (a) import IVA — nessuna aliquota "inventata" dal nome fornitore, le righe senza IVA nel dato restano "da precisare"; (b) DSCR — rimosso il fallback `|| 1` (ora "N/A" senza servizio del debito); (c) testo PDF IVA sul reverse charge allineato al comportamento reale. Se servono anche questi come blocchi da dare ad Antigravity, richiederli: si producono nello stesso formato blindato.

Fine specifica.
