import { GoogleGenAI } from "@google/genai";
import { Transaction, TransactionType, SPSnapshot } from "../types";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "../constants";

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

const MODEL_NAME = 'gemini-2.5-flash';

export const suggestCategory = async (description: string, type: TransactionType): Promise<string | null> => {
  if (!apiKey) {
    console.warn("API Key is missing for Gemini.");
    return null;
  }

  try {
    const cleanDescription = (description || '')
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/["`'\\]/g, '')
      .slice(0, 300)
      .trim();

    const categories = type === TransactionType.EXPENSE ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
    const prompt = `
      Agisci come un assistente contabile per un'impresa edile italiana (Gruppo Visentin SRL).
      Analizza la seguente descrizione di transazione: "${cleanDescription}".
      
      Regole speciali:
      - Se è un incasso da cliente con parola "caparra" → [CANTIERE] Caparra Confirmatoria
      - Se è un incasso da cliente con parola "acconto", "SAL", "stato avanzamento" → [CANTIERE] SAL — Stato Avanzamento Lavori
      - Se è un incasso da cliente con parola "saldo", "saldo finale" → [CANTIERE] Saldo Finale Commessa
      - Se riguarda vendita di un immobile o terreno → [IMMOBILIARE] Vendita Immobili e Terreni
      - Se è un pagamento a dipendente (stipendio, cedolino) → categoria stipendi appropriata
      - Se è un versamento IVA o F24 → categoria fiscale appropriata
      - Se è un'assicurazione (polizza, premio) → [COMPLIANCE] Assicurazioni Generali o [MEZZI] Assicurazione Mezzi e Bolli
      
      Classifica in UNA di queste categorie: ${categories.join(', ')}.
      Rispondi SOLO con il nome della categoria esatto, niente altro.
    `;

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
    });

    const text = response.text?.trim();
    if (text && categories.includes(text)) {
      return text;
    }
    return "Altro";
  } catch (error) {
    console.error("Gemini suggestion error:", error);
    return null;
  }
};

export const generateFinancialInsights = async (transactions: Transaction[]): Promise<string> => {
  if (!apiKey) {
    return "API Key mancante. Impossibile generare analisi.";
  }
  if (transactions.length === 0) {
    return "Nessuna transazione disponibile per l'analisi.";
  }

  try {
    const csvData = transactions.map(t => 
      `${t.date}, ${t.type}, ${t.category}, ${t.amount}€, ${t.description}`
    ).join('\n');

    const prompt = `
      Sei un consulente finanziario esperto. Analizza i seguenti dati sulle transazioni (formato: Data, Tipo, Categoria, Importo, Descrizione) di un'impresa edile (Gruppo Visentin SRL):
      
      ${csvData}

      Il software calcola le performance basandosi sulle seguenti logiche:
      - Fatturato: Ricavi Core + Altro + Immobiliare.
      - Primo Margine %: (Fatturato - Costi Variabili) / Fatturato. (Target >15%).
      - EBITDA %: (Primo Margine - Costi Fissi Operativi) / Fatturato.
      - Utile Netto %: Utile dopo tasse e ammortamenti su Fatturato.
      - BEP Cassa: Punto di pareggio di cassa considerando i costi fissi operativi e le rate capitale finanziamenti (capex).
      - Incidenze e impatti delle rimanenze (WIP).

      Fornisci un'analisi breve e strategica in formato Markdown. Includi:
      1. Una panoramica generale della salute economica e di cassa.
      2. Le aree di costo critiche (variabili e fisse).
      3. 2-3 raccomandazioni concrete per allinearsi ai target ottimali di margine e sostenibilità della cassa.
      
      Usa un tono professionale, conciso e concreto. Parla in Italiano.
    `;

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
    });

    return response.text || "Impossibile generare l'analisi al momento.";
  } catch (error) {
    console.error("Gemini insight error:", error);
    return "Si è verificato un errore durante la generazione dell'analisi.";
  }
};

export const chatWithCoach = async (
  transactions: Transaction[], 
  history: { role: 'user' | 'model', text: string }[],
  userMessage: string
): Promise<string> => {
  if (!apiKey) return "API Key mancante.";
  
  try {
    const csvData = transactions.map(t => 
      `${t.date}, ${t.type}, ${t.category}, ${t.amount}€, ${t.description}`
    ).join('\n');

    const systemInstruction = `
      Sei un consulente finanziario esperto (AI Coach) per l'app Gruppo Visentin (gestione cash flow ed economico di un'impresa edile).
      Hai accesso ai dati delle transazioni dell'utente:
      ${csvData}
      
      LOGICHE E FORMULE SPECIFICHE DEL SOFTWARE (Usa queste esatte definizioni nelle risposte):
      1. Fatturato: Ricavi Core + Ricavi Altro + Ricavi Immobiliare.
      2. Primo Margine %: (Fatturato - Costi Variabili) / Fatturato. (Ottimo >=15%, Buono 10-15%, Attenzione 5-10%, Critico <5%).
      3. EBITDA % (Margine Operativo Lordo): (Primo Margine - Costi Fissi Operativi) / Fatturato. I Costi Fissi Operativi includono struttura e studio/personale ufficio, esclusi gli ammortamenti. (Ottimo >=10%, Buono 7-10%, Attenzione 4-7%, Critico <4%).
      4. Utile Netto %: (EBITDA - Ammortamenti - Oneri Finanziari + Proventi Finanziari + Straordinari - Imposte) / Fatturato. (Ottimo >=6%, Buono 4-6%, Attenzione 2-4%, Critico <2%).
      5. Punto di Pareggio (BEP Contabile): Costi Fissi Totali (con ammortamenti) / (1 - Costi Variabili / Fatturato).
      6. Punto di Pareggio di Cassa (BEP Cassa): Costi Fissi di Cassa / (1 - Costi Variabili / Fatturato). Dove Costi Fissi di Cassa = Costi Fissi Operativi (senza ammortamenti) + Quota Capitale Rate Finanziamenti (capex).
      7. Incidenza Studio %: Costi Tecnici e Personale Studio / Fatturato. (Ottimo <=15%, Buono 15-20%, Attenzione 20-25%, Critico >25%).
      8. Incidenza Fissi %: Costi Struttura e Sede / Fatturato. (Ottimo <=8%, Buono 8-12%, Attenzione 12-15%, Critico >15%).
      9. Compenso Soci (Incidenza su Utile): Compenso Soci / Utile Netto Totale. (Ottimo <=30%, Buono 30-50%, Attenzione 50-80%, Critico >80%).
      10. DSO (Days Sales Outstanding): Lag medio tra data fattura (invoiceDate) e incasso effettivo (se ci sono almeno 3 fatture); altrimenti stima fissa di 45 giorni.
      11. DPO (Days Payable Outstanding): Lag medio tra data fattura e pagamento effettivo a fornitori (se ci sono almeno 3 fatture); altrimenti stima fissa di 60 giorni.

      REGOLE EDILIZIA E DETTAGLI APPLICAZIONE:
      - La quota capitale dei prestiti/mutui è considerata capex (non costo CE) ma incide nel Cash Flow e nel calcolo del BEP Cassa.
      - La variazione delle rimanenze WIP e dei materiali a magazzino incide sull'utile di competenza e sulle basi imponibili IRES (24%) e IRAP (3,9% in Veneto).

      Rispondi alle domande dell'utente basandoti su questi dati, su queste formule del software e sulla tua esperienza.
      Se ti chiedono informazioni sulle formule o sul calcolo di un indice, rispondi spiegando esattamente le regole descritte sopra.
      Sii conciso, pratico e professionale. Parla in Italiano. Usa Markdown per formattare le risposte.
    `;

    // Convert history to Gemini format
    const contents = history.map(h => ({
      role: h.role === 'user' ? 'user' : 'model',
      parts: [{ text: h.text }]
    }));

    // Add current message
    contents.push({
      role: 'user',
      parts: [{ text: userMessage }]
    });

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents,
      config: {
        systemInstruction
      }
    });

    return response.text || "Nessuna risposta ricevuta.";
  } catch (error) {
    console.error("Gemini chat error:", error);
    return "Errore nella comunicazione con l'AI Coach.";
  }
};

export const fetchEuriborRates = async (): Promise<{
  euribor_1m: number | null;
  euribor_3m: number | null;
  euribor_6m: number | null;
  euribor_12m: number | null;
  data_aggiornamento: string;
} | null> => {
  if (!apiKey) return null;

  try {
    const prompt = `
      Cerca i tassi Euribor aggiornati ad oggi per le scadenze 1M, 3M, 6M e 12M.
      Rispondi SOLO con questo JSON senza markdown:
      {"euribor_1m": NUMBER_OR_NULL, "euribor_3m": NUMBER_OR_NULL, "euribor_6m": NUMBER_OR_NULL, "euribor_12m": NUMBER_OR_NULL, "data_aggiornamento": "GG/MM/AAAA"}
      I valori devono essere numeri decimali (es. 2.456 per 2.456%).
    `;

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
    });

    const text = response.text?.trim();
    if (!text) return null;

    const match = text.match(/\{[^{}]+\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
    return null;
  } catch (error) {
    console.error("Gemini Euribor error:", error);
    return null;
  }
};

export const parseBalanceSheetText = async (textInput: string): Promise<Partial<SPSnapshot> | null> => {
  if (!apiKey) {
    console.warn("API Key is missing for Gemini.");
    return null;
  }

  try {
    const prompt = `
      Sei un esperto contabile italiano. Analizza il seguente testo estratto da un bilancino di verifica o situazione patrimoniale fornita dal commercialista.
      Estrai e riclassifica i valori per compilare lo Stato Patrimoniale dell'impresa.
      
      Dati da cercare e mappare (cerca corrispondenze anche parziali o sinonimi tipici dei conti italiani):
      - immImmateriali (Immobilizzazioni immateriali, brevetti, marchi, spese impianto/sviluppo)
      - immMateriali (Immobilizzazioni materiali, macchinari, attrezzature, computer, automezzi, impianti)
      - immobiliTerreni (Fabbricati, terreni, immobili di proprietà civile o industriale)
      - partecipazioni (Partecipazioni in altre imprese, titoli a lungo termine)
      - rimanenze (Magazzino, rimanenze finali, lavori in corso su ordinazione, WIP)
      - creditiClienti (Crediti v/clienti, fatture da emettere, crediti commerciali)
      - creditiTributari (Crediti per imposte, IVA a credito, crediti tributari vari)
      - liquidita (Cassa, banca c/c attivi, disponibilità liquide)
      - capitaleSociale (Capitale sociale, capitale deliberato/sottoscritto)
      - riserve (Riserva legale, riserva straordinaria, sovrapprezzo azioni, utili portati a nuovo)
      - utileEsercizio (Utile o perdita d'esercizio)
      - mutuiLT (Mutui passivi oltre 12 mesi, finanziamenti a lungo termine da banche o altri)
      - leasingLT (Debiti per leasing a lungo termine, locazione finanziaria LT)
      - tfr (Trattamento fine rapporto dipendenti, fondo TFR)
      - fidiRT (Fidi bancari, anticipi su fatture, banche c/c passivi, scoperti a breve termine)
      - debitiFornitori (Debiti v/fornitori, fatture da ricevere, debiti commerciali)
      - debitiTributari (Debiti tributari, debiti previdenziali/assistenziali, IVA a debito, imposte da pagare, INPS, INAIL, Erario c/ritenute)
      - accontiClienti (Acconti da clienti, debiti per acconti)
      - altriDebitiBT (Altri debiti a breve termine, debiti v/soci per finanziamenti infruttiferi, debiti diversi entro 12m)
      - mutuiBT (Quota corrente mutui/leasing entro 12m)

      IMPORTANTE:
      - Se trovi saldi espressi in formato italiano (es. con punti come separatori delle migliaia e virgole per i decimali, o con indicazione "Dare" / "Avere"), convertili correttamente in numeri JavaScript (es. "832.211,28" o "832211,28" diventa 832211.28).
      - Ritorna esclusivamente un oggetto JSON piatto contenente solo le chiavi identificate (con valori numerici positivi o negativi a seconda del segno contabile corretto). Ometti le chiavi non trovate o non specificate nel testo.
      - Non includere spiegazioni, formattazioni markdown extra o markdown block, rispondi SOLO con il JSON.
      
      Testo del bilancio da analizzare:
      ---
      ${textInput}
      ---
    `;

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
    });

    const text = response.text?.trim();
    if (!text) return null;

    const match = text.match(/\{[\s\S]+\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
    return null;
  } catch (error) {
    console.error("Gemini parse balance sheet error:", error);
    return null;
  }
};

export const generateForecastInsights = async (metricsPrev: any, rates: any): Promise<string> => {
  if (!apiKey) {
    return "";
  }
  try {
    const prompt = `
      Sei un AI Coach finanziario per l'impresa edile Gruppo Visentin SRL.
      Analizza questi dati PREVISIONALI (target/pianificati) calcolati per l'anno in corso:
      - Fatturato Previsionale: ${new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(metricsPrev.fatturato)}
      - Primo Margine Previsionale %: ${new Intl.NumberFormat('it-IT', { style: 'percent', minimumFractionDigits: 1 }).format(metricsPrev.primoMarginePercent)}
      - EBITDA Previsionale %: ${new Intl.NumberFormat('it-IT', { style: 'percent', minimumFractionDigits: 1 }).format(metricsPrev.ebitdaPercent)}
      - Utile Netto Previsionale %: ${new Intl.NumberFormat('it-IT', { style: 'percent', minimumFractionDigits: 1 }).format(metricsPrev.utileNettoPercent)}
      - Punto di Pareggio (BEP) Previsionale: ${new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(metricsPrev.breakEven)}
      - Incidenza Studio Previsionale: ${new Intl.NumberFormat('it-IT', { style: 'percent', minimumFractionDigits: 1 }).format(rates.incidenzaStudioFatturatoPrev)}
      - Incidenza Fissi Previsionale: ${new Intl.NumberFormat('it-IT', { style: 'percent', minimumFractionDigits: 1 }).format(rates.incidenzaFissiFatturatoPrev ?? 0)}
      
      Fornisci una breve valutazione strategica e 3 azioni correttive concrete suggerite dall'AI per raggiungere o consolidare questi target previsionali. Sii sintetico e diretto. Parla in italiano. Usa un formato elenco puntato chiaro in Markdown.
    `;
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
    });
    return response.text || "";
  } catch (e) {
    console.error("Gemini forecast insight error:", e);
    return "";
  }
};

export const generateCardInsight = async (
  cardId: number,
  label: string,
  value: string,
  fasciaColore: string,
  desc: string,
  extraContext?: string
): Promise<string> => {
  if (!apiKey) return "";
  try {
    const livello = {
      ottimo: 'OTTIMO (target raggiunto e superato)',
      buono: 'BUONO (in linea con i target)',
      attenzione: 'ATTENZIONE (deviazione dai target — monitoraggio necessario)',
      critico: 'CRITICO (soglia di sicurezza superata — azione urgente richiesta)',
    }[fasciaColore] ?? fasciaColore;

    const prompt = `
      Sei un AI Coach finanziario per Gruppo Visentin SRL, impresa edile italiana.
      Un indicatore chiave del controllo di gestione ha raggiunto questo valore:

      - Indicatore: ${label}
      - Descrizione: ${desc}
      - Valore attuale (consuntivo YTD): ${value}
      - Livello di performance: ${livello}
      ${extraContext ? `- Contesto aggiuntivo: ${extraContext}` : ''}

      Fornisci UNA sola azione correttiva concreta, specifica e immediatamente attuabile per questo indicatore.
      Tono professionale, diretto, massimo 2-3 frasi. Parla in italiano. 
      ${fasciaColore === 'ottimo' || fasciaColore === 'buono' 
        ? 'Il valore è positivo: dai un consiglio per mantenere o consolidare la performance.' 
        : 'Il valore richiede attenzione: dai un consiglio correttivo urgente e pratico.'}
      Non usare markdown, rispondi solo con il testo dell'azione.
    `;
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
    });
    return response.text?.trim() || "";
  } catch (e) {
    console.error("Gemini card insight error:", e);
    return "";
  }
};

export const generateFinancialReportPDFAnalysis = async (data: any): Promise<string> => {
  if (!apiKey) {
    return "API Key mancante per l'analisi AI.";
  }

  try {
    const prompt = `
      Agisci come il CFO (Chief Financial Officer) esperto di "Gruppo Visentin SRL", un'impresa edile.
      Il CEO sta leggendo il Report di Cash Flow (Consuntivo vs Previsionale) e ti ha chiesto un'analisi direzionale e consigli operativi su come ottimizzare le risorse.

      I dati sintetici sono i seguenti:
      - Entrate Consuntive (da inizio anno ad oggi): ${data.actualIncome} €
      - Uscite Consuntive: ${data.actualExpense} €
      - Flusso di cassa netto consuntivo: ${data.actualNet} €
      
      - Entrate Previsionali (da oggi a fine anno): ${data.forecastIncome} €
      - Uscite Previsionali: ${data.forecastExpense} €
      - Flusso di cassa netto previsionale: ${data.forecastNet} €
      
      - Saldo di cassa teorico a fine anno: ${data.endOfYearBalance} €

      Elabora un breve documento Markdown che:
      1. Evidenzi in modo critico ma professionale il trend attuale (stiamo bruciando cassa o creando valore?).
      2. Metti a confronto l'andamento reale vs quello che ci aspetta (previsionale).
      3. Fornisci 3 azioni correttive (es. negoziazione scadenze fornitori, accelerazione incassi, rinegoziazione debiti) mirate e pratiche per l'impresa edile, in base alla situazione (se c'è deficit, fai raccomandazioni dure; se c'è surplus, consiglia come allocarlo/proteggerlo).

      Restituisci ESCLUSIVAMENTE testo formattato in Markdown (titoli H2, H3, elenchi puntati), senza altri preamboli.
    `;

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
    });

    return response.text?.trim() || "Nessuna analisi generata.";
  } catch (error) {
    console.error("Gemini PDF analysis error:", error);
    return "Errore durante la generazione dell'analisi AI.";
  }
};
