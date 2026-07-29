# PIANO DI DEBUG (parte 2) — GV GestioneFINANZIARIA v1.0
## Istruzioni per agente Antigravity — continuazione dell'audit fiscale-tecnico

**Contesto:** un primo round di fix è già stato applicato e verificato (vedi `REPORT_AUDIT_FINANZIARIO_3.md`, `FIX_SPEC_ANTIGRAVITY.md`, `FIX_SPEC_2_ANTIGRAVITY.md`, `BLOCCO_SP_ANTIGRAVITY.md`). Stato attuale: `npx tsc --noEmit` = 0 errori, `npm run build` = OK, Stato Patrimoniale 2025 quadra (Attivo = Passivo = 3.373.480,19 €).

Questo documento copre i punti **rimasti aperti**. A differenza dei file `FIX_SPEC_*`, qui **NON ci sono find/replace da applicare alla lettera**: ogni voce richiede un'indagine o una decisione. Il tuo compito è **indagare, preparare una proposta e chiedere conferma** — non modificare a occhio.

---

## ⛔ GUARDRAIL VINCOLANTI (valgono per TUTTO questo documento)

1. **Lavora su un branch dedicato** (es. `debug/audit-fase-2`). Non committare su `main`. Nessun push/deploy senza istruzione esplicita.
2. **MAI indovinare su materia fiscale italiana.** Per ogni punto marcato **[COMMERCIALISTA]** NON applicare modifiche: prepara solo una proposta scritta (cosa cambieresti, dove, con quale norma) e **fermati in attesa di conferma umana**.
3. **MAI inventare dati.** Non introdurre numeri, aliquote, saldi o valori "plausibili". Se un dato manca, va reso esplicito come mancante, non riempito.
4. **Non modificare i valori dello snapshot di bilancio** (`generateDefault2025Snapshot`) né altri dati contabili: derivano dal bilancio XBRL ufficiale.
5. **Una modifica per volta.** Dopo ogni modifica: `npx tsc --noEmit` deve restare a 0 errori e `npm run build` deve passare. Se una modifica rompe la build, ripristinala.
6. **Non cambiare il comportamento dei calcoli fiscali/finanziari** senza che il punto lo preveda esplicitamente e senza approvazione.
7. **Preserva la quadratura** dello Stato Patrimoniale (Attivo = Passivo) in ogni modifica che tocca lo SP.
8. Riporta sempre, per ogni punto: file:riga toccati, cosa hai cambiato, esito di `tsc`/`build`, e cosa resta da decidere.

---

## PUNTO 0 — Formalizzare la modifica "acconto" già presente (VERIFICA)
**File:** `utils/gasCoreEngine.ts`, funzione `getDynamicCEType` (blocco `metodoPagamento === 'acconto'`).
Nel codice locale questo blocco è già stato semplificato in `return 'solo_cashflow'` (probabilmente da una tua esecuzione precedente). **Verifica** che sia intenzionale e coerente (per una commessa ad acconto tutti gli incassi sono anticipi = debito → corretto). Se confermato, assicurati che sia **tracciato** (committato sul branch) così non va perso. Non è in nessun blocco `FIX_SPEC_*`.

---

## GRUPPO A — Indici finanziari (serve una scelta METODOLOGICA, non il commercialista)

### A1 — Unificare la definizione di DSCR (numeratore) [DECISIONE UTENTE]
**Problema:** esistono 3 definizioni diverse dello stesso indice:
- `components/Dashboard.tsx` (~riga 301-305): DSCR = **(EBITDA − imposte)** / (interessi + quota capitale) → CFADS. **È la più corretta.**
- `utils/cashFlowPdfExport.ts` (~riga 331): DSCR = **EBITDA** / (quota capitale + interessi) → senza imposte.
- `content/glossary.ts` (~riga 652): come il PDF.
Inoltre `cashFlowPdfExport.ts` (~riga 366) dichiara soglia ">1.15" ma colora verde solo se ">1.25".
**Cosa fare:** proponi di allineare TUTTE al numeratore CFADS (EBITDA − imposte) e a un'unica soglia. **Prima di modificare**, verifica che nel PDF e nel glossario sia disponibile il dato "imposte"; se non lo è, segnalalo. Uniforma anche la soglia (una sola: proposta 1,2). **Chiedi conferma della soglia all'utente prima di applicare.**

### A2 — Denominatore DPO incompleto [DECISIONE UTENTE]
**File:** `utils/gasCoreEngine.ts` `calcSPMetrics`, variabile `acquistiFornitoriPeriodo` (~riga 1009-1017): filtra solo `ceType === 'costo_variabile'`, ma il numeratore è il TOTALE `debitiFornitori`.
**Attenzione:** `costo_variabile` include anche gli stipendi operai (che NON sono acquisti da fornitori). Quindi non basta aggiungere `costo_fisso`: va definito cosa sono gli "acquisti da fornitori". **Proponi** una definizione (es. costi verso terzi al netto del personale) e mostrane l'effetto sul DPO **prima** di applicare. Non applicare senza conferma.

### A3 — Mismatch IVA in DSO/DPO [DECISIONE UTENTE]
**File:** `utils/gasCoreEngine.ts` `calcSPMetrics` (~riga 1027-1031): crediti/debiti sono al LORDO IVA, mentre ricavi/costi al NETTO → DSO/DPO sovrastimati (~+22%). La correzione richiede un'assunzione sull'aliquota media o di lordizzare i volumi. **Proponi** l'approccio (es. lordizzare fatturato/acquisti con l'aliquota media effettiva del periodo, se calcolabile dai dati) e chiedi conferma. Non inventare un'aliquota fissa.

---

## GRUPPO B — Fiscalità [COMMERCIALISTA] — solo PROPOSTA, NON applicare

Per OGNI voce di questo gruppo: prepara una nota (cosa, dove, norma di riferimento, impatto stimato) e **fermati**. NON toccare il codice finché l'utente non porta la conferma del commercialista.

### B1 — IVA per cassa vs esigibilità
`utils/gasCoreEngine.ts` `calcPosizIoneIVA` (~riga 1201): l'IVA è imputata alla data del movimento (cassa) invece che alla data fattura (esigibilità, art. 6 D.P.R. 633/72). Il campo `invoiceDate` esiste ma non è usato. Corretto solo se GV ha optato per "IVA per cassa" (art. 32-bis). **Serve conferma del regime.**

### B2 — Rilevamento periodicità mensile/trimestrale
`utils/gasCoreEngine.ts` (~riga 1232-1245): due versamenti in mesi consecutivi ⇒ "mensile", ma un trimestrale versa a novembre + acconto dicembre (consecutivi) → classificato erroneamente mensile. La soluzione robusta è un'**impostazione esplicita del regime** invece dell'euristica. Proponi il campo di configurazione; **non** cambiare l'euristica indovinando.

### B3 — Detraibilità IVA limitata (art. 19-bis1)
`utils/gasCoreEngine.ts` (~riga 1207-1209): IVA a credito detratta al 100% anche su auto/carburanti (limite 40%) e telefonia (50%). Richiede una mappatura categoria→percentuale di detraibilità: **decisione fiscale**.

### B4 — Cuneo IRAP (dipendenti a tempo indeterminato) e deduzione IRAP-da-IRES
`utils/gasCoreEngine.ts` `calcPrevisioneFiscale` (~riga 869-897 e 839-857): oggi il costo dei dipendenti è reso indeducibile IRAP al 100%, ma dal 2022 i dipendenti a T.I. sono integralmente deducibili; inoltre non è gestita la deduzione IRAP-da-IRES (10% + IRAP sul personale). Entrambe richiedono dati (quali dipendenti a T.I.) e conferma fiscale.

### B5 — Minori (dichiarare o gestire)
Acconti 40/60 vs 50/50 per soggetti ISA; ROL art. 96 sugli interessi; deducibilità parziale auto/telefoni ai fini IRES. Impatto minore. Proporre come "note/limitazioni dichiarate" o gestione, previa conferma.

---

## GRUPPO C — Presentazione, documentazione, robustezza (rischio basso — si può implementare con revisione)

### C1 — CE: riga "Risultato Straordinario" mal posizionata
`components/CEView.tsx` (~riga 1363-1385): la riga è mostrata SOPRA l'EBT ma numericamente entra solo nell'utile. Spostarla graficamente tra EBT e Utile Netto (nessun cambio di calcolo, solo ordine di visualizzazione). Verifica che i totali restino invariati.

### C2 — CE: nota "i costi restano sempre per cassa" non veritiera
`components/CEView.tsx` (~riga 1084) vs `utils/gasCoreEngine.ts` (~riga 99-103): la nota dice "costi sempre per cassa" ma il motore usa `invoiceDate` anche per i costi in competenza. **Decidi con l'utente** se allineare il testo (i costi possono essere per competenza) o il comportamento. Non cambiare il comportamento del motore senza conferma.

### C3 — Glossario: DSCR inesistente nella RatingView
`content/glossary.ts` (~riga 658 e ~932): dichiara un indicatore DSCR nella RatingView che in realtà non esiste (là c'è la copertura interessi EBITDA/oneri). Correggere il testo del glossario. Modifica documentale, sicura.

### C4 — Modalità cassa: riga "EBITDA di competenza (OIC)" con doppio conteggio residuo
`components/CEView.tsx` (~riga 1328-1337): in vista cassa la riga OIC somma la variazione rimanenze una seconda volta (perché `rawMetrics.ebitdaTot` la contiene già). Distinto dal fix già fatto sulla vista competenza. **Richiede una decisione** sul significato dell'EBITDA in vista cassa: proponi l'opzione (es. in cassa l'EBITDA base NON include la variazione rimanenze, che compare solo nella riga OIC) e chiedi conferma prima di toccare.

### C5 — Riconciliazione fatture fragile
`utils/spReconciliation.ts` (~riga 12-45): il match fatture↔pagamenti si basa su regex sulla descrizione; se il pattern non combacia, la fattura resta "aperta" → sovrastima di crediti/debiti. Proponi un fallback (match anche per importo+data) e testalo su dati reali prima di sostituire la logica.

### C6 — Campi UI per `creditiFinanziari` / `investimentiBT`
`components/SPView.tsx`: i due campi esistono nel modello e nell'attivo ma non hanno input in UI. Aggiungere i due campi di input (come gli altri `ManualInput`), così l'utente può valorizzarli. Verifica che la quadratura resti coerente.

---

## GRUPPO D — Azione dell'utente (NON codice)

### D1 — Sincronizzare la liquidità iniziale del Cash Flow
Lo snapshot SP 2025 ora parte da liquidità **835.767,84 €** (valore ufficiale di bilancio), mentre il modulo Cash Flow potrebbe partire da 832.211 €. Verificare con l'utente/commercialista: allineare il saldo iniziale del Cash Flow a 835.767,84 oppure identificare la differenza di **3.556,84 €** (probabile posta bancaria esclusa). Non forzare nulla nel codice.

---

## ORDINE CONSIGLIATO
1. **Punto 0** (verifica/traccia la modifica "acconto").
2. **Gruppo C** (basso rischio, migliora subito coerenza e documentazione) — con revisione utente su C2 e C4.
3. **Gruppo A** (indici) — presenta le proposte, ottieni le scelte metodologiche, poi applica.
4. **Gruppo B** (fiscale) — SOLO proposte scritte; applicare unicamente dopo conferma del commercialista.
5. **Gruppo D** — azione dell'utente, in parallelo.

Fine piano di debug (parte 2).
