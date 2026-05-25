import { GoogleGenAI } from "@google/genai";
import { Transaction, TransactionType } from "../types";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "../constants";

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

const MODEL_NAME = 'gemini-3-flash-preview';

export const suggestCategory = async (description: string, type: TransactionType): Promise<string | null> => {
  if (!apiKey) {
    console.warn("API Key is missing for Gemini.");
    return null;
  }

  try {
    const categories = type === TransactionType.EXPENSE ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
    const prompt = `
      Agisci come un assistente contabile per un'impresa edile italiana (Gruppo Visentin SRL).
      Analizza la seguente descrizione di transazione: "${description}".
      
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
