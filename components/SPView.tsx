import React, { useState, useMemo } from 'react';
import { Transaction, SPSnapshot, AppView, CEData, Project } from '../types';
import { buildCEData, calcCEMetrics, calcSPMetrics, calculateRepayment, parseUTCDate, getDynamicDepreciation, generateDefault2025Snapshot, calcPrevisioneFiscale } from '../utils/gasCoreEngine';
import { exportSPPDF } from '../utils/spPdfExport';
import * as XLSX from 'xlsx';
import { parseDettaglioFEP, parseDettaglioFEA } from '../utils/puntaNetImporter';
import { calcOutstandingInvoices } from '../utils/spReconciliation';
import InfoTooltip, { InfoTooltipWrapper } from './InfoTooltip';
import { useTermModal } from './TermModal';
import { HelpButton } from './HelpPanel';
import HelpPanel from './HelpPanel';
import { parseBalanceSheetText } from '../services/geminiService';
import { 
  Building2, 
  Wallet, 
  ArrowRightLeft, 
  ShieldCheck, 
  AlertTriangle,
  CheckCircle2,
  Save,
  Plus,
  Trash2,
  TrendingUp,
  History,
  BarChart2,
  FileDigit,
  Info
} from 'lucide-react';
import { CERow, InitialBalanceBreakdown, SaldoInizialeCashFlow, RimanenzeData } from '../types';

interface SPViewProps {
  transactions: Transaction[];
  initialData: InitialBalanceBreakdown;
  snapshots: SPSnapshot[];
  onUpdateSnapshots: (snaps: SPSnapshot[]) => void;
  ceManualData: Record<string, Partial<CEData>>;
  onGoToManuale?: (section?: string, tab?: 'manuale' | 'glossario') => void;
  saldoInizialeCF: SaldoInizialeCashFlow;
  rimanenze: RimanenzeData;
  projects?: Project[];
  aliquotaIRES?: number;
  aliquotaIRAP?: number;
}

const formatEuro = (val: number) => 
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(val);

const formatPercent = (val: number) => 
  new Intl.NumberFormat('it-IT', { style: 'percent', minimumFractionDigits: 1 }).format(val);

const EMPTY_SNAPSHOT: SPSnapshot = {
  dataRiferimento: new Date().toISOString().split('T')[0],
  immImmateriali: 0, immMateriali: 0, immobiliTerreni: 0, partecipazioni: 0,
  rimanenze: 0, creditiClienti: 0, creditiTributari: 0, liquidita: 0,
  capitaleSociale: 0, riserve: 0, utileEsercizio: 0,
  mutuiLT: 0, leasingLT: 0, tfr: 0,
  fidiRT: 0, debitiFornitori: 0, debitiTributari: 0, accontiClienti: 0, altriDebitiBT: 0,
  mutuiBT: 0
};

const ManualInput = ({ label, value, onChange, icon: Icon, isManual, tooltipText, termId }: { label: string, value: number, onChange: (v: number) => void, icon?: any, isManual?: boolean, tooltipText?: string, termId?: string }) => {
  const [isFocused, setIsFocused] = React.useState(false);
  const [inputValue, setInputValue] = React.useState(value ? String(value) : '');
  const [showLocalTip, setShowLocalTip] = React.useState(false);
  const tooltipRef = React.useRef<HTMLDivElement>(null);


  React.useEffect(() => {
    if (!isFocused) {
      setInputValue(value ? String(value) : '');
    }
  }, [value, isFocused]);

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) {
        setShowLocalTip(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const displayValue = isFocused 
    ? inputValue 
    : value 
      ? new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 }).format(value)
      : '';

  const handleInputChange = (val: string) => {
    setInputValue(val);
    let clean = val.trim();
    if (clean.includes('.') && clean.includes(',')) {
      clean = clean.replace(/\./g, '').replace(',', '.');
    } else if (clean.includes(',')) {
      clean = clean.replace(',', '.');
    } else if (clean.includes('.')) {
      const parts = clean.split('.');
      const lastPart = parts[parts.length - 1];
      if (lastPart.length === 3) {
        clean = clean.replace(/\./g, '');
      }
    }
    const cleanVal = clean.replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(cleanVal) || 0;
    onChange(parsed);
  };

  return (
    <div className={`relative flex items-center justify-between p-3 border rounded-xl transition-colors ${
      isManual 
        ? 'bg-amber-50/60 border-amber-200 hover:bg-amber-100/60' 
        : 'bg-slate-50 border-slate-100 hover:bg-slate-100'
    }`}>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          {Icon && <Icon size={14} className={isManual ? 'text-amber-600' : 'text-slate-500'} />}
          <span className={`text-[11px] font-black leading-tight ${isManual ? 'text-amber-800' : 'text-slate-700'}`}>{label}</span>
        </div>
        {termId ? (
          <InfoTooltipWrapper>
            <InfoTooltip termId={termId} />
          </InfoTooltipWrapper>
        ) : (
          tooltipText && (
            <div className="relative inline-block leading-none">
              <button
                onClick={(e) => { e.stopPropagation(); setShowLocalTip(!showLocalTip); }}
                className="p-1 rounded-full hover:bg-slate-200/50 text-slate-400 hover:text-slate-600 transition-all flex items-center justify-center focus:outline-none"
                title="Informazioni"
              >
                <Info size={12} />
              </button>
              {showLocalTip && (
                <div 
                  ref={tooltipRef}
                  className="absolute z-50 bottom-full left-0 mb-2 w-64 bg-slate-900 text-white rounded-xl shadow-xl p-3 text-[10px] leading-relaxed animate-in fade-in slide-in-from-bottom-1 duration-150"
                >
                  <div className="absolute top-full left-3 w-2 h-2 bg-slate-900 transform rotate-45 -mt-1"></div>
                  {tooltipText}
                </div>
              )}
            </div>
          )
        )}
      </div>
      <div className={`flex items-center border rounded px-3 py-1.5 shadow-sm bg-white transition-all ${
        isManual 
          ? 'border-amber-300 border-dashed bg-amber-50/30' 
          : 'border-slate-300 border-dashed'
      }`}>
        <span className="text-slate-400 mr-2 text-xs">✏️</span>
        <input
          type="text"
          value={displayValue}
          placeholder="0"
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onChange={e => handleInputChange(e.target.value)}
          className={`w-24 bg-transparent text-right text-sm font-black outline-none ${
            isManual ? 'text-amber-950' : 'text-slate-800'
          }`}
        />
      </div>
    </div>
  );
};

const SPView: React.FC<SPViewProps> = ({ 
  transactions, 
  initialData, 
  snapshots, 
  onUpdateSnapshots, 
  ceManualData, 
  onGoToManuale, 
  saldoInizialeCF, 
  rimanenze, 
  projects = [],
  aliquotaIRES = 24,
  aliquotaIRAP = 3.9
}) => {
  const [currentSnap, setCurrentSnap] = useState<SPSnapshot>(snapshots[0] || EMPTY_SNAPSHOT);
  const [isEditing, setIsEditing] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'input' | 'analisi' | 'storico'>('input');
  
  // States for automatic reconciliation of Receivables/Payables
  const [reconciliationStatus, setReconciliationStatus] = useState('');
  const [reconciliationError, setReconciliationError] = useState('');

  const handleReconcile = async (feaFile: File | null, fepFile: File | null) => {
    setReconciliationError('');
    setReconciliationStatus('Elaborazione in corso...');
    try {
      let mapFEA = new Map();
      let mapFEP = new Map();

      const readFileAsWorkbook = (file: File): Promise<XLSX.WorkBook> => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            try {
              const data = new Uint8Array(e.target?.result as ArrayBuffer);
              const wb = XLSX.read(data, { type: 'array' });
              resolve(wb);
            } catch (err) {
              reject(err);
            }
          };
          reader.onerror = (err) => reject(err);
          reader.readAsArrayBuffer(file);
        });
      };

      if (feaFile) {
        const wb = await readFileAsWorkbook(feaFile);
        mapFEA = parseDettaglioFEA(wb);
      }
      if (fepFile) {
        const wb = await readFileAsWorkbook(fepFile);
        mapFEP = parseDettaglioFEP(wb);
      }

      const results = calcOutstandingInvoices(
        currentSnap.dataRiferimento,
        transactions,
        mapFEA,
        mapFEP
      );

      setCurrentSnap(prev => {
        const updated = { ...prev };
        if (feaFile) {
          updated.creditiClienti = results.creditiClienti;
        }
        if (fepFile) {
          updated.debitiFornitori = results.debitiFornitori;
        }
        return updated;
      });

      setReconciliationStatus('Riconciliazione completata con successo!');
      setTimeout(() => setReconciliationStatus(''), 4000);
    } catch (err: any) {
      console.error(err);
      setReconciliationError('Errore durante la lettura o elaborazione dei file Excel.');
      setReconciliationStatus('');
    }
  };

  // States for commercialist balance sheet import
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState('');

  const targetDateObj = useMemo(() => parseUTCDate(currentSnap.dataRiferimento), [currentSnap.dataRiferimento]);
  const targetYear = useMemo(() => targetDateObj.getUTCFullYear(), [targetDateObj]);

  const autoLiquidita = useMemo(() => {
    const accountsForYear = saldoInizialeCF.contiPerAnno?.[String(targetYear)];
    let initialBalance = 0;
    if (accountsForYear && accountsForYear.length > 0) {
      initialBalance = accountsForYear.reduce((sum, acc) => sum + acc.balance, 0);
    } else if (targetYear === 2026) {
      initialBalance = initialData.accounts.reduce((sum, acc) => sum + acc.balance, 0);
    }

    const yearTxs = transactions.filter(tx => {
      const d = parseUTCDate(tx.date);
      return d.getUTCFullYear() === targetYear && d <= targetDateObj;
    });

    const totalTransactions = yearTxs.reduce((sum, tx) => {
      return sum + (tx.type === 'INCOME' ? tx.amount : -tx.amount);
    }, 0);

    return initialBalance + totalTransactions;
  }, [transactions, initialData, saldoInizialeCF, targetYear, targetDateObj]);

  const ceMetrics = useMemo(() => {
    const year = parseUTCDate(currentSnap.dataRiferimento).getUTCFullYear();
    const ceData = buildCEData(transactions, year, ceManualData[year.toString()], 'competenza', projects, initialData);
    return calcCEMetrics(ceData, transactions, projects, initialData);
  }, [transactions, currentSnap.dataRiferimento, ceManualData, projects, initialData]);

  const previsioneFiscale = useMemo(() => {
    const rimAnno = rimanenze[String(targetYear)];
    return calcPrevisioneFiscale(
      transactions,
      targetYear,
      ceMetrics,
      rimAnno,
      aliquotaIRES / 100,
      aliquotaIRAP / 100,
      true,
      initialData
    );
  }, [transactions, targetYear, ceMetrics, rimanenze, aliquotaIRES, aliquotaIRAP, initialData]);

  const autoUtile = useMemo(() => {
    return previsioneFiscale.utileDopoImposte;
  }, [previsioneFiscale.utileDopoImposte]);

  const autoRimanenze = useMemo(() => {
    const rim = rimanenze[String(targetYear)];
    if (!rim) return 0;
    return (rim.wipFine || 0) + (rim.materialiFine || 0) + (rim.terreniFine || 0);
  }, [rimanenze, targetYear]);

  const autoFixedAssets = useMemo(() => {
    const prevYearSnap = snapshots.find(s => {
      const d = parseUTCDate(s.dataRiferimento);
      return d.getUTCFullYear() === targetYear - 1 && d.getUTCMonth() === 11 && d.getUTCDate() === 31;
    }) || generateDefault2025Snapshot(transactions, initialData);

    let immobiliTerreni = prevYearSnap ? (prevYearSnap.immobiliTerreni || 0) : 0;
    let immMateriali = prevYearSnap ? (prevYearSnap.immMateriali || 0) : 0;
    let immImmateriali = prevYearSnap ? (prevYearSnap.immImmateriali || 0) : 0;

    transactions.forEach(t => {
      const d = parseUTCDate(t.date);
      if (d.getUTCFullYear() === targetYear && d <= targetDateObj) {
        if (t.category === '[INVESTIMENTI] Acquisto Terreni per Sviluppo' || (t.description && t.description.toLowerCase().includes('acquisto terreni'))) {
          immobiliTerreni += Math.abs(t.amount);
        } else if (t.category === '[INVESTIMENTI] Acquisto Attrezzature e Macchinari' || (t.description && t.description.toLowerCase().includes('acquisto attrezzature'))) {
          immMateriali += Math.abs(t.amount);
        }
      }
    });

    const deprArray = getDynamicDepreciation(transactions, targetYear);
    const targetMonth = targetDateObj.getUTCMonth();
    const currentYearDepreciation = deprArray.slice(0, targetMonth + 1).reduce((sum, v) => sum + v, 0);

    immMateriali = Math.max(0, immMateriali - currentYearDepreciation);

    return { immobiliTerreni, immMateriali, immImmateriali };
  }, [transactions, targetDateObj, targetYear, snapshots, initialData]);

  const autoMutui = useMemo(() => {
    let totOutstanding = 0;
    let totShortTerm = 0;
    
    const allLoans: { amount: number; originalAmount: number; details: any; name: string }[] = [];
    if (initialData.loans) {
      initialData.loans.forEach(loan => {
        allLoans.push({
          amount: loan.originalAmount,
          originalAmount: loan.originalAmount,
          details: loan.details,
          name: loan.name
        });
      });
    }

    // Aggiungiamo i mutui attivati tramite transactions
    transactions.forEach(t => {
      if (t.type === 'INCOME' && t.category === '[FINANZA] Finanziamenti Ricevuti' && t.loanDetails) {
        const d = parseUTCDate(t.date);
        if (d <= targetDateObj) {
           const hasLinked = transactions.some(act => !act.isForecast && (act.linkedForecastId === t.id || (t.loanSourceId && act.loanSourceId === t.loanSourceId)));
           if (!(t.isForecast && hasLinked)) {
             allLoans.push({
               amount: t.amount,
               originalAmount: t.amount,
               details: t.loanDetails,
               name: t.description
             });
           }
        }
      }
    });

    allLoans.forEach(loan => {
      const details = loan.details;
      if (!details || !details.interestStartDate) return;
        
        const intStart = parseUTCDate(details.interestStartDate);
        if (targetDateObj < intStart) return;

        let principal = loan.originalAmount;
        let current = details.principalStartDate ? parseUTCDate(details.principalStartDate) : intStart;
        
        while (current <= targetDateObj) {
          const rep = calculateRepayment(loan.originalAmount, loan.details, current);
          principal -= rep.principal;
          const nextMonth = current.getUTCMonth() + 1;
          current = new Date(Date.UTC(current.getUTCFullYear(), nextMonth, 15));
        }

        let principalNext12 = 0;
        let currentNext = new Date(Date.UTC(targetDateObj.getUTCFullYear(), targetDateObj.getUTCMonth() + 1, 15));
        for (let m = 0; m < 12; m++) {
          const rep = calculateRepayment(loan.originalAmount, loan.details, currentNext);
          principalNext12 += rep.principal;
          const nextMonth = currentNext.getUTCMonth() + 1;
          currentNext = new Date(Date.UTC(currentNext.getUTCFullYear(), nextMonth, 15));
        }

        totShortTerm += Math.round(principalNext12 * 100) / 100;
        totOutstanding += Math.round((principal - principalNext12) * 100) / 100;
      });
    
    return { lt: totOutstanding, bt: totShortTerm };
  }, [initialData, transactions, targetDateObj]);

  const metrics = useMemo(() => calcSPMetrics(currentSnap, ceMetrics, transactions), [currentSnap, ceMetrics, transactions]);

  const handleSave = () => {
    const exists = snapshots.find(s => s.dataRiferimento === currentSnap.dataRiferimento);
    if (exists) {
      onUpdateSnapshots(snapshots.map(s => s.dataRiferimento === currentSnap.dataRiferimento ? currentSnap : s));
    } else {
      onUpdateSnapshots([...snapshots, currentSnap].sort((a, b) => b.dataRiferimento.localeCompare(a.dataRiferimento)));
    }
    setIsEditing(false);
  };

  const handleDelete = (date: string) => {
    onUpdateSnapshots(snapshots.filter(s => s.dataRiferimento !== date));
    if (currentSnap.dataRiferimento === date) {
      setCurrentSnap(snapshots.find(s => s.dataRiferimento !== date) || EMPTY_SNAPSHOT);
    }
  };

  const handleNew = () => {
    setCurrentSnap({ ...EMPTY_SNAPSHOT, dataRiferimento: new Date().toISOString().split('T')[0] });
    setIsEditing(true);
  };

  const handleImportTextSubmit = async () => {
    if (!importText.trim()) return;
    setIsImporting(true);
    setImportError('');
    try {
      const parsed = await parseBalanceSheetText(importText);
      if (parsed && Object.keys(parsed).length > 0) {
        setCurrentSnap(s => ({
          ...s,
          ...parsed
        }));
        setShowImportModal(false);
        setImportText('');
      } else {
        setImportError("Nessun dato riconosciuto. Verifica il formato del testo incollato.");
      }
    } catch (err) {
      console.error(err);
      setImportError("Errore durante l'elaborazione del bilancio. Riprova.");
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-200 no-print">
        <div>
          <h2 className="text-2xl font-black text-slate-900 flex items-center gap-3">
            <Building2 className="text-slate-900" />
            Stato Patrimoniale
          </h2>
          <p className="text-slate-500 text-sm mt-1">Fotografia della solidità e struttura finanziaria</p>
        </div>

        <div className="flex items-center gap-3">
          <HelpButton onClick={() => setShowHelp(true)} />
          <div className="flex items-center bg-slate-100 rounded-xl p-1">
            <select 
              value={currentSnap.dataRiferimento}
              onChange={(e) => {
                const found = snapshots.find(s => s.dataRiferimento === e.target.value);
                if (found) setCurrentSnap(found);
              }}
              className="bg-transparent px-4 py-2 font-black text-slate-800 outline-none text-sm"
            >
              {snapshots.map(s => (
                <option key={s.dataRiferimento} value={s.dataRiferimento}>{new Date(s.dataRiferimento).toLocaleDateString('it-IT')}</option>
              ))}
              {isEditing && <option value={currentSnap.dataRiferimento}>Nuovo Snapshot...</option>}
            </select>
          </div>
          <button 
            onClick={handleNew}
            className="p-2 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-all shadow-md"
            title="Nuovo Snapshot"
          >
            <Plus size={20} />
          </button>

          <button 
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-black rounded-xl hover:bg-amber-100 transition-all shadow-md"
            title="Importa Bilancio da Commercialista"
          >
            <FileDigit size={16} />
            <span>Importa Bilancino</span>
          </button>

          <button 
            onClick={() => {
              setCurrentSnap(s => ({
                ...s,
                liquidita: autoLiquidita,
                utileEsercizio: autoUtile,
                rimanenze: autoRimanenze,
                mutuiLT: autoMutui.lt,
                mutuiBT: autoMutui.bt,
                immobiliTerreni: autoFixedAssets.immobiliTerreni,
                immMateriali: autoFixedAssets.immMateriali,
                immImmateriali: autoFixedAssets.immImmateriali,
                debitiTributari: Math.round(previsioneFiscale.residuoDaVersare)
              }));
            }}
            className="flex items-center gap-1 px-3 py-2 bg-blue-50 border border-blue-200 text-blue-700 text-xs font-black rounded-xl hover:bg-blue-100 transition-all shadow-md"
            title="Autocompila valori da Cash Flow, CE e Magazzino"
          >
            ⚡ Autocompila
          </button>

          <button
            onClick={() => exportSPPDF({ snapshot: currentSnap, metrics })}
            className="flex items-center gap-1.5 px-3 py-2 border-2 border-slate-200 text-slate-600 hover:border-slate-400 hover:text-slate-800 text-xs font-black rounded-xl transition-all active:scale-95 shadow-sm bg-white"
            title="Esporta Bilancio e Analisi Indici in PDF Tecnico"
          >
            <span>Esporta PDF</span>
          </button>
        </div>
      </div>

      {/* Sub-Tabs Navigation */}
      <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl w-fit no-print">
        <button
          onClick={() => setActiveSubTab('input')}
          className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
            activeSubTab === 'input' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Bilancio Riclassificato
        </button>
        <button
          onClick={() => setActiveSubTab('analisi')}
          className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
            activeSubTab === 'analisi' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Analisi & Indici
        </button>
        <button
          onClick={() => setActiveSubTab('storico')}
          className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
            activeSubTab === 'storico' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Storico Snapshot
        </button>
      </div>

      <div id="sp-report-content" className="space-y-6">
        {/* Header for PDF only (hidden in UI) */}
        <div className="hidden print-only bg-white p-6 rounded-3xl border border-slate-200 mb-6">
           <h2 className="text-2xl font-black text-slate-900">Stato Patrimoniale {new Date(currentSnap.dataRiferimento).toLocaleDateString('it-IT')}</h2>
           <p className="text-slate-500 text-sm">Fotografia della solidità e struttura finanziaria del Gruppo Visentin</p>
        </div>

        {activeSubTab === 'input' && (
          <div className="space-y-6">
            {/* Riconciliazione automatica da file Punta Net */}
            <div className="bg-gradient-to-r from-amber-50/60 to-orange-50/60 border border-amber-200 rounded-3xl p-5 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4 animate-in slide-in-from-bottom-2 duration-300">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-amber-100/80 text-amber-700 rounded-2xl">
                  <FileDigit size={24} />
                </div>
                <div className="space-y-1">
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">Riconciliazione Crediti e Debiti da file Punta Net</h4>
                  <p className="text-[11px] text-slate-500 font-medium max-w-xl leading-relaxed">
                    Carica i file Excel di dettaglio FEA (Entrate) e/o FEP (Uscite) di Punta Net per calcolare automaticamente le fatture insolute (aperte) alla data di riferimento del bilancio (<strong>{new Date(currentSnap.dataRiferimento).toLocaleDateString('it-IT')}</strong>).
                  </p>
                  {reconciliationStatus && (
                    <p className="text-[10px] font-black text-amber-700 animate-pulse flex items-center gap-1">Data: {reconciliationStatus}</p>
                  )}
                  {reconciliationError && (
                    <p className="text-[10px] font-black text-rose-600 flex items-center gap-1">Attenzione: {reconciliationError}</p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 shrink-0">
                <label className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-black uppercase tracking-wider rounded-xl cursor-pointer shadow-sm transition-all select-none">
                  📁 Carica Dettaglio FEA (Entrate)
                  <input
                    type="file"
                    accept=".xlsx, .xls"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        await handleReconcile(file, null);
                      }
                    }}
                  />
                </label>
                <label className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-950 hover:bg-slate-900 text-white text-[10px] font-black uppercase tracking-wider rounded-xl cursor-pointer shadow-sm transition-all select-none">
                  📁 Carica Dettaglio FEP (Uscite)
                  <input
                    type="file"
                    accept=".xlsx, .xls"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        await handleReconcile(null, file);
                      }
                    }}
                  />
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in slide-in-from-bottom-4 duration-500">
            {/* ATTIVO */}
            <div className="space-y-6">
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-slate-800 p-4 text-white flex items-center justify-between">
                  <h3 className="font-black text-sm uppercase tracking-wider">Attivo Immobilizzato</h3>
                  <TrendingUp size={18} />
                </div>
                <div className="p-4 space-y-3">
                  <ManualInput 
                    label="Immobilizzazioni Immateriali" 
                    value={currentSnap.immImmateriali} 
                    onChange={v => setCurrentSnap(s => ({...s, immImmateriali: v}))} 
                    isManual={true} 
                    tooltipText="Beni immateriali a utilità pluriennale privi di consistenza fisica. Include le spese di costituzione o ampliamento societario, i costi di ricerca e sviluppo, marchi registrati, brevetti, software di proprietà e avviamento commerciale."
                  />
                  <div className="space-y-1">
                    <ManualInput 
                      label="Immobilizzazioni Materiali" 
                      value={currentSnap.immMateriali} 
                      onChange={v => setCurrentSnap(s => ({...s, immMateriali: v}))} 
                      tooltipText="Fattori produttivi materiali ad uso durevole che costituiscono la struttura tecnico-operativa dell'impresa. Include escavatori, gru, ponteggi, attrezzature da cantiere, veicoli commerciali, macchine d'ufficio e server informatici."
                    />
                    {currentSnap.immMateriali !== autoFixedAssets.immMateriali && (
                      <button 
                        onClick={() => setCurrentSnap(s => ({...s, immMateriali: autoFixedAssets.immMateriali}))}
                        className="text-[10px] text-blue-600 font-bold hover:underline block w-full text-right"
                      >
                        💡 Carica acquisto attrezzature ({formatEuro(autoFixedAssets.immMateriali)})
                      </button>
                    )}
                  </div>
                  <div className="space-y-1">
                    <ManualInput 
                      label="Immobili e Terreni" 
                      value={currentSnap.immobiliTerreni} 
                      onChange={v => setCurrentSnap(s => ({...s, immobiliTerreni: v}))} 
                      tooltipText="Beni immobiliari di proprietà destinati all'attività produttiva (capannoni, magazzini, sedi) o all'investimento, inclusi i terreni industriali o edificabili acquistati per lo sviluppo."
                    />
                    {currentSnap.immobiliTerreni !== autoFixedAssets.immobiliTerreni && (
                      <button 
                        onClick={() => setCurrentSnap(s => ({...s, immobiliTerreni: autoFixedAssets.immobiliTerreni}))}
                        className="text-[10px] text-blue-600 font-bold hover:underline block w-full text-right"
                      >
                        💡 Carica acquisto terreni/immobili ({formatEuro(autoFixedAssets.immobiliTerreni)})
                      </button>
                    )}
                  </div>
                  <ManualInput 
                    label="Partecipazioni" 
                    value={currentSnap.partecipazioni} 
                    onChange={v => setCurrentSnap(s => ({...s, partecipazioni: v}))} 
                    isManual={true} 
                    tooltipText="Investimenti finanziari strategici a lungo termine costituiti da quote societarie o azioni detenute in altre imprese (es. VISMAN)."
                  />
                  <div className="pt-4 border-t border-slate-100 flex justify-between items-center px-3">
                    <span className="text-[10px] font-black text-slate-400 uppercase">Totale Immobilizzato</span>
                    <span className="text-lg font-black text-slate-900">{formatEuro(metrics.totAttivoImm)}</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-slate-600 p-4 text-white flex items-center justify-between">
                  <h3 className="font-black text-sm uppercase tracking-wider">Attivo Circolante</h3>
                  <ArrowRightLeft size={18} />
                </div>
                <div className="p-4 space-y-3">
                  <div className="space-y-1">
                    <ManualInput 
                      label="Rimanenze" 
                      value={currentSnap.rimanenze} 
                      onChange={v => setCurrentSnap(s => ({...s, rimanenze: v}))} 
                      termId="wip"
                    />
                    {currentSnap.rimanenze !== autoRimanenze && (
                      <button 
                        onClick={() => setCurrentSnap(s => ({...s, rimanenze: autoRimanenze}))}
                        className="text-[10px] text-blue-600 font-bold hover:underline block w-full text-right"
                      >
                        💡 Carica valore da magazzino ({formatEuro(autoRimanenze)})
                      </button>
                    )}
                  </div>
                  <ManualInput 
                    label="Crediti Clienti" 
                    value={currentSnap.creditiClienti} 
                    onChange={v => setCurrentSnap(s => ({...s, creditiClienti: v}))} 
                    isManual={true} 
                    termId="dso"
                  />
                  <ManualInput 
                    label="Crediti Tributari" 
                    value={currentSnap.creditiTributari} 
                    onChange={v => setCurrentSnap(s => ({...s, creditiTributari: v}))} 
                    isManual={true} 
                    tooltipText="Crediti vantati nei confronti dell'Erario o di altri enti impositori. Comprende l'eccedenza IVA a credito compensabile o a rimborso, crediti d'imposta per investimenti."
                  />
                  <div className="space-y-2">
                    <ManualInput 
                      label="Disponibilità Liquide" 
                      value={currentSnap.liquidita} 
                      onChange={v => setCurrentSnap(s => ({...s, liquidita: v}))} 
                      icon={Wallet} 
                      tooltipText="Risorse monetarie prontamente disponibili e non vincolate: include i saldi attivi di tutti i conti correnti bancari e postali intestati alla società."
                    />
                    <button 
                      onClick={() => setCurrentSnap(s => ({...s, liquidita: autoLiquidita}))}
                      className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-bold text-slate-500 hover:bg-slate-100 transition-all flex items-center justify-center gap-2"
                    >
                      💡 Usa saldo Cash Flow ({formatEuro(autoLiquidita)})
                    </button>
                  </div>
                  <div className="pt-4 border-t border-slate-100 flex justify-between items-center px-3">
                    <span className="text-[10px] font-black text-slate-400 uppercase">Totale Circolante</span>
                    <span className="text-lg font-black text-slate-900">{formatEuro(metrics.totAttivoCirc)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* PASSIVO & PN */}
            <div className="space-y-6">
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-slate-900 p-4 text-white flex items-center justify-between">
                  <h3 className="font-black text-sm uppercase tracking-wider">Patrimonio Netto</h3>
                  <ShieldCheck size={18} />
                </div>
                <div className="p-4 space-y-3">
                  <ManualInput 
                    label="Capitale Sociale" 
                    value={currentSnap.capitaleSociale} 
                    onChange={v => setCurrentSnap(s => ({...s, capitaleSociale: v}))} 
                    isManual={true} 
                    tooltipText="Valore nominale dei conferimenti in denaro o in beni effettuati dai soci al momento della costituzione della società."
                  />
                  <ManualInput 
                    label="Riserves" 
                    value={currentSnap.riserve} 
                    onChange={v => setCurrentSnap(s => ({...s, riserve: v}))} 
                    isManual={true} 
                    tooltipText="Quote di utili netti conseguiti negli esercizi precedenti che non sono state distribuite sotto forma di dividendi ai soci."
                  />
                  <div className="space-y-1">
                    <ManualInput 
                      label="Utile d'Esercizio" 
                      value={currentSnap.utileEsercizio} 
                      onChange={v => setCurrentSnap(s => ({...s, utileEsercizio: v}))} 
                      termId="utile_netto"
                    />
                    {currentSnap.utileEsercizio !== autoUtile && (
                      <button 
                        onClick={() => setCurrentSnap(s => ({...s, utileEsercizio: autoUtile}))}
                        className="text-[10px] text-blue-600 font-bold hover:underline block w-full text-right"
                      >
                        💡 Carica utile da CE ({formatEuro(autoUtile)})
                      </button>
                    )}
                  </div>
                  <div className="pt-4 border-t border-slate-100 flex justify-between items-center px-3">
                    <span className="text-[10px] font-black text-slate-400 uppercase">Totale PN</span>
                    <span className="text-lg font-black text-slate-900">{formatEuro(metrics.totPN)}</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-slate-800 p-4 text-white flex items-center justify-between">
                  <h3 className="font-black text-sm uppercase tracking-wider">Passività Lungo Termine</h3>
                  <History size={18} />
                </div>
                <div className="p-4 space-y-3">
                  <div className="space-y-1">
                    <ManualInput 
                      label="Mutui e Finanziamenti LT" 
                      value={currentSnap.mutuiLT} 
                      onChange={v => setCurrentSnap(s => ({...s, mutuiLT: v}))} 
                      tooltipText="Finanziamenti erogati da istituti di credito (banche o altri intermediari abilitati) la cui scadenza contrattuale è posteriore ai 12 mesi."
                    />
                    {currentSnap.mutuiLT !== autoMutui.lt && (
                      <button 
                        onClick={() => setCurrentSnap(s => ({...s, mutuiLT: autoMutui.lt}))}
                        className="text-[10px] text-blue-600 font-bold hover:underline block w-full text-right"
                      >
                        💡 Carica debito LT calcolato ({formatEuro(autoMutui.lt)})
                      </button>
                    )}
                  </div>
                  <ManualInput 
                    label="Leasing LT" 
                    value={currentSnap.leasingLT} 
                    onChange={v => setCurrentSnap(s => ({...s, leasingLT: v}))} 
                    isManual={true} 
                    tooltipText="Debito finanziario implicito residuo oltre i 12 mesi legato a contratti di locazione finanziaria (leasing) per macchinari o automezzi."
                  />
                  <ManualInput 
                    label="TFR" 
                    value={currentSnap.tfr} 
                    onChange={v => setCurrentSnap(s => ({...s, tfr: v}))} 
                    isManual={true} 
                    tooltipText="Fondo per il Trattamento di Fine Rapporto (TFR) che rappresenta il debito maturato dall'azienda nei confronti dei propri dipendenti."
                  />
                  <div className="pt-4 border-t border-slate-100 flex justify-between items-center px-3">
                    <span className="text-[10px] font-black text-slate-400 uppercase">Totale Passivo LT</span>
                    <span className="text-lg font-black text-slate-900">{formatEuro(metrics.totPassivoLT)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* PASSIVO BT */}
            <div className="space-y-6">
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-slate-700 p-4 text-white flex items-center justify-between">
                  <h3 className="font-black text-sm uppercase tracking-wider">Passività Breve Termine</h3>
                  <AlertTriangle size={18} />
                </div>
                <div className="p-4 space-y-3">
                  <ManualInput 
                    label="Fidi e Anticipi RT" 
                    value={currentSnap.fidiRT} 
                    onChange={v => setCurrentSnap(s => ({...s, fidiRT: v}))} 
                    isManual={true} 
                    tooltipText="Finanziamenti bancari a breve termine ed elasticità di cassa. Include gli scoperti di conto corrente attivi e l'utilizzo di fidi."
                  />
                  <ManualInput 
                    label="Debiti Fornitori" 
                    value={currentSnap.debitiFornitori} 
                    onChange={v => setCurrentSnap(s => ({...s, debitiFornitori: v}))} 
                    isManual={true} 
                    termId="dpo"
                  />
                  <div className="space-y-1">
                    <ManualInput 
                      label="Debiti Tributari/Previdenziali" 
                      value={currentSnap.debitiTributari} 
                      onChange={v => setCurrentSnap(s => ({...s, debitiTributari: v}))} 
                      isManual={true} 
                      tooltipText="Debiti a breve termine verso l'Erario (IVA a debito da liquidare, imposte dovute) ed enti previdenziali."
                    />
                    {currentSnap.debitiTributari !== Math.round(previsioneFiscale.residuoDaVersare) && (
                      <button 
                        onClick={() => setCurrentSnap(s => ({...s, debitiTributari: Math.round(previsioneFiscale.residuoDaVersare)}))}
                        className="text-[10px] text-blue-600 font-bold hover:underline block w-full text-right"
                      >
                        💡 Carica tasse residue da CE ({formatEuro(Math.round(previsioneFiscale.residuoDaVersare))})
                      </button>
                    )}
                  </div>
                  <ManualInput 
                    label="Acconti Clienti" 
                    value={currentSnap.accontiClienti} 
                    onChange={v => setCurrentSnap(s => ({...s, accontiClienti: v}))} 
                    isManual={true} 
                    tooltipText="Anticipi e caparre finanziarie ricevuti da clienti privati o committenti per lavori non ancora eseguiti."
                  />
                  <ManualInput 
                    label="Altri Debiti BT" 
                    value={currentSnap.altriDebitiBT} 
                    onChange={v => setCurrentSnap(s => ({...s, altriDebitiBT: v}))} 
                    isManual={true} 
                    tooltipText="Debiti diversi a breve termine non rientranti nelle categorie precedenti, inclusi i finanziamenti soci."
                  />
                  <div className="space-y-1">
                    <ManualInput 
                      label="Quota Corrente Mutui/Leasing (entro 12m)" 
                      value={currentSnap.mutuiBT || 0} 
                      onChange={v => setCurrentSnap(s => ({...s, mutuiBT: v}))} 
                      tooltipText="La quota capitale delle rate di ammortamento di mutui bancari, finanziamenti o contratti di leasing che l'azienda riscatta entro 12 mesi."
                    />
                    {currentSnap.mutuiBT !== autoMutui.bt && (
                      <button 
                        onClick={() => setCurrentSnap(s => ({...s, mutuiBT: autoMutui.bt}))}
                        className="text-[10px] text-blue-600 font-bold hover:underline block w-full text-right"
                      >
                        💡 Carica quota 12m calcolata ({formatEuro(autoMutui.bt)})
                      </button>
                    )}
                  </div>
                  <div className="pt-4 border-t border-slate-100 flex justify-between items-center px-3">
                    <span className="text-[10px] font-black text-slate-400 uppercase">Totale Passivo BT</span>
                    <span className="text-lg font-black text-slate-900">{formatEuro(metrics.totPassivoBT)}</span>
                  </div>
                </div>
              </div>

              <div className={`p-6 rounded-3xl border shadow-sm flex items-center gap-4 ${metrics.quadratura ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-rose-50 border-rose-100 text-rose-700'}`}>
                {metrics.quadratura ? <CheckCircle2 size={24} /> : <AlertTriangle size={24} />}
                <div>
                  <p className="text-xs font-black uppercase tracking-wider">Stato Quadratura</p>
                  <p className="text-sm font-bold">{metrics.quadratura ? 'Bilancio in Pareggio' : 'Sbilancio Rilevato'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

        {activeSubTab === 'analisi' && (
          <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-[10px] font-black text-sky-600 uppercase">PFN</p>
                  <InfoTooltipWrapper>
                    <InfoTooltip 
                      termId="pfn" 
                      calculatedValues={`PFN (Posizione Finanziaria Netta):\n- Debiti Finanziari Totali: ${formatEuro(currentSnap.mutuiLT + currentSnap.mutuiBT + (currentSnap.leasingLT || 0) + currentSnap.fidiRT)}\n- Disponibilità Liquide: ${formatEuro(currentSnap.liquidita)}\n- PFN: ${formatEuro(metrics.pfn)} (${metrics.pfn <= 0 ? 'Liquidità Netta' : 'Debito Netto'})`}
                    />
                  </InfoTooltipWrapper>
                </div>
                <p className="text-2xl font-black text-slate-900">{formatEuro(metrics.pfn)}</p>
                <p className={`text-[10px] font-bold mt-1 ${metrics.pfn <= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {metrics.pfn <= 0 ? 'Liquidità Netta' : 'Debito Netto'}
                </p>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-[10px] font-black text-emerald-600 uppercase">PFN / EBITDA</p>
                  <InfoTooltipWrapper>
                    <InfoTooltip 
                      termId="pfn_ebitda" 
                      calculatedValues={`PFN / EBITDA:\n- PFN: ${formatEuro(metrics.pfn)}\n- EBITDA Anno: ${formatEuro(ceMetrics.ebitdaTot)}\n- Rapporto: ${metrics.pfnSuEbitda.toFixed(2)}x`}
                    />
                  </InfoTooltipWrapper>
                </div>
                <p className="text-2xl font-black text-slate-900">{metrics.pfnSuEbitda.toFixed(2)}x</p>
                <p className={`text-[10px] font-bold mt-1 ${metrics.pfnSuEbitda < 3 ? 'text-emerald-600' : metrics.pfnSuEbitda < 4 ? 'text-amber-600' : 'text-rose-600'}`}>
                  {metrics.pfnSuEbitda < 3 ? 'Ottimo' : metrics.pfnSuEbitda < 4 ? 'Attenzione' : 'Critico'}
                </p>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-[10px] font-black text-indigo-600 uppercase">Current Ratio</p>
                  <InfoTooltipWrapper>
                    <InfoTooltip 
                      termId="current_ratio" 
                      calculatedValues={`Current Ratio:\n- Attivo Circolante: ${formatEuro(metrics.totAttivoCirc)}\n- Passivo Breve Termine: ${formatEuro(metrics.totPassivoBT)}\n- Rapporto: ${metrics.currentRatio.toFixed(2)}`}
                    />
                  </InfoTooltipWrapper>
                </div>
                <p className="text-2xl font-black text-slate-900">{metrics.currentRatio.toFixed(2)}</p>
                <p className={`text-[10px] font-bold mt-1 ${metrics.currentRatio > 1.2 ? 'text-emerald-600' : metrics.currentRatio > 1 ? 'text-amber-600' : 'text-rose-600'}`}>
                  {metrics.currentRatio > 1.2 ? 'Solido' : metrics.currentRatio > 1 ? 'Equilibrato' : 'Illiquido'}
                </p>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-[10px] font-black text-amber-600 uppercase">Solidità</p>
                  <InfoTooltipWrapper>
                    <InfoTooltip 
                      termId="solidita_patrimoniale" 
                      calculatedValues={`Solidità Patrimoniale:\n- Patrimonio Netto (PN): ${formatEuro(metrics.totPN)}\n- Attivo Totale (Imm. + Circ.): ${formatEuro(metrics.totAttivoImm + metrics.totAttivoCirc)}\n- Rapporto: ${formatPercent(metrics.soliditaPatr)}`}
                    />
                  </InfoTooltipWrapper>
                </div>
                <p className="text-2xl font-black text-slate-900">{formatPercent(metrics.soliditaPatr)}</p>
                <p className={`text-[10px] font-bold mt-1 ${metrics.soliditaPatr > 0.3 ? 'text-emerald-600' : metrics.soliditaPatr > 0.15 ? 'text-amber-600' : 'text-rose-600'}`}>
                  {metrics.soliditaPatr > 0.3 ? 'Ottima' : metrics.soliditaPatr > 0.15 ? 'Sufficiente' : 'Debole'}
                </p>
              </div>
            </div>

            {/* Legenda Indici */}
            <div className="bg-slate-50 border border-slate-200 rounded-3xl p-5 shadow-sm">
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Info size={14} className="text-slate-500" />
                Legenda Punteggi Indici
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-[10px]">
                <div className="space-y-2">
                  <p className="font-bold text-slate-700 border-b border-slate-200 pb-1">PFN / EBITDA</p>
                  <ul className="space-y-1 text-slate-600">
                    <li><span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1"></span><span className="font-bold text-emerald-600">Ottimo:</span> &lt; 3x (Alta capacità di ripagare il debito)</li>
                    <li><span className="inline-block w-2 h-2 rounded-full bg-amber-500 mr-1"></span><span className="font-bold text-amber-600">Attenzione:</span> 3x - 4x (Soglia di allerta bancaria)</li>
                    <li><span className="inline-block w-2 h-2 rounded-full bg-rose-500 mr-1"></span><span className="font-bold text-rose-600">Critico:</span> &gt; 4x (Rischio insolvenza)</li>
                  </ul>
                </div>
                <div className="space-y-2">
                  <p className="font-bold text-slate-700 border-b border-slate-200 pb-1">Current Ratio</p>
                  <ul className="space-y-1 text-slate-600">
                    <li><span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1"></span><span className="font-bold text-emerald-600">Solido:</span> &gt; 1.2 (Liquidità abbondante a breve termine)</li>
                    <li><span className="inline-block w-2 h-2 rounded-full bg-amber-500 mr-1"></span><span className="font-bold text-amber-600">Equilibrato:</span> 1.0 - 1.2 (Margine ristretto)</li>
                    <li><span className="inline-block w-2 h-2 rounded-full bg-rose-500 mr-1"></span><span className="font-bold text-rose-600">Illiquido:</span> &lt; 1.0 (Incapacità di coprire i debiti a breve)</li>
                  </ul>
                </div>
                <div className="space-y-2">
                  <p className="font-bold text-slate-700 border-b border-slate-200 pb-1">Solidità Patrimoniale</p>
                  <ul className="space-y-1 text-slate-600">
                    <li><span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1"></span><span className="font-bold text-emerald-600">Ottima:</span> &gt; 30% (Forte indipendenza da terzi)</li>
                    <li><span className="inline-block w-2 h-2 rounded-full bg-amber-500 mr-1"></span><span className="font-bold text-amber-600">Sufficiente:</span> 15% - 30% (Soglia fisiologica)</li>
                    <li><span className="inline-block w-2 h-2 rounded-full bg-rose-500 mr-1"></span><span className="font-bold text-rose-600">Debole:</span> &lt; 15% (Sottocapitalizzazione)</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Analisi Strutturale */}
            <div className="bg-[#222222] rounded-3xl p-8 text-white shadow-xl">
              <h3 className="text-lg font-black mb-6 flex items-center gap-3">
                <BarChart2 className="text-sky-400" />
                Analisi Strutturale
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Composizione Attivo</p>
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Immobilizzato</span>
                      <span className="font-black">{formatPercent(metrics.totAttivoImm / (metrics.totAttivoImm + metrics.totAttivoCirc) || 0)}</span>
                    </div>
                    <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                      <div className="bg-sky-500 h-full" style={{ width: `${(metrics.totAttivoImm / (metrics.totAttivoImm + metrics.totAttivoCirc) || 0) * 100}%` }} />
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Circolante</span>
                      <span className="font-black">{formatPercent(metrics.totAttivoCirc / (metrics.totAttivoImm + metrics.totAttivoCirc) || 0)}</span>
                    </div>
                    <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                      <div className="bg-emerald-500 h-full" style={{ width: `${(metrics.totAttivoCirc / (metrics.totAttivoImm + metrics.totAttivoCirc) || 0) * 100}%` }} />
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Copertura Immobilizzazioni</p>
                  <div className="p-4 bg-slate-800/50 rounded-2xl border border-slate-700">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-slate-300">Indice di Copertura</span>
                      <span className={`text-lg font-black ${metrics.totPN / metrics.totAttivoImm > 1 ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {(metrics.totPN / metrics.totAttivoImm || 0).toFixed(2)}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500 leading-relaxed">
                      Indica quanto le immobilizzazioni sono finanziate dal patrimonio netto. Un valore {'>'} 1 è segno di grande solidità.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeSubTab === 'storico' && (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-black text-slate-900">Archivio Snapshot Patrimoniali</h3>
              <span className="px-3 py-1 bg-slate-100 text-slate-600 text-[10px] font-black rounded-full uppercase">
                {snapshots.length} salvataggi
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="py-4 px-6 text-[10px] font-black text-slate-500 uppercase tracking-wider">Data</th>
                    <th className="py-4 px-6 text-[10px] font-black text-slate-500 uppercase tracking-wider text-right">Tot. Attivo</th>
                    <th className="py-4 px-6 text-[10px] font-black text-slate-500 uppercase tracking-wider text-right">Patrimonio Netto</th>
                    <th className="py-4 px-6 text-[10px] font-black text-slate-500 uppercase tracking-wider text-right">PFN</th>
                    <th className="py-4 px-6 text-[10px] font-black text-slate-500 uppercase tracking-wider text-center">Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshots.map(s => {
                    const sMetrics = calcSPMetrics(s, ceMetrics, transactions);
                    return (
                      <tr key={s.dataRiferimento} className="border-t border-slate-100 hover:bg-slate-50 transition-colors group">
                        <td className="py-4 px-6 text-sm font-black text-slate-900">
                          {new Date(s.dataRiferimento).toLocaleDateString('it-IT')}
                        </td>
                        <td className="py-4 px-6 text-sm text-right font-mono text-slate-600">
                          {formatEuro(sMetrics.totAttivoImm + sMetrics.totAttivoCirc)}
                        </td>
                        <td className="py-4 px-6 text-sm text-right font-mono text-blue-600 font-bold">
                          {formatEuro(sMetrics.totPN)}
                        </td>
                        <td className="py-4 px-6 text-sm text-right font-mono">
                          <span className={sMetrics.pfn <= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                            {formatEuro(sMetrics.pfn)}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button 
                              onClick={() => { setCurrentSnap(s); setActiveSubTab('input'); }}
                              className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-all"
                              title="Carica"
                            >
                              <ArrowRightLeft size={16} />
                            </button>
                            <button 
                              onClick={() => handleDelete(s.dataRiferimento)}
                              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                              title="Elimina"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {snapshots.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-400 italic text-sm">
                        Nessuno snapshot salvato. Crea il primo cliccando su "Nuovo Snapshot".
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex gap-4">
        <button 
          onClick={handleSave}
          className="px-8 py-4 bg-slate-900 text-white rounded-2xl font-black shadow-2xl hover:bg-slate-800 transition-all flex items-center gap-3 active:scale-95"
        >
          <Save size={20} />
          SALVA SNAPSHOT
        </button>
        <button 
          onClick={() => handleDelete(currentSnap.dataRiferimento)}
          className="p-4 bg-white text-slate-600 border border-slate-100 rounded-2xl font-black shadow-2xl hover:bg-slate-50 transition-all active:scale-95"
        >
          <Trash2 size={20} />
        </button>
      </div>

      <HelpPanel 
        isOpen={showHelp}
        onClose={() => setShowHelp(false)}
        currentView={AppView.STATO_PATRIMONIALE}
        onGoToManuale={onGoToManuale}
      />

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200">
            <h3 className="text-xl font-black text-slate-900 flex items-center gap-2 mb-2">
              <FileDigit className="text-amber-600" />
              Importa da Bilancino Commercialista
            </h3>
            <p className="text-slate-500 text-xs mb-4">
              Incolla qui sotto il testo estratto o copiato dal bilancino trimestrale o di verifica fornito dal commercialista. L'intelligenza artificiale cercherà e compilerà automaticamente le voci patrimoniali (comprese quelle gialle).
            </p>

            {importError && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-100 rounded-xl text-xs font-semibold text-rose-700">
                ⚠️ {importError}
              </div>
            )}

            <textarea
              className="w-full h-64 p-4 border border-slate-200 rounded-2xl text-xs font-mono outline-none focus:border-slate-400 bg-slate-50 focus:bg-white transition-all shadow-inner"
              placeholder="Incolla il testo del bilancino qui (es. conto, descrizione, saldo dare/avere, ecc...)"
              value={importText}
              onChange={e => setImportText(e.target.value)}
              disabled={isImporting}
            />

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowImportModal(false);
                  setImportText('');
                  setImportError('');
                }}
                className="px-4 py-2 bg-slate-100 text-slate-600 text-xs font-black rounded-xl hover:bg-slate-200 transition-all"
                disabled={isImporting}
              >
                Annulla
              </button>
              <button
                onClick={handleImportTextSubmit}
                className="px-5 py-2 bg-slate-900 text-white text-xs font-black rounded-xl hover:bg-slate-800 transition-all flex items-center gap-2"
                disabled={isImporting || !importText.trim()}
              >
                {isImporting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    <span>Elaborazione in corso...</span>
                  </>
                ) : (
                  <span>Avvia Importazione ⚡</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SPView;
