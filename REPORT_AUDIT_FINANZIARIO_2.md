# Secondo Report di Audit Tecnico-Finanziario
**GV GestioneFINANZIARIA v1.0**
*Redatto dal team congiunto di Analisi Finanziaria ed Ingegneria del Software*

---

## 1. Introduzione ed Metodologia
Questo documento costituisce la seconda parte dell'audit approfondito dell'applicazione **GV GestioneFINANZIARIA v1.0**. In questa fase ci siamo concentrati sugli algoritmi di allocazione dei costi industriali (costo orario della manodopera), le logiche di calcolo delle imposte IRES, l'ingestione avanzata dei file banca (PuntaNet), la stabilità dei report esportati in PDF e le residue vulnerabilità legate ai fusi orari locali.

---

## 2. Nuova Tabella delle Valutazioni per Componente (Stato Attuale)

Di seguito viene riportato lo stato delle valutazioni per i moduli analizzati in questa seconda fase:

| # | Modulo / Focus | File Principali Analizzati | Voto Attuale | Criticità Rilevate |
|---|---|---|---|---|
| **1** | 🔢 **Core Engine & Fiscale** | `gasCoreEngine.ts` | **9.0 / 10** | L'IRES viene calcolata sull'EBIT invece che sull'EBT, ignorando la deducibilità degli oneri finanziari. |
| **2** | 📥 **Import / Ingestione** | `puntaNetImporter.ts` | **8.5 / 10** | Verifica del formato Prima Nota basata su indice fisso (`headers[8]`) ed estrazione importo cablata su `row[5]`. |
| **3** | 📊 **Financial & Rating Views** | `AnalisiView.tsx`, `RatingView.tsx` | **8.0 / 10** | Allocazione asimmetrica di stipendi/contributi non agganciati (con perdita di dati) e rating PFN/EBITDA errato con EBITDA negativo. |
| **4** | 📅 **Timeline & Wizards** | `TransactionForm.tsx`, `Wizards.tsx` | **8.5 / 10** | Shift di date all'indietro di un giorno/anno per fuso orario negativo durante l'inizializzazione o il salvataggio ricorrente. |
| **5** | 📄 **PDF Export Utilities** | `pdfExport.ts`, `cashFlowPdfExport.ts` | **8.5 / 10** | Errore `NaN €` nel minimo di cassa del report Cash Flow e distorsione verticale (stretching) nelle catture multi-pagina. |

---

## 3. Registro dei Nuovi Bug Rilevati: Cause e Soluzioni

### 🚨 Bug 7: Verifica Fragile `isPrimaNota` e Colonne Cablate nell'Importatore
* **File di riferimento:** [puntaNetImporter.ts](file:///e:/Direzione/Desktop/gv-gestionefinanziaria-1.0/utils/puntaNetImporter.ts#L676-L690)
* **Causa:** In `parseDettaglioFEA` si verifica se il foglio importato è una Prima Nota (es. estratto conto bancario) controllando strettamente se `headers[8] === 'BANCA' || headers[8] === 'CONTO'`. Se vero, si estrae l'importo della riga dalla colonna fissa `row[5]`. Se il layout delle colonne nel file Excel importato subisce uno shift (anche di una sola colonna), la verifica fallisce: il file viene trattato erroneamente come un dettaglio fatture FEA (che somma sotto-righe) e l'importo della transazione viene impostato a `0`.
* **Soluzione Proposta:** Rendere la rilevazione e l'estrazione dinamiche cercando la colonna di flag banca/conto in tutti gli header e identificando la colonna importo tramite parole chiave ("IMPORTO", "ENTRATE", "VALORE", "TOTALE") con fallback sul comportamento precedente.
* **Codice Proposto:**
```diff
-        const isPrimaNota = headers[8] === 'BANCA' || headers[8] === 'CONTO';
-        const rowAmount = (isPrimaNota && typeof row[5] === 'number') ? row[5] : 0;
+        const indexBancaConto = headers.findIndex(h => h === 'BANCA' || h === 'CONTO');
+        const isPrimaNota = indexBancaConto !== -1;
+        const indexAmountPrimaNota = findHeaderIndex(headers, ['IMPORTO', 'ENTRATE', 'ENTRAT', 'AVERE', 'VALORE', 'TOTALE'], 5);
+        const rowAmount = (isPrimaNota && typeof row[indexAmountPrimaNota] === 'number') ? row[indexAmountPrimaNota] : 0;
```

---

### 🚨 Bug 8: Perdita dei Salari non Riconciliati ed Errata Allocazione dei Contributi
* **File di riferimento:** [AnalisiView.tsx](file:///e:/Direzione/Desktop/gv-gestionefinanziaria-1.0/components/AnalisiView.tsx#L252-L320)
* **Causa:** Nella schermata di analisi del costo orario, il software cerca di associare le transazioni dei salari reali ai singoli operai confrontando i nomi nella descrizione. Se almeno un operaio viene associato con successo (`sumMatchedActual > 0`), le transazioni dei dipendenti che non hanno avuto un match (es. per piccoli refusi o diciture generiche come "Acconto stipendi") vengono **completamente scartate** dal calcolo. Inoltre, i contributi previdenziali totali (`totContributiActual`) vengono distribuiti solo tra gli operai matchati in base alla quota del loro stipendio, gonfiando artificialmente il loro costo orario reale e lasciando gli altri operai con un costo orario di `0 €/ora`.
* **Soluzione Proposta:** Distribuire l'eventuale quota di stipendi non allocati (`totStipendiActual - sumMatchedActual`) proporzionalmente alle ore lavorate da tutti gli operai. In questo modo il totale complessivo allocato corrisponderà sempre esattamente al dato di bilancio ( ground truth) e nessun operaio risulterà a costo zero.
* **Codice Proposto:**
```diff
     const sumMatchedActual = matchedActualSalaries.reduce((a, b) => a + b, 0);
     const sumMatchedPrev = matchedPrevSalaries.reduce((a, b) => a + b, 0);
 
-    // Fallback if no names matched
-    if (sumMatchedActual === 0 && list.length > 0) {
-      const totHours = list.reduce((a, b) => a + (b.oreConsuntivo || 0), 0);
-      matchedActualSalaries = list.map(w => {
-        if (totHours > 0) {
-          return totStipendiActual * ((w.oreConsuntivo || 0) / totHours);
-        }
-        return totStipendiActual / list.length;
-      });
-    }
-
-    if (sumMatchedPrev === 0 && list.length > 0) {
-      const totHoursPrev = list.reduce((a, b) => a + (b.orePrevisionale || 0), 0);
-      matchedPrevSalaries = list.map(w => {
-        if (totHoursPrev > 0) {
-          return totStipendiPrev * ((w.orePrevisionale || 0) / totHoursPrev);
-        }
-        return totStipendiPrev / list.length;
-      });
-    }
+    const totHours = list.reduce((a, b) => a + (b.oreConsuntivo || 0), 0);
+    const unallocatedActual = Math.max(0, totStipendiActual - sumMatchedActual);
+    let matchedActualSalariesAdjusted = list.map((w, idx) => {
+      const matched = matchedActualSalaries[idx] || 0;
+      const share = totHours > 0 ? (w.oreConsuntivo || 0) / totHours : 1 / list.length;
+      return matched + unallocatedActual * share;
+    });
+    if (sumMatchedActual > totStipendiActual && sumMatchedActual > 0) {
+      matchedActualSalariesAdjusted = matchedActualSalaries.map(val => val * (totStipendiActual / sumMatchedActual));
+    }
+
+    const totHoursPrev = list.reduce((a, b) => a + (b.orePrevisionale || 0), 0);
+    const unallocatedPrev = Math.max(0, totStipendiPrev - sumMatchedPrev);
+    let matchedPrevSalariesAdjusted = list.map((w, idx) => {
+      const matched = matchedPrevSalaries[idx] || 0;
+      const share = totHoursPrev > 0 ? (w.orePrevisionale || 0) / totHoursPrev : 1 / list.length;
+      return matched + unallocatedPrev * share;
+    });
+    if (sumMatchedPrev > totStipendiPrev && sumMatchedPrev > 0) {
+      matchedPrevSalariesAdjusted = matchedPrevSalaries.map(val => val * (totStipendiPrev / sumMatchedPrev));
+    }
```

---

### 🚨 Bug 9: Visualizzazione di `NaN €` nel Minimo di Cassa del PDF Cash Flow
* **File di riferimento:** [cashFlowPdfExport.ts](file:///e:/Direzione/Desktop/gv-gestionefinanziaria-1.0/utils/cashFlowPdfExport.ts#L310-L313)
* **Causa:** Il calcolo di `minBalance` estrae i saldi mensili dalla matrice `tableRows` filtrando per le celle che contengono oggetti. Tuttavia, le righe di riepilogo trimestrale contengono la cella `{ content: '-', ... }` nella colonna dei saldi progressivi. L'algoritmo esegue `parseFloat('-')`, che restituisce `NaN`. La presenza di anche un solo valore non numerico fa sì che `Math.min` restituisca `NaN`, stampando a video nel report `Punto di Minimo Previsto: NaN €`.
* **Soluzione Proposta:** Escludere esplicitamente i valori segnaposto `'-'` dal calcolo dei minimi.
* **Codice Proposto:**
```diff
-  const minBalance = Math.min(...tableRows.filter(r => typeof r[4] === 'object').map(r => {
-      const val = r[4].content.replace(/[^0-9,-]/g, '').replace(',', '.');
-      return parseFloat(val);
-  }));
+  const parsedBalances = tableRows
+    .filter(r => typeof r[4] === 'object' && r[4].content !== '-')
+    .map(r => {
+      const val = r[4].content.replace(/[^0-9,-]/g, '').replace(',', '.');
+      return parseFloat(val);
+    })
+    .filter(val => !isNaN(val));
+  const minBalance = parsedBalances.length > 0 ? Math.min(...parsedBalances) : 0;
```

---

### 🚨 Bug 10: Distorsione Verticale (Stretching) dei Grafici e Tabelle nei PDF Multilivello
* **File di riferimento:** [pdfExport.ts](file:///e:/Direzione/Desktop/gv-gestionefinanziaria-1.0/utils/pdfExport.ts#L119-L122)
* **Causa:** Quando la pagina da esportare supera l'altezza disponibile di un singolo foglio A4, l'esportatore divide lo snapshot grafico in più fette verticali di altezza `sliceH`. Durante la scrittura del file jsPDF, ogni fetta viene forzata ad occupare l'altezza massima `altezzaDisponibile` della pagina. Poiché `altezzaDisponibile` è solitamente maggiore dell'altezza proporzionale della fetta reale, il documento finale risulta allungato verticalmente su ogni pagina successiva alla prima, distorcendo visivamente grafici e testi.
* **Soluzione Proposta:** Calcolare l'altezza di rendering nel PDF in modo proporzionale all'altezza effettiva dei pixel della fetta di canvas esportata.
* **Codice Proposto:**
```diff
-        const sliceH_pdf = altezzaDisponibile;
+        const sliceH_pdf = (sliceCanvas.height / canvas.height) * imgPdfH;
         pdf.addImage(sliceData, 'PNG', 10,
           i === 0 ? margineTop : 14,
           imgPdfW, sliceH_pdf);
```

---

### 🚨 Bug 11: Base Imponibile IRES Calcolata sull'EBIT Anziché sull'EBT
* **File di riferimento:** [gasCoreEngine.ts](file:///e:/Direzione/Desktop/gv-gestionefinanziaria-1.0/utils/gasCoreEngine.ts#L684-L685)
* **Causa:** Nella stima fiscale, la variabile `baseImponibileIRES` viene determinata partendo da `ebitCompetenza = ceMetrics.ebitTot`. In Italia, la base imponibile IRES per le società di capitali si calcola partendo dal risultato ante imposte (EBT, *Earnings Before Taxes*), non dal risultato operativo (EBIT). Utilizzando l'EBIT si escludono gli oneri finanziari (interessi passivi sui finanziamenti), portando a una base imponibile sovrastimata e a imposte stimate sensibilmente più alte rispetto alla realtà aziendale.
* **Soluzione Proposta:** Sostituire l'EBIT con l'EBT (che include gli oneri finanziari deducibili) per la determinazione dell'imponibile IRES.
* **Codice Proposto:**
```diff
-  const ebitCompetenza = includeForecast ? ceMetrics.proiezioneEbit : ceMetrics.ebitTot;
-  const baseImponibileIRES = Math.max(0, ebitCompetenza + variazioneRimanenze);
+  const ebtCompetenza = includeForecast ? ceMetrics.proiezioneEbt : ceMetrics.ebtTot;
+  const baseImponibileIRES = Math.max(0, ebtCompetenza + variazioneRimanenze);
```

---

### 🚨 Bug 12: Shift Temporale all'Indietro per Fusi Orari Negativi nei Wizard e Form
* **File di riferimento:** [Wizards.tsx](file:///e:/Direzione/Desktop/gv-gestionefinanziaria-1.0/components/Wizards.tsx#L174), [TransactionForm.tsx](file:///e:/Direzione/Desktop/gv-gestionefinanziaria-1.0/components/TransactionForm.tsx#L178-L180), e date di default
* **Causa:** L'inizializzazione di date fittizie o odierne mediante `new Date(year, 0, 1).toISOString()` o `new Date().toISOString().split('T')[0]` converte la data locale del browser in UTC. Per gli utenti situati in fusi orari negativi o durante le ore serali a cavallo della mezzanotte, questo sposta la data di default al giorno (o all'anno) precedente (es: `2025-12-31` anziché `2026-01-01`), inquinando la classificazione per anno fiscale.
* **Soluzione Proposta:** Usare stringhe statiche per date fisse (es: `${targetYear}-01-01`) o estrarre i componenti della data in modo isolato tramite string manipulation per le date ricorrenti.
* **Codice Proposto:**
```diff
// In Wizards.tsx riga 174:
-      date: new Date(targetYear, 0, 1).toISOString().split('T')[0],
+      date: `${targetYear}-01-01`,

// In TransactionForm.tsx riga 178-180:
-        const selectedDate = new Date(date);
-        const year = selectedDate.getFullYear();
-        const day = selectedDate.getDate();
+        const parts = date.split('-');
+        const year = parseInt(parts[0], 10);
+        const day = parseInt(parts[2], 10);
```

---

## 4. Allineamento Repository Locale vs Cartella di Rete NAS
Dall'analisi dei repository Git è emerso che:
1. Il codice presente sul disco locale `E:\Direzione\Desktop\gv-gestionefinanziaria-1.0` contiene già tutti i fix eseguiti con successo nel precedente round (compilazione `SPView.tsx`, shift fuso orario banca, rimozione doppio conteggio oneri, rating per aziende debt-free).
2. Il codice presente nella cartella condivisa di rete `\\NAS\Ufficio Tecnico\GRUPPO VISENTIN\00_GESTIONE GV\35_APP GV ECOSISTEM\04-GV GestioneFINANZIARIA\gv-gestionefinanziaria-1.0` **non è ancora aggiornato** ed è indietro di 2 commit rispetto al ramo locale e a GitHub.

**Raccomandazione:** Non appena verranno approvati questi nuovi fix, provvederemo a integrare le modifiche in entrambi i percorsi ed a eseguire un allineamento completo del codice sul NAS per garantire la sincronizzazione di tutto l'ecosistema aziendale.
