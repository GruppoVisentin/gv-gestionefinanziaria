# SPECIFICA FIX FISCALI — GV GestioneFINANZIARIA v1.0
## Per agente esecutore (Antigravity) — ESEGUIRE ALLA LETTERA

**Base fattuale:** questi fix derivano dal **bilancio XBRL ufficiale 2025** e da conferme del cliente:
- dipendenti **tutti a tempo indeterminato**;
- compensi amministratori resi con **partita IVA personale**;
- **nessun super/iper-ammortamento**;
- volume d'affari 2025 ≈ **3,95 mln €** (→ IVA ordinaria mensile, NO "IVA per cassa").
- Imposte reali di bilancio 2025 (benchmark di validazione): **IRES 54.683**, **IRAP 9.942**.

I blocchi vanno pubblicati **uno alla volta**, ciascuno con la sua verifica.

---

## ⛔ REGOLE VINCOLANTI
1. Applica SOLO ed ESATTAMENTE le sostituzioni indicate. Find/replace **letterale**; se il `CERCA` non è identico → **FERMATI e segnala**.
2. Non riformattare, non rinominare, non toccare altro. Lavora su branch dedicato; nessun commit/push/deploy salvo istruzione.
3. Dopo ogni blocco: `npx tsc --noEmit` = 0 errori e `npm run build` = OK. Se rompe, ripristina.
4. Commenti in italiano invariati; non tradurre.

---

# BLOCCO FISCALE 1 — Cuneo IRAP: personale a T.I. e compensi amministratori P.IVA deducibili
**File:** `utils/gasCoreEngine.ts`, funzione `calcPrevisioneFiscale` (~riga 893). 1 sostituzione.

**Contesto:** dal 2022 il costo dei dipendenti a **tempo indeterminato** è integralmente deducibile ai fini IRAP (art. 11 c. 4-octies D.Lgs. 446/1997). I dipendenti di GV sono tutti a T.I. e i compensi amministratori sono resi con P.IVA (prestazioni di servizi, deducibili). Oggi l'app li **riprende a tassazione** (li rende indeducibili), sovrastimando l'IRAP. Verifica sul bilancio 2025: IRAP reale **9.942 €** (base ≈ 254.923 ≈ Differenza A−B), mentre l'app oggi stimerebbe ~34.000 €.

CERCA (esatto):
```
  const costiDeducibiliIRAP = Math.max(0, costiOperativiTotali - costoPersonaleDipendente - compensoAmministratoriIRAP);
  const baseImponibileIRAP = Math.max(0, valoreProduzione - costiDeducibiliIRAP);
```
SOSTITUISCI CON:
```
  // Cuneo fiscale IRAP (art. 11 c. 4-octies D.Lgs. 446/1997): dal 2022 il costo dei dipendenti a TEMPO
  // INDETERMINATO è integralmente deducibile. I dipendenti di GV sono tutti a T.I. e i compensi amministratori
  // sono resi con P.IVA (prestazione di servizi, deducibile): pertanto NON vanno ripresi a tassazione IRAP.
  // Verifica sul bilancio 2025: IRAP reale 9.942 (base ≈ 254.923 ≈ Differenza A-B), coerente con questa deduzione.
  // (costoPersonaleDipendente/compensoAmministratoriIRAP restano calcolati per eventuali affinamenti su lavoratori NON a T.I.)
  const costiDeducibiliIRAP = Math.max(0, costiOperativiTotali);
  const baseImponibileIRAP = Math.max(0, valoreProduzione - costiDeducibiliIRAP);
```

### ✅ Verifica BLOCCO FISCALE 1
1. `npx tsc --noEmit` → nessun errore nuovo (le due variabili `costoPersonaleDipendente`/`compensoAmministratoriIRAP` restano definite ma non più usate: è previsto e innocuo — `noUnusedLocals` non è attivo).
2. `npm run build` → OK.
3. Controllo di merito: nella previsione fiscale l'**IRAP stimata** per il 2025 deve scendere a **~10.000 €** (ordine di grandezza dell'IRAP reale di bilancio, 9.942), non più ~34.000 €.

---

# BLOCCO FISCALE 2 — Deduzione IRAP dalla base IRES (10% forfettario)
**File:** `utils/gasCoreEngine.ts`, funzione `calcPrevisioneFiscale`. 2 sostituzioni.
**⚠️ Applicare DOPO il BLOCCO FISCALE 1** (la deduzione analitica IRAP-su-personale è ~0 solo perché il cuneo del Blocco 1 ha già reso il personale deducibile IRAP).

**Contesto:** l'IRAP è parzialmente deducibile dalla base IRES. Con il cuneo (Blocco 1) il personale è già fuori dalla base IRAP, quindi la deduzione analitica sul personale è nulla; resta la deduzione **forfettaria del 10% dell'IRAP** (art. 6 DL 185/2008), riconosciuta in presenza di interessi passivi (GV ne ha). Oggi l'app non applica alcuna deduzione → sovrastima (di poco) l'IRES.

### Modifica 2.1 — sezione "Calcolo imposte"
CERCA (esatto):
```
  // Calcolo imposte
  const iresStimata = baseImponibileIRES * aliquotaIRES;
  const irapStimata = baseImponibileIRAP * aliquotaIRAP;
  const totaleImposteStimate = iresStimata + irapStimata;
```
SOSTITUISCI CON:
```
  // Calcolo imposte
  const irapStimata = baseImponibileIRAP * aliquotaIRAP;
  // Deduzione IRAP dalla base IRES (art. 6 DL 185/2008): 10% forfettario dell'IRAP versata, riconosciuto in
  // presenza di interessi passivi (GV ne ha). La deduzione ANALITICA sull'IRAP relativa al costo del personale
  // è ~0, perché con il cuneo fiscale il personale a T.I. è già integralmente dedotto dall'IRAP.
  const deduzioneIrapDaIres = irapStimata * 0.10;
  const baseImponibileIRESNetta = Math.max(0, baseImponibileIRES - deduzioneIrapDaIres);
  const iresStimata = baseImponibileIRESNetta * aliquotaIRES;
  const totaleImposteStimate = iresStimata + irapStimata;
```

### Modifica 2.2 — oggetto restituito (base IRES = base netta, coerente con l'imposta)
CERCA (esatto):
```
    ebtCompetenza,
    variazioneRimanenze,
    baseImponibileIRES,
    baseImponibileIRAP,
```
SOSTITUISCI CON:
```
    ebtCompetenza,
    variazioneRimanenze,
    baseImponibileIRES: baseImponibileIRESNetta,
    baseImponibileIRAP,
```

### ✅ Verifica BLOCCO FISCALE 2
1. `npx tsc --noEmit` → 0 errori. 2. `npm run build` → OK.
3. La "Base Imponibile IRES" mostrata × 24% deve coincidere con l'IRES stimata (coerenza base↔imposta).

> **NOTA DI ACCURATEZZA (importante):** questo blocco applica la formula normativa corretta, ma il suo effetto è **piccolo** (~10% dell'IRAP ≈ 1.000 €). Il bilancio civilistico mostra una base IRES reale (227.846) più bassa del risultato ante imposte (239.108) per un insieme di variazioni fiscali (riprese e deduzioni) che **NON sono desumibili dal bilancio civilistico** (stanno nel modello Redditi SC). Pertanto, anche dopo questo blocco, l'IRES stimata dall'app resta un'approssimazione **prudenziale** (tende a essere leggermente più alta del reale). Per un allineamento al centesimo servirebbe il dettaglio delle variazioni dal commercialista.

---

# BLOCCO FISCALE 3 — IVA per esigibilità (data fattura), non per cassa
**File:** `utils/gasCoreEngine.ts`, funzione `calcPosizIoneIVA`. 2 sostituzioni. Indipendente dai blocchi F1/F2.

**Contesto:** oggi l'IVA a debito/credito è imputata al mese del **movimento bancario** (`tx.date`). Nel regime ordinario (GV: volume d'affari > 2 mln → NON può optare per "IVA per cassa" art. 32-bis) l'IVA è esigibile alla **data di effettuazione dell'operazione = data fattura** (art. 6 D.P.R. 633/1972). Si usa quindi `invoiceDate` quando disponibile, con fallback su `tx.date`. Il **versamento F24** resta un'uscita di cassa, imputata alla data del movimento.

### Modifica 3.1 — filtro annuale + helper data di esigibilità
CERCA (esatto):
```
  const txAnno = transactions.filter(tx => {
    const d = parseUTCDate(tx.date);
    const inYear = d.getUTCFullYear() === anno;
    if (!inYear) return false;
    if (includeForecast) return true;
    return !tx.isForecast;
  });
```
SOSTITUISCI CON:
```
  // Esigibilità IVA (art. 6 D.P.R. 633/1972): l'IVA è imputata alla DATA FATTURA (invoiceDate) se disponibile,
  // non alla data del movimento bancario. GV è in regime ordinario (volume d'affari > 2 mln → non "IVA per cassa").
  const ivaRefDate = (tx: Transaction) => tx.invoiceDate || tx.date;
  const txAnno = transactions.filter(tx => {
    const d = parseUTCDate(ivaRefDate(tx));
    const inYear = d.getUTCFullYear() === anno;
    if (!inYear) return false;
    if (includeForecast) return true;
    return !tx.isForecast;
  });
```

### Modifica 3.2 — imputazione mensile IVA per esigibilità (versamento F24 per cassa)
CERCA (esatto):
```
  const mensileSenzaPos = Array.from({ length: 12 }, (_, mese) => {
    const txMese = txAnno.filter(tx => parseUTCDate(tx.date).getUTCMonth() === mese);

    const ivaIncassata = txMese
      .filter(tx => tx.type === 'INCOME' && (tx.vatRate ?? 0) > 0 && tx.ceType !== 'solo_cashflow')
      .reduce((s, tx) => s + tx.amount * ((tx.vatRate ?? 0) / 100), 0);

    const ivaPagata = txMese
      .filter(tx => tx.type === 'EXPENSE' && (tx.vatRate ?? 0) > 0 && tx.ceType !== 'solo_cashflow')
      .reduce((s, tx) => s + tx.amount * ((tx.vatRate ?? 0) / 100), 0);

    // Solo i versamenti F24 reali
    const versamentoIVA = txMese
      .filter(tx =>
        tx.type === 'EXPENSE' &&
        tx.category === '[FISCO] Versamento IVA' &&
        !tx.isForecast
      )
      .reduce((s, tx) => s + Math.abs(tx.amount), 0);

    const saldoIVA = ivaIncassata - ivaPagata;

    return { mese, ivaIncassata, ivaPagata, saldoIVA, versamentoIVA };
  });
```
SOSTITUISCI CON:
```
  const mensileSenzaPos = Array.from({ length: 12 }, (_, mese) => {
    // IVA a debito/credito: imputata per ESIGIBILITÀ (data fattura se presente), non per cassa.
    const txMeseIva = txAnno.filter(tx => parseUTCDate(ivaRefDate(tx)).getUTCMonth() === mese);

    const ivaIncassata = txMeseIva
      .filter(tx => tx.type === 'INCOME' && (tx.vatRate ?? 0) > 0 && tx.ceType !== 'solo_cashflow')
      .reduce((s, tx) => s + tx.amount * ((tx.vatRate ?? 0) / 100), 0);

    const ivaPagata = txMeseIva
      .filter(tx => tx.type === 'EXPENSE' && (tx.vatRate ?? 0) > 0 && tx.ceType !== 'solo_cashflow')
      .reduce((s, tx) => s + tx.amount * ((tx.vatRate ?? 0) / 100), 0);

    // Il versamento F24 è un'uscita di CASSA: resta imputato alla data del movimento (tx.date).
    const versamentoIVA = txAnno
      .filter(tx =>
        parseUTCDate(tx.date).getUTCMonth() === mese &&
        tx.type === 'EXPENSE' &&
        tx.category === '[FISCO] Versamento IVA' &&
        !tx.isForecast
      )
      .reduce((s, tx) => s + Math.abs(tx.amount), 0);

    const saldoIVA = ivaIncassata - ivaPagata;

    return { mese, ivaIncassata, ivaPagata, saldoIVA, versamentoIVA };
  });
```

### ✅ Verifica BLOCCO FISCALE 3
1. `npx tsc --noEmit` → 0 errori. 2. `npm run build` → OK.
3. Controllo di merito: le fatture con `invoiceDate` in un mese diverso dalla data d'incasso/pagamento devono ora spostare l'IVA nel mese della **fattura**; i versamenti F24 restano nel mese del movimento.

> **NOTA:** l'effetto è pieno solo se le transazioni hanno il campo `invoiceDate` valorizzato (import con dettaglio fattura). Per i movimenti senza data fattura si usa la data del movimento (fallback), quindi nessuna regressione.

---

<!-- Prossimo blocco fiscale: F4 — regime IVA mensile fisso. -->>
