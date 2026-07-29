# SPECIFICA FIX ESEGUIBILE (parte 2) — GV GestioneFINANZIARIA v1.0
## Continuazione per agente esecutore (Antigravity) — ESEGUIRE ALLA LETTERA

**Prerequisito:** questo file contiene i BLOCCHI 4, 5, 6. Sono **indipendenti** dai Blocchi 1/2/SP e possono essere applicati in qualsiasi ordine rispetto a quelli.
**File toccati:** `components/ImportPuntaNetModal.tsx`, `components/Dashboard.tsx`, `utils/ivaPdfExport.ts`.

---

## ⛔ REGOLE VINCOLANTI (leggere prima di iniziare)
1. Applica **SOLO ed ESATTAMENTE** le sostituzioni dei BLOCCHI 4, 5, 6. Nient'altro.
2. Ogni sostituzione è un **find/replace letterale**: il testo in `CERCA` deve essere trovato **identico carattere per carattere**, inclusi spazi, virgole, backtick e indentazione. Se non lo trovi identico → **FERMATI e segnala**. NON improvvisare.
3. **NON riformattare**, non cambiare indentazione, non riordinare, non rinominare, non "migliorare" altro.
4. **NON modificare** file diversi dai tre indicati.
5. I numeri di riga sono indicativi; l'ancora vera è il testo in `CERCA`.
6. Al termine esegui la **VERIFICA** in fondo. Se fallisce, **ripristina** e segnala.
7. **Nessun commit, push o deploy** salvo istruzione esplicita separata.
8. Lingua del codice invariata (commenti in italiano). Non tradurre nulla.

---

# BLOCCO 4 — Import IVA: nessuna aliquota "inventata"; righe senza IVA restano "da precisare"
**Priorità: MEDIA. 3 modifiche in `components/ImportPuntaNetModal.tsx`. Rischio: medio (cambia il comportamento dell'import).**

**Contesto:** quando l'IVA non è ricavabile dal dato della fattura, oggi l'app la "indovina" dal nome del fornitore/categoria e importa un'aliquota potenzialmente errata. Si vuole invece: leggere l'IVA dal dato quando c'è; se non c'è, lasciare la riga "da precisare" (`vatRateSuggerito = null`) e **non renderla importabile** finché l'operatore non inserisce l'aliquota. Lo 0% strutturale (fuori campo/esente) resta automatico. Le righe non determinate confluiscono nella bozza sospesa già gestita da `onAggiornaBozza`.

### Modifica 4.1 — blocco di fallback dell'aliquota (≈ riga 450)
CERCA (esatto):
```
        if (!vatRateSuggerito) {
          // Se la categoria è stata assegnata dall'euristica, proviamo a prendere il VAT standard da quella categoria!
          vatRateSuggerito = categoria ? suggerisciAliquotaIVADaCategoria(categoria) : auto.vatRateSuggerito;
          vatRateNota = categoria ? `Aliquota standard per categoria` : auto.vatRateNota;
        }
```
SOSTITUISCI CON:
```
        if (!vatRateSuggerito) {
          // NON inventare un'aliquota positiva dal nome/categoria: l'IVA va letta dal dato della fattura.
          // Se non è ricavabile, la riga resta "da precisare" (vatRateSuggerito = null) e ricade nel
          // flusso di revisione/sospensione: l'aliquota dovrà essere inserita manualmente prima della conferma.
          // Unica eccezione accettata in automatico: lo 0% STRUTTURALE (fuori campo / esente — stipendi,
          // contributi, tasse, caparre, ecc.), che non è un'aliquota "indovinata" ma certa per natura del flusso.
          const guess = categoria ? suggerisciAliquotaIVADaCategoria(categoria) : auto.vatRateSuggerito;
          if (guess === 0) {
            vatRateSuggerito = 0;
            vatRateNota = auto.vatRateNota ?? 'Fuori campo / esente';
          } else {
            vatRateSuggerito = null;
            vatRateNota = 'IVA non presente nei dati — da precisare';
          }
        }
```

### Modifica 4.2 — gating dell'import nella funzione `importa` (≈ riga 527)
CERCA (esatto):
```
      const daImportare = righe.filter(r => r.confermata && r.categoria && r.ceType && !r.isDuplicato);
      const daSospendere = righe.filter(r => (!r.confermata || !r.categoria || !r.ceType) && !r.isDuplicato);
```
SOSTITUISCI CON:
```
      // Una riga è importabile solo se ha anche l'IVA determinata (letta dal dato o inserita a mano).
      // Le righe con IVA "da precisare" (vatRate null) restano sospese nella bozza per la precisazione manuale.
      const ivaDeterminata = (r: typeof righe[number]) => (r.vatRateConfermato ?? r.vatRateSuggerito) !== null;
      const daImportare = righe.filter(r => r.confermata && r.categoria && r.ceType && ivaDeterminata(r) && !r.isDuplicato);
      const daSospendere = righe.filter(r => (!r.confermata || !r.categoria || !r.ceType || !ivaDeterminata(r)) && !r.isDuplicato);
```

### Modifica 4.3 — pulsante "Conferma tutte" (≈ riga 1127)
CERCA (esatto):
```
              <button onClick={() => setRighe(righe.map(r => ({ ...r, confermata: r.categoria !== null && !r.isDuplicato })))} className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-900">Conferma tutte</button>
```
SOSTITUISCI CON:
```
              <button onClick={() => setRighe(righe.map(r => ({ ...r, confermata: r.categoria !== null && (r.vatRateConfermato ?? r.vatRateSuggerito) !== null && !r.isDuplicato })))} className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-900">Conferma tutte</button>
```

---

# BLOCCO 5 — DSCR: "N/A" quando non c'è servizio del debito
**Priorità: BASSA. 1 modifica in `components/Dashboard.tsx`. Rischio: basso.**

**Contesto:** il fallback `|| 1` sul denominatore produce un DSCR assurdo (es. "500000x") quando interessi + quota capitale = 0. Si restituisce invece una sentinella `-1` che la UI mostra già come "N/A".

### Modifica 5.1 (≈ riga 304)
CERCA (esatto):
```
    const dscrDenominatore = (ceMetrics.oneriFin + ceMetrics.costiCapitaleRate) || 1;
    return { score, label, color, dscr: cfads / dscrDenominatore, breakdown, radarData, spMetrics };
```
SOSTITUISCI CON:
```
    // Se non c'è servizio del debito (interessi + quota capitale = 0), il DSCR non è definito:
    // -1 come sentinella → la UI lo mostra come "N/A" invece di un valore assurdo (era: fallback " || 1").
    const dscrDenominatore = ceMetrics.oneriFin + ceMetrics.costiCapitaleRate;
    const dscr = dscrDenominatore > 0 ? cfads / dscrDenominatore : -1;
    return { score, label, color, dscr, breakdown, radarData, spMetrics };
```

---

# BLOCCO 6 — Testo PDF IVA sul reverse charge allineato al comportamento reale
**Priorità: BASSA (documentale). 1 modifica in `utils/ivaPdfExport.ts`. Rischio: nullo (solo testo).**

**Contesto:** il PDF dichiarava che il reverse charge è gestito in automatico a 0%. Si allinea al comportamento effettivo: l'app legge lo 0% dal dato della fattura; se il dato manca, la riga resta "da precisare".

### Modifica 6.1 (≈ riga 165)
CERCA (esatto):
```
    `• REGIME DEL REVERSE CHARGE IN EDILIZIA (ART. 17 D.P.R. 633/1972): In applicazione dell'Art. 17, comma 6, lett. a) del D.P.R. 633/1972, le prestazioni di subappalto rese nel settore edile sono soggette al meccanismo di inversione contabile. Il subappaltatore emette fattura senza addebito d'imposta, e l'appaltatore (Gruppo Visentin) integra la fattura registrando l'IVA sia a debito che a credito. Di conseguenza, i relativi flussi di cassa non includono esborsi IVA verso il subappaltatore (flusso di cassa IVA pari a 0%).\n\n` +
```
SOSTITUISCI CON:
```
    `• REGIME DEL REVERSE CHARGE IN EDILIZIA (ART. 17 D.P.R. 633/1972): In applicazione dell'Art. 17, comma 6, lett. a) del D.P.R. 633/1972, le prestazioni di subappalto rese nel settore edile sono soggette al meccanismo di inversione contabile: il subappaltatore emette fattura senza addebito d'imposta e l'appaltatore (Gruppo Visentin) integra la fattura registrando l'IVA sia a debito sia a credito, con flusso di cassa IVA pari a 0. L'applicazione rileva tale condizione dal dato della fattura importata (imposta pari a zero) e la riporta ad aliquota 0%; qualora l'informazione IVA non sia desumibile dall'importazione, l'operazione resta in stato "da precisare" e l'aliquota va confermata manualmente dall'operatore prima dell'importazione.\n\n` +
```

---

## ✅ VERIFICA (dopo i BLOCCHI 4, 5, 6)
1. Esegui:
```
npx tsc --noEmit
```
   **Atteso:** nessun errore nuovo introdotto da questi blocchi.
2. Esegui:
```
npm run build
```
   **Atteso:** build completata senza errori.
3. **Controllo funzionale import (Blocco 4):** importando un movimento bancario senza dettaglio fattura e non strutturalmente a 0%, la riga deve comparire come **"IVA da precisare"** e **non** deve essere importabile finché non si seleziona l'aliquota; le voci fuori campo (stipendi, F24, contributi) restano a 0% in automatico.

## Riepilogo file toccati
| File | N. sostituzioni | Blocco |
|---|---|---|
| `components/ImportPuntaNetModal.tsx` | 3 | 4 |
| `components/Dashboard.tsx` | 1 | 5 |
| `utils/ivaPdfExport.ts` | 1 | 6 |

(Totale: **5 sostituzioni**.)

Fine specifica (parte 2).
