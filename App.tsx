import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
  BankAccount,
  ImportSession
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
import { DiagnosticModal } from './components/DiagnosticModal';
import { generateDefault2025Snapshot, parseUTCDate, getLocalYMD } from './utils/gasCoreEngine';
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
  Receipt,
  Copy
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

const WelcomeScreen: React.FC<WelcomeScreenProps & { handleLoadFromPastedText: (text: string) => void }> = ({
  pendingHandleFromIDB,
  handleConfirmIDBHandle,
  handleOpenExisting,
  handleCreateNew,
  handleMigrateFromLocalStorage,
  handleDemoMode,
  hasLocalStorageData,
  isFileSystemSupported,
  handleLoadFromPastedText
}) => {
  const [showPasteBox, setShowPasteBox] = useState(false);
  const [pastedText, setPastedText] = useState('');

  return (
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
          {showPasteBox ? (
            <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
              <div className="space-y-2">
                <h3 className="text-xl font-black text-slate-900 tracking-tight">Incolla Contenuto File</h3>
                <p className="text-slate-500 text-xs font-bold leading-normal">
                  Apri il file <span className="font-bold text-slate-700">gv-cashflow.txt</span> sul tuo Google Drive da cellulare, copia tutto il testo interno e incollalo qui sotto:
                </p>
              </div>

              <textarea
                value={pastedText}
                onChange={e => setPastedText(e.target.value)}
                placeholder="Incolla il testo del database qui..."
                className="w-full h-48 p-4 border-2 border-slate-200 rounded-2xl text-xs font-mono focus:border-slate-950 focus:ring-1 focus:ring-slate-950 outline-none resize-none"
              />

              <div className="flex gap-4">
                <button
                  onClick={() => setShowPasteBox(false)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-4 rounded-xl text-xs font-black uppercase tracking-wider transition-colors"
                >
                  Annulla
                </button>
                <button
                  onClick={() => handleLoadFromPastedText(pastedText)}
                  className="flex-1 bg-slate-900 hover:bg-slate-800 text-white py-4 rounded-xl text-xs font-black uppercase tracking-wider transition-colors shadow-lg active:scale-98"
                >
                  Carica Dati
                </button>
              </div>
            </div>
          ) : pendingHandleFromIDB ? (
            <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
              <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-blue-100 flex items-center justify-center text-blue-600 shrink-0 shadow-lg">
                  <FileCode size={24} />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-lg leading-tight">File trovato</h3>
                  <p className="text-sm text-slate-600 mt-1">
                    È stato rilevato il file <span className="font-bold text-slate-900">gv-cashflow.txt</span> dall'ultima sessione.
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
                    <p className="text-xs text-slate-500 font-medium mt-0.5">Seleziona il tuo gv-cashflow.txt</p>
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
                    <p className="text-xs text-slate-500 font-medium mt-0.5">Esplora l'app senza salvare file</p>
                  </div>
                </button>

                <button 
                  onClick={() => setShowPasteBox(true)}
                  className="w-full group flex items-center gap-4 p-6 rounded-3xl border-2 border-slate-100 bg-slate-50/30 hover:border-slate-900 hover:bg-slate-50 transition-all text-left"
                >
                  <div className="w-14 h-14 rounded-2xl bg-blue-100 flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors shadow-sm">
                    <Copy size={28} />
                  </div>
                  <div>
                    <h4 className="font-black text-slate-900 uppercase text-sm tracking-wider">Incolla dati (Alternativa Mobile)</h4>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">Copia il testo da Google Drive e incollalo qui</p>
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
                    Usa l'opzione "Incolla dati" per caricare, e "Copia Dati (Mobile)" per salvare.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};;

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

function migrateBackupData(data: BackupData): BackupData {
  if (!data) return data;

  const migrated: BackupData = { ...data };

  // 1. Migrate transactions and ensure they map to the correct ceType dynamically
  if (data.transactions) {
    const subCantieriSuppliers = [
      'Munaretto', 'Solar system', 'Lattoneria Rossanese', 'Asolo Pavimenti', 'il fabbro srl', 'Nart Sonia',
      'Decorgesso srls', 'Galliazzo Ivano', 'Visentin & Gasparetto', 'Geosolar', 'Agostini Sergio',
      'Aeerre costruzioni', 'Conte Ambienti Esterni', 'Falegnameria Trentin', 'Visentin Francesco',
      'Dkh srls', 'Masaro Fabio', 'Roccon Silvio', 'Pozzobon Serramenti', 'M.N. costruzioni srls',
      'Edilmuli di zogaj', 'Timexpert', 'Termoidraulica G.sc.', 'Cbm martignago', 'Tm toniolo',
      'Ganeo adriano', 'Bs impianti', 'Colordesign', 'E.p. ponteggi', 'Az. Florovivaistica Giandino',
      'Bonetto', 'Miftaroski Fikmet', 'Metope', 'Tm toniolo massimo', 'Serramenti Ruffato',
      'Ikon tecnology', 'Edilmonastier', 'Pedemontana Serramenti', 'Guritenco Igor', 'Soligo Damiano',
      'Contarin', 'Dametto Simone', 'Dm Posa srls', 'Moro serrande', 'Cetos srl', 'Eurocostruzioni srls',
      'Giuliano coperture srls', 'Nicola metal design', 'Libra serramenti', 'Paesaggi umbri consorzio',
      'Sbrissa sebastiano giardini', 'Moretto scavi', 'Lillo Coperture', 'Alpac', 'Edile coperture',
      'Pizzolato Jody', 'Edillux di Abo Ghazalah', 'Visentin Costruzioni Srl', 'Storgato'
    ].map(s => s.toLowerCase());

    const historicalRowNames = [
      'SUBAPPALTI MANODOPERA', 'SUBAPPALTI SU CANTIERI', 'FORNITORI MATERIALI', 'PROFESSIONISTI ESTERNI',
      'NOLEGGI', 'CARBURANTI', 'RIFIUTI E MACERIE', 'PRANZI', 'ASSICURAZIONE CANTIERI',
      'STIPENDI DIPENDENTI OPERATIVI', 'CONTRIBUTI DIPENDENTI OPERATIVI', 'STIPENDI DIPENDENTI UFFICIO',
      'CONTRIBUTI DIPENDENTI UFFICIO', 'COLLABORATORI FISSI', 'COMPENSO AMMINISTRATORI', 'CONSULENTI OPEX20',
      'CONSULENTI', 'SOA E ISO', 'COMMERCIALISTA', 'AFFITTI SEDI', 'UTENZE SEDI', 'SOFTWARE', 'CANCELLERIA',
      'ASSICURAZIONE MEZZI E BOLLI', 'ASSICURAZIONI GENERALI', 'REVISIONE MACCHINARI',
      'RIPARAZIONI MACCHINARI E ATTREZZATURE', 'NUOVE ATTREZZATURE', 'ACQUISIZIONE TERRENI o IMMOBILI',
      'ACQUISIZIONE TERRENI', 'NUOVA SOCIETA\'', 'CORSI DIPENDENTI', 'VISITE MEDICHE DIPENDENTI',
      "PUBBLICITA' E MARKETING", 'VOLONTARIATO', 'TASSE', 'VERSAMENTO IVA', 'RITENUTE SU BONIFICI',
      "RITENUTE D'ACCONTO SU PROFESSIONISTI", 'SANZIONI', 'IMPREVISTI', 'SPESE BANCARIE',
      'RATE E INTERESSI FINANZIAMENTI', 'PRELIEVO UTILE SOCI', 'DE FILIPPO GIOVANNI', 'SELMEDIN NESIMOSKI',
      'DE FILIPPO', 'SELMEDIN', 'NESIMOSKI'
    ].map(s => s.toLowerCase());

    // 1. Etichetta retroattivamente i previsionali generati da storico con sourceRef: 'Wizard Inizio Anno'
    let taggedTxs = data.transactions.map(t => {
      if (t.isForecast && !t.sourceRef && t.description) {
        const descLower = t.description.toLowerCase();
        const matchesHist = historicalRowNames.some(name => descLower.includes(name));
        if (matchesHist) {
          return { ...t, sourceRef: 'Wizard Inizio Anno' };
        }
      }
      return t;
    });

    // Rileva se ci sono previsionali da Wizard che non hanno una sessione associata nel registro e le crea retroattivamente
    const wizardTxs = taggedTxs.filter(t => t.isForecast && t.sourceRef === 'Wizard Inizio Anno');
    const wizardYears = Array.from(new Set(wizardTxs.map(t => new Date(t.date).getFullYear())));
    
    let updatedSessions = data.importSessions ? [...data.importSessions] : [];
    
    wizardYears.forEach(year => {
      const sessionName = `Wizard Inizio Anno ${year}`;
      const sessionExists = updatedSessions.some(s => s.nomeFile === sessionName);
      if (!sessionExists) {
        const sessionId = `wizard-retro-${year}`;
        const count = wizardTxs.filter(t => new Date(t.date).getFullYear() === year).length;
        
        updatedSessions.push({
          id: sessionId,
          timestamp: new Date().toISOString(),
          nomeFile: sessionName,
          transazioniImportate: count,
          periodoInizio: `${year}-01-01`,
          periodoFine: `${year}-12-31`
        });
        
        taggedTxs = taggedTxs.map(t => {
          if (t.isForecast && t.sourceRef === 'Wizard Inizio Anno' && new Date(t.date).getFullYear() === year) {
            return { ...t, importSessionId: sessionId };
          }
          return t;
        });
      }
    });

    migrated.importSessions = updatedSessions;

    // 2. Raccoglie gli ID di tutte le sessioni annullate
    const cancelledSessionIds = new Set(
      data.importSessions?.filter(s => s.annullata).map(s => s.id) || []
    );
    const cancelledStoricoSessionIds = new Set(
      data.importSessions?.filter(s => s.annullata && s.nomeFile && s.nomeFile.startsWith("Storico Excel")).map(s => s.id) || []
    );
    const hasActiveStoricoSession = data.importSessions?.some(s => !s.annullata && s.nomeFile && s.nomeFile.startsWith("Storico Excel"));

    let filteredTxs = taggedTxs;
    
    // Rimuove i consuntivi appartenenti a QUALSIASI sessione annullata
    if (cancelledSessionIds.size > 0) {
      filteredTxs = filteredTxs.filter(t => {
        if (t.importSessionId && cancelledSessionIds.has(t.importSessionId)) {
          return false;
        }
        if (t.sourceRef && t.sourceRef.startsWith("Storico Excel")) {
          // Se non ha ID sessione (vecchio import), eliminala solo se non ci sono sessioni attive
          if (!t.importSessionId && !hasActiveStoricoSession) {
            return false;
          }
        }
        return true;
      });
    }

    migrated.transactions = filteredTxs.map(tx => {
      let category = tx.category;
      let description = tx.description || '';
      const descLower = description.toLowerCase();

      // Correzione retroattiva subappalti su cantieri finiti in subappalti manodopera
      if (category === '[PERSONALE] Subappalti Manodopera' || category === '[CANTIERE] Subappalti Manodopera' || category === 'SUBAPPALTI MANODOPERA') {
        const matchesSupplier = subCantieriSuppliers.some(sup => descLower.includes(sup));
        const matchesPhrase = /sub.*cantier/i.test(descLower) || descLower.includes('sub appalti su cantieri') || descLower.includes('subappalti su cantieri');
        if (matchesSupplier || matchesPhrase) {
          category = '[FORNITORI] Subappalti su Cantieri';
        }
      }

      // Correzione retroattiva terreni finiti in fornitori materiali
      if (category === '[FORNITORI] Fornitori Materiali' || category === '[CANTIERE] Fornitori Materiali' || category === 'FORNITORI MATERIALI') {
        if (/terreno|terreni/i.test(descLower) || /acquisizione.*terren/i.test(descLower) || /acquisto.*terren/i.test(descLower)) {
          category = '[INVESTIMENTI] Acquisto Terreni per Sviluppo';
        }
      }

      if (category && CATEGORY_MIGRATION_MAP[category]) {
        category = CATEGORY_MIGRATION_MAP[category];
      }
      return {
        ...tx,
        category,
        ceType: CATEGORY_TO_CE_TYPE[category] ?? tx.ceType,
      };
    });
  }

  // 2. Migrate category lists
  if (data.fixedCategories) {
    migrated.fixedCategories = Array.from(new Set(
      data.fixedCategories.map(cat => CATEGORY_MIGRATION_MAP[cat] || cat)
    ));
  }
  if (data.variableCategories) {
    migrated.variableCategories = Array.from(new Set(
      data.variableCategories.map(cat => CATEGORY_MIGRATION_MAP[cat] || cat)
    ));
  }
  if (data.incomeCategories) {
    migrated.incomeCategories = Array.from(new Set(
      data.incomeCategories.map(cat => CATEGORY_MIGRATION_MAP[cat] || cat)
    ));
  }

  // 3. Migrate budgetData and align ceType
  if (data.budgetData) {
    const migratedBudget: Record<string, BudgetData> = {};
    for (const [key, bData] of Object.entries(data.budgetData)) {
      if (bData && bData.righe) {
        migratedBudget[key] = {
          ...bData,
          righe: bData.righe.map(r => {
            let categoria = r.categoria;
            if (categoria && CATEGORY_MIGRATION_MAP[categoria]) {
              categoria = CATEGORY_MIGRATION_MAP[categoria];
            }
            return {
              ...r,
              categoria,
              ceType: CATEGORY_TO_CE_TYPE[categoria] ?? r.ceType,
            };
          })
        };
      } else {
        migratedBudget[key] = bData;
      }
    }
    migrated.budgetData = migratedBudget;
  }

  // 4. Migrate tipologieCantiere and align ceType
  if (data.tipologieCantiere) {
    migrated.tipologieCantiere = data.tipologieCantiere.map(t => {
      if (t && t.vociAttive) {
        return {
          ...t,
          vociAttive: t.vociAttive.map(v => {
            let categoria = v.categoria;
            if (categoria && CATEGORY_MIGRATION_MAP[categoria]) {
              categoria = CATEGORY_MIGRATION_MAP[categoria];
            }
            return {
              ...v,
              categoria,
              ceType: CATEGORY_TO_CE_TYPE[categoria] ?? v.ceType,
            };
          })
        };
      }
      return t;
    });
  }

  // 5. Migrate cantieriPrev
  if (data.cantieriPrev) {
    migrated.cantieriPrev = data.cantieriPrev.map(c => {
      if (c && c.costiStimati) {
        const migratedCosti: Record<string, number> = {};
        for (const [cat, value] of Object.entries(c.costiStimati)) {
          const newCat = CATEGORY_MIGRATION_MAP[cat] || cat;
          migratedCosti[newCat] = (migratedCosti[newCat] || 0) + value;
        }
        return {
          ...c,
          costiStimati: migratedCosti
        };
      }
      return c;
    });
  }

  // 6. Migrate supplierPresets
  if (data.supplierPresets) {
    const migratedPresets: Record<string, string[]> = {};
    for (const [cat, suppliers] of Object.entries(data.supplierPresets)) {
      const newCat = CATEGORY_MIGRATION_MAP[cat] || cat;
      if (!migratedPresets[newCat]) {
        migratedPresets[newCat] = [];
      }
      migratedPresets[newCat] = Array.from(new Set([
        ...migratedPresets[newCat],
        ...(suppliers || [])
      ]));
    }
    migrated.supplierPresets = migratedPresets;
  }

  // 7. Migrate regolePuntaNet and align ceType
  if (data.regolePuntaNet) {
    migrated.regolePuntaNet = data.regolePuntaNet.map(r => {
      let categoria = r.categoria;
      if (categoria && CATEGORY_MIGRATION_MAP[categoria]) {
        categoria = CATEGORY_MIGRATION_MAP[categoria];
      }
      return {
        ...r,
        categoria,
        ceType: CATEGORY_TO_CE_TYPE[categoria] ?? r.ceType
      };
    });
  }

  return migrated;
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
  const [oreOperaiStorico, setOreOperaiStorico] = useState<Record<string, any>>({});

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
  const [showDiagnosticModal, setShowDiagnosticModal] = useState(false);
  const [storicoImportato, setStoricoImportato]   = useState(false);

  const [aliquotaIRES, setAliquotaIRES] = useState<number>(24);
  const [aliquotaIRAP, setAliquotaIRAP] = useState<number>(3.9);

  // Memoized Array
  const allExpenseCategories = useMemo(() => [...fixedCategories, ...variableCategories], [fixedCategories, variableCategories]);

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasUnsavedChangesRef = useRef(false);

  // --- SCROLL SYNCHRONIZATION ---
  useEffect(() => {
    if (view !== AppView.TIMELINE) return;

    let incomeEl: HTMLDivElement | null = null;
    let expenseEl: HTMLDivElement | null = null;
    let cashFlowEl: HTMLDivElement | null = null;
    let handleScroll: ((e: Event) => void) | null = null;

    // Small delay to ensure refs are populated after view change
    const timer = setTimeout(() => {
      incomeEl = incomeScrollRef.current;
      expenseEl = expenseScrollRef.current;
      cashFlowEl = cashFlowScrollRef.current;

      if (!incomeEl || !expenseEl || !cashFlowEl) return;

      handleScroll = (e: Event) => {
        const source = e.target as HTMLDivElement;
        const targets = [incomeEl, expenseEl, cashFlowEl].filter(t => t && t !== source);
        
        targets.forEach(target => {
          if (target && target.scrollLeft !== source.scrollLeft) {
            target.scrollLeft = source.scrollLeft;
          }
        });
      };

      incomeEl.addEventListener('scroll', handleScroll, { passive: true });
      expenseEl.addEventListener('scroll', handleScroll, { passive: true });
      cashFlowEl.addEventListener('scroll', handleScroll, { passive: true });
    }, 100);

    return () => {
      clearTimeout(timer);
      if (handleScroll) {
        if (incomeEl) incomeEl.removeEventListener('scroll', handleScroll);
        if (expenseEl) expenseEl.removeEventListener('scroll', handleScroll);
        if (cashFlowEl) cashFlowEl.removeEventListener('scroll', handleScroll);
      }
    };
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
    oreOperaiStorico,
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
    budgetData, oreStorico, oreOperaiStorico, tipologieCantiere, cantieriPrev, rimanenze,
    regolePuntaNet, mappingContiPuntaNet, bozzaImportPuntaNet, importSessions, storicoImportato, aliquotaIRES, aliquotaIRAP
  ]);

  // Ref che mantiene sempre l'ultima versione di buildBackupData
  // senza causare il reset dell'interval di auto-save
  const buildBackupDataRef = useRef(buildBackupData);
  useEffect(() => {
    buildBackupDataRef.current = buildBackupData;
  }, [buildBackupData]);

  const loadFromData = useCallback((rawData: BackupData) => {
    const data = migrateBackupData(rawData);
    if (data.transactions) setTransactions(data.transactions);
    if (data.projects) setProjects(data.projects);
    
    let loadedFixed = data.fixedCategories || [...FIXED_COST_CATEGORIES];
    let loadedVar = data.variableCategories || [...VARIABLE_COST_CATEGORIES];
    
    const quotaCapitaleCat = "[FINANZA] Quota Capitale Rate Finanziamenti";
    if (loadedVar.includes(quotaCapitaleCat)) {
      loadedVar = loadedVar.filter(c => c !== quotaCapitaleCat);
    }
    if (!loadedFixed.includes(quotaCapitaleCat)) {
      loadedFixed = [...loadedFixed, quotaCapitaleCat];
    }

    // Migrazione forzata: rinomina [CANTIERE] Oneri Comunali → [CANTIERE] Oneri Comunali, Abaco e Occupazioni
    const oldOneri = "[CANTIERE] Oneri Comunali";
    const newOneri = "[CANTIERE] Oneri Comunali, Abaco e Occupazioni";
    if (loadedVar.includes(oldOneri) && !loadedVar.includes(newOneri)) {
      loadedVar = loadedVar.map(c => c === oldOneri ? newOneri : c);
    } else if (!loadedVar.includes(newOneri)) {
      const idx = loadedVar.indexOf("[CANTIERE] Rifiuti e Macerie");
      if (idx !== -1) {
        loadedVar = [...loadedVar.slice(0, idx), newOneri, ...loadedVar.slice(idx)];
      } else {
        loadedVar = [...loadedVar, newOneri];
      }
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
    if (data.spSnapshots && data.spSnapshots.length > 0) {
      const txs = data.transactions || [];
      const initData = data.initialData || { accounts: [], previousFinancing: 0, loans: [], accontiClienti: 0, altriDebitiBT: 0, mutuiBT: 0 };
      const migratedSnaps = data.spSnapshots.map(s => {
        // Migrazione una tantum: rigenera SOLO gli snapshot creati con il vecchio seed (con i due "plug"),
        // riconoscibili dalla firma dei vecchi valori. Gli snapshot già migrati o modificati a mano NON vengono toccati.
        if (s.dataRiferimento === '2025-12-31' && s.partecipazioni === 698659 && s.liquidita === 832211) {
          return generateDefault2025Snapshot(txs, initData);
        }
        return s;
      });
      setSpSnapshots(migratedSnaps);
    } else {
      const txs = data.transactions || [];
      const initData = data.initialData || { accounts: [], previousFinancing: 0, loans: [], accontiClienti: 0, altriDebitiBT: 0, mutuiBT: 0 };
      const defaultSnap = generateDefault2025Snapshot(txs, initData);
      setSpSnapshots([defaultSnap]);
    }
    if (data.budgetData) setBudgetData(data.budgetData);
    if (data.oreCantiereStorico) setOreStorico(data.oreCantiereStorico);
    if (data.oreOperaiStorico) setOreOperaiStorico(data.oreOperaiStorico);
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
    if (data.importSessions) {
      setImportSessions(data.importSessions);
    }
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
      hasUnsavedChangesRef.current = false;
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (e) {
      console.error('Save failed', e);
      setSaveStatus('error');
    }
  }, []); // ← array vuoto: saveToFile non cambia mai → interval non si resetta mai

  const triggerImmediateSave = useCallback(async (
    updatedTxs?: Transaction[], 
    updatedSessions?: ImportSession[],
    updatedStoricoImportato?: boolean,
    updatedCantieriPrev?: CantierePrev[],
    overrides?: {
      rimanenze?: RimanenzeData;
      ceManualData?: Record<string, Partial<CEData>>;
      spSnapshots?: SPSnapshot[];
      budgetData?: Record<string, BudgetData>;
      oreStorico?: Record<string, number>;
      oreOperaiStorico?: Record<string, any>;
      tipologieCantiere?: TipologiaCantiere[];
      operators?: string[];
      saldoInizialeCF?: SaldoInizialeCashFlow;
      fixedCategories?: string[];
      variableCategories?: string[];
      incomeCategories?: string[];
      aliquotaIRES?: number;
      aliquotaIRAP?: number;
    }
  ) => {
    if (!fileHandle) return;
    try {
      setSaveStatus('saving');
      const data: BackupData = {
        version: '4.0',
        timestamp: new Date().toISOString(),
        transactions: updatedTxs || transactions,
        projects,
        fixedCategories: overrides?.fixedCategories || fixedCategories,
        variableCategories: overrides?.variableCategories || variableCategories,
        incomeCategories: overrides?.incomeCategories || incomeCategories,
        supplierPresets,
        initialData,
        saldoInizialeCF: overrides?.saldoInizialeCF || saldoInizialeCF,
        operators: overrides?.operators || responsiblesList,
        ceManualData: overrides?.ceManualData || ceManualData,
        spSnapshots: overrides?.spSnapshots || spSnapshots,
        budgetData: overrides?.budgetData || budgetData,
        oreCantiereStorico: overrides?.oreStorico || oreStorico,
        oreOperaiStorico: overrides?.oreOperaiStorico || oreOperaiStorico,
        tipologieCantiere: overrides?.tipologieCantiere || tipologieCantiere,
        cantieriPrev: updatedCantieriPrev || cantieriPrev,
        rimanenze: overrides?.rimanenze || rimanenze,
        regolePuntaNet,
        mappingContiPuntaNet,
        bozzaImportPuntaNet,
        importSessions: updatedSessions || importSessions,
        storicoExcelImportato: updatedStoricoImportato !== undefined ? updatedStoricoImportato : storicoImportato,
        aliquoteFiscali: {
          ires: overrides?.aliquotaIRES !== undefined ? overrides.aliquotaIRES : aliquotaIRES,
          irap: overrides?.aliquotaIRAP !== undefined ? overrides.aliquotaIRAP : aliquotaIRAP
        },
      };

      await writeFile(fileHandle, data);
      if (backupFileHandle) {
        try {
          await writeFile(backupFileHandle, data);
        } catch (e) {
          console.error('Backup write failed', e);
        }
      }
      setLastSaved(new Date());
      setSaveStatus('saved');
      // I dati sono stati persistiti: azzera il flag così l'autosave periodico non riscrive inutilmente
      // (coerente con saveToFile). Prima restava true e provocava un save ridondante al tick successivo.
      hasUnsavedChangesRef.current = false;
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (e) {
      console.error('Immediate save failed', e);
      setSaveStatus('error');
    }
  }, [
    fileHandle, backupFileHandle, transactions, projects, fixedCategories, variableCategories,
    incomeCategories, supplierPresets, initialData, saldoInizialeCF, responsiblesList, ceManualData,
    spSnapshots, budgetData, oreStorico, oreOperaiStorico, tipologieCantiere, cantieriPrev, rimanenze, regolePuntaNet,
    mappingContiPuntaNet, bozzaImportPuntaNet, importSessions, storicoImportato, aliquotaIRES, aliquotaIRAP
  ]);

  // --- INITIALIZATION ---
  useEffect(() => {
    const init = async () => {
      if (!isFileSystemSupported) {
        setAppState('welcome'); // Mostra comunque welcome per caricare file tramite input fallback
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

  // --- REACTIVE DEBUNCED AUTO-SAVE ---
  // Ogni volta che cambia un qualsiasi dato (transazioni, rimanenze, budget, etc.),
  // salva automaticamente sul file 1.5 secondi dopo che l'utente ha smesso di digitare.
  useEffect(() => {
    if (!fileHandle || appState !== 'ready') return;
    
    hasUnsavedChangesRef.current = true;
    const timer = setTimeout(() => {
      saveToFile(fileHandle, backupFileHandle);
    }, 1500);
    
    return () => clearTimeout(timer);
  }, [buildBackupData, fileHandle, backupFileHandle, appState, saveToFile]);

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
      // Avvisa l'utente se ci sono modifiche in corso di salvataggio o non ancora salvate
      if (saveStatus === 'saving' || hasUnsavedChangesRef.current) {
        e.preventDefault();
        e.returnValue = 'Ci sono modifiche non salvate o salvataggio in corso. Uscire comunque?';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [fileHandle, saveStatus]);

  // --- HANDLERS ---
  const handleDownloadBackup = useCallback(async (forceFallback: boolean = false) => {
    try {
      const data = buildBackupData();
      const fileName = `gv_backup_${getLocalYMD()}.json`;
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

  const handleMobileFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const contents = await file.text();
      const data = JSON.parse(contents) as BackupData;
      
      const mockHandle = {
        name: file.name,
        kind: 'file',
        getFile: async () => file,
        createWritable: async () => {
          return {
            write: async (content: string) => {
              const blob = new Blob([content], { type: 'text/plain' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = file.name || 'backup-cashflow.txt';
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            },
            close: async () => {}
          };
        }
      };
      
      loadFromData(data);
      setFileHandle(mockHandle as any);
      setAppState('ready');
      e.target.value = '';
    } catch (err: any) {
      alert("Errore nel caricamento del file: " + err.message);
    }
  }, [loadFromData]);

  const handleOpenExisting = useCallback(async () => {
    if (!isFileSystemSupported) {
      fileInputRef.current?.click();
      return;
    }
    try {
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
    } catch (err: any) {
      alert("Errore nell'apertura del file: " + err.message);
    }
  }, [loadFromData, pendingBackupHandleFromIDB, pendingRulesHandleFromIDB, isFileSystemSupported]);

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
      try {
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
      } catch (err: any) {
        alert("Errore nel caricamento del file salvato: " + err.message);
        setPendingHandleFromIDB(null);
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
      try {
        const val = localStorage.getItem(key);
        return val ? JSON.parse(val) : null;
      } catch (e) {
        console.error(`Error parsing ${key} from localStorage`, e);
        return null;
      }
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
      oreOperaiStorico: getLocal('gv_ore_operai') || {},
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
        suggestedName: 'backup-cashflow.txt',
        types: [{
          description: 'GV Cash Flow Backup',
          accept: { 'text/plain': ['.txt'], 'application/json': ['.json', '.gvcf'] },
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

    // SINCRONIZZAZIONE FINANZIAMENTO NUOVO -> initialData.loans (solo se effettivamente diverso)
    if (newTransaction.type === TransactionType.INCOME && newTransaction.category === '[FINANZA] Finanziamenti Ricevuti' && newTransaction.loanDetails) {
      const loanId = newTransaction.loanSourceId || newTransaction.id;
      if (!newTransaction.loanSourceId) {
        newTransaction.loanSourceId = loanId;
      }
      setInitialData(prev => {
        const loans = prev.loans || [];
        const existing = loans.find(l => l.id === loanId);
        if (!existing) {
          const newLoan = {
            id: loanId,
            name: newTransaction.description,
            originalAmount: newTransaction.amount,
            details: newTransaction.loanDetails!
          };
          return { ...prev, loans: [...loans, newLoan] };
        }
        return prev;
      });
    }

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

    // SINCRONIZZAZIONE FINANZIAMENTO AGGIORNATO -> initialData.loans (solo se effettivamente cambiato)
    if (updated.type === TransactionType.INCOME && updated.category === '[FINANZA] Finanziamenti Ricevuti' && updated.loanDetails) {
      const loanId = updated.loanSourceId || updated.id;
      if (!updated.loanSourceId) {
        updated.loanSourceId = loanId;
      }
      setInitialData(prev => {
        const loans = prev.loans || [];
        const existing = loans.find(l => l.id === loanId);
        
        // Verifica se c'è un cambiamento reale
        const isChanged = !existing || 
          existing.name !== updated.description ||
          existing.originalAmount !== updated.amount ||
          existing.details.interestRate !== updated.loanDetails?.interestRate ||
          existing.details.rateType !== updated.loanDetails?.rateType ||
          existing.details.interestStartDate !== updated.loanDetails?.interestStartDate ||
          existing.details.principalStartDate !== updated.loanDetails?.principalStartDate ||
          existing.details.endDate !== updated.loanDetails?.endDate;

        if (isChanged) {
          if (existing) {
            return {
              ...prev,
              loans: loans.map(l => l.id === loanId ? {
                ...l,
                name: updated.description,
                originalAmount: updated.amount,
                details: updated.loanDetails!
              } : l)
            };
          } else {
            const newLoan = {
              id: loanId,
              name: updated.description,
              originalAmount: updated.amount,
              details: updated.loanDetails!
            };
            return { ...prev, loans: [...loans, newLoan] };
          }
        }
        return prev; // Nessun cambiamento reale, non aggiornare lo stato evitando race conditions
      });
    }
    
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
    // Prima di eliminare, se si tratta di un finanziamento, rimuoviamolo da initialData
    const tx = transactions.find(t => t.id === id);
    if (tx && tx.type === TransactionType.INCOME && tx.category === '[FINANZA] Finanziamenti Ricevuti') {
      const loanId = tx.loanSourceId || tx.id;
      setInitialData(prev => {
        const loans = prev.loans || [];
        return {
          ...prev,
          loans: loans.filter(l => l.id !== loanId)
        };
      });
    }
    setTransactions(prev => prev.filter(t => t.id !== id));
  };

  const handleAnnullaSessioneImport = (sessionId: string) => {
    if (!window.confirm("Sei sicuro di voler annullare questo import? Tutte le transazioni collegate verranno rimosse.")) return;
    
    const session = importSessions.find(s => s.id === sessionId);
    const isStorico = session && session.nomeFile && session.nomeFile.startsWith("Storico Excel");

    // 1. Calcola i nuovi stati usando i valori correnti
    const newSessions = importSessions.map(s => s.id === sessionId ? { ...s, annullata: true } : s);
    
    const storicoTxs = transactions.filter(t => (t.importSessionId === sessionId) || (isStorico && t.sourceRef && t.sourceRef.startsWith("Storico Excel")));
    const storicoDescSet = new Set(storicoTxs.map(t => t.description?.trim().toLowerCase()).filter(Boolean));

    const newTxs = transactions.filter(t => {
      if (t.importSessionId === sessionId) return false;
      if (isStorico && t.sourceRef && t.sourceRef.startsWith("Storico Excel")) {
        // Se la transazione ha un ID sessione ed è diversa da quella che stiamo annullando, mantienila attiva!
        if (t.importSessionId && t.importSessionId !== sessionId) {
          return true;
        }
        return false;
      }
      
      // Se stiamo annullando lo storico, rimuoviamo anche TUTTI i previsionali generati dal Wizard Inizio Anno
      if (isStorico && t.isForecast && t.sourceRef === 'Wizard Inizio Anno') return false;

      // Se è storico ed è un previsionale copiato da una delle transazioni eliminate, rimuovilo
      if (t.isForecast && isStorico && t.description) {
        const descLower = t.description.trim().toLowerCase();
        if (storicoDescSet.has(descLower)) {
          return false;
        }
      }
      return true;
    });

    // 2. Aggiorna lo stato in modo pulito
    setImportSessions(newSessions);
    setTransactions(newTxs);
    if (isStorico) {
      setStoricoImportato(false);
    }

    // 3. Salva immediatamente su disco
    triggerImmediateSave(newTxs, newSessions, isStorico ? false : undefined);
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
              
              const startUtc = parseUTCDate(c.dataInizio);
              let targetYear = startUtc.getUTCFullYear();
              let targetMonth = startUtc.getUTCMonth() + absoluteMonthOffset;
              
              if (targetMonth > 11) {
                targetYear += Math.floor(targetMonth / 12);
                targetMonth = targetMonth % 12;
              } else if (targetMonth < 0) {
                targetYear += Math.floor(targetMonth / 12) - 1;
                targetMonth = (targetMonth % 12) + 12;
              }
              
              const yearStr = targetYear.toString();
              const monthStr = (targetMonth + 1).toString().padStart(2, '0');
              const dayStr = '01';
              const txDateStr = `${yearStr}-${monthStr}-${dayStr}`;
              
              const realCeType = CATEGORY_TO_CE_TYPE[voce.categoria] || 'solo_cashflow';
              const selectedVat = c.costiVatRates && c.costiVatRates[voce.categoria] !== undefined 
                ? c.costiVatRates[voce.categoria] 
                : 22;
              const newTx: Transaction = {
                id: crypto.randomUUID(),
                date: txDateStr,
                amount: monthlyAmount,
                vatRate: selectedVat,
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
    const exists = cantieriPrev.some(item => item.id === c.id);
    const finalCantieri = exists 
      ? cantieriPrev.map(item => item.id === c.id ? c : item)
      : [...cantieriPrev, c];
      
    setCantieriPrev(finalCantieri);

    if (c.previsionaliGenerati) {
      const filteredTxs = transactions.filter(tx => !(tx.isForecast && tx.sourceRef === c.id));
      
      const tipologia = tipologieCantiere.find(t => t.id === c.tipologiaId);
      if (tipologia) {
        const newTransactions: Transaction[] = [];
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
              
              const startUtc = parseUTCDate(c.dataInizio);
              let targetYear = startUtc.getUTCFullYear();
              let targetMonth = startUtc.getUTCMonth() + absoluteMonthOffset;
              
              if (targetMonth > 11) {
                targetYear += Math.floor(targetMonth / 12);
                targetMonth = targetMonth % 12;
              } else if (targetMonth < 0) {
                targetYear += Math.floor(targetMonth / 12) - 1;
                targetMonth = (targetMonth % 12) + 12;
              }
              
              const yearStr = targetYear.toString();
              const monthStr = (targetMonth + 1).toString().padStart(2, '0');
              const dayStr = '01';
              const txDateStr = `${yearStr}-${monthStr}-${dayStr}`;
              
              const realCeType = CATEGORY_TO_CE_TYPE[voce.categoria] || 'solo_cashflow';
              const selectedVat = c.costiVatRates && c.costiVatRates[voce.categoria] !== undefined 
                ? c.costiVatRates[voce.categoria] 
                : 22;
              const newTx: Transaction = {
                id: crypto.randomUUID(),
                date: txDateStr,
                amount: monthlyAmount,
                vatRate: selectedVat,
                type: TransactionType.EXPENSE,
                category: voce.categoria,
                description: `Previsionale ${c.nome} — ${voce.categoria.split('] ')[1] || voce.categoria}`,
                project: c.nome,
                isForecast: true,
                ceType: realCeType as any,
                sourceRef: c.id
              };
              newTransactions.push(newTx);
            }
          });
        });
        const finalTxs = [...filteredTxs, ...newTransactions];
        setTransactions(finalTxs);
        triggerImmediateSave(finalTxs, undefined, undefined, finalCantieri);
      } else {
        setTransactions(filteredTxs);
        triggerImmediateSave(filteredTxs, undefined, undefined, finalCantieri);
      }
    } else {
      triggerImmediateSave(undefined, undefined, undefined, finalCantieri);
    }
  };

  const handleDeleteCantierePrev = (id: string) => {
    if (window.confirm('Eliminare questo cantiere previsionale e rimuovere automaticamente tutte le voci generate nel cash flow?')) {
      const finalCantieri = cantieriPrev.filter(c => c.id !== id);
      const finalTxs = transactions.filter(tx => !(tx.isForecast && tx.sourceRef === id));
      setCantieriPrev(finalCantieri);
      setTransactions(finalTxs);
      triggerImmediateSave(finalTxs, undefined, undefined, finalCantieri);
    }
  };

  const handleGenerateCantiereTransactions = (c: CantierePrev) => {
    const tipologia = tipologieCantiere.find(t => t.id === c.tipologiaId);
    if (!tipologia) return;

    const newTransactions: Transaction[] = [];

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
          
          const startUtc = parseUTCDate(c.dataInizio);
          let targetYear = startUtc.getUTCFullYear();
          let targetMonth = startUtc.getUTCMonth() + absoluteMonthOffset;
          
          if (targetMonth > 11) {
            targetYear += Math.floor(targetMonth / 12);
            targetMonth = targetMonth % 12;
          } else if (targetMonth < 0) {
            targetYear += Math.floor(targetMonth / 12) - 1;
            targetMonth = (targetMonth % 12) + 12;
          }
          
          const yearStr = targetYear.toString();
          const monthStr = (targetMonth + 1).toString().padStart(2, '0');
          const dayStr = '01';
          const txDateStr = `${yearStr}-${monthStr}-${dayStr}`;
          
          const realCeType = CATEGORY_TO_CE_TYPE[voce.categoria] || 'solo_cashflow';
          const selectedVat = c.costiVatRates && c.costiVatRates[voce.categoria] !== undefined 
            ? c.costiVatRates[voce.categoria] 
            : 22;
          const newTx: Transaction = {
            id: crypto.randomUUID(), // N2 fix: usa UUID invece di Math.random()
            date: txDateStr,
            amount: monthlyAmount,
            vatRate: selectedVat,
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

    const finalTxs = [...transactions, ...newTransactions];
    const finalCantieri = cantieriPrev.map(item => item.id === c.id ? { ...item, previsionaliGenerati: true } : item);

    setTransactions(finalTxs);
    setCantieriPrev(finalCantieri);
    triggerImmediateSave(finalTxs, undefined, undefined, finalCantieri);
  };

  const handleDeleteCantiereGenerated = (c: CantierePrev) => {
    // N10 fix: match esatto sul sourceRef (cantiereWizardId) invece che sulla descrizione
    const finalTxs = transactions.filter(tx => !(tx.isForecast && tx.sourceRef === c.id));
    const finalCantieri = cantieriPrev.map(item => item.id === c.id ? { ...item, previsionaliGenerati: false } : item);
    setTransactions(finalTxs);
    setCantieriPrev(finalCantieri);
    triggerImmediateSave(finalTxs, undefined, undefined, finalCantieri);
  };

  const handleAuthChange = (auth: boolean, user: string) => {
    setIsAuthorized(auth);
    setCurrentUser(user);
  };

  const handleRimanenzeChange = (anno: number, data: RimanenzeAnno) => {
    setRimanenze(prev => {
      const nextVal = {
        ...prev,
        [anno.toString()]: data,
      };
      triggerImmediateSave(undefined, undefined, undefined, undefined, { rimanenze: nextVal });
      return nextVal;
    });
  };

  const handleCEManualDataChange = (anno: number, data: Partial<CEData>) => {
    setCeManualData(prev => {
      const nextVal = {
        ...prev,
        [anno.toString()]: { ...(prev[anno.toString()] || {}), ...data }
      };
      triggerImmediateSave(undefined, undefined, undefined, undefined, { ceManualData: nextVal });
      return nextVal;
    });
  };

  const handleSpSnapshotsChange = (snapshotsOrFunc: React.SetStateAction<SPSnapshot[]>) => {
    setSpSnapshots(prev => {
      const nextVal = typeof snapshotsOrFunc === 'function' ? (snapshotsOrFunc as Function)(prev) : snapshotsOrFunc;
      triggerImmediateSave(undefined, undefined, undefined, undefined, { spSnapshots: nextVal });
      return nextVal;
    });
  };

  const handleBudgetChange = (anno: number, data: BudgetData) => {
    setBudgetData(prev => {
      const nextVal = {
        ...prev,
        [anno.toString()]: data
      };
      triggerImmediateSave(undefined, undefined, undefined, undefined, { budgetData: nextVal });
      return nextVal;
    });
  };

  const handleOreStoricoChange = (valOrFunc: React.SetStateAction<Record<string, number>>) => {
    setOreStorico(prev => {
      const nextVal = typeof valOrFunc === 'function' ? (valOrFunc as Function)(prev) : valOrFunc;
      triggerImmediateSave(undefined, undefined, undefined, undefined, { oreStorico: nextVal });
      return nextVal;
    });
  };

  const handleOreOperaiStoricoChange = (valOrFunc: React.SetStateAction<Record<string, any>>) => {
    setOreOperaiStorico(prev => {
      const nextVal = typeof valOrFunc === 'function' ? (valOrFunc as Function)(prev) : valOrFunc;
      triggerImmediateSave(undefined, undefined, undefined, undefined, { oreOperaiStorico: nextVal });
      return nextVal;
    });
  };

  const handleTipologieCantiereChange = (nextTipologieOrFunc: React.SetStateAction<TipologiaCantiere[]>) => {
    setTipologieCantiere(prev => {
      const nextVal = typeof nextTipologieOrFunc === 'function' ? (nextTipologieOrFunc as Function)(prev) : nextTipologieOrFunc;
      triggerImmediateSave(undefined, undefined, undefined, undefined, { tipologieCantiere: nextVal });
      return nextVal;
    });
  };

  const handleOperatorsChange = (nextOperatorsOrFunc: React.SetStateAction<string[]>) => {
    setResponsiblesList(prev => {
      const nextVal = typeof nextOperatorsOrFunc === 'function' ? (nextOperatorsOrFunc as Function)(prev) : nextOperatorsOrFunc;
      triggerImmediateSave(undefined, undefined, undefined, undefined, { operators: nextVal });
      return nextVal;
    });
  };

  const handleSaldoInizialeChange = (nextSaldoOrFunc: React.SetStateAction<SaldoInizialeCashFlow>) => {
    setSaldoInizialeCF(prev => {
      const nextVal = typeof nextSaldoOrFunc === 'function' ? (nextSaldoOrFunc as Function)(prev) : nextSaldoOrFunc;
      triggerImmediateSave(undefined, undefined, undefined, undefined, { saldoInizialeCF: nextVal });
      return nextVal;
    });
  };

  const handleFixedCategoriesChange = (nextCatsOrFunc: React.SetStateAction<string[]>) => {
    setFixedCategories(prev => {
      const nextVal = typeof nextCatsOrFunc === 'function' ? (nextCatsOrFunc as Function)(prev) : nextCatsOrFunc;
      triggerImmediateSave(undefined, undefined, undefined, undefined, { fixedCategories: nextVal });
      return nextVal;
    });
  };

  const handleVariableCategoriesChange = (nextCatsOrFunc: React.SetStateAction<string[]>) => {
    setVariableCategories(prev => {
      const nextVal = typeof nextCatsOrFunc === 'function' ? (nextCatsOrFunc as Function)(prev) : nextCatsOrFunc;
      triggerImmediateSave(undefined, undefined, undefined, undefined, { variableCategories: nextVal });
      return nextVal;
    });
  };

  const handleIncomeCategoriesChange = (nextCatsOrFunc: React.SetStateAction<string[]>) => {
    setIncomeCategories(prev => {
      const nextVal = typeof nextCatsOrFunc === 'function' ? (nextCatsOrFunc as Function)(prev) : nextCatsOrFunc;
      triggerImmediateSave(undefined, undefined, undefined, undefined, { incomeCategories: nextVal });
      return nextVal;
    });
  };

  const handleAliquotaIRESChange = (nextValOrFunc: React.SetStateAction<number>) => {
    setAliquotaIRES(prev => {
      const nextVal = typeof nextValOrFunc === 'function' ? (nextValOrFunc as Function)(prev) : nextValOrFunc;
      triggerImmediateSave(undefined, undefined, undefined, undefined, { aliquotaIRES: nextVal });
      return nextVal;
    });
  };

  const handleAliquotaIRAPChange = (nextValOrFunc: React.SetStateAction<number>) => {
    setAliquotaIRAP(prev => {
      const nextVal = typeof nextValOrFunc === 'function' ? (nextValOrFunc as Function)(prev) : nextValOrFunc;
      triggerImmediateSave(undefined, undefined, undefined, undefined, { aliquotaIRAP: nextVal });
      return nextVal;
    });
  };

  const handleLoadFromPastedText = useCallback((text: string) => {
    try {
      if (!text || text.trim() === '') {
        throw new Error("Il testo incollato è vuoto.");
      }
      const data = JSON.parse(text) as BackupData;
      if (!data.transactions || !data.projects) {
        throw new Error("Dati non validi: mancano transazioni o progetti.");
      }
      
      const mockHandle = {
        name: 'gv-cashflow.txt',
        kind: 'file',
        getFile: async () => new File([text], 'gv-cashflow.txt', { type: 'text/plain' }),
        createWritable: async () => {
          return {
            write: async (content: string) => {
              const blob = new Blob([content], { type: 'text/plain' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'gv-cashflow.txt';
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            },
            close: async () => {}
          };
        }
      };
      
      loadFromData(data);
      setFileHandle(mockHandle as any);
      setAppState('ready');
      alert("Dati caricati con successo!");
    } catch (e: any) {
      alert("Errore nel parsing del testo incollato: " + e.message);
    }
  }, [loadFromData]);

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
                expenseCategories={allExpenseCategories}
                onGoToManuale={handleGoToManuale}
                initialAccounts={initialData.accounts}
                initialData={initialData}
                projects={projects}
                spSnapshots={spSnapshots}
                ceManualData={ceManualData}
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
                    rimanenze={rimanenze}
                    ceManualData={ceManualData}
                />
            </div>

             <div className="pt-4">
                <CashFlowTimeline 
                  transactions={transactions} 
                  projects={projects}
                  initialData={initialData}
                  onUpdateInitialData={setInitialData}
                  saldoInizialeCF={saldoInizialeCF}
                  onUpdateSaldoIniziale={handleSaldoInizialeChange}
                  scrollContainerRef={cashFlowScrollRef}
                  currentYear={timelineYear}
                  isAuthorized={isAuthorized}
                  onGoToManuale={handleGoToManuale}
                  onOpenImportPuntaNet={() => setShowImportPuntaNet(true)}
                  onSaveTransaction={handleSaveTransaction}
                  onUpdateTransaction={handleUpdateTransaction}
                  onDeleteTransaction={handleDeleteTransaction}
                  rimanenze={rimanenze}
                  ceManualData={ceManualData}
                  aliquotaIRES={aliquotaIRES}
                  aliquotaIRAP={aliquotaIRAP}
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
                    onUpdateFixed={handleFixedCategoriesChange}
                    onUpdateVariable={handleVariableCategoriesChange}
                    onUpdateIncome={handleIncomeCategoriesChange}
                    onUpdateTipologie={handleTipologieCantiereChange}
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
                onUpdateOperators={handleOperatorsChange}
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
      case AppView.BILANCIO_RIEPILOGO:
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
            saldoInizialeCF={saldoInizialeCF}
            ceManualData={ceManualData}
            onManualDataChange={handleCEManualDataChange}
            spSnapshots={spSnapshots}
            onUpdateSnapshots={handleSpSnapshotsChange}
            budgetData={budgetData}
            onBudgetChange={handleBudgetChange}
            oreStorico={oreStorico}
            setOreStorico={handleOreStoricoChange}
            oreOperaiStorico={oreOperaiStorico}
            setOreOperaiStorico={handleOreOperaiStoricoChange}
            rimanenze={rimanenze}
            onRimanenzeChange={handleRimanenzeChange}
            onGoToManuale={handleGoToManuale}
            aliquotaIRES={aliquotaIRES}
            aliquotaIRAP={aliquotaIRAP}
            onChangeAliquotaIRES={handleAliquotaIRESChange}
            onChangeAliquotaIRAP={handleAliquotaIRAPChange}
            projects={projects}
            initialTab={
              view === AppView.CE_RICLASSIFICATO ? 'pl' :
              view === AppView.STATO_PATRIMONIALE ? 'sp' :
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
                  expenseCategories={allExpenseCategories}
                  onGoToManuale={handleGoToManuale}
                  initialAccounts={initialData.accounts}
                  initialData={initialData}
                  projects={projects}
                  spSnapshots={spSnapshots}
                  ceManualData={ceManualData}
                  rimanenze={rimanenze}
                />;
    }
  };

  // --- UI COMPONENTS ---

  const navItems = [
    { view: AppView.HOME, label: 'Home', icon: LayoutGrid },
    { view: AppView.DASHBOARD, label: 'Dashboard', icon: LayoutDashboard },
    { view: AppView.TIMELINE, label: 'Cash Flow', icon: CalendarClock },
    { view: AppView.BILANCIO_RIEPILOGO, label: 'Bilancio', icon: Building2 },
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
        handleLoadFromPastedText={handleLoadFromPastedText}
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
      <div className="bg-[#222222] py-1 border-b border-white/10 shrink-0 z-[60] font-sans">
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
             {appState === 'ready' && (
               <button
                 onClick={() => {
                   const data = buildBackupData();
                   navigator.clipboard.writeText(JSON.stringify(data, null, 2))
                     .then(() => alert("Dati copiati! Ora apri il file gv-cashflow.txt su Google Drive, incolla tutto il testo e salva."))
                     .catch(err => alert("Errore copia appunti: " + err.message));
                 }}
                 className="bg-white/5 border border-white/10 hover:bg-white/10 text-white px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 active:scale-95"
                 title="Copia tutto il database per incollarlo su Drive dal telefono"
               >
                 <Copy size={12} />
                 <span>Copia Dati (Mobile)</span>
               </button>
             )}
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
      <header className="bg-white border-b border-slate-200 z-[55] shadow-sm font-sans shrink-0">
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
              {view !== AppView.HOME && (
                <button
                  onClick={() => setShowDiagnosticModal(true)}
                  className="px-4 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] md:text-sm font-bold shadow-sm transition-all active:scale-95 flex items-center gap-2"
                  title="Diagnostica database per doppioni ed anomalie"
                >
                  <ShieldCheck size={16} />
                  <span className="hidden md:inline">Diagnostica</span>
                </button>
              )}

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
            onSave={(newTxs) => {
              const sessionId = crypto.randomUUID();
              const targetYear = newTxs.length > 0 ? new Date(newTxs[0].date).getFullYear() : new Date().getFullYear();
              
              // Tagga le transazioni con il sessionId del wizard e sourceRef
              const taggedTxs = newTxs.map(tx => ({
                ...tx,
                importSessionId: sessionId,
                sourceRef: 'Wizard Inizio Anno'
              }));

              const session: ImportSession = {
                id: sessionId,
                timestamp: new Date().toISOString(),
                nomeFile: `Wizard Inizio Anno ${targetYear}`,
                transazioniImportate: newTxs.length,
                periodoInizio: `${targetYear}-01-01`,
                periodoFine: `${targetYear}-12-31`
              };

              const updatedTxs = [...transactions, ...taggedTxs];
              const updatedSessions = [session, ...importSessions];

              setTransactions(updatedTxs);
              setImportSessions(updatedSessions);
              triggerImmediateSave(updatedTxs, updatedSessions);
            }}
            onClose={() => setShowYearStartWizard(false)}
          />
        )}

        {showCantiereWizard && (
          <CantiereWizard 
            tipologie={tipologieCantiere}
            cantieriPrev={cantieriPrev}
            projects={projects}
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
              setTransactions(prev => {
                const newTxs = [...prev, ...txs];
                // Note: triggerImmediateSave here might use a slightly stale importSessions if onSalvaSessione was just called.
                // But it's better than not saving at all. We will also save on SalvaSessione.
                triggerImmediateSave(newTxs, undefined);
                return newTxs;
              });
              // Non puliamo la bozza qui e non chiudiamo il modal: lasciamo che l'utente veda lo step "completato"
            }}
            onSalvaRegole={setRegolePuntaNet}
            onSalvaMappingConti={setMappingContiPuntaNet}
            onSalvaSessione={s => {
              setImportSessions(prev => {
                const newSessions = [s, ...prev];
                triggerImmediateSave(undefined, newSessions);
                return newSessions;
              });
            }}
            onClose={() => {
              setBozzaImportPuntaNet([]);
              setFileBanca(null);
              setFileFEP(null);
              setFileFEA(null);
              setFileFEA2(null);
              setShowImportPuntaNet(false);
            }}
          />
        )}

        {showImportStorico && (
          <ImportStoricoModal
            storicoGiaImportato={storicoImportato}
            onImport={(txs, session) => {
              const newTxs = [...transactions, ...txs];
              const newSessions = [session, ...importSessions];
              setTransactions(newTxs);
              setImportSessions(newSessions);
              setStoricoImportato(true);
              triggerImmediateSave(newTxs, newSessions, true);
            }}
            onClose={() => setShowImportStorico(false)}
          />
        )}

        {showDiagnosticModal && (
          <DiagnosticModal 
            transactions={transactions}
            onClose={() => setShowDiagnosticModal(false)}
            onFixDuplicates={(cleanedTxs) => {
              setTransactions(cleanedTxs);
              triggerImmediateSave(cleanedTxs, undefined);
              setShowDiagnosticModal(false);
            }}
          />
        )}

        {activeTermId && (
          <TermModal 
            termId={activeTermId}
            onClose={closeTerm}
          />
        )}

        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          onChange={handleMobileFileChange} 
        />
        <Footer />
      </main>
    </div>
  );
};

export default App;