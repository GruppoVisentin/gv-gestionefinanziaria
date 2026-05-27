import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Transaction, 
  AppView, 
  TransactionType, 
  Project, 
  InitialBalanceBreakdown, 
  BackupData, 
  CEData, 
  BudgetData, 
  SPSnapshot,
  CERow,
  BudgetRow,
  TipologiaCantiere,
  CantierePrev,
  RimanenzeAnno,
  RimanenzeData,
  SaldoInizialeCashFlow,
  BankAccount
} from './types';
import Dashboard from './components/Dashboard';
import TransactionList from './components/TransactionList';
import TransactionForm from './components/TransactionForm';
import InsightPanel from './components/InsightPanel';
import IncomeTimeline from './components/IncomeTimeline';
import ExpenseTimeline from './components/ExpenseTimeline';
import CashFlowTimeline from './components/CashFlowTimeline';
import ProjectManager from './components/ProjectManager';
import AnalyticsView from './components/AnalyticsView';
import CategoryManager from './components/CategoryManager';
import ProjectCostDistribution from './components/ProjectCostDistribution';
import SecureResponsibleWidget from './components/SecureResponsibleWidget';
import OperatorManager from './components/OperatorManager';
import HomeScreen from './components/HomeScreen';
import CEView from './components/CEView';
import SPView from './components/SPView';
import BudgetView from './components/BudgetView';
import RatingView from './components/RatingView';
import AnalisiView from './components/AnalisiView';
import GuidaKPIView from './components/GuidaKPIView';
import IVAView from './components/IVAView';
import BilancioView from './components/BilancioView';
import Footer from './components/Footer';
import TermModal, { useTermModal } from './components/TermModal';
import ImportPuntaNetModal from './components/ImportPuntaNetModal';
import ImportStoricoModal from './components/ImportStoricoModal';
import { 
  FIXED_COST_CATEGORIES, 
  VARIABLE_COST_CATEGORIES, 
  INCOME_CATEGORIES, 
  SUPPLIER_PRESETS,
  CATEGORY_MIGRATION_MAP,
  CATEGORY_TO_CE_TYPE
} from './constants';
import { 
  YearStartWizard, 
  TipologiaManager, 
  CantiereWizard 
} from './components/Wizards';
import { 
  LayoutDashboard, 
  LayoutGrid,
  List, 
  PlusCircle, 
  TableProperties, 
  Briefcase, 
  BarChart2, 
  Settings, 
  ChevronLeft, 
  ChevronRight, 
  Sparkles,
  CalendarClock,
  Save,
  Download,
  TrendingUp,
  Building2,
  Target,
  ShieldCheck,
  BookOpen,
  FileCode,
  FolderOpen,
  Plus,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Receipt
} from 'lucide-react';
import { 
  getHandleFromIDB, 
  saveHandleToIDB, 
  requestPermission, 
  readFile, 
  writeFile, 
  openExistingFile, 
  createNewFile,
  clearHandleFromIDB,
  saveBackupHandleToIDB,
  getBackupHandleFromIDB,
  clearBackupHandleFromIDB,
  saveRulesHandleToIDB,
  getRulesHandleFromIDB,
  clearRulesHandleFromIDB,
  readRulesFile,
  writeRulesFile
} from './services/fileStorage';

interface WelcomeScreenProps {
  pendingHandleFromIDB: FileSystemFileHandle | null;
  handleConfirmIDBHandle: () => void;
  handleOpenExisting: () => void;
  handleCreateNew: () => void;
  handleMigrateFromLocalStorage: () => void;
  handleDemoMode: () => void;
  hasLocalStorageData: boolean;
  isFileSystemSupported: boolean;
}

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  pendingHandleFromIDB,
  handleConfirmIDBHandle,
  handleOpenExisting,
  handleCreateNew,
  handleMigrateFromLocalStorage,
  handleDemoMode,
  hasLocalStorageData,
  isFileSystemSupported
}) => (
  <div className="fixed inset-0 z-[100] bg-[#222222] flex items-center justify-center p-4 font-sans overflow-y-auto">
    <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
      {/* Left: Branding */}
      <div className="text-white space-y-6">
        <div className="flex items-center gap-4">
          <div className="bg-black w-16 h-16 rounded-2xl flex items-center justify-center text-white shadow-2xl">
            <span className="text-4xl font-black">V</span>
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tighter uppercase leading-none">Gruppo Visentin</h1>
            <p className="text-slate-400 font-bold text-sm tracking-widest uppercase mt-1">GV Ecosystem</p>
          </div>
        </div>
        
        <div className="space-y-4">
          <h2 className="text-5xl font-black leading-[0.9] tracking-tight">
            Gestione <br />
            <span className="text-white/40 italic">Finanziaria</span> <br />
            Evoluta.
          </h2>
          <p className="text-slate-400 text-lg leading-relaxed max-w-md font-medium">
            Benvenuto nel sistema di controllo GV. Scegli come iniziare per accedere ai tuoi dati finanziari in tempo reale.
          </p>
        </div>

        <div className="flex items-center gap-6 pt-4">
          <div className="flex -space-x-3">
            {[1,2,3].map(i => (
              <div key={i} className="w-10 h-10 rounded-full border-2 border-slate-900 bg-slate-800 flex items-center justify-center overflow-hidden">
                <img src={`https://picsum.photos/seed/user${i}/100/100`} alt="user" className="w-full h-full object-cover opacity-60" referrerPolicy="no-referrer" />
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">
            Utilizzato dal team <br /> Gruppo Visentin
          </p>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="bg-white rounded-[2.5rem] p-8 md:p-12 shadow-2xl space-y-8">
        {pendingHandleFromIDB ? (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
            <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-100 flex items-center justify-center text-blue-600 shrink-0 shadow-lg">
                <FileCode size={24} />
              </div>
              <div>
                <h3 className="font-black text-slate-900 text-lg leading-tight">File trovato</h3>
                <p className="text-sm text-slate-600 mt-1">
                  È stato rilevato il file <span className="font-bold text-slate-900">gv-cashflow.gvcf</span> dall'ultima sessione.
                </p>
              </div>
            </div>
            
            <button 
              onClick={handleConfirmIDBHandle}
              className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black text-lg hover:bg-slate-800 transition-all active:scale-[0.98] shadow-xl flex items-center justify-center gap-3"
            >
              <FolderOpen size={24} />
              Apri file rilevato
            </button>

            <div className="relative py-4">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100"></div></div>
              <div className="relative flex justify-center text-xs uppercase font-black text-slate-400 tracking-widest bg-white px-4">Oppure</div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button onClick={handleOpenExisting} className="p-4 rounded-2xl border-2 border-slate-100 hover:border-slate-400 hover:bg-slate-50 transition-all group">
                <Plus size={20} className="text-slate-400 group-hover:text-slate-900 mb-2" />
                <span className="block text-xs font-black text-slate-900 uppercase">Sfoglia</span>
              </button>
              <button onClick={handleCreateNew} className="p-4 rounded-2xl border-2 border-slate-100 hover:border-slate-900 hover:bg-slate-50 transition-all group">
                <FileCode size={20} className="text-slate-400 group-hover:text-slate-900 mb-2" />
                <span className="block text-xs font-black text-slate-900 uppercase">Nuovo</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="space-y-2">
              <h3 className="text-2xl font-black text-slate-900 tracking-tight">Inizia ora</h3>
              <p className="text-slate-500 text-sm font-medium">Seleziona un'opzione per caricare i dati.</p>
            </div>

            <div className="space-y-4">
              <button 
                onClick={handleOpenExisting}
                className="w-full group flex items-center gap-4 p-6 rounded-3xl border-2 border-slate-100 hover:border-slate-900 hover:bg-slate-50 transition-all text-left"
              >
                <div className="w-14 h-14 rounded-2xl bg-amber-100 flex items-center justify-center text-amber-600 group-hover:bg-amber-600 group-hover:text-white transition-colors shadow-sm">
                  <FolderOpen size={28} />
                </div>
                <div>
                  <h4 className="font-black text-slate-900 uppercase text-sm tracking-wider">Apri file esistente</h4>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">Seleziona il tuo gv-cashflow.gvcf</p>
                </div>
              </button>

              <button 
                onClick={handleCreateNew}
                className="w-full group flex items-center gap-4 p-6 rounded-3xl border-2 border-slate-100 hover:border-slate-900 hover:bg-slate-50 transition-all text-left"
              >
                <div className="w-14 h-14 rounded-2xl bg-emerald-100 flex items-center justify-center text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors shadow-sm">
                  <Plus size={28} />
                </div>
                <div>
                  <h4 className="font-black text-slate-900 uppercase text-sm tracking-wider">Crea nuovo file</h4>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">Inizia una nuova gestione da zero</p>
                </div>
              </button>

              <button 
                onClick={handleDemoMode}
                className="w-full group flex items-center gap-4 p-6 rounded-3xl border-2 border-slate-100 bg-slate-50/30 hover:border-slate-900 hover:bg-slate-50 transition-all text-left"
              >
                <div className="w-14 h-14 rounded-2xl bg-purple-100 flex items-center justify-center text-purple-600 group-hover:bg-purple-600 group-hover:text-white transition-colors shadow-sm">
                  <Sparkles size={28} />
                </div>
                <div>
                  <h4 className="font-black text-slate-900 uppercase text-sm tracking-wider">Modalità Demo (solo anteprima)</h4>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">Esplora l'app senza salvare file (ideale per AI Studio)</p>
                </div>
              </button>

              {hasLocalStorageData && (
                <button 
                  onClick={handleMigrateFromLocalStorage}
                  className="w-full group flex items-center gap-4 p-6 rounded-3xl border-2 border-slate-100 bg-slate-50/30 hover:border-slate-900 hover:bg-slate-50 transition-all text-left"
                >
                  <div className="w-14 h-14 rounded-2xl bg-rose-100 flex items-center justify-center text-rose-600 group-hover:bg-rose-600 group-hover:text-white transition-colors shadow-sm">
                    <RefreshCw size={28} />
                  </div>
                  <div>
                    <h4 className="font-black text-slate-900 uppercase text-sm tracking-wider">Migra dati locali</h4>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">Recupera i dati salvati nel browser</p>
                  </div>
                </button>
              )}
            </div>

            {!isFileSystemSupported && (
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex gap-3">
                <AlertCircle size={18} className="text-slate-500 shrink-0" />
                <p className="text-[10px] text-slate-700 font-bold leading-tight uppercase">
                  Attenzione: Il tuo browser non supporta il salvataggio diretto su file. 
                  L'app funzionerà in modalità provvisoria (backup manuale richiesto).
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  </div>
);

function mergeRegole(listA: any[], listB: any[]): any[] {
  const map = new Map<string, any>();
  if (Array.isArray(listB)) {
    listB.forEach(r => {
      if (r && r.entityKey) map.set(r.entityKey.trim().toUpperCase(), r);
    });
  }
  if (Array.isArray(listA)) {
    listA.forEach(r => {
      if (r && r.entityKey) map.set(r.entityKey.trim().toUpperCase(), r);
    });
  }
  return Array.from(map.values());
}

function getGlobalRules(): any[] {
  try {
    const cached = localStorage.getItem('gv_global_rules');
    return cached ? JSON.parse(cached) : [];
  } catch (e) {
    console.error("Errore lettura gv_global_rules", e);
    return [];
  }
}

const App: React.FC = () => {
  const [view, setView] = useState<AppView>(AppView.HOME);
  
  const isFileSystemSupported = 'showOpenFilePicker' in window;
  const hasLocalStorageData = !!localStorage.getItem('transactions');

  // File Storage States
  const [fileHandle, setFileHandle] = useState<FileSystemFileHandle | null>(null);
  const [backupFileHandle, setBackupFileHandle] = useState<FileSystemFileHandle | null>(null);
  const [rulesFileHandle, setRulesFileHandle] = useState<FileSystemFileHandle | null>(null);
  const [appState, setAppState] = useState<'loading' | 'welcome' | 'ready'>('loading');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [pendingHandleFromIDB, setPendingHandleFromIDB] = useState<FileSystemFileHandle | null>(null);
  const [pendingBackupHandleFromIDB, setPendingBackupHandleFromIDB] = useState<FileSystemFileHandle | null>(null);
  const [pendingRulesHandleFromIDB, setPendingRulesHandleFromIDB] = useState<FileSystemFileHandle | null>(null);

  const isCashFlowView = [
    AppView.DASHBOARD, 
    AppView.TIMELINE, 
    AppView.TRANSACTIONS, 
    AppView.ADD, 
    AppView.ANALYTICS, 
    AppView.COST_DISTRIBUTION
  ].includes(view);

  const isManagementView = [
    AppView.CE_RICLASSIFICATO,
    AppView.STATO_PATRIMONIALE,
    AppView.BUDGET,
    AppView.RATING_BANCHE,
    AppView.ANALISI_INDICI,
    AppView.GUIDA_KPI
  ].includes(view);

  // Year State for Timeline Navigation
  const [timelineYear, setTimelineYear] = useState(new Date().getFullYear());
  
  // Auth State & Operators Management
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [currentUser, setCurrentUser] = useState("");
  
  // Persist Operators (Responsibles)
  const [responsiblesList, setResponsiblesList] = useState<string[]>(["admin"]);

  // Transactions State
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  // Projects State
  const [projects, setProjects] = useState<Project[]>([]);

  // Categories State (Dynamic)
  const [fixedCategories, setFixedCategories] = useState<string[]>([...FIXED_COST_CATEGORIES]);

  const [variableCategories, setVariableCategories] = useState<string[]>([...VARIABLE_COST_CATEGORIES]);

  const [incomeCategories, setIncomeCategories] = useState<string[]>([...INCOME_CATEGORIES]);

  // Dynamic Supplier Presets
  const [supplierPresets, setSupplierPresets] = useState<Record<string, string[]>>({...SUPPLIER_PRESETS});

  // Initial Balance State (Detailed)
  const [initialData, setInitialData] = useState<InitialBalanceBreakdown>({ 
    accounts: [], 
    previousFinancing: 0, 
    loans: [], 
    accontiClienti: 0, 
    altriDebitiBT: 0, 
    mutuiBT: 0 
  });

  const [saldoInizialeCF, setSaldoInizialeCF] = useState<SaldoInizialeCashFlow>({
    annoBase: 2026,
    saldoManualeConsuntivo: 0,
    saldoManualePrevisionale: 0,
    conguagliPrevisionali: {},
    contiPerAnno: {},
  });

  // --- NEW: MANAGEMENT CONTROL STATES ---
  const [ceManualData, setCeManualData] = useState<Record<string, Partial<CEData>>>({});

  const [spSnapshots, setSpSnapshots] = useState<SPSnapshot[]>([]);

  const [budgetData, setBudgetData] = useState<Record<string, BudgetData>>({});

  const [oreStorico, setOreStorico] = useState<Record<string, number>>({});

  // SV-B: Tipologie e Cantieri Previsionali
  const [tipologieCantiere, setTipologieCantiere] = useState<TipologiaCantiere[]>([]);
  const [cantieriPrev, setCantieriPrev] = useState<CantierePrev[]>([]);
  const [rimanenze, setRimanenze] = useState<RimanenzeData>({});

  const [regolePuntaNet, setRegolePuntaNet] = useState<import('./utils/puntaNetImporter').RegolaMapping[]>([]);
  const [mappingContiPuntaNet, setMappingContiPuntaNet] = useState<import('./utils/puntaNetImporter').MappingConto | null>(null);
  const [bozzaImportPuntaNet, setBozzaImportPuntaNet] = useState<import('./utils/puntaNetImporter').RigaClassificata[]>([]);
  const [importSessions, setImportSessions] = useState<import('./types').ImportSession[]>([]);
  const [fileBanca, setFileBanca] = useState<File | null>(null);
  const [fileFEP, setFileFEP] = useState<File | null>(null);
  const [fileFEA, setFileFEA] = useState<File | null>(null);
  const [fileFEA2, setFileFEA2] = useState<File | null>(null);
  const [showImportPuntaNet, setShowImportPuntaNet] = useState(false);
  const [showImportStorico, setShowImportStorico] = useState(false);
  const [storicoImportato, setStoricoImportato]   = useState(false);

  const [aliquotaIRES, setAliquotaIRES] = useState<number>(24);
  const [aliquotaIRAP, setAliquotaIRAP] = useState<number>(3.9);

  // Help & Navigation States
  const [guidaInitialTab, setGuidaInitialTab] = useState<'manuale' | 'glossario'>('manuale');
  const [guidaInitialSection, setGuidaInitialSection] = useState<string | undefined>(undefined);

  const handleGoToManuale = (section?: string, tab?: 'manuale' | 'glossario') => {
    if (tab) setGuidaInitialTab(tab);
    setGuidaInitialSection(section);
    setView(AppView.GUIDA_KPI);
  };

  const { activeTermId, closeTerm } = useTermModal();

  // Wizards Visibility
  const [showYearStartWizard, setShowYearStartWizard] = useState(false);
  const [showCantiereWizard, setShowCantiereWizard] = useState(false);

  // Scroll Synchronization Refs
  const incomeScrollRef = useRef<HTMLDivElement>(null);
  const expenseScrollRef = useRef<HTMLDivElement>(null);
  const cashFlowScrollRef = useRef<HTMLDivElement>(null);

  // --- SCROLL SYNCHRONIZATION ---
  useEffect(() => {
    if (view !== AppView.TIMELINE) return;

    // Small delay to ensure refs are populated after view change
    const timer = setTimeout(() => {
      const income = incomeScrollRef.current;
      const expense = expenseScrollRef.current;
      const cashFlow = cashFlowScrollRef.current;

      if (!income || !expense || !cashFlow) return;

      const handleScroll = (e: Event) => {
        const source = e.target as HTMLDivElement;
        const targets = [income, expense, cashFlow].filter(t => t && t !== source);
        
        targets.forEach(target => {
          if (target && target.scrollLeft !== source.scrollLeft) {
            target.scrollLeft = source.scrollLeft;
          }
        });
      };

      income.addEventListener('scroll', handleScroll, { passive: true });
      expense.addEventListener('scroll', handleScroll, { passive: true });
      cashFlow.addEventListener('scroll', handleScroll, { passive: true });

      return () => {
        income.removeEventListener('scroll', handleScroll);
        expense.removeEventListener('scroll', handleScroll);
        cashFlow.removeEventListener('scroll', handleScroll);
      };
    }, 100);

    return () => clearTimeout(timer);
  }, [view]);

  // --- DATA STRUCTURES & PERSISTENCE ---

  const buildBackupData = useCallback((): BackupData => ({
    version: '4.0',
    timestamp: new Date().toISOString(),
    transactions,
    projects,
    fixedCategories,
    variableCategories,
    incomeCategories,
    supplierPresets,
    initialData,
    saldoInizialeCF,
    operators: responsiblesList,
    ceManualData,
    spSnapshots,
    budgetData,
    oreCantiereStorico: oreStorico,
    tipologieCantiere,
    cantieriPrev,
    rimanenze,
    regolePuntaNet,
    mappingContiPuntaNet,
    bozzaImportPuntaNet,
    importSessions,
    storicoExcelImportato: storicoImportato,
    aliquoteFiscali: { ires: aliquotaIRES, irap: aliquotaIRAP },
  }), [
    transactions, projects, fixedCategories, variableCategories, incomeCategories, 
    supplierPresets, initialData, responsiblesList, ceManualData, spSnapshots, 
    budgetData, oreStorico, tipologieCantiere, cantieriPrev, rimanenze,
    regolePuntaNet, mappingContiPuntaNet, bozzaImportPuntaNet, importSessions, storicoImportato, aliquotaIRES, aliquotaIRAP
  ]);

  // Ref che mantiene sempre l'ultima versione di buildBackupData
  // senza causare il reset dell'interval di auto-save
  const buildBackupDataRef = useRef(buildBackupData);
  useEffect(() => {
    buildBackupDataRef.current = buildBackupData;
  }, [buildBackupData]);

  const loadFromData = useCallback((data: BackupData) => {
    if (data.transactions) setTransactions(data.transactions);
    if (data.projects) setProjects(data.projects);
    
    let loadedFixed = data.fixedCategories || [...FIXED_COST_CATEGORIES];
    let loadedVar = data.variableCategories || [...VARIABLE_COST_CATEGORIES];
    
    const quotaCapitaleCat = "[FINANZA] Quota Capitale Rate Finanziamenti";
    if (loadedVar.includes(quotaCapitaleCat)) {
      loadedVar = loadedVar.filter(c => c !== quotaCapitaleCat);
    }
    if (!loadedFixed.includes(quotaCapitaleCat)) {
      // Find the financial category index or append it
      loadedFixed = [...loadedFixed, quotaCapitaleCat];
    }
    
    setFixedCategories(loadedFixed);
    setVariableCategories(loadedVar);
    if (data.incomeCategories) setIncomeCategories(data.incomeCategories);
    if (data.supplierPresets) setSupplierPresets(data.supplierPresets);
    if (data.initialData) setInitialData(data.initialData);
    if (data.saldoInizialeCF) {
      setSaldoInizialeCF({
        ...data.saldoInizialeCF,
        contiPerAnno: data.saldoInizialeCF.contiPerAnno || {}
      });
    } else if (data.initialData?.accounts) {
      const tot = data.initialData.accounts.reduce((s: number, a: BankAccount) => s + a.balance, 0);
      setSaldoInizialeCF(prev => ({
        ...prev,
        saldoManualeConsuntivo: tot,
        saldoManualePrevisionale: tot,
      }));
    }
    if (data.operators) setResponsiblesList(data.operators);
    if (data.ceManualData) setCeManualData(data.ceManualData);
    if (data.spSnapshots) setSpSnapshots(data.spSnapshots);
    if (data.budgetData) setBudgetData(data.budgetData);
    if (data.oreCantiereStorico) setOreStorico(data.oreCantiereStorico);
    if (data.tipologieCantiere) setTipologieCantiere(data.tipologieCantiere);
    if (data.cantieriPrev) setCantieriPrev(data.cantieriPrev);
    if (data.rimanenze) setRimanenze(data.rimanenze);
    if (data.regolePuntaNet) {
      setRegolePuntaNet(mergeRegole(data.regolePuntaNet, getGlobalRules()));
    } else {
      setRegolePuntaNet(getGlobalRules());
    }
    if (data.mappingContiPuntaNet) setMappingContiPuntaNet(data.mappingContiPuntaNet);
    if (data.bozzaImportPuntaNet) setBozzaImportPuntaNet(data.bozzaImportPuntaNet);
    if (data.importSessions) setImportSessions(data.importSessions);
    if (data.storicoExcelImportato) setStoricoImportato(data.storicoExcelImportato);
    if (data.aliquoteFiscali) {
      setAliquotaIRES(data.aliquoteFiscali.ires);
      setAliquotaIRAP(data.aliquoteFiscali.irap);
    }
  }, []);

  const saveToFile = useCallback(async (handle: FileSystemFileHandle, backupHandle?: FileSystemFileHandle | null) => {
    try {
      setSaveStatus('saving');
      const data = buildBackupDataRef.current(); // ← legge sempre l'ultima versione
      await writeFile(handle, data);
      
      // Salva in parallelo sul file di backup su Drive se configurato
      if (backupHandle) {
        try {
          await writeFile(backupHandle, data);
        } catch (err) {
          console.error("Errore scrittura file di backup di sicurezza", err);
        }
      }
      
      setLastSaved(new Date());
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (e) {
      console.error('Save failed', e);
      setSaveStatus('error');
    }
  }, []); // ← array vuoto: saveToFile non cambia mai → interval non si resetta mai

  // --- INITIALIZATION ---
  useEffect(() => {
    const init = async () => {
      if (!isFileSystemSupported) {
        setAppState('ready'); // Fallback mode
        return;
      }
      const handle = await getHandleFromIDB();
      if (handle) {
        setPendingHandleFromIDB(handle);
      }
      const backupHandle = await getBackupHandleFromIDB();
      if (backupHandle) {
        setPendingBackupHandleFromIDB(backupHandle);
      }
      const rulesHandle = await getRulesHandleFromIDB();
      if (rulesHandle) {
        setPendingRulesHandleFromIDB(rulesHandle);
      }
      setAppState('welcome');
    };
    init();
  }, [isFileSystemSupported]);

  // --- SYNC RULES ---
  useEffect(() => {
    if (appState !== 'ready') return;
    
    // 1. Sync to localStorage (Opzione A)
    try {
      localStorage.setItem('gv_global_rules', JSON.stringify(regolePuntaNet));
    } catch (e) {
      console.error("Errore scrittura gv_global_rules", e);
    }
    
    // 2. Sync to Rules File if linked (Opzione B/C)
    if (rulesFileHandle) {
      writeRulesFile(rulesFileHandle, regolePuntaNet).catch(err => {
        console.error("Errore scrittura file regole", err);
      });
    }
  }, [regolePuntaNet, rulesFileHandle, appState]);

  // --- AUTO-SAVE ---
  useEffect(() => {
    if (!fileHandle || appState !== 'ready') return;
    
    const interval = setInterval(() => {
      saveToFile(fileHandle, backupFileHandle);
    }, 3 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fileHandle, backupFileHandle, appState, saveToFile]);

  // --- KEYBOARD SHORTCUTS ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (fileHandle) saveToFile(fileHandle, backupFileHandle);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [fileHandle, backupFileHandle, saveToFile]);

  // --- SALVATAGGIO ALLA CHIUSURA BROWSER ---
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!fileHandle) return;
      // Tenta salvataggio best-effort (asincrono, potrebbe non completare)
      saveToFile(fileHandle, backupFileHandle);
      // Se ci sono modifiche non ancora salvate, avvisa l'utente
      if (saveStatus !== 'saved') {
        e.preventDefault();
        e.returnValue = 'Ci sono modifiche non salvate. Uscire comunque?';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [fileHandle, backupFileHandle, saveStatus, saveToFile]);

  // --- HANDLERS ---
  const handleDownloadBackup = useCallback(async (forceFallback: boolean = false) => {
    try {
      const data = buildBackupData();
      const fileName = `gv_backup_${new Date().toISOString().split('T')[0]}.json`;
      const json = JSON.stringify(data, null, 2);

      let useFallback = forceFallback || !('showSaveFilePicker' in window);

      if (!useFallback) {
        try {
          const opts = {
            suggestedName: fileName,
            types: [{
              description: 'Backup File JSON',
              accept: { 'application/json': ['.json'] },
            }],
          };
          // @ts-ignore
          const handle = await window.showSaveFilePicker(opts);
          await writeFile(handle, data);
          setFileHandle(handle);
          saveHandleToIDB(handle);
          setSaveStatus('saved');
          setLastSaved(new Date());
          return;
        } catch (error: any) {
          if (error.name === 'AbortError') return;
          if (error.name === 'SecurityError') {
            useFallback = true;
          } else {
            throw error;
          }
        }
      }

      if (useFallback) {
        const blob = new Blob([json], { type: 'application/json' });
        const href = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = href;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(href);
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error("Backup error", error);
        setSaveStatus('error');
      }
    }
  }, [buildBackupData]);

  const handleOpenExisting = useCallback(async () => {
    const result = await openExistingFile();
    if (result) {
      loadFromData(result.data);
      setFileHandle(result.handle);
      await saveHandleToIDB(result.handle);
      
      // Chiedi autorizzazione per il file di Backup di Sicurezza se presente
      if (pendingBackupHandleFromIDB) {
        const hasBackupPerm = await requestPermission(pendingBackupHandleFromIDB);
        if (hasBackupPerm) {
          setBackupFileHandle(pendingBackupHandleFromIDB);
        } else {
          console.warn("Permesso negato per il file di backup. Scollegato.");
          await clearBackupHandleFromIDB();
        }
        setPendingBackupHandleFromIDB(null);
      }
      
      // Chiedi autorizzazione per il file delle Regole se presente
      if (pendingRulesHandleFromIDB) {
        const hasRulesPerm = await requestPermission(pendingRulesHandleFromIDB);
        if (hasRulesPerm) {
          setRulesFileHandle(pendingRulesHandleFromIDB);
          try {
            const fileRegole = await readRulesFile(pendingRulesHandleFromIDB);
            if (fileRegole && fileRegole.length > 0) {
              setRegolePuntaNet(prev => mergeRegole(prev, fileRegole));
            }
          } catch (e) {
            console.error("Errore lettura regole", e);
          }
        } else {
          console.warn("Permesso negato per il file delle regole. Scollegato.");
          await clearRulesHandleFromIDB();
        }
        setPendingRulesHandleFromIDB(null);
      }
      
      setAppState('ready');
    }
  }, [loadFromData, pendingBackupHandleFromIDB, pendingRulesHandleFromIDB]);

  const handleCreateNew = useCallback(async () => {
    const result = await createNewFile(buildBackupData());
    if (result) {
      setFileHandle(result.handle);
      await saveHandleToIDB(result.handle);
      
      // Chiedi autorizzazione per il file di Backup di Sicurezza se presente
      if (pendingBackupHandleFromIDB) {
        const hasBackupPerm = await requestPermission(pendingBackupHandleFromIDB);
        if (hasBackupPerm) {
          setBackupFileHandle(pendingBackupHandleFromIDB);
        } else {
          console.warn("Permesso negato per il file di backup. Scollegato.");
          await clearBackupHandleFromIDB();
        }
        setPendingBackupHandleFromIDB(null);
      }
      
      // Chiedi autorizzazione per il file delle Regole se presente
      if (pendingRulesHandleFromIDB) {
        const hasRulesPerm = await requestPermission(pendingRulesHandleFromIDB);
        if (hasRulesPerm) {
          setRulesFileHandle(pendingRulesHandleFromIDB);
          try {
            const fileRegole = await readRulesFile(pendingRulesHandleFromIDB);
            if (fileRegole && fileRegole.length > 0) {
              setRegolePuntaNet(prev => mergeRegole(prev, fileRegole));
            }
          } catch (e) {
            console.error("Errore lettura regole", e);
          }
        } else {
          console.warn("Permesso negato per il file delle regole. Scollegato.");
          await clearRulesHandleFromIDB();
        }
        setPendingRulesHandleFromIDB(null);
      }
      
      setAppState('ready');
    }
  }, [buildBackupData, pendingBackupHandleFromIDB, pendingRulesHandleFromIDB]);

  const handleConfirmIDBHandle = useCallback(async () => {
    if (!pendingHandleFromIDB) return;
    const hasPermission = await requestPermission(pendingHandleFromIDB);
    if (hasPermission) {
      const data = await readFile(pendingHandleFromIDB);
      if (data) {
        loadFromData(data);
        setFileHandle(pendingHandleFromIDB);
        
        // Permesso sequenziale per il file di Backup di Sicurezza
        if (pendingBackupHandleFromIDB) {
          const hasBackupPerm = await requestPermission(pendingBackupHandleFromIDB);
          if (hasBackupPerm) {
            setBackupFileHandle(pendingBackupHandleFromIDB);
          } else {
            console.warn("Permesso negato per il file di backup. Scollegato.");
            await clearBackupHandleFromIDB();
          }
          setPendingBackupHandleFromIDB(null);
        }
        
        // Permesso sequenziale per il file delle Regole
        if (pendingRulesHandleFromIDB) {
          const hasRulesPerm = await requestPermission(pendingRulesHandleFromIDB);
          if (hasRulesPerm) {
            setRulesFileHandle(pendingRulesHandleFromIDB);
            try {
              const fileRegole = await readRulesFile(pendingRulesHandleFromIDB);
              if (fileRegole && fileRegole.length > 0) {
                setRegolePuntaNet(prev => mergeRegole(prev, fileRegole));
              }
            } catch (err) {
              console.error("Errore caricamento regole da file", err);
            }
          } else {
            console.warn("Permesso negato per il file delle regole. Scollegato.");
            await clearRulesHandleFromIDB();
          }
          setPendingRulesHandleFromIDB(null);
        }
        
        setAppState('ready');
      }
    } else {
      // If permission denied, go back to welcome without pending
      setPendingHandleFromIDB(null);
    }
  }, [pendingHandleFromIDB, pendingBackupHandleFromIDB, pendingRulesHandleFromIDB, loadFromData]);

  const handleMigrateFromLocalStorage = useCallback(async () => {
    // Read all current states (which might have been loaded from localStorage if we didn't clear them yet)
    // Actually, we cleared the initializers, so we need to read from localStorage manually here
    const getLocal = (key: string) => {
      const val = localStorage.getItem(key);
      return val ? JSON.parse(val) : null;
    };

    const localData: BackupData = {
      version: '4.0-migrated',
      timestamp: new Date().toISOString(),
      transactions: getLocal('transactions') || [],
      projects: getLocal('projects') || [],
      fixedCategories: getLocal('fixedCategories') || FIXED_COST_CATEGORIES,
      variableCategories: getLocal('variableCategories') || VARIABLE_COST_CATEGORIES,
      incomeCategories: getLocal('incomeCategories') || INCOME_CATEGORIES,
      supplierPresets: getLocal('supplierPresets') || SUPPLIER_PRESETS,
      initialData: getLocal('initialBalanceData') || { accounts: [], previousFinancing: 0, loans: [], accontiClienti: 0, altriDebitiBT: 0, mutuiBT: 0 },
      operators: getLocal('operators') || ["admin"],
      ceManualData: getLocal('ceManualData') || {},
      spSnapshots: getLocal('spSnapshots') || [],
      budgetData: getLocal('budgetData') || {},
      oreCantiereStorico: getLocal('gv_ore_cantiere') || {},
      tipologieCantiere: getLocal('tipologieCantiere') || [],
      cantieriPrev: getLocal('cantieriPrev') || [],
      rimanenze: getLocal('rimanenze') || {}
    };

    const result = await createNewFile(localData);
    if (result) {
      loadFromData(localData);
      setFileHandle(result.handle);
      await saveHandleToIDB(result.handle);
      
      // Clear localStorage
      localStorage.clear();
      setAppState('ready');
    }
  }, [loadFromData]);

  const handleChangeFile = useCallback(async () => {
    const result = await createNewFile(buildBackupData());
    if (result) {
      setFileHandle(result.handle);
      await saveHandleToIDB(result.handle);
    }
  }, [buildBackupData]);

  const handleDemoMode = useCallback(() => {
    setAppState('ready');
  }, []);

  const handleSetBackupFile = useCallback(async () => {
    try {
      // @ts-ignore
      const handle = await window.showSaveFilePicker({
        suggestedName: 'backup-cashflow.gvcf',
        types: [{
          description: 'GV Cash Flow Backup',
          accept: { 'application/json': ['.gvcf', '.json'] },
        }],
      });
      if (handle) {
        setBackupFileHandle(handle);
        await saveBackupHandleToIDB(handle);
        // Scrive subito i dati correnti nel file di backup
        const data = buildBackupData();
        await writeFile(handle, data);
        alert("Backup di sicurezza configurato con successo!");
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        alert("Errore durante la configurazione del backup: " + e.message);
      }
    }
  }, [buildBackupData]);

  const handleClearBackupFile = useCallback(async () => {
    if (confirm("Sei sicuro di voler scollegare il file di backup di sicurezza? I salvataggi non verranno più specchiati su Google Drive.")) {
      setBackupFileHandle(null);
      await clearBackupHandleFromIDB();
    }
  }, []);

  const handleLinkRulesFile = useCallback(async () => {
    try {
      // @ts-ignore
      const [handle] = await window.showOpenFilePicker({
        types: [{
          description: 'File Regole GV',
          accept: { 'application/json': ['.json'] },
        }],
        multiple: false
      });
      if (handle) {
        setRulesFileHandle(handle);
        await saveRulesHandleToIDB(handle);
        // Carica e unisce le regole
        const fileRegole = await readRulesFile(handle);
        setRegolePuntaNet(prev => {
          const merged = mergeRegole(prev, fileRegole);
          writeRulesFile(handle, merged).catch(console.error);
          return merged;
        });
        alert("File regole collegato e sincronizzato con successo!");
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        alert("Errore durante il collegamento del file regole: " + e.message);
      }
    }
  }, []);

  const handleCreateRulesFile = useCallback(async () => {
    try {
      // @ts-ignore
      const handle = await window.showSaveFilePicker({
        suggestedName: 'gv-regole.json',
        types: [{
          description: 'File Regole GV',
          accept: { 'application/json': ['.json'] },
        }],
      });
      if (handle) {
        setRulesFileHandle(handle);
        await saveRulesHandleToIDB(handle);
        // Salva le regole correnti nel nuovo file
        await writeRulesFile(handle, regolePuntaNet);
        alert("Nuovo file regole creato e collegato con successo!");
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        alert("Errore durante la creazione del file regole: " + e.message);
      }
    }
  }, [regolePuntaNet]);

  const handleClearRulesFile = useCallback(async () => {
    if (confirm("Sei sicuro di voler scollegare il file delle regole? Le modifiche alle regole non verranno più scritte su questo file.")) {
      setRulesFileHandle(null);
      await clearRulesHandleFromIDB();
    }
  }, []);

  // --- UI LOGIC ---

  // Helper to extract clean supplier name (remove invoice ref)
  const extractSupplierName = (description: string): string => {
      // Remove " (Rif. ...)" from end of string
      const match = description.match(/(.*) \(Rif\..*\)$/);
      return match ? match[1].trim() : description.trim();
  };

  const handleSaveTransaction = (data: Omit<Transaction, 'id'>) => {
    const newTransaction: Transaction = {
      ...data,
      id: crypto.randomUUID(),
      ceType: CATEGORY_TO_CE_TYPE[data.category] as any,
    };
    setTransactions(prev => [newTransaction, ...prev]);

    // Auto-add supplier/description to presets if new
    if (data.description) {
        const cleanName = extractSupplierName(data.description);
        const category = data.category;
        
        // Only if it's not a generic placeholder
        if (cleanName && category && cleanName.length > 2) {
            const currentList = supplierPresets[category] || [];
            // Check case-insensitive
            const exists = currentList.some(s => s.toLowerCase() === cleanName.toLowerCase());
            
            if (!exists) {
                setSupplierPresets(prev => ({
                    ...prev,
                    [category]: [...(prev[category] || []), cleanName].sort()
                }));
            }
        }
    }

    // If we are in timeline view, we stay there to see the update
    if (view !== AppView.TIMELINE) {
      setView(AppView.TRANSACTIONS);
    }
  };

  const handleUpdateTransaction = (transaction: Transaction) => {
    const updated = {
      ...transaction,
      ceType: (CATEGORY_TO_CE_TYPE[transaction.category] ?? transaction.ceType) as any,
    };
    setTransactions(prev => prev.map(t => t.id === updated.id ? updated : t));
    
    // Auto-add supplier even on update
    if (transaction.description) {
        const cleanName = extractSupplierName(transaction.description);
        const category = transaction.category;
        if (cleanName && category && cleanName.length > 2) {
            const currentList = supplierPresets[category] || [];
            if (!currentList.some(s => s.toLowerCase() === cleanName.toLowerCase())) {
                setSupplierPresets(prev => ({
                    ...prev,
                    [category]: [...(prev[category] || []), cleanName].sort()
                }));
            }
        }
    }
  };

  const handleDeleteTransaction = (id: string) => {
    setTransactions(prev => prev.filter(t => t.id !== id));
  };

  const handleAnnullaSessioneImport = (sessionId: string) => {
    if (!window.confirm("Sei sicuro di voler annullare questo import? Tutte le transazioni collegate verranno rimosse.")) return;
    
    setTransactions(prev => prev.filter(t => t.importSessionId !== sessionId));
    setImportSessions(prev => prev.map(s => s.id === sessionId ? { ...s, annullata: true } : s));
  };

  const handleSaveProject = (data: Omit<Project, 'id'>) => {
    const newProject: Project = {
      ...data,
      id: crypto.randomUUID()
    };
    setProjects(prev => [newProject, ...prev]);
  };

  // NEW: Update existing project (for estimates)
  const handleUpdateProject = (updatedProject: Project) => {
      setProjects(prev => prev.map(p => p.id === updatedProject.id ? updatedProject : p));
  };

  const handleDeleteProject = (id: string) => {
    setProjects(prev => prev.filter(p => p.id !== id));
  };

  // SV-B Handlers
  const handleSaveTipologia = (t: TipologiaCantiere) => {
    setTipologieCantiere(prev => {
      const exists = prev.find(item => item.id === t.id);
      if (exists) return prev.map(item => item.id === t.id ? t : item);
      return [...prev, t];
    });

    const cantieriDaRigenerare = cantieriPrev.filter(c => c.tipologiaId === t.id && c.previsionaliGenerati);
    
    if (cantieriDaRigenerare.length > 0) {
      const cantieriIds = cantieriDaRigenerare.map(c => c.id);
      const allNewTransactions: Transaction[] = [];

      cantieriDaRigenerare.forEach(c => {
        const startDate = new Date(c.dataInizio);
        t.vociAttive.forEach(voce => {
          const totalAmount = c.costiStimati[voce.categoria] || 0;
          if (totalAmount <= 0) return;

          let offsetMesiLegacy = 0;
          voce.fasi.forEach(fase => {
            const faseAmount = (totalAmount * fase.percentuale) / 100;
            
            const getMeseValue = (m: any) => {
               const parsed = parseInt(m, 10);
               return isNaN(parsed) ? 1 : parsed;
            };
            
            let meseInizio = getMeseValue(fase.meseInizio);
            let meseFine = getMeseValue(fase.meseFine);
            
            if (fase.meseInizio === undefined || fase.meseFine === undefined) {
               meseInizio = offsetMesiLegacy >= 0 ? offsetMesiLegacy + 1 : offsetMesiLegacy;
               const offsetFine = offsetMesiLegacy + (fase.durataMesi || 1) - 1;
               meseFine = offsetFine >= 0 ? offsetFine + 1 : offsetFine;
               offsetMesiLegacy += (fase.durataMesi || 1);
            }
            
            const offsetInizio = meseInizio > 0 ? meseInizio - 1 : meseInizio;
            const offsetFine = meseFine > 0 ? meseFine - 1 : meseFine;
            const durataMesi = Math.max(1, offsetFine - offsetInizio + 1);

            const monthlyAmount = faseAmount / durataMesi;

            for (let i = 0; i < durataMesi; i++) {
              const absoluteMonthOffset = offsetInizio + i;
              const txDate = new Date(startDate.getFullYear(), startDate.getMonth() + absoluteMonthOffset, 1);
              
              const realCeType = CATEGORY_TO_CE_TYPE[voce.categoria] || 'solo_cashflow';
              const newTx: Transaction = {
                id: crypto.randomUUID(),
                date: txDate.toISOString().split('T')[0],
                amount: monthlyAmount,
                vatRate: 22,
                type: TransactionType.EXPENSE,
                category: voce.categoria,
                description: `Previsionale ${c.nome} — ${voce.categoria.split('] ')[1] || voce.categoria}`,
                project: c.nome,
                isForecast: true,
                ceType: realCeType as any,
                sourceRef: c.id
              };
              allNewTransactions.push(newTx);
            }
          });
        });
      });

      setTransactions(prev => [
        ...prev.filter(tx => !(tx.isForecast && tx.sourceRef && cantieriIds.includes(tx.sourceRef))),
        ...allNewTransactions
      ]);
    }
  };

  const handleDeleteTipologia = (id: string) => {
    if (window.confirm('Eliminare questa tipologia?')) {
      setTipologieCantiere(prev => prev.filter(t => t.id !== id));
    }
  };

  const handleSaveCantierePrev = (c: CantierePrev) => {
    setCantieriPrev(prev => {
      const exists = prev.find(item => item.id === c.id);
      if (exists) return prev.map(item => item.id === c.id ? c : item);
      return [...prev, c];
    });
  };

  const handleDeleteCantierePrev = (id: string) => {
    if (window.confirm('Eliminare questo cantiere previsionale e rimuovere automaticamente tutte le voci generate nel cash flow?')) {
      setCantieriPrev(prev => prev.filter(c => c.id !== id));
      setTransactions(prev => prev.filter(tx => !(tx.isForecast && tx.sourceRef === id)));
    }
  };

  const handleGenerateCantiereTransactions = (c: CantierePrev) => {
    const tipologia = tipologieCantiere.find(t => t.id === c.tipologiaId);
    if (!tipologia) return;

    const newTransactions: Transaction[] = [];
    const startDate = new Date(c.dataInizio);

    tipologia.vociAttive.forEach(voce => {
      const totalAmount = c.costiStimati[voce.categoria] || 0;
      if (totalAmount <= 0) return;

      let offsetMesiLegacy = 0;
      voce.fasi.forEach(fase => {
        const faseAmount = (totalAmount * fase.percentuale) / 100;
        
        const getMeseValue = (m: any) => {
           const parsed = parseInt(m, 10);
           return isNaN(parsed) ? 1 : parsed;
        };
        
        let meseInizio = getMeseValue(fase.meseInizio);
        let meseFine = getMeseValue(fase.meseFine);
        
        if (fase.meseInizio === undefined || fase.meseFine === undefined) {
           meseInizio = offsetMesiLegacy >= 0 ? offsetMesiLegacy + 1 : offsetMesiLegacy;
           const offsetFine = offsetMesiLegacy + (fase.durataMesi || 1) - 1;
           meseFine = offsetFine >= 0 ? offsetFine + 1 : offsetFine;
           offsetMesiLegacy += (fase.durataMesi || 1);
        }
        
        const offsetInizio = meseInizio > 0 ? meseInizio - 1 : meseInizio;
        const offsetFine = meseFine > 0 ? meseFine - 1 : meseFine;
        const durataMesi = Math.max(1, offsetFine - offsetInizio + 1);

        const monthlyAmount = faseAmount / durataMesi;

        for (let i = 0; i < durataMesi; i++) {
          const absoluteMonthOffset = offsetInizio + i;
          const txDate = new Date(startDate.getFullYear(), startDate.getMonth() + absoluteMonthOffset, 1);
          
          const realCeType = CATEGORY_TO_CE_TYPE[voce.categoria] || 'solo_cashflow';
          const newTx: Transaction = {
            id: crypto.randomUUID(), // N2 fix: usa UUID invece di Math.random()
            date: txDate.toISOString().split('T')[0],
            amount: monthlyAmount,
            vatRate: 22,
            type: TransactionType.EXPENSE,
            category: voce.categoria,
            description: `Previsionale ${c.nome} — ${voce.categoria.split('] ')[1] || voce.categoria}`,
            project: c.nome,
            isForecast: true,
            ceType: realCeType as any, // N2 fix: garantisce che il ceType derivi da constants.ts
            sourceRef: c.id // N10 fix: cantiereWizardId salvato in sourceRef
          };
          newTransactions.push(newTx);
        }
      });
    });

    setTransactions(prev => [...prev, ...newTransactions]);
    setCantieriPrev(prev => prev.map(item => item.id === c.id ? { ...item, previsionaliGenerati: true } : item));
  };

  const handleDeleteCantiereGenerated = (c: CantierePrev) => {
    // N10 fix: match esatto sul sourceRef (cantiereWizardId) invece che sulla descrizione
    setTransactions(prev => prev.filter(tx => !(tx.isForecast && tx.sourceRef === c.id)));
    setCantieriPrev(prev => prev.map(item => item.id === c.id ? { ...item, previsionaliGenerati: false } : item));
  };

  const handleAuthChange = (auth: boolean, user: string) => {
    setIsAuthorized(auth);
    setCurrentUser(user);
  };

  const handleRimanenzeChange = (anno: number, data: RimanenzeAnno) => {
    setRimanenze(prev => ({
      ...prev,
      [anno.toString()]: data,
    }));
  };

  const renderContent = () => {
    switch (view) {
      case AppView.HOME:
        return (
          <HomeScreen onNavigate={setView} />
        );
      case AppView.DASHBOARD:
        return (
          <div className="space-y-8 animate-in fade-in duration-500">
            <InsightPanel transactions={transactions} />
            <Dashboard 
                transactions={transactions} 
                expenseCategories={[...fixedCategories, ...variableCategories]}
                onGoToManuale={handleGoToManuale}
            />
          </div>
        );
      case AppView.TIMELINE:
        return (
          <div className="space-y-8 animate-in fade-in duration-500 pb-12">
            <div className="space-y-2">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <span className="w-2 h-8 bg-emerald-500 rounded-full"></span>
                    Flusso Entrate
                </h3>
                <IncomeTimeline 
                    transactions={transactions} 
                    availableProjects={projects}
                    initialData={initialData}
                    onUpdateInitialData={setInitialData}
                    onSaveTransaction={handleSaveTransaction}
                    onUpdateTransaction={handleUpdateTransaction}
                    onDeleteTransaction={handleDeleteTransaction}
                    scrollContainerRef={incomeScrollRef}
                    currentYear={timelineYear}
                    isAuthorized={isAuthorized}
                    onGoToManuale={handleGoToManuale}
                />
            </div>

            <div className="space-y-2">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <span className="w-2 h-8 bg-rose-500 rounded-full"></span>
                    Flusso Uscite
                </h3>
                <ExpenseTimeline 
                    transactions={transactions}
                    projects={projects} // Pass Projects for Estimates
                    initialData={initialData} // Pass Initial Data for Existing Loans
                    onSaveTransaction={handleSaveTransaction}
                    onUpdateTransaction={handleUpdateTransaction}
                    onDeleteTransaction={handleDeleteTransaction}
                    scrollContainerRef={expenseScrollRef}
                    fixedCategories={fixedCategories}
                    variableCategories={variableCategories}
                    supplierPresets={supplierPresets}
                    currentYear={timelineYear}
                    isAuthorized={isAuthorized}
                    onGoToManuale={handleGoToManuale}
                />
            </div>

             <div className="pt-4">
                <CashFlowTimeline 
                  transactions={transactions} 
                  projects={projects}
                  initialData={initialData}
                  onUpdateInitialData={setInitialData}
                  saldoInizialeCF={saldoInizialeCF}
                  onUpdateSaldoIniziale={setSaldoInizialeCF}
                  scrollContainerRef={cashFlowScrollRef}
                  currentYear={timelineYear}
                  isAuthorized={isAuthorized}
                  onGoToManuale={handleGoToManuale}
                  onOpenImportPuntaNet={() => setShowImportPuntaNet(true)}
                  onSaveTransaction={handleSaveTransaction}
                  onUpdateTransaction={handleUpdateTransaction}
                  onDeleteTransaction={handleDeleteTransaction}
                />
            </div>
          </div>
        );
      case AppView.ANALYTICS:
        return <AnalyticsView 
                  transactions={transactions} 
                  projects={projects} 
                  fixedCategories={fixedCategories}
                  variableCategories={variableCategories}
                />;
      case AppView.COST_DISTRIBUTION: 
        return <ProjectCostDistribution 
                  projects={projects} 
                  onUpdateProject={handleUpdateProject} 
                  isAuthorized={isAuthorized}
                />;
      case AppView.PROJECTS:
        return (
          <ProjectManager 
            projects={projects} 
            onSave={handleSaveProject} 
            onUpdate={handleUpdateProject}
            onDelete={handleDeleteProject}
            isAuthorized={isAuthorized}
          />
        );
      case AppView.SETTINGS:
        return (
            <div className="space-y-8 animate-in fade-in duration-500">
                {isAuthorized && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-600">
                          <CalendarClock size={20} />
                        </div>
                        <div>
                          <h3 className="font-black text-slate-900">Wizard Inizio Anno</h3>
                          <p className="text-[10px] text-slate-500 font-bold uppercase">Costi Fissi Previsionali</p>
                        </div>
                      </div>
                      <p className="text-xs text-slate-600 mb-6 leading-relaxed">
                        Copia automaticamente i costi fissi (affitti, stipendi ufficio, utenze) dall'anno precedente 
                        come basi previsionali per il nuovo anno.
                      </p>
                      <button 
                        onClick={() => setShowYearStartWizard(true)}
                        className="w-full bg-slate-900 text-white py-3 rounded-xl text-xs font-bold hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
                      >
                        Avvia Wizard Inizio Anno
                      </button>
                    </div>

                    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-600">
                          <Building2 size={20} />
                        </div>
                        <div>
                          <h3 className="font-black text-slate-900">Pianifica Cantieri</h3>
                          <p className="text-[10px] text-slate-500 font-bold uppercase">Costi Variabili Previsionali</p>
                        </div>
                      </div>
                      <p className="text-xs text-slate-600 mb-6 leading-relaxed">
                        Definisci tipologie di cantiere e genera flussi di cassa previsionali basati su regole 
                        di distribuzione temporale dei costi.
                      </p>
                      <button 
                        onClick={() => setShowCantiereWizard(true)}
                        className="w-full bg-slate-900 text-white py-3 rounded-xl text-xs font-bold hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
                      >
                        Pianifica Nuovi Cantieri
                      </button>
                    </div>
                  </div>
                )}

                <CategoryManager 
                    fixedCategories={fixedCategories}
                    variableCategories={variableCategories}
                    incomeCategories={incomeCategories}
                    tipologieCantiere={tipologieCantiere}
                    onUpdateFixed={setFixedCategories}
                    onUpdateVariable={setVariableCategories}
                    onUpdateIncome={setIncomeCategories}
                    onUpdateTipologie={setTipologieCantiere}
                    isAuthorized={isAuthorized}
                    onExportData={buildBackupData}
                    onImportData={loadFromData}
                    onChangeFile={handleChangeFile}
                    currentFileName={fileHandle?.name}
                    backupFileName={backupFileHandle?.name}
                    onSetBackupFile={handleSetBackupFile}
                    onClearBackupFile={handleClearBackupFile}
                    rulesFileName={rulesFileHandle?.name}
                    onLinkRulesFile={handleLinkRulesFile}
                    onCreateRulesFile={handleCreateRulesFile}
                    onClearRulesFile={handleClearRulesFile}
                    importSessions={importSessions}
                    onAnnullaSessione={handleAnnullaSessioneImport}
                    onImportStorico={() => setShowImportStorico(true)}
                    storicoImportato={storicoImportato}
                    transactions={transactions}
                    onRenameCategory={(oldName, newName) => {
                      setTransactions(prev => prev.map(t => t.category === oldName ? { ...t, category: newName } : t));
                    }}
                />
            </div>
        );
      case AppView.OPERATORS: // New Operator Management View
        return (
            <OperatorManager 
                operators={responsiblesList}
                onUpdateOperators={setResponsiblesList}
                isAuthorized={isAuthorized}
            />
        );
      case AppView.TRANSACTIONS:
        return (
           <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
             <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-slate-800">Storico Transazioni</h2>
                <button 
                  onClick={() => isAuthorized && setView(AppView.ADD)}
                  disabled={!isAuthorized}
                  className={`bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${!isAuthorized ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-800'}`}
                  title={!isAuthorized ? "Accedi per aggiungere" : "Aggiungi"}
                >
                  <PlusCircle size={16} />
                  Aggiungi
                </button>
             </div>
             <TransactionList transactions={transactions} onDelete={handleDeleteTransaction} isAuthorized={isAuthorized} />
           </div>
        );
      case AppView.ADD:
        return (
          <div className="animate-in zoom-in-95 duration-300">
            <TransactionForm 
              onSave={handleSaveTransaction} 
              onCancel={() => setView(AppView.TRANSACTIONS)} 
              availableProjects={projects}
              fixedCategories={fixedCategories}
              variableCategories={variableCategories}
              incomeCategories={incomeCategories}
              supplierPresets={supplierPresets}
            />
          </div>
        );
      case AppView.CE_RICLASSIFICATO:
      case AppView.STATO_PATRIMONIALE:
      case AppView.BUDGET:
      case AppView.RATING_BANCHE:
      case AppView.ANALISI_INDICI:
      case AppView.IVA_POSIZIONE:
        return (
          <BilancioView 
            transactions={transactions}
            initialData={initialData}
            ceManualData={ceManualData}
            onManualDataChange={(anno, data) => {
              setCeManualData(prev => ({
                ...prev,
                [anno.toString()]: { ...(prev[anno.toString()] || {}), ...data }
              }));
            }}
            spSnapshots={spSnapshots}
            onUpdateSnapshots={setSpSnapshots}
            budgetData={budgetData}
            onBudgetChange={(anno, data) => {
              setBudgetData(prev => ({
                ...prev,
                [anno.toString()]: data
              }));
            }}
            oreStorico={oreStorico}
            setOreStorico={setOreStorico}
            rimanenze={rimanenze}
            onRimanenzeChange={handleRimanenzeChange}
            onGoToManuale={handleGoToManuale}
            aliquotaIRES={aliquotaIRES}
            aliquotaIRAP={aliquotaIRAP}
            onChangeAliquotaIRES={setAliquotaIRES}
            onChangeAliquotaIRAP={setAliquotaIRAP}
            initialTab={
              view === AppView.CE_RICLASSIFICATO ? 'pl' :
              view === AppView.STATO_PATRIMONIALE ? 'summary' :
              view === AppView.BUDGET ? 'budget' :
              view === AppView.RATING_BANCHE ? 'rating' :
              view === AppView.ANALISI_INDICI ? 'analisi' :
              view === AppView.IVA_POSIZIONE ? 'iva' : 'summary'
            }
          />
        );
      case AppView.GUIDA_KPI:
        return (
          <GuidaKPIView 
            initialTab={guidaInitialTab}
            initialSection={guidaInitialSection}
          />
        );
      default:
        return <Dashboard 
                  transactions={transactions} 
                  expenseCategories={[...fixedCategories, ...variableCategories]}
                  onGoToManuale={handleGoToManuale}
                />;
    }
  };

  // --- UI COMPONENTS ---

  const navItems = [
    { view: AppView.HOME, label: 'Home', icon: LayoutGrid },
    { view: AppView.DASHBOARD, label: 'Dashboard', icon: LayoutDashboard },
    { view: AppView.TIMELINE, label: 'Cash Flow', icon: CalendarClock },
    { view: AppView.STATO_PATRIMONIALE, label: 'Bilancio', icon: Building2 },
    { view: AppView.PROJECTS, label: 'Commesse', icon: Briefcase },
    { view: AppView.GUIDA_KPI, label: 'Guida', icon: BookOpen },
    { view: AppView.SETTINGS, label: 'Config.', icon: Settings },
  ];

  const weekRangeLabel = `Anno Fiscale ${timelineYear}`;

  if (appState === 'loading') {
    return (
      <div className="h-screen bg-[#222222] flex flex-col items-center justify-center gap-6">
        <div className="w-16 h-16 border-4 border-white/10 border-t-slate-400 rounded-full animate-spin"></div>
        <div className="text-center">
          <h2 className="text-white font-black text-xl tracking-tighter uppercase flex items-baseline justify-center gap-2">
            GV Ecosystem
            <span className="text-white text-xs sm:text-lg normal-case font-normal animate-in fade-in slide-in-from-left-2 duration-300">
              GV GestioneFINANZIARIA
            </span>
          </h2>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Caricamento in corso...</p>
        </div>
      </div>
    );
  }

  if (appState === 'welcome') {
    return (
      <WelcomeScreen 
        pendingHandleFromIDB={pendingHandleFromIDB}
        handleConfirmIDBHandle={handleConfirmIDBHandle}
        handleOpenExisting={handleOpenExisting}
        handleCreateNew={handleCreateNew}
        handleMigrateFromLocalStorage={handleMigrateFromLocalStorage}
        handleDemoMode={handleDemoMode}
        hasLocalStorageData={hasLocalStorageData}
        isFileSystemSupported={isFileSystemSupported}
      />
    );
  }

  const isDemoMode = appState === 'ready' && fileHandle === null;

  return (
    <div className="h-screen bg-slate-50 flex flex-col font-sans text-slate-900 overflow-hidden">
      
      {/* Demo Mode Banner */}
      {isDemoMode && (
        <div className="bg-slate-800 text-white px-4 py-2 flex items-center justify-between text-sm font-bold z-[70]">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} />
            <span>Modalità demo — i dati non vengono salvati automaticamente</span>
          </div>
          <button 
            onClick={() => setAppState('welcome')}
            className="bg-white text-slate-900 px-3 py-1 rounded-full text-xs hover:bg-slate-50 transition-colors"
          >
            Collega file
          </button>
        </div>
      )}

      {/* --- TOP BAR (Sfondo Grigio Scuro) --- */}
      <div className="bg-[#222222] py-1 border-b border-white/10 shrink-0 sticky top-0 z-[60] font-sans">
        <div className="max-w-[1600px] mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-4">
          
          {/* Logo Testuale */}
          <div className="flex items-baseline tracking-[0.2em] md:tracking-[0.4em] select-none">
            <span className="text-lg sm:text-2xl text-white/60 italic uppercase font-light">GV ECOSYSTEM</span>
            <span className="text-white text-xs sm:text-lg ml-2 md:ml-4 normal-case animate-in fade-in slide-in-from-left-2 duration-300">
              GV GestioneFINANZIARIA
            </span>
          </div>

          {/* Save Status Indicator */}
          {fileHandle && (
            <div className="flex items-center gap-4 px-4 py-1.5 bg-white/5 rounded-full border border-white/10">
              <div className="flex items-center gap-2">
                {saveStatus === 'saving' ? (
                  <Loader2 size={14} className="text-slate-400 animate-spin" />
                ) : saveStatus === 'saved' ? (
                  <CheckCircle2 size={14} className="text-slate-400" />
                ) : saveStatus === 'error' ? (
                  <AlertCircle size={14} className="text-slate-400" />
                ) : (
                  <div className="w-2 h-2 rounded-full bg-slate-500"></div>
                )}
                <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">
                  {saveStatus === 'saving' ? 'Salvataggio...' : 
                   saveStatus === 'saved' ? 'Salvato' : 
                   saveStatus === 'error' ? 'Errore' : 'Sincronizzato'}
                </span>
              </div>
              {lastSaved && (
                <span className="text-[10px] font-bold text-white/20 uppercase">
                  Ultimo: {lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
          )}
          
          {/* Controlli Destra (Secure Widget) */}
          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
             <SecureResponsibleWidget 
                responsibles={responsiblesList}
                onAuthChange={handleAuthChange}
                onSettingsClick={() => setView(AppView.OPERATORS)} // CLICK OPENS OPERATOR MANAGER
                masterPassword="gvflow808282"
             />
          </div>
        </div>
      </div>

      {/* --- HEADER PRINCIPALE (Sfondo Bianco) --- */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-[55] shadow-sm font-sans shrink-0">
        <div className="max-w-[1600px] mx-auto px-4 flex flex-col md:flex-row items-center justify-between py-4 md:h-20 gap-4">
          
          {/* Logo Azienda e Pallini */}
          <div className="flex items-center gap-3 self-start md:self-auto cursor-pointer" onClick={() => setView(AppView.HOME)}>
            <div className="w-10 h-10 md:w-12 md:h-12 bg-black rounded-xl flex items-center justify-center shadow-lg flex-shrink-0">
              <span className="text-white text-xl md:text-2xl font-black">V</span>
            </div>
            <div className="flex flex-col">
              <h1 className="text-sm md:text-base font-black text-slate-900 uppercase tracking-tighter leading-none mb-1">Gruppo Visentin</h1>
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 md:w-2 md:h-2 bg-indigo-500"></div>
                <div className="w-1.5 h-1.5 md:w-2 md:h-2 bg-emerald-500"></div>
                <div className="w-1.5 h-1.5 md:w-2 md:h-2 bg-amber-500"></div>
              </div>
            </div>
          </div>
          
          {/* Navigazione Tab */}
          {view !== AppView.HOME && (
            <nav className="flex bg-slate-100 p-1 rounded-xl overflow-x-auto w-full md:w-auto scrollbar-hide animate-in fade-in slide-in-from-top-2 duration-300">
               {navItems.map((item) => (
                  <button 
                    key={item.view} 
                    onClick={() => setView(item.view)} 
                    className={`px-3 md:px-4 py-2 rounded-lg text-[11px] md:text-sm font-bold transition-all whitespace-nowrap flex-1 md:flex-none flex items-center gap-2 ${view === item.view ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    <span className="hidden lg:inline"><item.icon size={14} /></span>
                    {item.label}
                  </button>
               ))}
            </nav>
          )}

          {/* Pulsanti Azione (Nuova / AI / Salva) */}
          {/* Pulsanti Azione — Salva sempre visibile, Nuova solo nelle view operative */}
          <div className="flex items-center gap-3 w-full md:w-auto justify-end animate-in fade-in zoom-in-95 duration-300">
            <div className="flex gap-2">
              <button 
                onClick={() => isDemoMode ? handleDownloadBackup(true) : (fileHandle ? saveToFile(fileHandle) : handleDownloadBackup())}
                className={`px-4 py-2 rounded-xl text-white text-[11px] md:text-sm font-bold shadow-md transition-all active:scale-95 flex items-center gap-2 ${isDemoMode ? 'bg-slate-600 hover:bg-slate-700' : (saveStatus === 'error' ? 'bg-slate-800 hover:bg-slate-900' : 'bg-slate-900 hover:bg-slate-800')}`}
                title={isDemoMode ? "Scarica JSON (Modalità Demo)" : (fileHandle ? "Salva modifiche" : "Salva una copia locale (Backup)")}
              >
                {isDemoMode ? <AlertCircle size={16} /> : (fileHandle ? <Save size={16} /> : <Download size={16} />)}
                <span className="hidden md:inline">{isDemoMode ? '⚠️ Nessun file' : (fileHandle ? 'Salva' : 'Salva con nome')}</span>
              </button>

              {isCashFlowView && (
                <button 
                  onClick={() => isAuthorized && setView(AppView.ADD)}
                  disabled={!isAuthorized}
                  className={`flex-1 md:flex-none px-4 py-2 rounded-xl bg-slate-900 text-white text-[11px] md:text-sm font-bold shadow-md transition-all flex items-center gap-2 ${!isAuthorized ? 'opacity-50 grayscale cursor-not-allowed' : 'hover:bg-slate-800 active:scale-95'}`}
                  title={!isAuthorized ? "Accedi per abilitare" : "Nuova Transazione"}
                >
                  <PlusCircle size={16} /><span className="hidden md:inline">Nuova</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Barra Navigazione Date (Solo Timeline) */}
        {view === AppView.TIMELINE && (
          <div className="h-12 border-t border-slate-100 flex items-center justify-between md:justify-center px-4 md:px-0 md:gap-6 bg-slate-50/50">
            <button 
                onClick={() => setTimelineYear(prev => prev - 1)}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-600 shadow-sm hover:bg-slate-50 active:scale-95 transition-transform"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-[10px] md:text-sm font-black text-slate-800 tracking-wide uppercase text-center flex-1 md:flex-none">
                {weekRangeLabel}
            </span>
            <button 
                onClick={() => setTimelineYear(prev => prev + 1)}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-600 shadow-sm hover:bg-slate-50 active:scale-95 transition-transform"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto w-full relative flex flex-col bg-slate-50">
        <div className="flex-1 p-4 md:p-8 max-w-[1600px] mx-auto w-full relative">
             <div className="hidden md:block absolute bottom-4 left-8 pointer-events-none opacity-50 z-0">
                <div className="flex items-center gap-2 text-xs text-slate-400">
                    <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-pulse"></div>
                    Gemini AI Active
                </div>
             </div>
             {renderContent()}
        </div>
        
        {/* Modals & Wizards */}
        {showYearStartWizard && (
          <YearStartWizard 
            transactions={transactions}
            onSave={(newTxs) => setTransactions(prev => [...prev, ...newTxs])}
            onClose={() => setShowYearStartWizard(false)}
          />
        )}

        {showCantiereWizard && (
          <CantiereWizard 
            tipologie={tipologieCantiere}
            cantieriPrev={cantieriPrev}
            onSaveCantiere={handleSaveCantierePrev}
            onDeleteCantiere={handleDeleteCantierePrev}
            onGenerateTransactions={handleGenerateCantiereTransactions}
            onDeleteGenerated={handleDeleteCantiereGenerated}
            onClose={() => setShowCantiereWizard(false)}
          />
        )}

        {showImportPuntaNet && (
          <ImportPuntaNetModal
            contiConfigurati={initialData.accounts}
            regoleSalvate={regolePuntaNet}
            mappingContiSalvato={mappingContiPuntaNet}
            projectsApp={projects}
            transazioniEsistenti={transactions}
            bozza={bozzaImportPuntaNet}
            fileFEP={fileFEP}
            fileFEA={fileFEA}
            fileFEA2={fileFEA2}
            onSetFileFEP={setFileFEP}
            onSetFileFEA={setFileFEA}
            onSetFileFEA2={setFileFEA2}
            onAggiornaBozza={setBozzaImportPuntaNet}
            onImport={(txs) => {
              setTransactions(prev => [...prev, ...txs]);
              setBozzaImportPuntaNet([]); // Pulisce la bozza dopo l'import
              setFileBanca(null);
              setFileFEP(null);
              setFileFEA(null);
              setFileFEA2(null);
              setShowImportPuntaNet(false);
            }}
            onSalvaRegole={setRegolePuntaNet}
            onSalvaMappingConti={setMappingContiPuntaNet}
            onSalvaSessione={s => setImportSessions(prev => [s, ...prev])}
            onClose={() => setShowImportPuntaNet(false)}
          />
        )}

        {showImportStorico && (
          <ImportStoricoModal
            storicoGiaImportato={storicoImportato}
            onImport={(txs) => {
              setTransactions(prev => [...prev, ...txs]);
              setStoricoImportato(true);
            }}
            onSalvaSessione={(session) =>
              setImportSessions(prev => [session, ...prev])
            }
            onClose={() => setShowImportStorico(false)}
          />
        )}

        {activeTermId && (
          <TermModal 
            termId={activeTermId}
            onClose={closeTerm}
          />
        )}

        <Footer />
      </main>
    </div>
  );
};

export default App;