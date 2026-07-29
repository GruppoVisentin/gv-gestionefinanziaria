# Terzo Report di Audit Tecnico-Fiscale — GV GestioneFINANZIARIA v1.0
**Azienda:** Gruppo Visentin S.R.L. (settore edile/costruzioni)
**Data:** 27/07/2026
**Oggetto:** Verifica approfondita della correttezza dei calcoli fiscali italiani (IRES/IRAP/IVA), del Conto Economico, dello Stato Patrimoniale, del Rating, e accertamento dell'assenza di dati mock/inventati.

> Metodo: audit parallelo su 6 domini + verifica diretta nel codice dei difetti critici + type-check dell'intero progetto. Ogni rilievo è ancorato a `file:riga`. I difetti marcati **[VERIFICATO IN CODICE]** sono stati riletti direttamente riga per riga.

---

## 0. VERDETTO SINTETICO

| Dominio | Esito | Difetti CRITICI/ALTI |
|---|---|---|
| Dati mock/inventati | ✅ **Nessun dato finto** (1 eccezione documentale) | — |
| Motore IRES/IRAP | ⚠️ 1 bug critico + semplificazioni | 1 |
| Conto Economico | ⚠️ 1 bug critico + 1 classificazione errata | 2 |
| Stato Patrimoniale | ⚠️ quadratura OK ma con "plug" + riclassifiche | 1 |
| IVA | ⚠️ metodo e reverse charge | 1 |
| Rating/DSCR/PFN | ⚠️ eredita il bug rimanenze + incoerenze DSCR | 1 |
| Compilazione TypeScript | ❌ 2 errori di tipo | — |

**Risposta diretta alle tue tre domande:**
1. **«Niente è mock o inventato?»** → **Confermato.** L'app calcola tutto dalle transazioni reali dell'utente. Nessuna transazione demo, nessun numero casuale, nessun placeholder mostrato come reale. *Unica eccezione:* lo snapshot di bilancio iniziale 2025 (dati XBRL ufficiali) contiene **due voci di quadratura** retro-calcolate — vedi §4.
2. **«Il CE è corretto?»** → **Struttura corretta**, ma con **1 bug matematico ad alto impatto** (doppio conteggio rimanenze) e **1 errore di classificazione** (anticipi da clienti come ricavo). Correggibili.
3. **«Il calcolo fiscale italiano è affidabile?»** → **Le aliquote e l'impianto sono corretti**, ma **la base imponibile IRES è sovrastimata** dal bug rimanenze, e ci sono alcune semplificazioni (alcune dichiarate, altre no). Dopo i fix sotto, l'affidabilità è alta *come stima gestionale* — non sostituisce il commercialista.

---

## 1. 🔴 IL DIFETTO PRINCIPALE — Doppio conteggio della Variazione Rimanenze [VERIFICATO IN CODICE]

**Causa radice unica, tre manifestazioni.** La funzione `calcCEMetrics` riceve **sempre** le rimanenze dai chiamanti e le incorpora già nel valore della produzione:
- `gasCoreEngine.ts:457-459` → `arrVarRimanenze[11] = ΔWIP + Δterreni + Δmateriali`
- `gasCoreEngine.ts:463` → `valoreProduzione = totRicavi + arrVarRimanenze` → confluisce in `ebitdaTot`, `ebitTot`, `ebtTot`, `utileNettoTot`.

Poi **ogni chiamante la somma una seconda volta** (solo vista **consuntivo YTD / competenza**):

| Manifestazione | File:riga | Effetto |
|---|---|---|
| Base imponibile **IRES** | [gasCoreEngine.ts:857](utils/gasCoreEngine.ts) — `ebtCompetenza + … + variazioneRimanenze` | IRES sovrastimata del **24% della variazione rimanenze** |
| Utile netto stimato | gasCoreEngine.ts:955 | Utile dopo imposte distorto |
| **EBITDA** del Rating | [RatingView.tsx:112](components/RatingView.tsx) — `ceMetrics.ebitdaTot + varRim` | Falsa PFN/EBITDA e copertura oneri → rating gonfiato |
| Metriche **CE** (EBITDA/EBIT/EBT/Utile) | [CEView.tsx:152-155](components/CEView.tsx) — `rawMetrics.*Tot + varRimEffettivo` | CE YTD sovrastimato; **Σ mesi ≠ Totale** |

**Prova che è un bug e non voluto:** la vista **Forecast** è corretta perché usa `proiezioneEbt` (costruito dai soli ricavi, senza rimanenze) e somma la variazione **una sola volta**. YTD e Forecast trattano `rawMetrics` in modo opposto.

**Impatto concreto:** con WIP/rimanenze da **€1.262.318** (snapshot 2025), l'errore è materiale — potenzialmente **decine di migliaia di € di IRES in più** e un rating artificialmente migliore. L'IRAP **non** è colpita (usa il fatturato senza rimanenze).

**Fix:** un'unica sorgente della variazione rimanenze. O `calcCEMetrics` non la incorpora (i chiamanti la aggiungono), **oppure** i chiamanti (`CEView.tsx:152-155`, `RatingView.tsx:112`, `gasCoreEngine.ts:857/955`) smettono di ri-aggiungerla. Consigliata la seconda: lasciare la variazione dentro `calcCEMetrics` (già coerente coi mesi) e rimuovere le ri-addizioni. Un solo fix chiude 4 rilievi.

---

## 2. 🔴 Conto Economico

### 2.1 [ALTA — VERIFICATO] Anticipi da Clienti contabilizzati come RICAVO
`getDynamicCEType` in [gasCoreEngine.ts:59-68](utils/gasCoreEngine.ts): la categoria `[CANTIERE] Anticipi da Clienti su Commessa` è inclusa in `isOperationalRevenue` (riga 64) → diventa `ricavo_core`/`ricavo_immobiliare`. La guardia che la riporta a `solo_cashflow` scatta **solo** se `proj.metodoPagamento === 'acconto'` (righe 52-56). Per una commessa a **SAL** o **senza `metodoPagamento` impostato (default)** l'anticipo diventa **ricavo**.
- Contraddice il mapping statico dichiarato: `constants.ts:200` → `solo_cashflow` ("acconto: debito, mai nel CE").
- **Norma:** art. 2425 c.c. — gli acconti da clienti sono **debiti** (D.6), mai ricavi finché non maturano via SAL/rimanenze.
- **Impatto:** sovrastima di Valore della Produzione e Utile.

### 2.2 [MEDIA] "Risultato Straordinario" mostrato sopra l'EBT ma non incluso nell'EBT
`ebt = ebit − oneriFin + proventiFin` (gasCoreEngine.ts:473, **senza** straordinario); lo straordinario entra solo nell'utile (riga 474). Ma nel layout è collocato **prima** dell'EBT (CEView.tsx:1363-1385) → incoerenza visiva/numerica. Spostarlo tra EBT e Utile Netto.

### 2.3 [MEDIA] Variazione rimanenze MATERIALI in area A anziché B11
`gasCoreEngine.ts:457-459` somma anche Δmateriali nel valore della produzione. Civilisticamente le materie prime vanno in **B11** (rettifica di costo). L'effetto netto sull'utile è identico, ma la classificazione del "Valore della Produzione" non è conforme.

### 2.4 [MEDIA] Nota "i costi restano sempre per cassa" non veritiera
CEView.tsx:1084 dichiara costi sempre per cassa, ma il motore usa `invoiceDate` anche per i costi in competenza (gasCoreEngine.ts:99-103). Coincidono solo perché i costi raramente hanno `invoiceDate`. Allineare codice e documentazione.

### ✅ CE — confermato corretto
Esclusione voci `solo_cashflow` (IVA, F24, ritenute, finanziamenti); caparra art.15 esclusa; ritenute d'acconto escluse; CAPEX/quota capitale fuori dal CE; ammortamenti tra EBITDA ed EBIT; oneri/proventi finanziari tra EBIT ed EBT; imposte dopo EBT; segno variazione rimanenze corretto; catena a margine di contribuzione coerente in modalità cassa.

---

## 3. 🟠 IRES / IRAP

### ✅ Corretto
- Aliquota **IRES 24%** e **IRAP 3,9% Veneto** — corrette e applicate alle basi giuste.
- **BUG-003** (straordinari indeducibili: sanzioni/donazioni ri-aggiunti come variazione in aumento) — gestito correttamente (gasCoreEngine.ts:843-857).
- **Dividendi** esclusi al 95% ex art. 89 TUIR (gasCoreEngine.ts:826-837) — corretto.
- **Compensi amministratori** esclusi dalla deducibilità IRAP — corretto.
- **Acconti complessivi 100%** con split 40/60 — corretto in generale.
- **ACE e perdite pregresse** — non gestite ma **esplicitamente dichiarate** come limitazioni (disclaimer UI e PDF) → semplificazione lecita.

### ⚠️ Da correggere / valutare
| Sev. | File:riga | Rilievo |
|---|---|---|
| **CRITICO** | gasCoreEngine.ts:857, :955 | Doppio conteggio rimanenze (vedi §1) |
| MEDIO | gasCoreEngine.ts:869-897 | **Cuneo IRAP**: dal 2022 i dipendenti a tempo indeterminato sono integralmente deducibili IRAP; il codice li rende indeducibili → IRAP sovrastimata. *Dichiarato* nel disclaimer, ma andrebbe implementato per l'edile con molti operai a T.I. |
| MEDIO | gasCoreEngine.ts:839-857 | **Deduzione IRAP-da-IRES** (10% forfettario + IRAP sul personale, art. 2 DL 201/2011) non gestita **e non dichiarata** → IRES sovrastimata |
| MEDIO | analisiPdfExport.ts:697-698 vs AnalisiView.tsx:2200 | Acconti: il PDF li ricalcola sull'imposta **stimata**, la UI sulla base **storica** → i due output divergono se sono inserite le imposte storiche |
| BASSO | gasCoreEngine.ts:910-911 | Split 40/60 anziché **50/50** per soggetti ISA (il totale 100% non cambia) |
| BASSO | gasCoreEngine.ts:473 | Limite ROL art. 96 sugli interessi passivi non applicato (impatto trascurabile per GV) |
| BASSO | gasCoreEngine.ts:839-857 | Deducibilità parziale auto/telefoni non gestita (parz. dichiarata) |

---

## 4. 🟠 Stato Patrimoniale

### ✅ Corretto
- **Quadratura del seed 2025 verificata:** Attivo = Passivo = **€3.369.923** (delta 0).
- Impianto macro-classi coerente; acconti clienti come passività; crediti tributari in attivo circolante; logica dinamica di cespiti/mutui/liquidità dagli anni successivi corretta.
- PFN: componenti e segno corretti (esclude debiti commerciali, TFR, acconti).

### ⚠️ Da correggere
| Sev. | File:riga | Rilievo |
|---|---|---|
| ALTA | gasCoreEngine.ts:1531, :1540 | **Doppio balancing plug**: sia `riserve` (895.770) sia `altriDebitiBT` (268.075) sono retro-calcolati per quadrare. Con una sola identità serve **un solo** grado di libertà → le due voci non sono verificabili sul bilancio XBRL. Riportare i valori ufficiali reali e indagare lo scarto residuo (probabili ratei/risconti/fondi mancanti). |
| MEDIA | gasCoreEngine.ts:1525 | Il prestito VISMAN (€500.310) è dentro `partecipazioni`. Un finanziamento a collegata è un **credito v/collegate** (B.III.2), non una partecipazione; inoltre sepolto lì **non abbatte la PFN**. Riclassificare in `creditiFinanziari`. |
| MEDIA | tipo `SPSnapshot` + seed | Mancano **Ratei/Risconti** e **Fondi rischi**: probabile componente dello sbilancio confluita nel plug. |
| MEDIA | gasCoreEngine.ts:1533/1541 | Mutuo senza **quota corrente** (`mutuiBT: 0`): un mutuo LT ha sempre rate entro 12 mesi → sottostima passivo corrente, Current Ratio troppo favorevole. |
| MEDIA | spReconciliation.ts:12-45 | Riconciliazione fatture↔pagamenti basata su **regex sulla descrizione**: se il pattern non combacia, la fattura resta "aperta" → **sovrastima crediti/debiti**. Nessun fallback su importo/data. |
| MEDIA | App.tsx:900 | La "migrazione" **rigenera il seed 2025 sovrascrivendo le modifiche dell'utente** se certi valori differiscono → perdita silenziosa di dati. Usare un flag di versione, non confronti di valore. |
| BASSA | types.ts:162-163 + gasCoreEngine.ts:986/992 | **[VERIFICATO]** Campi `creditiFinanziari`/`investimentiBT`: **sottratti nella PFN** (riga 992) ma **non sommati nell'attivo circolante** (riga 986), assenti da UI/seed/`EMPTY_SNAPSHOT`. Se popolati, migliorano la PFN ma **rompono la quadratura** (Attivo ≠ Passivo). |
| BASSA | — | `accontiClienti: 1.365.000` è una cifra tonda sospetta per un dato "ufficiale": verificare. |

---

## 5. 🟠 IVA

### ✅ Corretto
Scorporo imponibile dal lordo (`/1,22`); caparra a 0% escl. art. 15; stipendi/contributi fuori campo a 0%; formula liquidazione (debito − credito); saldo residuo; riporto credito IVA; derivazione aliquota reale dal dettaglio fattura (cattura il reverse charge quando imposte=0); acconto **88%** e maggiorazione **1%** trimestrale corretti.

### ⚠️ Da correggere
| Sev. | File:riga | Rilievo |
|---|---|---|
| **CRITICO** | puntaNetImporter.ts:1206-1208, :1287 + ivaPdfExport.ts:165 | **Reverse charge edile (art. 17 c.6 lett. a/a-ter)** non applicato: i subappalti ricevono aliquota **10%** per nome/categoria → IVA a credito fantasma. **Aggravante:** il PDF dichiara al lettore che il reverse charge è gestito a 0%, ma nessun ramo lo applica automaticamente (solo un avviso manuale). Rischio di sottostima del debito IVA. |
| ALTO | gasCoreEngine.ts:1201 | IVA imputata alla **data del movimento (cassa)** e non alla **data fattura (esigibilità, art. 6)**: `invoiceDate` esiste ma non è usato. Errato se GV è in regime ordinario (non ha optato per "IVA per cassa" art. 32-bis). |
| ALTO | gasCoreEngine.ts:1232-1245 | Rilevamento periodicità: due versamenti in mesi consecutivi ⇒ "mensile". Ma un **trimestrale** versa a novembre (Q3) e dicembre (acconto) = consecutivi → classificato erroneamente mensile. |
| ALTO/MEDIO | puntaNetImporter.ts:1199-1228 | Aliquote assegnate per **lista di nomi fornitori** senza base normativa (materiali edili sono ordinariamente **22%**, non 10%). Fallback pericoloso quando manca il dettaglio fattura. |
| MEDIO | gasCoreEngine.ts:1207-1209 | **Detraibilità non limitata** (art. 19-bis1): auto/carburanti 40%, telefonia 50% → credito IVA gonfiato. |
| MEDIO | puntaNetImporter.ts:1308 | Scorporo con **aliquota unica** anche su movimenti ad aliquote miste (`aliquoteMiste` definito ma non gestito). |
| MEDIO | puntaNetImporter.ts:962, :1289-1290 | Affitti/cessioni immobiliari a 10% flat ignorano l'esenzione art. 10 (marginale per l'attività core). |
| BASSO | — | Split payment (art. 17-ter) verso PA non gestito; terminologia "esente/escluso/fuori campo" imprecisa (numericamente corretta a 0%). |

> Nota: alcuni rilievi IVA dipendono dal **regime effettivo di GV** (ordinario vs IVA per cassa; mensile vs trimestrale; se riceve fatture in reverse charge). Da confermare col commercialista prima del fix.

---

## 6. 🟠 Rating / DSCR / PFN

### ✅ Corretto
PFN (componenti e segno), soglie PFN/EBITDA (3x/4,5x), DSO annualizzato, cascata EBITDA→EBIT→EBT→Utile, DSCR Dashboard (CFADS/servizio debito), DSO/DPO rolling metodo "preciso", Current Ratio, Solidità patrimoniale, copertura interessi. Dati reali dalle transazioni.

### ⚠️ Da correggere
| Sev. | File:riga | Rilievo |
|---|---|---|
| **ALTA** | RatingView.tsx:112 | Doppio conteggio rimanenze in EBITDA (vedi §1) → falsa l'intero rating dell'edile. |
| MEDIA | gasCoreEngine.ts:1010-1031 | **DPO** con denominatore incompleto (solo `costo_variabile`; il numeratore è il totale debiti fornitori) → DPO sovrastimato. |
| MEDIA | gasCoreEngine.ts:1028-1031 | **Mismatch IVA** in DSO/DPO: crediti/debiti al lordo IVA vs ricavi/costi al netto → giorni sovrastimati di ~22%. |
| MEDIA | Dashboard.tsx:301-305 vs cashFlowPdfExport.ts:331 vs glossary.ts:652 | **Tre definizioni di DSCR** incoerenti (con/senza deduzione imposte) + soglia dichiarata 1,15 ma verde solo >1,25. Uniformare. |
| MEDIA | Dashboard.tsx:304 | Fallback `|| 1` sul denominatore DSCR: se non c'è servizio debito, DSCR = EBITDA intero (valore assurdo). Mostrare `N/A`. |
| BASSA | RatingView.tsx / glossary.ts:658,932 | Il glossario dichiara un **DSCR nella RatingView che non esiste** (c'è solo copertura interessi). Correggere la documentazione. |
| BASSA | RatingView.tsx:294 | Etichetta "Rating Bancario (Basilea 3)" con pesi equiponderati arbitrari: è un cruscotto gestionale (c'è disclaimer), non una metodologia Basel/PD. |
| — | tutto il codebase | **ROE/ROS non calcolati** da nessuna parte (esiste solo un ROI di commessa immobiliare). Da implementare se richiesti nel rating. |

---

## 7. ❌ Compilazione TypeScript [VERIFICATO]
`npx tsc --noEmit` → **2 errori**:
- `components/SPView.tsx:51` e `utils/gasCoreEngine.ts:1520`: gli oggetti `SPSnapshot` (`EMPTY_SNAPSHOT` e `generateDefault2025Snapshot`) **non forniscono i campi obbligatori** `creditiFinanziari` e `investimentiBT`. Il progetto **non compila pulito** (il `dist/` è potenzialmente disallineato dal sorgente). Collegato al rilievo §4 (campi PFN fantasma).

---

## 8. PIANO DI INTERVENTO CONSIGLIATO (in ordine)

1. **[CRITICO]** Eliminare il doppio conteggio della variazione rimanenze (1 fix → chiude 4 rilievi: IRES, utile, EBITDA rating, CE). §1
2. **[CRITICO]** Correggere la classificazione degli Anticipi da Clienti (default → `solo_cashflow`, non ricavo). §2.1
3. **[CRITICO IVA]** Allineare il reverse charge edile: rimuovere l'aliquota 10% automatica sui subappalti **o** implementare l'inversione contabile; correggere il testo del PDF. §5
4. **[ALTO]** Aggiungere i campi `creditiFinanziari`/`investimentiBT` a seed/`EMPTY_SNAPSHOT`/UI e includerli nell'attivo circolante (ripristina compilazione + quadratura). §4/§7
5. **[ALTO]** IVA: usare `invoiceDate` (esigibilità) e correggere il rilevamento periodicità. §5
6. **[MEDIO]** SP: sostituire i due plug con valori ufficiali; riclassificare il prestito VISMAN; aggiungere quota corrente mutuo. §4
7. **[MEDIO]** Uniformare le definizioni di DSCR + rimuovere il fallback `|| 1`; correggere denominatore DPO e mismatch IVA su DSO/DPO. §6
8. **[MEDIO]** Fisco: valutare cuneo IRAP dipendenti T.I. e deduzione IRAP-da-IRES (o dichiararle nei disclaimer). §3

> **Nota di responsabilità:** i moduli fiscali sono e restano **stime gestionali** per la pianificazione della liquidità; non sostituiscono l'elaborazione del commercialista. Dopo i fix 1-5 l'affidabilità del calcolo per lo scopo dell'app è alta.
