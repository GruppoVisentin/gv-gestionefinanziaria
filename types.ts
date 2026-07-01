
export enum TransactionType {
  INCOME = 'INCOME',
  EXPENSE = 'EXPENSE'
}

export interface RinegoziazioneMutuo {
  dataInizio: string;           // YYYY-MM-DD — da quando si applica il nuovo tasso
  nuovoTasso: number;           // percentuale annua
  nuovoTipoTasso: 'FIXED' | 'VARIABLE';
  spread?: number;              // spread sul tasso variabile (es. 1.5%)
  indiceDiRiferimento?: string; // es. "Euribor 3M", "Euribor 6M"
  note?: string;                // es. "Rinegoziazione Unicredit 2024"
}

export interface LoanDetails {
  interestRate: number;              // tasso iniziale (%)
  rateType: 'FIXED' | 'VARIABLE';
  spread?: number;                   // spread sul variabile (es. 1.5%)
  indiceDiRiferimento?: string;      // es. "Euribor 3M"
  interestStartDate: string;
  principalStartDate: string;
  endDate?: string;
  rinegoziazioni?: RinegoziazioneMutuo[];  // ← NUOVO — storico rinegoziazioni
}

export interface ExistingLoan {
  id: string;
  name: string; // Nome Banca / Prestito
  originalAmount: number; // Capitale Iniziale/Residuo
  details: LoanDetails;
}

export type CEType =
  | 'ricavo_core'          // Ricavi operativi core — entra nel CE come fatturato
  | 'ricavo_immobiliare'   // Ricavi da vendita immobili — entra nel CE come fatturato (distinto da core)
  | 'ricavo_altro'         // Altri ricavi — entra nel CE ma non è fatturato core
  | 'costo_variabile'      // Costo variabile diretto — entra nel CE
  | 'costo_fisso'          // Costo fisso struttura — entra nel CE
  | 'costo_studio'         // Personale tecnico/studio — entra nel CE (sottotipo di fisso)
  | 'ammortamento'         // Non monetario — solo CE, importo 0 nel cash flow
  | 'onere_finanziario'    // Interessi passivi — entra nel CE sotto EBITDA
  | 'provento_finanziario' // Interessi attivi / dividendi — entra nel CE sotto EBITDA
  | 'imposta_ce'           // IRES/IRAP — entra nel CE sotto EBT
  | 'solo_cashflow'        // Solo cash flow — non entra mai nel CE
  | 'capex'                // Investimento patrimoniale — non è un costo CE
  | 'straordinario'        // Proventi/Oneri straordinari — entra nel CE sotto EBT
  | 'distribuzione_utile'; // Distribuzione utile — non è un costo CE

export interface Transaction {
  id: string;
  date: string; // ISO date string YYYY-MM-DD
  amount: number; // This is now treated as the NET amount (Imponibile)
  vatRate?: number; // IVA rate (4, 10, 22, etc.)
  type: TransactionType;
  category: string;
  description: string;
  project?: string; // Commessa Name
  isForecast?: boolean; // True = Previsione, False/Undefined = Consuntivo
  linkedForecastId?: string; // ID of the forecast transaction this actual realizes
  
  // Specific for Loans (Finanziamenti)
  loanDetails?: LoanDetails;
  loanSourceId?: string; // ← NUOVO — Collega la transazione al prestito di origine

  // Natura contabile per futura integrazione CE (invisibile all'utente)
  ceType?: CEType;

  // Data fattura separata dalla data pagamento (per DSO/DPO futuri)
  invoiceDate?: string;
  sourceRef?: string; // Origine della transazione, es: "Punta Net — FEP 60/2026/E · 03/01/2026"
  importSessionId?: string;   // ← NUOVO — ID univoco della sessione di import Punta Net
  grossAmount?: number; // Exact gross amount imported from PuntaNet / bank
}

export interface IntestatarioFattura {
  id: string;
  nome: string;
  tipo: 'persona_fisica' | 'ditta';
}

export interface Project {
  id: string;
  name: string;
  client: string;
  location: string;
  jobType: string;
  startDate: string;
  status: 'ACTIVE' | 'COMPLETED';
  intestatari?: IntestatarioFattura[];   // ← NUOVO
  metodoPagamento?: 'sal' | 'acconto';   // ← NUOVO
  estimatedStartDate?: string;
  estimatedLabor?: number;
  laborType?: 'INTERNAL' | 'EXTERNAL';
  estimatedMaterials?: number;
  estimatedSubcontractors?: number;
  estimatedProfessionals?: number;
  estimatedRevenue?: number;
}

export interface BankAccount {
  id: string;
  name: string;
  balance: number;
}

export interface InitialBalanceBreakdown {
  accounts: BankAccount[];
  previousFinancing: number; // Deprecated single value (kept for compatibility sum)
  loans?: ExistingLoan[]; // New detailed list of loans
  accontiClienti?: number;
  altriDebitiBT?: number;
  mutuiBT?: number;
  imposteAnnoPrecedente?: number;
}

export interface FinancialSummary {
  totalIncome: number;
  totalExpense: number;
  balance: number;
}

// ─── DATI CE ────────────────────────────────────────────────────

export interface CERow {
  label: string;
  monthly: number[];           // 12 valori mensili (indice 0=gen, 11=dic)
  isAutoPopulated: boolean;    // true = viene da transazioni
  ceType: string;              // riferimento al ceType delle transazioni
  isEditable: boolean;         // false = solo lettura (calcolato)
}

export interface CEData {
  anno: number;
  ricaviCore: number[];        // 12 mesi
  ricaviImmobiliare: number[]; // 12 mesi — vendite immobili/terreni
  ricaviAltro: number[];       // 12 mesi
  costiVariabili: number[];    // 12 mesi
  costiFissi: number[];        // 12 mesi
  costiStudio: number[];       // 12 mesi (sottotipo di fissi)
  ammortamenti: number[];      // 12 mesi — MANUALE
  oneriFin: number[];          // 12 mesi
  proventiFin: number[];       // 12 mesi
  straordinario: number[];     // 12 mesi (netto proventi - oneri)
  imposte: number[];           // 12 mesi — MANUALE
  compensoImprenditore: number[]; // 12 mesi — da transazioni [SOCI]
}

// ─── DATI SP ────────────────────────────────────────────────────

export interface SPSnapshot {
  dataRiferimento: string;     // ISO date — es. "2024-12-31"
  // ATTIVO IMMOBILIZZATO
  immImmateriali: number;
  immMateriali: number;
  immobiliTerreni: number;
  partecipazioni: number;
  // ATTIVO CIRCOLANTE
  rimanenze: number;
  creditiClienti: number;
  creditiTributari: number;
  liquidita: number;
  // PATRIMONIO NETTO
  capitaleSociale: number;
  riserve: number;
  utileEsercizio: number;
  // PASSIVO LT
  mutuiLT: number;
  leasingLT: number;
  tfr: number;
  // PASSIVO BT
  fidiRT: number;
  debitiFornitori: number;
  debitiTributari: number;
  accontiClienti: number;
  altriDebitiBT: number;
  mutuiBT: number; // Quota corrente finanziamenti LT (entro 12m)
}

export interface RimanenzeAnno {
  // Lavori in corso su ordinazione (WIP)
  wipInizio: number;        // valore WIP a inizio anno (= fine anno precedente)
  wipFine: number;          // valore WIP a fine anno (inserito manualmente)

  // Rimanenze materiali in magazzino
  materialiInizio: number;  // valore materiali a inizio anno
  materialiFine: number;    // valore materiali a fine anno

  // Note libere (es. riferimento a perizia o inventario)
  note?: string;
}

// RimanenzeData è la mappa anno → valori
// es. { "2024": { wipInizio: 0, wipFine: 150000, ... } }
export type RimanenzeData = Record<string, RimanenzeAnno>;

// ─── DATI BUDGET ────────────────────────────────────────────────

export interface BudgetRow {
  categoria: string;
  ceType: string;
  budgetAnnuo: number;         // target manuale
  budgetMensile: number[];     // distribuzione mensile del budget (manuale o auto /12)
}

export interface BudgetData {
  anno: number;
  righe: BudgetRow[];
}

// ─── TIPOLOGIE E CANTIERI PREVISIONALI ──────────────────────────

export interface FaseDistribuzione {
    id: string;
    meseInizio: number | string;          // es. 1 per inizio cantiere, -1 per il mese prima (stringa per gestire input temporanei come "-")
    meseFine: number | string;            // es. 3 (incluso)
    durataMesi?: number;         // Deprecato: mantenuto temporaneamente per retrocompatibilità
    percentuale: number;         // % del totale da distribuire in questa fase (0-100)
    // la distribuzione dentro la fase è uniforme sui mesi della fase
  }

// Voce di costo attiva per una tipologia di cantiere
export interface VoceCostoTipologia {
  categoria: string;           // es. "[PERSONALE] Stipendi Dipendenti Operativi"
  ceType: string;              // es. "costo_variabile"
  fasi: FaseDistribuzione[];   // regole di distribuzione temporale
}

// Tipologia di cantiere con regole di distribuzione
export interface TipologiaCantiere {
  id: string;
  nome: string;                // es. "Palazzina Completa", "Solo Grezzo", "Ristrutturazione"
  descrizione?: string;
  vociAttive: VoceCostoTipologia[]; // solo le voci di costo presenti in questa tipologia
}

// Cantiere previsionale
export interface CantierePrev {
  id: string;
  nome: string;
  tipologiaId: string;         // riferimento a TipologiaCantiere.id
  dataInizio: string;          // ISO date YYYY-MM-DD
  costiStimati: Record<string, number>; // chiave: categoria, valore: importo totale stimato
  costiVatRates?: Record<string, number>; // chiave: categoria, valore: aliquota IVA (es. 22, 10, 4, 0)
  previsionaliGenerati: boolean; // true se le transazioni sono già state generate
}

export interface ImportSession {
  id: string;              // uuid univoco della sessione
  timestamp: string;       // ISO datetime dell'import
  nomeFile: string;        // nome del file banca caricato
  transazioniImportate: number;  // quante transazioni ha aggiunto
  periodoInizio: string;   // data più vecchia del batch (YYYY-MM-DD)
  periodoFine: string;     // data più recente del batch (YYYY-MM-DD)
  annullata?: boolean;     // true se già annullata
}

// ─── IMPORT STORICO EXCEL ────────────────────────────────────────

export interface TransazioneStorica {
  anno: number;
  mese: number;           // 0-11
  tipo: 'INCOME' | 'EXPENSE';
  soggetto: string;       // cliente (entrate) o categoria (uscite)
  importo: number;        // importo lordo (ivato) — niente IVA separata
  categoriaApp: string;   // categoria mappata per l'app
  ceType: string;
  includi: boolean;       // l'utente può deselezionare prima di importare
}

export interface SaldoInizialeCashFlow {
  // Anno base — saldo manuale inserito dall'utente
  annoBase: number;                    // sempre 2026
  saldoManualeConsuntivo: number;      // dal pannello Gestisci
  saldoManualePrevisionale: number;    // di default = saldoManualeConsuntivo

  // Conguagli manuali — override del previsionale per anno specifico
  // Chiave: anno (es. "2027"), valore: saldo da cui riparte il previsionale
  conguagliPrevisionali: Record<string, number>;

  // Conti correnti per anno (per anni diversi da ANNO_BASE)
  contiPerAnno: Record<string, Array<{id: string; name: string; balance: number}>>;
}

export interface BackupData {
  version: string;
  timestamp: string;
  transactions: Transaction[];
  projects: Project[];
  fixedCategories: string[];
  variableCategories: string[];
  incomeCategories: string[];
  supplierPresets: Record<string, string[]>;
  initialData?: InitialBalanceBreakdown;
  saldoInizialeCF?: SaldoInizialeCashFlow; // ← NUOVO
  operators?: any[];
  ceManualData?: Record<string, Partial<CEData>>;
  spSnapshots?: SPSnapshot[];
  budgetData?: Record<string, BudgetData>;
  oreCantiereStorico?: Record<string, number>;
  oreOperaiStorico?: Record<string, any>;
  tipologieCantiere?: TipologiaCantiere[];
  cantieriPrev?: CantierePrev[];
  rimanenze?: RimanenzeData;   // aggiunta — opzionale per retrocompatibilità
  regolePuntaNet?: any[];
  mappingContiPuntaNet?: any | null;
  bozzaImportPuntaNet?: any[]; // ← NUOVO
  importSessions?: ImportSession[];   // ← NUOVO
  storicoExcelImportato?: boolean;   // flag — impedisce doppio import accidentale
  aliquoteFiscali?: { ires: number; irap: number };
}

export enum AppView {
  HOME = 'HOME',           // ← NUOVO — schermata di ingresso
  DASHBOARD = 'DASHBOARD',
  TIMELINE = 'TIMELINE',
  COST_DISTRIBUTION = 'COST_DISTRIBUTION',
  ANALYTICS = 'ANALYTICS',
  PROJECTS = 'PROJECTS',
  TRANSACTIONS = 'TRANSACTIONS',
  ADD = 'ADD',
  SETTINGS = 'SETTINGS',
  OPERATORS = 'OPERATORS',
  // ── Moduli futuri (placeholder) ──
  BILANCIO_RIEPILOGO = 'BILANCIO_RIEPILOGO',
  CE_RICLASSIFICATO = 'CE_RICLASSIFICATO',
  STATO_PATRIMONIALE = 'STATO_PATRIMONIALE',
  BUDGET = 'BUDGET',
  RATING_BANCHE = 'RATING_BANCHE',
  ANALISI_INDICI = 'ANALISI_INDICI',
  GUIDA_KPI = 'GUIDA_KPI',
  IVA_POSIZIONE = 'IVA_POSIZIONE',
}