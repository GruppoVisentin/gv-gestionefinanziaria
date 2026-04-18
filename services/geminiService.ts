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
      Sei un consulente finanziario esperto. Analizza i seguenti dati sulle transazioni (formato: Data, Tipo, Categoria, Importo, Descrizione):
      
      ${csvData}

      Fornisci un'analisi breve e utile in formato Markdown. Includi:
      1. Una panoramica generale della salute finanziaria.
      2. Le principali aree di spesa.
      3. 2-3 consigli pratici e azionabili per risparmiare o ottimizzare il budget basati su questi dati specifici.
      
      Usa un tono professionale ma amichevole. Parla in Italiano.
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
      Sei un consulente finanziario esperto (AI Coach) per l'app Gruppo Visentin.
      Hai accesso ai dati delle transazioni dell'utente:
      ${csvData}
      
      Rispondi alle domande dell'utente basandoti su questi dati e sulla tua esperienza finanziaria.
      Sii conciso, pratico e professionale. Parla in Italiano.
      Usa Markdown per formattare le risposte.
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
