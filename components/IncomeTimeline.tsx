import React, { useState, useRef, useEffect } from 'react';
import { Transaction, TransactionType, Project, LoanDetails, AppView, RinegoziazioneMutuo, InitialBalanceBreakdown, ExistingLoan } from '../types';
import { fetchEuriborRates } from '../services/geminiService';
import { CURRENCY_FORMATTER, DATE_FORMATTER } from '../constants';
import { Plus, X, ArrowRight, Save, Landmark, TrendingUp, Pencil, Trash2, Calendar, FileText, User, Shield, Search, RefreshCw } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { HelpButton } from './HelpPanel';
import HelpPanel from './HelpPanel';
import { exportMonthlyReportPDF } from '../utils/monthlyPdfExport';

interface IncomeTimelineProps {
  transactions: Transaction[];
  availableProjects?: Project[];
  onSaveTransaction?: (data: Omit<Transaction, 'id'>) => void;
  onUpdateTransaction?: (transaction: Transaction) => void;
  onDeleteTransaction?: (id: string) => void;
  onUpdateInitialData?: (data: InitialBalanceBreakdown) => void;
  initialData?: InitialBalanceBreakdown;
  scrollContainerRef?: React.RefObject<HTMLDivElement>;
  currentYear: number;
  isAuthorized?: boolean;
  onGoToManuale?: (section?: string, tab?: 'manuale' | 'glossario') => void;
}

const IncomeTimeline: React.FC<IncomeTimelineProps> = ({ 
  transactions, 
  availableProjects = [], 
  onSaveTransaction, 
  onUpdateTransaction, 
  onDeleteTransaction, 
  onUpdateInitialData,
  initialData,
  scrollContainerRef, 
  currentYear,
  isAuthorized = false,
  onGoToManuale
}) => {
  const [showHelp, setShowHelp] = useState(false);
  const months = [
    'Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 
    'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'
  ];

  // COL WIDTH CONSTANTS FOR ALIGNMENT
  const COL_LABEL_WIDTH = "min-w-[300px] w-[300px] max-w-[300px]";
  const COL_MONTH_WIDTH = "min-w-[240px] w-[240px]";
  const COL_SUB_WIDTH = "w-[120px]";
  const COL_SUMMARY_WIDTH = "w-[120px]";

  // State to handle the "Add Actual" dropdown
  const [activeCell, setActiveCell] = useState<{ key: string; monthIndex: number } | null>(null);
  const [activeTab, setActiveTab] = useState<'budget' | 'new'>('budget');
  
  // State for "New Actual" Income
  const [newActualDate, setNewActualDate] = useState('');
  const [newActualAmount, setNewActualAmount] = useState('');
  const [newActualVat, setNewActualVat] = useState('22');
  const [newActualClient, setNewActualClient] = useState('');
  const [newActualDesc, setNewActualDesc] = useState('');
  const [newActualInvoiceRef, setNewActualInvoiceRef] = useState('');

  // State to handle the "Add/Edit Forecast" form (now also used for Financing Actuals)
  const [addingForecast, setAddingForecast] = useState<{ key: string; monthIndex: number } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formType, setFormType] = useState<'FORECAST' | 'ACTUAL'>('FORECAST');
  
  const [newForecastDate, setNewForecastDate] = useState('');
  const [newForecastAmount, setNewForecastAmount] = useState('');
  const [newForecastVat, setNewForecastVat] = useState('22');
  const [newForecastClient, setNewForecastClient] = useState('');
  const [newForecastDesc, setNewForecastDesc] = useState('');

  // Loan Specific State for Timeline Form
  const [loanInterestRate, setLoanInterestRate] = useState('');
  const [loanRateType, setLoanRateType] = useState<'FIXED' | 'VARIABLE'>('FIXED');
  const [loanInterestStart, setLoanInterestStart] = useState('');
  const [loanPrincipalStart, setLoanPrincipalStart] = useState('');
  const [loanEndDate, setLoanEndDate] = useState('');
  const [spread, setSpread] = useState('1.5');
  const [indiceDiRif, setIndiceDiRif] = useState('Euribor 3M');
  const [rinegoziazioni, setRinegoziazioni] = useState<RinegoziazioneMutuo[]>([]);
  const [showAddRineg, setShowAddRineg] = useState(false);
  const [nuovaRineg, setNuovaRineg] = useState<Partial<RinegoziazioneMutuo>>({
    nuovoTipoTasso: 'FIXED', nuovoTasso: 0, spread: 1.5, dataInizio: ''
  });

  const [euriborData, setEuriborData] = useState<Record<string, any>>({});
  const [loadingEuribor, setLoadingEuribor] = useState(false);
  const [euriborErrore, setEuriborErrore] = useState<string | null>(null);

  const cercaEuribor = async () => {
    setLoadingEuribor(true);
    setEuriborErrore(null);
    try {
      const parsed = await fetchEuriborRates();
      if (parsed) {
        setEuriborData({
          'Euribor 1M':  parsed.euribor_1m,
          'Euribor 3M':  parsed.euribor_3m,
          'Euribor 6M':  parsed.euribor_6m,
          'Euribor 12M': parsed.euribor_12m,
          '_data': parsed.data_aggiornamento,
        });
        // Aggiorna automaticamente il tasso con indice + spread
        const key = `euribor_${indiceDiRif.toLowerCase().replace('euribor ', '')}`;
        const valoreIndice = (parsed as any)[key];
        if (valoreIndice !== undefined && valoreIndice !== null && spread) {
          const tassoTotale = (valoreIndice + parseFloat(spread)).toFixed(3);
          setLoanInterestRate(tassoTotale);
        }
      } else {
        throw new Error('Formato risposta non valido');
      }
    } catch (e) {
      setEuriborErrore('Impossibile recuperare i tassi.');
    }
    setLoadingEuribor(false);
  };

  const dropdownRef = useRef<HTMLDivElement>(null);
  const forecastFormRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setActiveCell(null);
      }
      if (forecastFormRef.current && !forecastFormRef.current.contains(event.target as Node)) {
        setAddingForecast(null);
        setEditingId(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Reset actual form on activeCell change
  useEffect(() => {
    if (activeCell) {
        setNewActualAmount('');
        setNewActualVat('22');
        setNewActualClient('');
        setNewActualDesc('');
        setNewActualInvoiceRef('');
        setNewActualDate(`${currentYear}-${String(activeCell.monthIndex + 1).padStart(2, '0')}-15`);
        
        const hasForecasts = getUnpaidForecasts(activeCell.key).length > 0;
        setActiveTab(hasForecasts ? 'budget' : 'new');
    }
  }, [activeCell, currentYear]);

  // Helper to calculate Gross Amount (Cifra Ivata)
  const getGrossAmount = (t: Transaction) => {
    const net = t.amount;
    const vat = t.vatRate || 0;
    return net * (1 + vat / 100);
  };

  // 1. Filter Income only
  const incomeTransactions = transactions.filter(t => t.type === TransactionType.INCOME);

  // 2. Split into Operational, Financing, and Investments
  const financingTransactions = incomeTransactions.filter(t => t.category === '[FINANZA] Finanziamenti Ricevuti');
  const investmentTransactions = incomeTransactions.filter(t => t.category === '[FINANZA] Ritorno da Investimenti / Dividendi');
  const operationalTransactions = incomeTransactions.filter(t => t.category !== '[FINANZA] Finanziamenti Ricevuti' && t.category !== '[FINANZA] Ritorno da Investimenti / Dividendi');

  // 3. Identify unique "Commesse" (Projects) from Operational Transactions only
  const transactionProjects = operationalTransactions.map(t => t.project?.trim() || 'Generale');
  const explicitProjects = availableProjects.map(p => p.name.trim());
  // Aggiunge 'Generale' solo se esistono transazioni senza commessa assegnata
  const hasTransazioniGenerali = operationalTransactions.some(
    t => !t.project?.trim()
  );
  const allProjects = new Set([
    ...(hasTransazioniGenerali ? ['Generale'] : []),
    ...transactionProjects.filter(p => p !== 'Generale'),
    ...explicitProjects
  ]);
  
  // Ensure we sort alphabetically
  const projects: string[] = Array.from<string>(allProjects).sort();

  // Helper: Is a forecast paid?
  const isForecastPaid = (forecastId: string) => {
    return incomeTransactions.some(t => !t.isForecast && t.linkedForecastId === forecastId);
  };

  // Get specific transactions for a cell
  const getCellTransactions = (key: string, monthIndex: number, isForecast: boolean) => {
    let sourceList;
    if (key === 'FINANCING') sourceList = financingTransactions;
    else if (key === 'INVESTMENT') sourceList = investmentTransactions;
    else sourceList = operationalTransactions;

    return sourceList.filter(t => {
      const tDate = new Date(t.date);
      const tProj = t.project?.trim() || 'Generale';
      const tForecast = !!t.isForecast;
      
      const matchKey = (key === 'FINANCING' || key === 'INVESTMENT') ? true : tProj === key;

      return (
        matchKey &&
        tDate.getMonth() === monthIndex &&
        tDate.getFullYear() === currentYear &&
        tForecast === isForecast
      );
    });
  };

  // Get ALL unpaid forecasts
  const getUnpaidForecasts = (key: string) => {
    let sourceList;
    if (key === 'FINANCING') sourceList = financingTransactions;
    else if (key === 'INVESTMENT') sourceList = investmentTransactions;
    else sourceList = operationalTransactions;

    return sourceList.filter(t => {
      const tProj = t.project?.trim() || 'Generale';
      const matchKey = (key === 'FINANCING' || key === 'INVESTMENT') ? true : tProj === key;
      return t.isForecast && matchKey && !isForecastPaid(t.id);
    });
  };

  // Get Monthly Totals (Gross) - Includes EVERYTHING
  const getMonthlyTotal = (monthIndex: number, isForecast: boolean) => {
    return incomeTransactions
      .filter(t => {
        const tDate = new Date(t.date);
        const tForecast = !!t.isForecast;
        return (
          tDate.getMonth() === monthIndex &&
          tDate.getFullYear() === currentYear &&
          tForecast === isForecast
        );
      })
      .reduce((sum, t) => sum + getGrossAmount(t), 0);
  };

  // Get Annual Totals per Row
  const getRowAnnualTotal = (key: string, isForecast: boolean) => {
    let sourceList;
    if (key === 'FINANCING') sourceList = financingTransactions;
    else if (key === 'INVESTMENT') sourceList = investmentTransactions;
    else sourceList = operationalTransactions;

    return sourceList.filter(t => {
      const tDate = new Date(t.date);
      const tProj = t.project?.trim() || 'Generale';
      const tForecast = !!t.isForecast;
      const matchKey = (key === 'FINANCING' || key === 'INVESTMENT') ? true : tProj === key;
      return (
        matchKey &&
        tDate.getFullYear() === currentYear &&
        tForecast === isForecast
      );
    }).reduce((sum, t) => sum + getGrossAmount(t), 0);
  };

  // Get Grand Annual Total
  const getGrandAnnualTotal = (isForecast: boolean) => {
    return incomeTransactions.filter(t => {
      const tDate = new Date(t.date);
      const tForecast = !!t.isForecast;
      return tDate.getFullYear() === currentYear && tForecast === isForecast;
    }).reduce((sum, t) => sum + getGrossAmount(t), 0);
  };

  const handleSelectForecast = (forecast: Transaction, monthIndex: number) => {
    if (!onSaveTransaction) return;

    // Create a date object for the 15th of the selected month/year
    const dateString = `${currentYear}-${String(monthIndex + 1).padStart(2, '0')}-15`;

    onSaveTransaction({
      amount: forecast.amount, 
      vatRate: forecast.vatRate, 
      date: dateString,
      description: `Incasso: ${forecast.description}`,
      type: TransactionType.INCOME,
      category: forecast.category,
      project: forecast.project,
      isForecast: false,
      linkedForecastId: forecast.id,
      loanDetails: forecast.loanDetails, // Preserve loan details if they exist
      loanSourceId: forecast.loanSourceId // Inherit source ID
    });

    setActiveCell(null);
  };

  const openForecastForm = (key: string, monthIndex: number, transaction?: Transaction, type: 'FORECAST' | 'ACTUAL' = 'FORECAST') => {
    if (!isAuthorized) return; // Prevent opening if not authorized

    if (transaction) {
      setFormType(transaction.isForecast ? 'FORECAST' : 'ACTUAL');
      setNewForecastDate(transaction.date);
      setNewForecastAmount(transaction.amount.toString());
      setNewForecastDesc(transaction.description);
      setNewForecastClient('');
      setNewForecastVat(transaction.vatRate?.toString() || '22');
      setEditingId(transaction.id);

      // Populate loan details if present
      if (transaction.loanDetails) {
          setLoanInterestRate(transaction.loanDetails.interestRate.toString());
          setLoanRateType(transaction.loanDetails.rateType);
          setLoanInterestStart(transaction.loanDetails.interestStartDate);
          setLoanPrincipalStart(transaction.loanDetails.principalStartDate);
          setLoanEndDate(transaction.loanDetails.endDate || '');
          setSpread(transaction.loanDetails.spread?.toString() || '1.5');
          setIndiceDiRif(transaction.loanDetails.indiceDiRiferimento || 'Euribor 3M');
          setRinegoziazioni(transaction.loanDetails.rinegoziazioni || []);
      } else {
          setLoanInterestRate('');
          setLoanRateType('FIXED');
          setLoanInterestStart('');
          setLoanPrincipalStart('');
          setLoanEndDate('');
          setSpread('1.5');
          setIndiceDiRif('Euribor 3M');
          setRinegoziazioni([]);
      }

    } else {
      setFormType(type);
      setNewForecastDate(`${currentYear}-${String(monthIndex + 1).padStart(2, '0')}-15`);
      setNewForecastAmount('');
      setNewForecastDesc('');
      setNewForecastClient('');
      setNewForecastVat('22');
      setEditingId(null);
      
      // Reset loan details
      setLoanInterestRate('');
      setLoanRateType('FIXED');
      setLoanInterestStart('');
      setLoanPrincipalStart('');
      setLoanEndDate('');
    }
    
    setAddingForecast({ key: key, monthIndex: monthIndex });
    setActiveCell(null);
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!isAuthorized) return;
      if (confirm("Sei sicuro di voler eliminare questa voce?")) {
          const transaction = transactions.find(t => t.id === id);
          // SYNC DIRECTION 2 (Timeline -> Gestisci) Delete
          if (transaction?.loanSourceId && initialData && onUpdateInitialData) {
            const updatedLoans = (initialData.loans || []).filter(l => l.id !== transaction.loanSourceId);
            onUpdateInitialData({ ...initialData, loans: updatedLoans });
          }
          if (onDeleteTransaction) onDeleteTransaction(id);
      }
  };

  const handleSaveNewForecast = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addingForecast || !newForecastAmount) return;

    const dateString = newForecastDate || `${currentYear}-${String(addingForecast.monthIndex + 1).padStart(2, '0')}-15`;
    const isFinancing = addingForecast.key === 'FINANCING';
    const isInvestment = addingForecast.key === 'INVESTMENT';

    let category = '[CANTIERE] SAL — Stato Avanzamento Lavori';
    let defaultDesc = formType === 'FORECAST' ? 'Acconto previsionale' : 'Incasso generico';
    let project = addingForecast.key;

    // Construct Loan Details if Financing
    let loanDetails: LoanDetails | undefined = undefined;

    if (isFinancing) {
        category = '[FINANZA] Finanziamenti Ricevuti';
        defaultDesc = 'Erogazione prestito';
        project = '';
        
        loanDetails = {
            interestRate: parseFloat(loanInterestRate) || 0,
            rateType: loanRateType,
            spread: loanRateType === 'VARIABLE' ? parseFloat(spread) || undefined : undefined,
            indiceDiRiferimento: loanRateType === 'VARIABLE' ? indiceDiRif : undefined,
            interestStartDate: loanInterestStart,
            principalStartDate: loanPrincipalStart,
            endDate: loanEndDate,
            rinegoziazioni: rinegoziazioni.length > 0 ? rinegoziazioni : undefined
        };
    } else if (isInvestment) {
        category = '[FINANZA] Ritorno da Investimenti / Dividendi';
        defaultDesc = 'Dividendi/Interessi';
        project = '';
    }

    let finalDesc = newForecastDesc || defaultDesc;
    if (newForecastClient.trim()) {
        finalDesc = `${newForecastClient.trim()} - ${finalDesc}`;
    }

    const transactionData: any = {
        amount: parseFloat(newForecastAmount),
        vatRate: parseFloat(newForecastVat),
        date: dateString,
        description: finalDesc,
        type: TransactionType.INCOME,
        category: category,
        project: project,
        isForecast: formType === 'FORECAST',
        loanDetails
    };

    // SYNC DIRECTION 2 (Timeline -> Gestisci) Create/Update
    if (isFinancing && initialData && onUpdateInitialData) {
        if (editingId) {
            const original = transactions.find(t => t.id === editingId);
            if (original?.loanSourceId) {
                // Update corresponding loan in initialData
                const updatedLoans = (initialData.loans || []).map(l => 
                    l.id === original.loanSourceId ? {
                        ...l,
                        name: transactionData.description,
                        originalAmount: transactionData.amount,
                        details: transactionData.loanDetails
                    } : l
                );
                onUpdateInitialData({ ...initialData, loans: updatedLoans });
                transactionData.loanSourceId = original.loanSourceId;
            }
        } else {
            // New transaction - generate link
            const newLoanId = crypto.randomUUID();
            transactionData.loanSourceId = newLoanId;
            const newLoan: ExistingLoan = {
                id: newLoanId,
                name: transactionData.description,
                originalAmount: transactionData.amount,
                details: transactionData.loanDetails!
            };
            onUpdateInitialData({
                ...initialData,
                loans: [newLoan, ...(initialData.loans || [])]
            });
        }
    }

    if (editingId && onUpdateTransaction) {
       const original = transactions.find(t => t.id === editingId);
       
       onUpdateTransaction({
           ...original!,
           ...transactionData,
           isForecast: formType === 'FORECAST', 
           id: editingId,
           sourceRef: original?.sourceRef,  // ← preserva origine
       });
    } else if (onSaveTransaction) {
        onSaveTransaction(transactionData);
    }

    setAddingForecast(null);
    setEditingId(null);
  };

  // --- Handle Save Immediate Actual Income ---
  const handleSaveNewActual = (e: React.FormEvent) => {
      e.preventDefault();
      if (!activeCell || !newActualAmount) return;

      const isFinancing = activeCell.key === 'FINANCING';
      const isInvestment = activeCell.key === 'INVESTMENT';

      let category = '[CANTIERE] SAL — Stato Avanzamento Lavori';
      let project = activeCell.key;

      if (isFinancing) {
          category = '[FINANZA] Finanziamenti Ricevuti';
          project = '';
      } else if (isInvestment) {
          category = '[FINANZA] Ritorno da Investimenti / Dividendi';
          project = '';
      }

      // Construct Description: Client - Desc (Rif.)
      let finalDesc = newActualDesc || 'Incasso diretto';
      if (newActualClient.trim()) {
          finalDesc = `${newActualClient.trim()} - ${finalDesc}`;
      }
      if (newActualInvoiceRef.trim()) {
          finalDesc = `${finalDesc} (Rif. ${newActualInvoiceRef.trim()})`;
      }

      const transactionData: any = {
          amount: parseFloat(newActualAmount),
          vatRate: parseFloat(newActualVat),
          date: newActualDate,
          description: finalDesc,
          type: TransactionType.INCOME,
          category: category,
          project: project,
          isForecast: false
      };

      if (isFinancing && initialData && onUpdateInitialData) {
          const newLoanId = crypto.randomUUID();
          transactionData.loanSourceId = newLoanId;
          const newLoan: ExistingLoan = {
              id: newLoanId,
              name: transactionData.description,
              originalAmount: transactionData.amount,
              details: {
                  interestRate: 0,
                  rateType: 'FIXED',
                  interestStartDate: newActualDate,
                  principalStartDate: newActualDate
              }
          };
          onUpdateInitialData({
              ...initialData,
              loans: [newLoan, ...(initialData.loans || [])]
          });
      }

      if (onSaveTransaction) {
          onSaveTransaction(transactionData);
      }
      setActiveCell(null);
  };

  const renderRow = (key: string, label: string, rowType: 'standard' | 'financing' | 'investment', idx: number) => {
    const annualForecast = getRowAnnualTotal(key, true);
    const annualActual = getRowAnnualTotal(key, false);
    
    let rowBgClass = '';
    let stickyBgClass = '';
    let textClass = '';
    let subTextClass = '';
    let forecastBg = '';
    let actualBg = '';
    let forecastItemClass = '';
    let actualItemClass = '';
    let icon = null;
    let subLabel = '';

    if (rowType === 'financing') {
        rowBgClass = 'bg-sky-50 hover:bg-sky-50 border-b border-sky-100';
        stickyBgClass = 'bg-sky-50 shadow-[4px_0_4px_-2px_rgba(0,0,0,0.1)]';
        textClass = 'text-sky-900';
        subTextClass = 'text-sky-600';
        forecastBg = 'bg-sky-100';
        actualBg = 'bg-sky-200';
        forecastItemClass = 'bg-sky-50 text-sky-700 border-sky-100';
        actualItemClass = 'text-sky-700';
        icon = <Landmark size={16} className="text-sky-600" />;
        subLabel = 'Prestiti, Mutui, Finanziamenti';
    } else if (rowType === 'investment') {
        rowBgClass = 'bg-amber-50 hover:bg-amber-50 border-b border-amber-100';
        stickyBgClass = 'bg-amber-50 shadow-[4px_0_4px_-2px_rgba(0,0,0,0.1)]';
        textClass = 'text-amber-900';
        subTextClass = 'text-amber-600/80';
        forecastBg = 'bg-amber-100';
        actualBg = 'bg-amber-200';
        forecastItemClass = 'bg-amber-50 text-amber-800 border-amber-100';
        actualItemClass = 'text-amber-800';
        icon = <TrendingUp size={16} className="text-amber-600" />;
        subLabel = 'Dividendi, Cedole, Gain';
    } else {
        rowBgClass = `border-b border-emerald-50 hover:bg-emerald-50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-emerald-50'}`;
        stickyBgClass = 'bg-inherit shadow-[4px_0_4px_-2px_rgba(0,0,0,0.05)]';
        textClass = 'text-emerald-900';
        forecastBg = 'bg-transparent';
        actualBg = 'bg-emerald-50';
        forecastItemClass = 'bg-emerald-50 text-emerald-600 border-emerald-50';
        actualItemClass = 'text-emerald-700';
    }

    return (
      <tr key={key} className={rowBgClass}>
        {/* Name Column */}
        <td className={`px-6 py-4 font-medium sticky left-0 z-10 border-r border-slate-200 align-top ${stickyBgClass} ${textClass} ${COL_LABEL_WIDTH}`}>
          <div className="flex items-center gap-2">
             {icon}
             <div className="truncate max-w-[280px]" title={label}>{label}</div>
          </div>
          {subLabel && <div className={`text-[10px] font-normal mt-0.5 ${subTextClass}`}>{subLabel}</div>}
        </td>
        
        {months.map((_, mIdx) => {
          const forecasts = getCellTransactions(key, mIdx, true);
          const actuals = getCellTransactions(key, mIdx, false);
          const actualSum = actuals.reduce((sum, t) => sum + getGrossAmount(t), 0);
          
          const isCellActive = activeCell?.key === key && activeCell?.monthIndex === mIdx;
          const isAddingForecast = addingForecast?.key === key && addingForecast?.monthIndex === mIdx;

          return (
            <React.Fragment key={`${key}-${mIdx}`}>
              {/* Previsione Column */}
              <td className={`px-1 py-3 text-center border-r border-slate-100 align-top relative group ${forecastBg} ${COL_SUB_WIDTH}`}>
                <div className="flex flex-col gap-1 items-center w-full min-h-[30px]">
                  {forecasts.map(t => {
                    const paid = isForecastPaid(t.id);
                    return (
                      <div 
                        key={t.id} 
                        className={`relative group/item flex flex-col items-center justify-center px-2 py-1 rounded-md w-full border transition-all ${
                          paid 
                            ? 'bg-slate-50 text-slate-600 border-slate-100 opacity-70' 
                            : `${forecastItemClass} shadow-sm ${isAuthorized ? 'cursor-pointer hover:shadow-md' : ''}`
                        } ${rowType === 'standard' && !paid ? 'bg-slate-50 text-slate-600 border-slate-100' : ''}`}
                        title={`${t.description} - ${paid ? 'Incassato' : 'In attesa'}`}
                      >
                         {/* Edit/Delete Overlay - ONLY IF AUTHORIZED */}
                         {!paid && isAuthorized && (
                            <div className="absolute inset-0 bg-white/90 hidden group-hover/item:flex items-center justify-center gap-2 rounded-md z-10">
                                <button 
                                    onClick={(e) => { e.stopPropagation(); openForecastForm(key, mIdx, t, 'FORECAST'); }}
                                    className="p-1 hover:text-slate-600 text-slate-400"
                                >
                                    <Pencil size={12} />
                                </button>
                                <button 
                                    onClick={(e) => handleDelete(t.id, e)}
                                    className="p-1 hover:text-slate-600 text-slate-400"
                                >
                                    <Trash2 size={12} />
                                </button>
                            </div>
                         )}

                        <span className="text-[11px] font-mono font-medium leading-none flex items-center gap-1">
                          {t.loanDetails && <Landmark size={8} className="text-slate-400" />}
                          {t.category === '[FINANZA] Ritorno da Investimenti / Dividendi' && <TrendingUp size={8} className="text-slate-400" />}
                          {CURRENCY_FORMATTER.format(getGrossAmount(t))}
                        </span>
                        <span className="text-[9px] opacity-80 truncate w-full text-center mt-0.5 max-w-[90px]">
                          {t.description}
                        </span>
                      </div>
                    );
                  })}
                  
                  {/* Add Forecast Button - ONLY IF AUTHORIZED */}
                  {isAuthorized && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openForecastForm(key, mIdx, undefined, 'FORECAST');
                      }}
                      className={`mt-1 p-1.5 rounded-full bg-slate-50 border border-slate-200 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all shadow-sm ${forecasts.length === 0 ? 'opacity-80' : 'opacity-0 group-hover:opacity-100'}`}
                      title="Aggiungi Previsione"
                    >
                      <Plus size={14} />
                    </button>
                  )}

                  {/* Add/Edit Forecast Form Popover */}
                  {isAddingForecast && (
                    <div ref={forecastFormRef} className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-80 bg-white rounded-xl shadow-xl border border-slate-200 z-50 p-4 text-left animate-in zoom-in-95 duration-200 ring-1 ring-black/5">
                      <div className="flex justify-between items-center mb-3">
                        <h4 className="text-xs font-bold text-slate-700 uppercase">
                           {editingId 
                                ? (formType === 'FORECAST' ? 'Modifica Previsione' : 'Modifica Consuntivo') 
                                : (formType === 'FORECAST' ? 'Nuova Previsione' : 'Nuovo Consuntivo')
                           }
                        </h4>
                        <button onClick={() => { setAddingForecast(null); setEditingId(null); }} className="text-slate-400 hover:text-slate-600">
                          <X size={14} />
                        </button>
                      </div>
                      <form onSubmit={handleSaveNewForecast} className="space-y-3">
                        {(() => {
                          const currentProject = availableProjects.find(p => p.name === addingForecast.key);
                          const projectIntestatari = currentProject?.intestatari || [];
                          return (
                            <>
                              <div className="flex gap-2">
                                <div className="w-full relative">
                                    <Calendar size={12} className="absolute left-2 top-2 text-slate-400" />
                                    <input 
                                        type="date" 
                                        value={newForecastDate} 
                                        onChange={e => setNewForecastDate(e.target.value)} 
                                        className="w-full pl-6 pr-1 py-1 text-[10px] border rounded text-slate-900 outline-none focus:border-slate-500" 
                                    />
                                </div>
                              </div>
                              <div className="relative">
                                  <User size={12} className="absolute left-2 top-2 text-slate-400" />
                                  {projectIntestatari.length > 0 ? (
                                      <select 
                                          value={newForecastClient} 
                                          onChange={e => setNewForecastClient(e.target.value)}
                                          className="w-full pl-6 pr-1 py-1 text-[10px] border rounded text-slate-900 outline-none focus:border-slate-500 bg-white"
                                      >
                                          <option value="">-- Seleziona Intestatario --</option>
                                          {projectIntestatari.map(int => (
                                              <option key={int.id} value={int.nome}>{int.nome}</option>
                                          ))}
                                      </select>
                                  ) : (
                                      <input 
                                          type="text" 
                                          value={newForecastClient} 
                                          onChange={e => setNewForecastClient(e.target.value)} 
                                          className="w-full pl-6 pr-1 py-1 text-[10px] border rounded text-slate-900 outline-none focus:border-slate-500" 
                                          placeholder="Intestatario Pagamento" 
                                      />
                                  )}
                              </div>
                              <div>
                                <input
                                  type="text"
                                  value={newForecastDesc}
                                  onChange={(e) => setNewForecastDesc(e.target.value)}
                                  className="w-full px-2 py-1 text-[10px] rounded border border-slate-300 focus:border-slate-500 outline-none"
                                  placeholder="Descrizione Opzionale"
                                />
                              </div>
                              <div className="flex gap-2">
                                <input
                                  type="number"
                                  step="0.01"
                                  required
                                  value={newForecastAmount}
                                  onChange={(e) => setNewForecastAmount(e.target.value)}
                                  className="w-2/3 p-1 text-[10px] rounded border border-slate-300 focus:border-slate-500 outline-none font-mono"
                                  placeholder="€ Imponibile"
                                />
                                <select
                                    value={newForecastVat}
                                    onChange={(e) => setNewForecastVat(e.target.value)}
                                    className="w-1/3 p-1 text-[10px] rounded border border-slate-300 focus:border-slate-500 outline-none bg-white"
                                >
                                    <option value="22">22%</option>
                                    <option value="10">10%</option>
                                    <option value="4">4%</option>
                                    <option value="0">0%</option>
                                </select>
                              </div>
                            </>
                          );
                        })()}


                        {/* LOAN FIELDS IF FINANCING ROW */}
                        {addingForecast.key === 'FINANCING' && (
                            <div className="bg-slate-50/50 p-3 rounded-lg border border-slate-100 mt-2 space-y-2 max-h-[300px] overflow-y-auto">
                                 <div className="text-[10px] font-bold text-slate-700 border-b border-slate-200 pb-1 flex items-center gap-1">
                                    <Landmark size={12} />
                                    Parametri Prestito
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="block text-[9px] text-slate-600 font-semibold mb-0.5">Tasso %</label>
                                        <input type="number" step="0.01" value={loanInterestRate} onChange={e => setLoanInterestRate(e.target.value)} className="w-full text-xs p-1.5 border border-slate-200 rounded outline-none focus:border-slate-500" placeholder="4.5"/>
                                    </div>
                                    <div>
                                        <label className="block text-[9px] text-slate-600 font-semibold mb-0.5">Tipo</label>
                                        <select value={loanRateType} onChange={e => setLoanRateType(e.target.value as 'FIXED' | 'VARIABLE')} className="w-full text-xs p-1.5 border border-slate-200 rounded outline-none focus:border-slate-500 bg-white"><option value="FIXED">Fisso</option><option value="VARIABLE">Variabile</option></select>
                                    </div>
                                </div>

                                {loanRateType === 'VARIABLE' && (
                                  <div className="space-y-2 p-2 bg-blue-50/50 rounded border border-blue-100">
                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <label className="block text-[9px] text-blue-600 font-semibold mb-0.5">Indice</label>
                                        <select value={indiceDiRif} onChange={e => setIndiceDiRif(e.target.value)} className="w-full text-[10px] p-1 border border-blue-200 rounded bg-white">
                                          <option>Euribor 1M</option>
                                          <option>Euribor 3M</option>
                                          <option>Euribor 6M</option>
                                          <option>Euribor 12M</option>
                                        </select>
                                      </div>
                                      <div>
                                        <label className="block text-[9px] text-blue-600 font-semibold mb-0.5">Spread %</label>
                                        <input type="number" step="0.01" value={spread} onChange={e => setSpread(e.target.value)} className="w-full text-[10px] p-1 border border-blue-200 rounded" />
                                      </div>
                                    </div>
                                    
                                    <div className="flex items-center justify-between gap-2">
                                      <button 
                                        type="button"
                                        onClick={cercaEuribor}
                                        disabled={loadingEuribor}
                                        className="flex items-center gap-1.5 px-2 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-[9px] font-bold rounded transition-colors"
                                      >
                                        {loadingEuribor ? <RefreshCw size={10} className="animate-spin" /> : <Search size={10} />}
                                        {loadingEuribor ? 'Ricerca...' : 'Cerca Euribor Live'}
                                      </button>
                                      {euriborData._data && (
                                        <span className="text-[8px] text-blue-400/70 italic">Aggiornato: {euriborData._data}</span>
                                      )}
                                    </div>
                                    {euriborErrore && <p className="text-[8px] text-rose-400">{euriborErrore}</p>}
                                  </div>
                                )}

                                <div className="space-y-1">
                                  <div className="flex justify-between items-center">
                                    <label className="text-[9px] font-bold text-slate-500 uppercase">Rinegoziazioni</label>
                                    <button type="button" onClick={() => setShowAddRineg(!showAddRineg)} className="text-[9px] bg-slate-200 px-1 rounded hover:bg-slate-300">
                                      {showAddRineg ? 'Chiudi' : '+ Aggiungi'}
                                    </button>
                                  </div>
                                  
                                  {rinegoziazioni.map((r, i) => (
                                    <div key={i} className="text-[9px] bg-amber-50 p-1 rounded border border-amber-100 flex justify-between items-center">
                                      <span>{new Date(r.dataInizio).toLocaleDateString()} → {r.nuovoTasso}% ({r.nuovoTipoTasso})</span>
                                      <button type="button" onClick={() => setRinegoziazioni(prev => prev.filter((_, j) => j !== i))} className="text-red-400"><X size={10} /></button>
                                    </div>
                                  ))}

                                  {showAddRineg && (
                                    <div className="p-2 bg-amber-50 border border-amber-200 rounded space-y-1">
                                      <input type="date" value={nuovaRineg.dataInizio} onChange={e => setNuovaRineg(p => ({...p, dataInizio: e.target.value}))} className="w-full text-[10px] p-1 border rounded" />
                                      <div className="flex gap-1">
                                        <input type="number" step="0.01" value={nuovaRineg.nuovoTasso} onChange={e => setNuovaRineg(p => ({...p, nuovoTasso: parseFloat(e.target.value)}))} className="w-1/2 text-[10px] p-1 border rounded" placeholder="Tasso %" />
                                        <select value={nuovaRineg.nuovoTipoTasso} onChange={e => setNuovaRineg(p => ({...p, nuovoTipoTasso: e.target.value as any}))} className="w-1/2 text-[10px] p-1 border rounded bg-white">
                                          <option value="FIXED">Fisso</option>
                                          <option value="VARIABLE">Variabile</option>
                                        </select>
                                      </div>
                                      <button type="button" onClick={() => {
                                        if (nuovaRineg.dataInizio && nuovaRineg.nuovoTasso) {
                                          setRinegoziazioni(prev => [...prev, nuovaRineg as RinegoziazioneMutuo]);
                                          setNuovaRineg({ nuovoTipoTasso: 'FIXED', nuovoTasso: 0, spread: 1.5, dataInizio: '' });
                                          setShowAddRineg(false);
                                        }
                                      }} className="w-full bg-amber-500 text-white text-[9px] font-bold py-1 rounded">Aggiungi</button>
                                    </div>
                                  )}
                                </div>

                                <div><label className="block text-[9px] text-slate-600 font-semibold mb-0.5">Inizio Interessi</label><input type="date" value={loanInterestStart} onChange={e => setLoanInterestStart(e.target.value)} className="w-full text-xs p-1.5 border border-slate-200 rounded outline-none focus:border-slate-500" /></div>
                                <div><label className="block text-[9px] text-slate-600 font-semibold mb-0.5">Inizio Rate (Capitale)</label><input type="date" value={loanPrincipalStart} onChange={e => setLoanPrincipalStart(e.target.value)} className="w-full text-xs p-1.5 border border-slate-200 rounded outline-none focus:border-slate-500" /></div>
                                <div><label className="block text-[9px] text-slate-600 font-semibold mb-0.5">Data Estinzione / Fine</label><input type="date" value={loanEndDate} onChange={e => setLoanEndDate(e.target.value)} className="w-full text-xs p-1.5 border border-slate-200 rounded outline-none focus:border-slate-500" /></div>
                            </div>
                        )}

                        <div className="flex gap-2">
                          <button
                            type="submit"
                            className="flex-1 bg-slate-900 hover:bg-black text-white text-xs font-bold py-2 rounded-lg flex items-center justify-center gap-1 transition-colors"
                          >
                            <Save size={14} />
                            Salva
                          </button>
                          {editingId && formType === 'FORECAST' && (
                            <button
                              type="button"
                              onClick={() => {
                                setFormType('ACTUAL');
                                // We don't submit yet, just change the type so the user can see it's now an actual
                                // and maybe adjust the date/description before saving.
                              }}
                              className="px-3 bg-slate-800 hover:bg-slate-900 text-white text-[10px] font-bold rounded-lg transition-colors"
                              title="Converti in Consuntivo"
                            >
                              Converti
                            </button>
                          )}
                        </div>
                      </form>
                    </div>
                  )}
                </div>
              </td>

              {/* Consuntivo Column (Interactive) */}
              <td className={`px-1 py-3 text-center border-r border-slate-200 align-top relative group ${actualBg} ${COL_SUB_WIDTH}`}>
                <div className="flex flex-col items-center justify-between min-h-[30px] w-full">
                  {actualSum > 0 ? (
                      <div className="flex flex-col items-center w-full">
                          <span className={`font-mono font-bold text-xs ${actualItemClass} flex items-center justify-center gap-1`}>
                              {actuals.some(t => !!t.loanDetails) && <Landmark size={8} className="text-emerald-400" />}
                              {actuals.some(t => t.category === '[FINANZA] Ritorno da Investimenti / Dividendi') && <TrendingUp size={8} className="text-emerald-400" />}
                              {CURRENCY_FORMATTER.format(actualSum)}
                          </span>
                          {actuals.map(t => (
                              <div key={t.id} className="group/item flex items-center justify-center w-full relative">
                                  <span className="text-[9px] text-emerald-500 truncate w-full max-w-[90px] text-center mt-0.5 flex items-center justify-center gap-1"
                                        title={t.sourceRef ?? t.description}>
                                      {t.loanDetails && <Landmark size={8} className="text-emerald-400/70" />}
                                      {t.category === '[FINANZA] Ritorno da Investimenti / Dividendi' && <TrendingUp size={8} className="text-emerald-400/70" />}
                                      {t.sourceRef && (
                                        <span className="text-[7px] font-black text-blue-400 shrink-0">PN</span>
                                      )}
                                      {t.description}
                                  </span>
                                  {/* Edit Actual Actions - ONLY IF AUTHORIZED */}
                                  {isAuthorized && (
                                    <div className="absolute right-0 -top-1 bg-white shadow-sm border border-slate-100 rounded px-1 hidden group-hover/item:flex gap-1">
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); openForecastForm(key, mIdx, t, 'ACTUAL'); }} 
                                            className="text-slate-400 hover:text-slate-600"
                                        >
                                            <Pencil size={10} />
                                        </button>
                                        <button 
                                            onClick={(e) => handleDelete(t.id, e)} 
                                            className="text-slate-400 hover:text-slate-600"
                                        >
                                            <Trash2 size={10} />
                                        </button>
                                    </div>
                                  )}
                              </div>
                          ))}
                      </div>
                  ) : (
                    <span className="text-slate-300">-</span>
                  )}

                  {/* Add Button - ONLY IF AUTHORIZED */}
                  {isAuthorized && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            // If FINANCING, use the Full Form (Forecast-style) for actuals to include loan details
                            if (key === 'FINANCING') {
                                openForecastForm(key, mIdx, undefined, 'ACTUAL');
                            } else {
                                // Default simple dropdown for others
                                setActiveCell({ key: key, monthIndex: mIdx });
                                setAddingForecast(null);
                            }
                        }}
                        className={`mt-2 p-1.5 rounded-full bg-slate-50 border border-slate-200 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all shadow-sm ${actualSum > 0 ? 'opacity-0 group-hover:opacity-100' : 'opacity-80'}`}
                        title="Inserisci incasso"
                    >
                        <Plus size={14} />
                    </button>
                  )}

                  {/* Dropdown for selecting forecast */}
                  {isCellActive && (
                    <div ref={dropdownRef} className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-80 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 p-0 text-left animate-in zoom-in-95 duration-200 overflow-hidden ring-1 ring-black/5">
                      <div className="bg-slate-50 p-2 flex justify-between items-center border-b border-slate-100">
                        <span className="text-[10px] font-bold text-slate-600 uppercase">Registra Incasso</span>
                        <button onClick={() => setActiveCell(null)}><X size={12} /></button>
                      </div>

                      {/* TABS */}
                      <div className="flex text-[10px] font-semibold bg-slate-50 border-b border-slate-100">
                           <button onClick={() => setActiveTab('budget')} className={`flex-1 py-2 ${activeTab === 'budget' ? 'text-slate-600 bg-white border-r border-slate-100' : 'text-slate-400'}`}>Da Budget</button>
                           <button onClick={() => setActiveTab('new')} className={`flex-1 py-2 ${activeTab === 'new' ? 'text-slate-600 bg-white border-l border-slate-100' : 'text-slate-400'}`}>Nuovo Incasso</button>
                      </div>
                      
                      <div className="p-2 bg-white">
                        {activeTab === 'budget' ? (
                            <div className="max-h-60 overflow-y-auto space-y-1">
                                {getUnpaidForecasts(key).length === 0 ? (
                                <div className="text-center py-4 px-2">
                                    <p className="text-xs text-slate-500 font-medium">Nessuna previsione pendente</p>
                                    <button 
                                        onClick={() => setActiveTab('new')}
                                        className="text-xs text-slate-600 hover:underline mt-2"
                                    >
                                        Inserisci nuovo incasso
                                    </button>
                                </div>
                                ) : (
                                getUnpaidForecasts(key).map(f => (
                                    <button
                                    key={f.id}
                                    onClick={(e) => { e.stopPropagation(); handleSelectForecast(f, mIdx); }}
                                    className="w-full text-left p-3 rounded-lg hover:bg-slate-50 group flex items-center justify-between transition-all border border-transparent hover:border-slate-100"
                                    >
                                    <div className="flex flex-col gap-0.5 overflow-hidden">
                                        <div className="flex items-baseline gap-2">
                                            <span className="text-sm font-bold text-slate-700 group-hover:text-slate-700 font-mono">
                                            {CURRENCY_FORMATTER.format(getGrossAmount(f))}
                                            </span>
                                            <span className="text-[10px] text-slate-400 whitespace-nowrap">
                                            del {DATE_FORMATTER.format(new Date(f.date))}
                                            </span>
                                        </div>
                                        <span className="text-xs text-slate-500 truncate w-full group-hover:text-slate-700">
                                        {f.description} (+{f.vatRate || 0}% IVA)
                                        </span>
                                    </div>
                                    <div className="text-slate-200 group-hover:text-slate-500 pl-2">
                                        <ArrowRight size={16} />
                                    </div>
                                    </button>
                                ))
                                )}
                            </div>
                        ) : (
                            <form onSubmit={handleSaveNewActual} className="space-y-2 p-1">
                                 <div className="flex gap-2">
                                    <div className="w-2/3 relative">
                                        <Calendar size={12} className="absolute left-2 top-2 text-slate-400" />
                                        <input 
                                            type="date" 
                                            value={newActualDate} 
                                            onChange={e => setNewActualDate(e.target.value)} 
                                            className="w-full pl-6 pr-1 py-1 text-[10px] border rounded text-slate-900 outline-none focus:border-slate-500" 
                                        />
                                    </div>
                                    <div className="w-1/3 relative">
                                        <input 
                                            type="text" 
                                            value={newActualInvoiceRef} 
                                            onChange={e => setNewActualInvoiceRef(e.target.value)} 
                                            className="w-full px-1 py-1 text-[10px] border rounded text-slate-900 outline-none focus:border-slate-500" 
                                            placeholder="Rif. Fatt." 
                                        />
                                    </div>
                                </div>
                                {(() => {
                                  const currentProject = availableProjects.find(p => p.name === key);
                                  const projectIntestatari = currentProject?.intestatari || [];
                                  return (
                                    <div className="relative">
                                        <User size={12} className="absolute left-2 top-2 text-slate-400" />
                                        {projectIntestatari.length > 0 ? (
                                            <select 
                                                value={newActualClient} 
                                                onChange={e => setNewActualClient(e.target.value)}
                                                className="w-full pl-6 pr-1 py-1 text-[10px] border rounded text-slate-900 outline-none focus:border-slate-500 bg-white"
                                            >
                                                <option value="">-- Seleziona Intestatario --</option>
                                                {projectIntestatari.map(int => (
                                                    <option key={int.id} value={int.nome}>{int.nome}</option>
                                                ))}
                                            </select>
                                        ) : (
                                            <input 
                                                type="text" 
                                                value={newActualClient} 
                                                onChange={e => setNewActualClient(e.target.value)} 
                                                className="w-full pl-6 pr-1 py-1 text-[10px] border rounded text-slate-900 outline-none focus:border-slate-500" 
                                                placeholder="Nome Cliente" 
                                                autoFocus
                                            />
                                        )}
                                    </div>
                                  );
                                })()}
                                <input 
                                    type="text" 
                                    value={newActualDesc} 
                                    onChange={e => setNewActualDesc(e.target.value)} 
                                    className="w-full px-2 py-1 text-[10px] border rounded text-slate-900 outline-none focus:border-slate-500" 
                                    placeholder="Descrizione Opzionale" 
                                />
                                <div className="flex gap-2">
                                    <input type="number" step="0.01" value={newActualAmount} onChange={e => setNewActualAmount(e.target.value)} className="w-2/3 text-xs p-1 border rounded font-mono text-slate-900" placeholder="€ Imponibile" />
                                    <select value={newActualVat} onChange={e => setNewActualVat(e.target.value)} className="w-1/3 text-xs p-1 border rounded bg-white text-slate-900"><option value="22">22%</option><option value="10">10%</option><option value="4">4%</option><option value="0">0%</option></select>
                                </div>
                                <button type="submit" className="w-full bg-slate-800 hover:bg-slate-900 text-white text-xs py-1.5 rounded font-bold transition-colors">Salva Incasso</button>
                            </form>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </td>
            </React.Fragment>
          );
        })}

        {/* Annual Summary Columns */}
        <td className={`px-2 py-4 text-center border-l-2 border-slate-200 border-r border-slate-100 font-mono text-xs font-bold ${rowType === 'financing' ? 'bg-slate-50 text-slate-400' : rowType === 'investment' ? 'bg-slate-50 text-slate-500' : 'bg-slate-50 text-slate-400'} sticky right-[120px] z-10 shadow-[-4px_0_4px_-2px_rgba(0,0,0,0.05)] ${COL_SUMMARY_WIDTH}`}>
           {annualForecast > 0 ? CURRENCY_FORMATTER.format(annualForecast) : '-'}
        </td>
        <td className={`px-2 py-4 text-center border-r border-slate-200 font-mono text-xs font-bold ${rowType === 'financing' ? 'bg-slate-100 text-slate-700' : rowType === 'investment' ? 'bg-slate-100 text-slate-800' : 'bg-slate-100 text-slate-700'} sticky right-0 z-10 shadow-[-4px_0_4px_-2px_rgba(0,0,0,0.05)] ${COL_SUMMARY_WIDTH}`}>
           {annualActual > 0 ? CURRENCY_FORMATTER.format(annualActual) : '-'}
        </td>
      </tr>
    );
  };

  const esportaTotaleAnnuoPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const today = new Date().toLocaleDateString('it-IT');

    // Header section (Dark theme)
    doc.setFillColor(34, 34, 34);
    doc.rect(0, 0, pageWidth, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('GRUPPO VISENTIN SRL', 15, 20);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Riepilogo Entrate Annuale ${currentYear} — Prev. vs Cons.`, 15, 30);
    doc.setFontSize(10);
    doc.text(`Data generazione: ${today}`, pageWidth - 15, 30, { align: 'right' });

    const rows: { key: string, label: string }[] = projects.map(p => ({ key: p, label: p }));
    rows.push({ key: 'INVESTMENT', label: 'RITORNO DA INVESTIMENTI' });
    rows.push({ key: 'FINANCING', label: 'FINANZIAMENTI BANCARI' });

    const tableData = rows.map(row => {
      const prev = getRowAnnualTotal(row.key, true);
      const cons = getRowAnnualTotal(row.key, false);
      const scostamento = cons - prev;
      const percentuale = prev !== 0 ? ((scostamento / prev) * 100).toFixed(1) + '%' : '-';

      return [
        row.label,
        CURRENCY_FORMATTER.format(prev),
        CURRENCY_FORMATTER.format(cons),
        CURRENCY_FORMATTER.format(scostamento),
        percentuale,
        scostamento // For conditional styling
      ];
    });

    const totPrev = getGrandAnnualTotal(true);
    const totCons = getGrandAnnualTotal(false);
    const totScostamento = totCons - totPrev;
    const totPercentuale = totPrev !== 0 ? ((totScostamento / totPrev) * 100).toFixed(1) + '%' : '-';

    tableData.push([
      'TOTALE GENERALE',
      CURRENCY_FORMATTER.format(totPrev),
      CURRENCY_FORMATTER.format(totCons),
      CURRENCY_FORMATTER.format(totScostamento),
      totPercentuale,
      totScostamento
    ]);

    autoTable(doc, {
      startY: 50,
      head: [['VOCE', 'PREVISIONALE', 'CONSUNTIVO', 'SCOSTAMENTO', '%']],
      body: tableData.map(r => r.slice(0, 5)),
      theme: 'striped',
      headStyles: { fillColor: [34, 34, 34], textColor: 255, fontSize: 9, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8 },
      columnStyles: {
        1: { halign: 'right' },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'center' }
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 3) {
          const scostamento = tableData[data.row.index][5] as number;
          if (scostamento > 0) {
            data.cell.styles.textColor = [21, 128, 61]; // Green (Positive for income)
          } else if (scostamento < 0) {
            data.cell.styles.textColor = [185, 28, 28]; // Red (Negative for income)
          } else if (scostamento === 0 && data.cell.raw !== '-') {
             data.cell.styles.textColor = [21, 128, 61]; // Zero is also green
          }
        }
        if (data.row.index === tableData.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [209, 250, 229]; // bg-emerald-100
        }
      }
    });

    doc.save(`GV_Entrate_Annuale_${currentYear}.pdf`);
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col animate-in fade-in duration-500 min-h-[500px]">
      <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white sticky left-0 z-20 rounded-t-2xl">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Timeline Entrate {currentYear}</h2>
          <div className="flex items-center gap-4 mt-1 text-sm text-slate-500">
             <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                <span>Previsione (Non incassato)</span>
             </div>
             <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                <span>Previsione (Incassato)</span>
             </div>
             <div className="flex items-center gap-1 ml-4">
                <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                <span>Investimenti</span>
             </div>
             <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-sky-400"></span>
                <span>Finanziamenti</span>
             </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <HelpButton onClick={() => setShowHelp(true)} />
          {!isAuthorized && (
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 px-4 py-2 rounded-lg text-slate-700 text-sm animate-pulse">
              <Shield size={16} />
              <span>Sblocca il lucchetto in alto per abilitare l'editing</span>
            </div>
          )}
        </div>
      </div>
      
      <div ref={scrollContainerRef} className="overflow-x-auto w-full max-h-[calc(100vh-250px)] relative">
        <table className="w-full text-sm text-left border-collapse min-w-max">
          <thead className="text-xs uppercase bg-slate-50 text-slate-500 sticky top-0 z-30">
            {/* Headers remain same */}
            <tr>
              <th scope="col" rowSpan={2} className={`px-6 py-3 font-semibold sticky left-0 bg-slate-50 z-30 border-r border-slate-200 shadow-[4px_0_4px_-2px_rgba(0,0,0,0.05)] ${COL_LABEL_WIDTH}`}>
                Fonte / Commessa
              </th>
              {months.map((month, monthIndex) => (
                <th key={month} colSpan={2} className={`px-4 py-2 border-r border-slate-200 text-center bg-slate-50 ${COL_MONTH_WIDTH}`}>
                  <div className="flex items-center justify-center gap-2">
                    {month}
                    <button
                      onClick={() => exportMonthlyReportPDF({ monthIndex, year: currentYear, transactions })}
                      className="p-1 rounded-md hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors"
                      title={`Esporta Report Mensile ${month}`}
                    >
                      <FileText size={12} />
                    </button>
                  </div>
                </th>
              ))}
              <th colSpan={2} className="px-4 py-2 border-l-2 border-slate-200 text-center min-w-[240px] bg-slate-100 font-bold text-slate-700 sticky right-0 z-30 shadow-[-4px_0_4px_-2px_rgba(0,0,0,0.05)]">
                <div className="flex items-center justify-center gap-2">
                  TOTALE ANNUO
                  <button
                    onClick={esportaTotaleAnnuoPDF}
                    className="p-1 rounded-md hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors"
                    title="Esporta Riepilogo Annuale PDF"
                  >
                    <FileText size={13} />
                  </button>
                </div>
              </th>
            </tr>
            <tr>
              {months.map((month) => (
                <React.Fragment key={`${month}-sub`}>
                  <th className={`px-2 py-2 border-r border-slate-100 text-slate-400 font-medium text-center bg-slate-50 ${COL_SUB_WIDTH}`}>
                    Prev.
                  </th>
                  <th className={`px-2 py-2 border-r border-slate-200 text-slate-600 font-medium text-center bg-slate-100 ${COL_SUB_WIDTH}`}>
                    Cons.
                  </th>
                </React.Fragment>
              ))}
              <th className={`px-2 py-2 border-l-2 border-slate-200 border-r border-slate-300 text-slate-500 font-bold text-center bg-slate-100 sticky right-[120px] z-30 shadow-[-4px_0_4px_-2px_rgba(0,0,0,0.05)] ${COL_SUMMARY_WIDTH}`}>
                Tot. Prev.
              </th>
              <th className={`px-2 py-2 text-slate-700 font-bold text-center bg-slate-200 sticky right-0 z-30 shadow-[-4px_0_4px_-2px_rgba(0,0,0,0.05)] ${COL_SUMMARY_WIDTH}`}>
                Tot. Cons.
              </th>
            </tr>
          </thead>
          <tbody>
            {projects.length === 0 && financingTransactions.length === 0 && investmentTransactions.length === 0 ? (
              <tr>
                <td colSpan={27} className="px-6 py-12 text-center text-slate-400">
                  Nessuna entrata registrata.
                </td>
              </tr>
            ) : (
              <>
                {/* 1. Standard Projects */}
                {projects.map((proj, idx) => renderRow(proj, proj, 'standard', idx))}

                {/* 2. Distinct Investment Row */}
                {renderRow('INVESTMENT', 'RITORNO DA INVESTIMENTI', 'investment', 98)}

                {/* 3. Distinct Financing Row */}
                {renderRow('FINANCING', 'FINANZIAMENTI BANCARI', 'financing', 99)}
              </>
            )}
            
            {/* Totals Row */}
            <tr className="bg-emerald-100 font-bold border-t-2 border-emerald-300 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] sticky bottom-0 z-20">
              <td className={`px-6 py-4 sticky left-0 bottom-0 bg-emerald-100 z-30 border-r border-emerald-300 text-emerald-800 uppercase text-xs tracking-wider shadow-[4px_0_4px_-2px_rgba(0,0,0,0.05)] ${COL_LABEL_WIDTH}`}>
                TOTALE GENERALE
              </td>
              {months.map((_, mIdx) => {
                const totalForecast = getMonthlyTotal(mIdx, true);
                const totalActual = getMonthlyTotal(mIdx, false);
                return (
                  <React.Fragment key={`total-${mIdx}`}>
                    <td className={`px-1 py-4 text-center border-r border-emerald-200 text-emerald-500 font-mono text-[11px] bg-emerald-50 backdrop-blur-sm ${COL_SUB_WIDTH}`}>
                       {totalForecast > 0 ? CURRENCY_FORMATTER.format(totalForecast) : ''}
                    </td>
                    <td className={`px-1 py-4 text-center border-r border-emerald-300 text-emerald-700 font-mono text-[11px] bg-emerald-100 backdrop-blur-sm ${COL_SUB_WIDTH}`}>
                       {totalActual > 0 ? CURRENCY_FORMATTER.format(totalActual) : ''}
                    </td>
                  </React.Fragment>
                );
              })}
              
              <td className={`px-2 py-4 text-center border-l-2 border-emerald-300 border-r border-emerald-200 text-emerald-600 font-mono text-xs bg-emerald-200 font-bold sticky right-[120px] z-30 shadow-[-4px_0_4px_-2px_rgba(0,0,0,0.05)] ${COL_SUMMARY_WIDTH}`}>
                 {CURRENCY_FORMATTER.format(getGrandAnnualTotal(true))}
              </td>
              <td className={`px-2 py-4 text-center border-r border-emerald-300 text-emerald-800 font-mono text-xs bg-emerald-100 font-bold sticky right-0 z-30 shadow-[-4px_0_4px_-2px_rgba(0,0,0,0.05)] ${COL_SUMMARY_WIDTH}`}>
                 {CURRENCY_FORMATTER.format(getGrandAnnualTotal(false))}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <HelpPanel 
        isOpen={showHelp}
        onClose={() => setShowHelp(false)}
        currentView={AppView.TIMELINE}
        onGoToManuale={onGoToManuale}
      />
    </div>
  );
};

export default IncomeTimeline;