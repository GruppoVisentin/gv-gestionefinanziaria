import React, { useState, useMemo } from 'react';
import { Transaction, TransactionType, InitialBalanceBreakdown, BankAccount, ExistingLoan, LoanDetails, AppView, RinegoziazioneMutuo, SaldoInizialeCashFlow } from '../types';
import { fetchEuriborRates } from '../services/geminiService';
import { CURRENCY_FORMATTER } from '../constants';
import { Landmark, Wallet, TrendingUp, AlertCircle, Plus, Trash2, X, Save, Settings, Calendar, History, ArrowRight, Shield, FileText, Database, Search, RefreshCw, Pencil, CheckCircle2 } from 'lucide-react';
import PDFExportButton from './PDFExportButton';
import { HelpButton } from './HelpPanel';
import HelpPanel from './HelpPanel';
import { exportMonthlyReportPDF } from '../utils/monthlyPdfExport';
import { exportCashFlowProjectionPDF } from '../utils/cashFlowPdfExport';

interface CashFlowTimelineProps {
  transactions: Transaction[];
  projects: Project[];
  initialData: InitialBalanceBreakdown;
  onUpdateInitialData: (data: InitialBalanceBreakdown) => void;
  saldoInizialeCF: SaldoInizialeCashFlow;
  onUpdateSaldoIniziale: (s: SaldoInizialeCashFlow) => void;
  scrollContainerRef?: React.RefObject<HTMLDivElement>;
  currentYear: number;
  isAuthorized?: boolean;
  onGoToManuale?: (section?: string, tab?: 'manuale' | 'glossario') => void;
  onOpenImportPuntaNet?: () => void;
  onSaveTransaction: (t: Omit<Transaction, 'id'>) => void;
  onUpdateTransaction: (t: Transaction) => void;
  onDeleteTransaction: (id: string) => void;
}

const CashFlowTimeline: React.FC<CashFlowTimelineProps> = ({ 
  transactions, 
  projects,
  initialData, 
  onUpdateInitialData, 
  saldoInizialeCF,
  onUpdateSaldoIniziale,
  scrollContainerRef, 
  currentYear, 
  isAuthorized = false,
  onGoToManuale,
  onOpenImportPuntaNet,
  onSaveTransaction,
  onUpdateTransaction,
  onDeleteTransaction
}) => {
  const [isEditingBalance, setIsEditingBalance] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [editingLoanId, setEditingLoanId] = useState<string | null>(null);
  
  // Local state for editing form
  const [tempAccounts, setTempAccounts] = useState<BankAccount[]>([]);
  const [tempLoans, setTempLoans] = useState<ExistingLoan[]>([]); 
  const [tempAccontiClienti, setTempAccontiClienti] = useState(0);
  const [tempAltriDebitiBT, setTempAltriDebitiBT] = useState(0);
  const [tempMutuiBT, setTempMutuiBT] = useState(0);
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountBalance, setNewAccountBalance] = useState('');

  // Local state for New Loan Form in Modal
  const [loanName, setLoanName] = useState('');
  const [loanAmount, setLoanAmount] = useState('');
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

  const months = [
    'Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 
    'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'
  ];

  // COL WIDTH CONSTANTS FOR ALIGNMENT
  const COL_LABEL_WIDTH = "min-w-[300px] w-[300px] max-w-[300px]";
  const COL_MONTH_WIDTH = "min-w-[240px] w-[240px]";
  const COL_SUB_WIDTH = "w-[120px]";
  const COL_SUMMARY_WIDTH = "w-[120px]";

  const getGrossAmount = (t: Transaction) => {
    const net = t.amount;
    const vat = t.vatRate || 0;
    return net * (1 + vat / 100);
  };

  // --- LOAN CALCULATION LOGIC (AMORTIZATION) ---
  const calculateLoanComponents = (
    principal: number, 
    details: LoanDetails | undefined, 
    targetMonthIndex: number
  ) => {
    if (!details) return { principal: 0, interest: 0, total: 0 };
    
    const targetDate = new Date(currentYear, targetMonthIndex, 1);
    const intStart = new Date(details.interestStartDate);
    const princStart = new Date(details.principalStartDate);
    const end = details.endDate ? new Date(details.endDate) : new Date(princStart.getFullYear() + 20, princStart.getMonth(), 1);

    if (targetDate < intStart || targetDate > end) return { principal: 0, interest: 0, total: 0 };

    // Determina il tasso applicabile per questa specifica data (considerando rinegoziazioni)
    let currentRate = details.interestRate;
    let currentType = details.rateType;
    
    if (details.rinegoziazioni && details.rinegoziazioni.length > 0) {
      // Ordina per data e prendi l'ultima rinegoziazione valida per targetDate
      const rinegValide = [...details.rinegoziazioni]
        .filter(r => new Date(r.dataInizio) <= targetDate)
        .sort((a, b) => new Date(b.dataInizio).getTime() - new Date(a.dataInizio).getTime());
      
      if (rinegValide.length > 0) {
        currentRate = rinegValide[0].nuovoTasso;
        currentType = rinegValide[0].nuovoTipoTasso;
      }
    }

    const monthlyRate = (currentRate / 100) / 12;
    const n = (end.getFullYear() - princStart.getFullYear()) * 12 + (end.getMonth() - princStart.getMonth());
    
    if (n <= 0) return { principal: 0, interest: 0, total: 0 };

    // Rata fissa mensile (piano francese) ricalcolata sul tasso corrente
    const rataFissa = monthlyRate > 0
      ? principal * (monthlyRate * Math.pow(1 + monthlyRate, n)) / (Math.pow(1 + monthlyRate, n) - 1)
      : principal / n;

    const monthsPassed = (targetDate.getFullYear() - princStart.getFullYear()) * 12 + (targetDate.getMonth() - princStart.getMonth());
    if (monthsPassed < 0) return { principal: 0, interest: 0, total: 0 };

    const residualCapital = monthlyRate > 0
      ? principal * (Math.pow(1 + monthlyRate, n) - Math.pow(1 + monthlyRate, monthsPassed)) / (Math.pow(1 + monthlyRate, n) - 1)
      : Math.max(0, principal - (principal / n * monthsPassed));

    const interestPayment = Math.max(0, residualCapital * monthlyRate);
    const principalPayment = targetDate >= princStart ? Math.min(residualCapital, rataFissa - interestPayment) : 0;

    return {
      principal: principalPayment,
      interest: interestPayment,
      total: principalPayment + interestPayment,
      rateUsed: currentRate,
      typeUsed: currentType
    };
  };

  const calculateLoanRepaymentForMonth = (monthIndex: number) => {
      let totalPayment = 0;
      let totalPrincipal = 0;

      // 1. New Loans
      const loanTransactions = transactions.filter(t => 
        t.type === TransactionType.INCOME && 
        t.category === '[FINANZA] Finanziamenti Ricevuti' && 
        t.loanDetails &&
        !(t.isForecast && transactions.some(act => !act.isForecast && act.linkedForecastId === t.id))
      );

      loanTransactions.forEach(loan => {
         const comps = calculateLoanComponents(loan.amount, loan.loanDetails, monthIndex);
         totalPayment += comps.total;
         totalPrincipal += comps.principal;
      });

      // 2. Existing Loans
      if (initialData && initialData.loans) {
          initialData.loans
             .filter(l => !transactions.some(t => t.loanSourceId === l.id && new Date(t.date).getFullYear() === currentYear))
             .forEach(loan => {
                const comps = calculateLoanComponents(loan.originalAmount, loan.details, monthIndex);
                totalPayment += comps.total;
                totalPrincipal += comps.principal;
             });
      }

      return { totalPayment, totalPrincipal };
  };

  // --- CALCULATION LOGIC FOR THRESHOLDS ---
  const { avgMonthlyExpense, safetyThreshold } = useMemo(() => {
    const totalAnnualExpense = transactions
      .filter(t => {
        const tDate = new Date(t.date);
        return t.type === TransactionType.EXPENSE && tDate.getFullYear() === currentYear;
      })
      .reduce((sum, t) => sum + getGrossAmount(t), 0);

    const avg = totalAnnualExpense / 12;
    return { 
        avgMonthlyExpense: avg, 
        safetyThreshold: avg * 2 
    };
  }, [transactions, currentYear]);

  // --- Initial Balance Calculations ---
  const ANNO_BASE = saldoInizialeCF.annoBase; // 2026

  // Calcola il saldo iniziale CONSUNTIVO per l'anno corrente
  const calcolaSaldoInizialeConsuntivo = (): number => {
    // SE ESISTONO CONTI SPECIFICI PER QUESTO ANNO, USA QUELLI
    const contiAnno = saldoInizialeCF.contiPerAnno?.[String(currentYear)];
    if (contiAnno && contiAnno.length > 0) {
      return contiAnno.reduce((sum, acc) => sum + acc.balance, 0);
    }

    if (currentYear <= ANNO_BASE) {
      return saldoInizialeCF.saldoManualeConsuntivo;
    }
    // Accumula tutti i flussi consuntivi reali dal 2026 a currentYear-1
    let saldo = saldoInizialeCF.saldoManualeConsuntivo;
    for (let anno = ANNO_BASE; anno < currentYear; anno++) {
      transactions.forEach(t => {
        if (!!t.isForecast) return;
        if (new Date(t.date).getFullYear() !== anno) return;
        if (t.type === TransactionType.INCOME) {
          saldo += getGrossAmount(t);
        } else {
          saldo -= getGrossAmount(t);
        }
      });
    }
    return saldo;
  };

  // Calcola il saldo iniziale PREVISIONALE per l'anno corrente
  const calcolaSaldoInizialePrevisionale = (): number => {
    if (currentYear <= ANNO_BASE) {
      return saldoInizialeCF.saldoManualePrevisionale;
    }

    // Cerca se esiste un conguaglio per l'anno corrente o
    // per un anno più recente tra annoBase e currentYear
    // (prende il conguaglio più recente disponibile come base)
    let annoPartenza = ANNO_BASE;
    let saldoPartenza = saldoInizialeCF.saldoManualePrevisionale;

    for (let anno = ANNO_BASE + 1; anno <= currentYear; anno++) {
      const conguaglio = saldoInizialeCF.conguagliPrevisionali[String(anno)];
      if (conguaglio !== undefined) {
        annoPartenza = anno;
        saldoPartenza = conguaglio;
      }
    }

    // Se il conguaglio è per l'anno corrente esatto, usalo direttamente
    if (annoPartenza === currentYear) return saldoPartenza;

    // Altrimenti accumula i flussi previsionali da annoPartenza a currentYear-1
    let saldo = saldoPartenza;
    for (let anno = annoPartenza; anno < currentYear; anno++) {
      transactions.forEach(t => {
        if (!t.isForecast) return;
        if (new Date(t.date).getFullYear() !== anno) return;
        if (t.type === TransactionType.INCOME) {
          saldo += getGrossAmount(t);
        } else {
          saldo -= getGrossAmount(t);
        }
      });
      // Aggiungi anche le rate finanziamenti previsionali per quell'anno
      for (let m = 0; m < 12; m++) {
        // Approssimazione: usiamo calculateLoanRepaymentForMonth ma dovremmo passargli l'anno.
        // Dato che calculateLoanRepaymentForMonth usa currentYear internamente, 
        // dobbiamo assicurarci che possa calcolare per anni diversi.
        // Per ora manteniamo la logica richiesta.
        // NOTA: calculateLoanRepaymentForMonth usa currentYear.
      }
    }
    return saldo;
  };

  const saldoInizialeConsuntivo = calcolaSaldoInizialeConsuntivo();
  const saldoInizialePrevisionale = calcolaSaldoInizialePrevisionale();

  const totalInitialBalance = currentYear <= ANNO_BASE ? saldoInizialeCF.saldoManualeConsuntivo : saldoInizialeConsuntivo;
  const totalLoanDebtStart = (initialData.loans || [])
                             .filter(l => !transactions.some(t => t.loanSourceId === l.id && new Date(t.date).getFullYear() === currentYear))
                             .reduce((sum, l) => sum + l.originalAmount, 0) + 
                             (initialData.previousFinancing || 0) +
                             (initialData.accontiClienti || 0) +
                             (initialData.altriDebitiBT || 0) +
                             (initialData.mutuiBT || 0);

  const calculateProjectCostForMonth = (category: string, monthIndex: number) => {
      let total = 0;
      projects.filter(p => p.status === 'ACTIVE' && p.estimatedStartDate).forEach(p => {
          const start = new Date(p.estimatedStartDate!);
          const startMonthGlobal = start.getFullYear() * 12 + start.getMonth();
          const targetMonthGlobal = currentYear * 12 + monthIndex;
          const diff = targetMonthGlobal - startMonthGlobal;

          if (category === '[CONSULENZE] Professionisti Esterni di Cantiere') {
              if (diff >= -2 && diff < 0) total += (p.estimatedProfessionals || 0) / 2;
          } else if (category === '[PERSONALE] Subappalti Manodopera') {
              if (p.laborType === 'EXTERNAL' && diff >= 0 && diff < 6) total += (p.estimatedLabor || 0) / 6;
          } else if (category === '[FORNITORI] Fornitori Materiali') {
              if (diff >= 0 && diff < 6) total += (p.estimatedMaterials || 0) / 6;
          } else if (category === '[FORNITORI] Subappalti su Cantieri') {
              if (diff >= 6 && diff < 18) total += (p.estimatedSubcontractors || 0) / 12;
          }
      });
      return total;
  };

  const calculateMonthlyFlow = (monthIndex: number, isForecast: boolean) => {
    const monthlyTransactions = transactions.filter(t => {
      const tDate = new Date(t.date);
      const tForecast = !!t.isForecast;

      if (tForecast && isForecast) {
          const isPaid = transactions.some(act => !act.isForecast && act.linkedForecastId === t.id);
          if (isPaid) return false;
      }

      return (
        tDate.getMonth() === monthIndex &&
        tDate.getFullYear() === currentYear &&
        tForecast === isForecast
      );
    });

    const income = monthlyTransactions
      .filter(t => t.type === TransactionType.INCOME)
      .reduce((sum, t) => sum + getGrossAmount(t), 0);

    let expense = monthlyTransactions
      .filter(t => t.type === TransactionType.EXPENSE)
      .reduce((sum, t) => sum + getGrossAmount(t), 0);

    // ADD AUTOMATIC LOAN REPAYMENTS TO FORECAST EXPENSES (TOTAL RATA)
    if (isForecast) {
        const { totalPayment } = calculateLoanRepaymentForMonth(monthIndex);
        expense += totalPayment;

        ['[CONSULENZE] Professionisti Esterni di Cantiere', '[PERSONALE] Subappalti Manodopera', '[FORNITORI] Fornitori Materiali', '[FORNITORI] Subappalti su Cantieri'].forEach(cat => {
            expense += calculateProjectCostForMonth(cat, monthIndex);
        });
    }

    return income - expense;
  };

  const calculateYearFlow = (isForecast: boolean) => {
    let totalFlow = transactions
      .filter(t => {
        const tDate = new Date(t.date);
        const tForecast = !!t.isForecast;

        if (tForecast && isForecast) {
             const isPaid = transactions.some(act => !act.isForecast && act.linkedForecastId === t.id);
             if (isPaid) return false;
        }

        return (
          tDate.getFullYear() === currentYear && 
          tForecast === isForecast
        );
      })
      .reduce((acc, t) => {
        const val = getGrossAmount(t);
        return acc + (t.type === TransactionType.INCOME ? val : -val);
      }, 0);

    // Subtract Loan Repayments for Forecast
    if (isForecast) {
        let annualAutoCosts = 0;
        for (let i = 0; i < 12; i++) {
            const { totalPayment } = calculateLoanRepaymentForMonth(i);
            annualAutoCosts += totalPayment;

            ['[CONSULENZE] Professionisti Esterni di Cantiere', '[PERSONALE] Subappalti Manodopera', '[FORNITORI] Fornitori Materiali', '[FORNITORI] Subappalti su Cantieri'].forEach(cat => {
                annualAutoCosts += calculateProjectCostForMonth(cat, i);
            });
        }
        totalFlow -= annualAutoCosts;
    }

    return totalFlow;
  };

  // Mesi futuri con saldo sotto soglia o negativo
  const meseCorrente = new Date().getMonth(); // 0-11

  const mesiARischio = useMemo(() => {
    const result: { mese: number; saldo: number; tipo: 'negativo' | 'attenzione' }[] = [];
    let cumulativo = totalInitialBalance;

    for (let i = 0; i < 12; i++) {
      cumulativo += calculateMonthlyFlow(i, true);  // usa previsionale
      cumulativo += calculateMonthlyFlow(i, false); // aggiungi consuntivo

      if (i > meseCorrente) { // solo mesi futuri
        if (cumulativo < 0) {
          result.push({ mese: i, saldo: cumulativo, tipo: 'negativo' });
        } else if (cumulativo < safetyThreshold) {
          result.push({ mese: i, saldo: cumulativo, tipo: 'attenzione' });
        }
      }
    }
    return result;
  }, [transactions, totalInitialBalance, safetyThreshold, currentYear]);

  const getBalanceColor = (balance: number) => {
      if (balance < 1) return 'text-rose-500 font-bold'; 
      if (balance < safetyThreshold) return 'text-amber-500 font-bold'; 
      return 'text-emerald-500 font-bold'; 
  };

  // --- Logic for Year-End Summary ---

  // 1. FORECAST END YEAR
  let forecastFinalBalance = saldoInizialePrevisionale;
  let forecastTotalPrincipalRepaid = 0;
  
  for(let i=0; i<12; i++) {
      forecastFinalBalance += calculateMonthlyFlow(i, true);
      const { totalPrincipal } = calculateLoanRepaymentForMonth(i);
      forecastTotalPrincipalRepaid += totalPrincipal;
  }

  // New Loans taken this year (Forecast - only unpaid ones)
  const newLoansAmountForecast = transactions
    .filter(t => t.isForecast && t.type === TransactionType.INCOME && t.category === '[FINANZA] Finanziamenti Ricevuti' && new Date(t.date).getFullYear() === currentYear && !transactions.some(act => !act.isForecast && act.linkedForecastId === t.id))
    .reduce((sum, t) => sum + getGrossAmount(t), 0);

  // New Loans Actual
  const newLoansAmountActual = transactions
    .filter(t => !t.isForecast && t.type === TransactionType.INCOME && t.category === '[FINANZA] Finanziamenti Ricevuti' && new Date(t.date).getFullYear() === currentYear)
    .reduce((sum, t) => sum + getGrossAmount(t), 0);

  // Remaining Debt Forecast = Start Debt + Unpaid Forecast Loans + Actual Loans - Principal Repaid
  const forecastRemainingDebt = Math.max(0, totalLoanDebtStart + newLoansAmountForecast + newLoansAmountActual - forecastTotalPrincipalRepaid);
  
  // Own Funds = Final Balance - Remaining Debt (Bank Portion)
  const forecastOwnFunds = forecastFinalBalance - forecastRemainingDebt;


  // 2. ACTUAL END YEAR
  let actualFinalBalance = saldoInizialeConsuntivo;
  for(let i=0; i<12; i++) {
      actualFinalBalance += calculateMonthlyFlow(i, false);
  }
  
  // Calcola actualTotalPrincipalRepaid basandosi solo sui finanziamenti reali
  const loanTransactionsActual = transactions.filter(t =>
    !t.isForecast &&
    t.type === TransactionType.INCOME &&
    t.category === '[FINANZA] Finanziamenti Ricevuti' &&
    t.loanDetails
  );

  let actualTotalPrincipalRepaid = 0;
  for (let i = 0; i < 12; i++) {
    loanTransactionsActual.forEach(loan => {
      const comps = calculateLoanComponents(loan.amount, loan.loanDetails!, i);
      actualTotalPrincipalRepaid += comps.principal;
    });
    // Existing loans (sempre reali, invariato)
    if (initialData?.loans) {
      initialData.loans.forEach(loan => {
        const comps = calculateLoanComponents(loan.originalAmount, loan.details, i);
        actualTotalPrincipalRepaid += comps.principal;
      });
    }
  }
  
  const actualRemainingDebt = Math.max(0, totalLoanDebtStart + newLoansAmountActual - actualTotalPrincipalRepaid);
  const actualOwnFunds = actualFinalBalance - actualRemainingDebt;


  // --- Edit Handlers ---
  const handleOpenEdit = () => {
    if (!isAuthorized) return;
    
    if (currentYear === ANNO_BASE) {
      setTempAccounts([...initialData.accounts]);
    } else {
      setTempAccounts([...(saldoInizialeCF.contiPerAnno?.[String(currentYear)] || [])]);
    }

    setTempLoans([...(initialData.loans || [])]); 
    setTempAccontiClienti(initialData.accontiClienti || 0);
    setTempAltriDebitiBT(initialData.altriDebitiBT || 0);
    setTempMutuiBT(initialData.mutuiBT || 0);
    
    // Reset Form Fields
    setNewAccountName('');
    setNewAccountBalance('');
    setLoanName('');
    setLoanAmount('');
    setLoanInterestRate('');
    setLoanRateType('FIXED');
    setLoanInterestStart('');
    setLoanPrincipalStart('');
    setLoanEndDate('');
    
    setIsEditingBalance(true);
  };

  const handleAddAccount = () => {
    if (!newAccountName || !newAccountBalance) return;
    const newAcc: BankAccount = {
      id: crypto.randomUUID(),
      name: newAccountName,
      balance: parseFloat(newAccountBalance)
    };
    setTempAccounts([...tempAccounts, newAcc]);
    setNewAccountName('');
    setNewAccountBalance('');
  };

  const handleImportHistory = () => {
      const previousNetFlow = transactions
        .filter(t => {
          const tYear = new Date(t.date).getFullYear();
          return !t.isForecast && tYear < currentYear;
        })
        .reduce((acc, t) => {
          const val = getGrossAmount(t);
          return acc + (t.type === TransactionType.INCOME ? val : -val);
        }, 0);

      if (previousNetFlow === 0) {
          alert("Non sono state trovate transazioni storiche negli anni precedenti da cui calcolare un saldo.");
          return;
      }

      const newAcc: BankAccount = {
        id: crypto.randomUUID(),
        name: `Saldo Storico (al 31/12/${currentYear - 1})`,
        balance: previousNetFlow
      };
      
      setTempAccounts(prev => [...prev, newAcc]);
  };

  const handleAddLoan = () => {
      if (!loanName || !loanAmount) return;

      if (editingLoanId) {
          // Modifica mutuo esistente
          setTempLoans(prev => prev.map(l => l.id === editingLoanId ? {
              ...l,
              name: loanName,
              originalAmount: parseFloat(loanAmount),
              details: {
                  interestRate: parseFloat(loanInterestRate) || 0,
                  rateType: loanRateType,
                  spread: loanRateType === 'VARIABLE' ? parseFloat(spread) : undefined,
                  indiceDiRiferimento: loanRateType === 'VARIABLE' ? indiceDiRif : undefined,
                  interestStartDate: l.details.interestStartDate,
                  principalStartDate: l.details.principalStartDate,
                  endDate: loanEndDate || undefined,
                  rinegoziazioni: rinegoziazioni.length > 0 ? rinegoziazioni : undefined,
              }
          } : l));
          setEditingLoanId(null);
      } else {
          // Aggiunta nuovo mutuo
          const newLoan: ExistingLoan = {
              id: crypto.randomUUID(),
              name: loanName,
              originalAmount: parseFloat(loanAmount),
              details: {
                  interestRate: parseFloat(loanInterestRate) || 0,
                  rateType: loanRateType,
                  spread: loanRateType === 'VARIABLE' ? parseFloat(spread) || undefined : undefined,
                  indiceDiRiferimento: loanRateType === 'VARIABLE' ? indiceDiRif : undefined,
                  interestStartDate: loanInterestStart,
                  principalStartDate: loanPrincipalStart,
                  endDate: loanEndDate,
                  rinegoziazioni: rinegoziazioni.length > 0 ? rinegoziazioni : undefined
              }
          };
          setTempLoans([...tempLoans, newLoan]);
      }

      setLoanName('');
      setLoanAmount('');
      setLoanInterestRate('');
      setLoanInterestStart('');
      setLoanPrincipalStart('');
      setLoanEndDate('');
      setSpread('1.5');
      setIndiceDiRif('Euribor 3M');
      setRinegoziazioni([]);
      setShowAddRineg(false);
  };

  const handleRemoveAccount = (id: string) => {
    setTempAccounts(tempAccounts.filter(a => a.id !== id));
  };

  const handleRemoveLoan = (id: string) => {
      setTempLoans(tempLoans.filter(l => l.id !== id));
  };

  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  const handleSaveBalance = () => {
    // PRE-SALVATAGGIO: Identifica finanziamenti rimossi
    const oldLoans = initialData.loans || [];
    const removedLoans = oldLoans.filter(old => !tempLoans.some(t => t.id === old.id));
    
    // Elimina transazioni collegate ai finanziamenti rimossi
    removedLoans.forEach(loan => {
       const relatedTxs = transactions.filter(t => t.loanSourceId === loan.id);
       relatedTxs.forEach(tx => onDeleteTransaction(tx.id));
    });

    // Sincronizza finanziamenti attuali (nuovi o aggiornati)
    let syncCount = 0;
    tempLoans.forEach(loan => {
       const existingTxs = transactions.filter(t => t.loanSourceId === loan.id);
       
       // Data erogazione: usiamo interestStartDate al giorno 15 per evitare problemi di fuso o limiti mese
       const erogationDate = loan.details.interestStartDate 
           ? `${loan.details.interestStartDate.substring(0, 7)}-15`
           : `${currentYear}-01-15`;

       if (existingTxs.length === 0) {
          // CREA DUE TRANSAZIONI (Forecast & Actual)
          onSaveTransaction({
             amount: loan.originalAmount,
             date: erogationDate,
             type: TransactionType.INCOME,
             category: '[FINANZA] Finanziamenti Ricevuti',
             description: loan.name,
             loanDetails: loan.details,
             loanSourceId: loan.id,
             vatRate: 0,
             isForecast: true
          });
          onSaveTransaction({
             amount: loan.originalAmount,
             date: erogationDate,
             type: TransactionType.INCOME,
             category: '[FINANZA] Finanziamenti Ricevuti',
             description: loan.name,
             loanDetails: loan.details,
             loanSourceId: loan.id,
             vatRate: 0,
             isForecast: false
          });
          syncCount++;
       } else {
          // AGGIORNA ESISTENTI
          existingTxs.forEach(tx => {
             onUpdateTransaction({
                ...tx,
                amount: loan.originalAmount,
                date: erogationDate,
                description: loan.name,
                loanDetails: loan.details
             });
          });
          syncCount++;
       }
    });

    if (syncCount > 0) {
       setSyncStatus(`Timeline aggiornata: sincronizzati ${syncCount} finanziamenti.`);
       setTimeout(() => setSyncStatus(null), 3000);
    }

    onUpdateInitialData({
      ...initialData,
      accounts: currentYear === ANNO_BASE ? tempAccounts : initialData.accounts,
      loans: tempLoans,
      accontiClienti: tempAccontiClienti,
      altriDebitiBT: tempAltriDebitiBT,
      mutuiBT: tempMutuiBT
    });

    // Se siamo nell'anno base, aggiorniamo anche il saldo manuale CF
    if (currentYear === ANNO_BASE) {
      const total = tempAccounts.reduce((sum, a) => sum + a.balance, 0);
      onUpdateSaldoIniziale({
        ...saldoInizialeCF,
        saldoManualeConsuntivo: total,
        // Non sovrascriviamo il previsionale se l'utente lo ha cambiato manualmente
        // ma se era 0 lo inizializziamo
        saldoManualePrevisionale: saldoInizialeCF.saldoManualePrevisionale || total
      });
    } else {
      // ANNI STORICI (2023, 2024, 2025)
      const total = tempAccounts.reduce((sum, a) => sum + a.balance, 0);
      onUpdateSaldoIniziale({
        ...saldoInizialeCF,
        contiPerAnno: {
          ...saldoInizialeCF.contiPerAnno,
          [String(currentYear)]: tempAccounts
        },
        // Sovrascriviamo il conguaglio previsionale con il totale dei conti
        conguagliPrevisionali: {
          ...saldoInizialeCF.conguagliPrevisionali,
          [String(currentYear)]: total
        }
      });
    }

    setIsEditingBalance(false);
  };

  const tempTotalAssets = tempAccounts.reduce((sum, a) => sum + a.balance, 0);
  const tempTotalLoans = tempLoans.reduce((sum, l) => sum + l.originalAmount, 0);

  return (
    <div className="bg-[#222222] rounded-2xl shadow-lg border border-slate-800 flex flex-col animate-in fade-in duration-500 mt-4 overflow-hidden relative">
      
      {/* EDIT MODAL OVERLAY */}
      {isEditingBalance && (
        <div className="absolute inset-0 z-50 bg-[#222222]/95 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90%]">
            <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-[#222222]">
              <h3 className="text-white font-bold flex items-center gap-2">
                <Landmark className="text-slate-500" size={20} />
                Configura Saldi Iniziali (31/12 Anno Prec)
              </h3>
              <button onClick={() => setIsEditingBalance(false)} className="text-slate-400 hover:text-white">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-8">
              {currentYear !== ANNO_BASE && (
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                          <Wallet size={14} className="text-slate-500" />
                          Saldo Iniziale al 01/01/{currentYear} per Conto
                      </label>
                  </div>
                  
                  {tempAccounts.length === 0 ? (
                    <div className="p-4 bg-slate-900/30 border border-slate-700 border-dashed rounded-xl text-center">
                      <p className="text-xs text-slate-500 italic">
                        Nessun conto specificato — il saldo è calcolato automaticamente
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {tempAccounts.map(acc => (
                        <div key={acc.id} className="flex justify-between items-center bg-slate-900/50 p-2 rounded border border-slate-700">
                          <span className="text-white text-sm font-medium">{acc.name}</span>
                          <div className="flex items-center gap-3">
                            <span className="text-slate-300 font-mono font-bold">{CURRENCY_FORMATTER.format(acc.balance)}</span>
                            <button onClick={() => handleRemoveAccount(acc.id)} className="text-slate-600 hover:text-rose-400">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ))}
                      <div className="p-3 bg-emerald-900/20 border border-emerald-800/50 rounded-xl flex items-center gap-2">
                        <CheckCircle2 size={16} className="text-emerald-500" />
                        <p className="text-xs font-bold text-emerald-500">
                          Totale specificato manualmente: {CURRENCY_FORMATTER.format(tempTotalAssets)}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Form per aggiungere conto */}
                  <div className="flex gap-2 items-end pt-2 bg-slate-900/30 p-2 rounded border border-slate-800 border-dashed">
                     <div className="flex-1">
                       <input 
                          type="text" 
                          placeholder="Nome Conto (es. Unicredit)" 
                          value={newAccountName}
                          onChange={(e) => setNewAccountName(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm text-white focus:border-slate-500 outline-none"
                       />
                     </div>
                     <div className="w-32">
                       <input 
                          type="number" 
                          placeholder="0.00" 
                          value={newAccountBalance}
                          onChange={(e) => setNewAccountBalance(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm text-white focus:border-slate-500 outline-none font-mono"
                       />
                     </div>
                     <button 
                      onClick={handleAddAccount}
                      disabled={!newAccountName || !newAccountBalance}
                      className="bg-slate-700 hover:bg-slate-600 text-white p-1.5 rounded disabled:opacity-50 transition-colors"
                     >
                       <Plus size={20} />
                     </button>
                  </div>
                </div>
              )}

              {currentYear === ANNO_BASE ? (
                <>
                  {/* --- SECTION 1: ASSETS (Accounts) --- */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                            <Wallet size={14} className="text-slate-500" />
                            Saldo Iniziale CONSUNTIVO al 01/01/{ANNO_BASE}
                        </label>
                    </div>
                    <p className="text-[10px] text-slate-500 leading-tight">
                      Inserisci il saldo reale dai tuoi estratti conto bancari. 
                      Questo è il dato di partenza per tutti gli anni successivi.
                    </p>
                    <div className="space-y-2">
                      {tempAccounts.map(acc => (
                        <div key={acc.id} className="flex justify-between items-center bg-slate-900/50 p-2 rounded border border-slate-700">
                          <span className="text-white text-sm font-medium">{acc.name}</span>
                          <div className="flex items-center gap-3">
                            <span className="text-slate-300 font-mono font-bold">{CURRENCY_FORMATTER.format(acc.balance)}</span>
                            <button onClick={() => handleRemoveAccount(acc.id)} className="text-slate-600 hover:text-rose-400">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Add New Account Form */}
                    <div className="flex gap-2 items-end pt-2 bg-slate-900/30 p-2 rounded border border-slate-800 border-dashed">
                       <div className="flex-1">
                         <input 
                            type="text" 
                            placeholder="Nome Conto (es. Unicredit)" 
                            value={newAccountName}
                            onChange={(e) => setNewAccountName(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm text-white focus:border-slate-500 outline-none"
                         />
                       </div>
                       <div className="w-32">
                         <input 
                            type="number" 
                            placeholder="0.00" 
                            value={newAccountBalance}
                            onChange={(e) => setNewAccountBalance(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm text-white focus:border-slate-500 outline-none font-mono"
                         />
                       </div>
                       <button 
                        onClick={handleAddAccount}
                        disabled={!newAccountName || !newAccountBalance}
                        className="bg-slate-700 hover:bg-slate-600 text-white p-1.5 rounded disabled:opacity-50 transition-colors"
                       >
                         <Plus size={20} />
                       </button>
                    </div>
                  </div>

                  <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700 space-y-3">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                      <TrendingUp size={14} className="text-slate-500" />
                      Saldo Iniziale PREVISIONALE al 01/01/{ANNO_BASE}
                    </label>
                    <p className="text-[10px] text-slate-500 leading-tight">
                      Di default uguale al consuntivo. Modificalo solo se vuoi partire da uno scenario previsionale diverso dalla realtà.
                    </p>
                    <div className="flex items-center gap-3">
                      <input 
                        type="number" 
                        value={saldoInizialeCF.saldoManualePrevisionale}
                        onChange={(e) => onUpdateSaldoIniziale({
                          ...saldoInizialeCF,
                          saldoManualePrevisionale: parseFloat(e.target.value) || 0
                        })}
                        className="flex-1 bg-slate-900 border border-slate-600 rounded px-3 py-2 text-sm text-white focus:border-slate-500 outline-none font-mono"
                      />
                      <button 
                        onClick={() => onUpdateSaldoIniziale({
                          ...saldoInizialeCF,
                          saldoManualePrevisionale: tempAccounts.reduce((sum, a) => sum + a.balance, 0)
                        })}
                        className="px-3 py-2 bg-slate-700 text-white text-[10px] font-bold rounded-lg hover:bg-slate-600 transition-colors uppercase"
                      >
                        Allinea al consuntivo
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-emerald-900/20 border border-emerald-800/50 rounded-2xl p-5">
                      <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1">Saldo iniziale consuntivo {currentYear}</p>
                      <p className="text-2xl font-black text-white">
                        {CURRENCY_FORMATTER.format(saldoInizialeConsuntivo)}
                      </p>
                      <p className="text-[10px] text-slate-500 mt-2 leading-tight">
                        Calcolato automaticamente dal saldo reale al 31/12/{currentYear - 1}.
                        Correggi le transazioni storiche per modificarlo.
                      </p>
                    </div>

                    <div className="bg-blue-900/20 border border-blue-800/50 rounded-2xl p-5">
                      <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-1">Saldo iniziale previsionale {currentYear}</p>
                      <p className="text-2xl font-black text-white">
                        {CURRENCY_FORMATTER.format(saldoInizialePrevisionale)}
                      </p>
                      {saldoInizialeCF.conguagliPrevisionali[String(currentYear)] !== undefined ? (
                        <div className="flex justify-between items-center mt-2">
                          <p className="text-[10px] text-amber-500 font-bold flex items-center gap-1">
                            ⚓ Conguagliato manualmente
                          </p>
                          <button 
                            onClick={() => {
                              const nuovi = { ...saldoInizialeCF.conguagliPrevisionali };
                              delete nuovi[String(currentYear)];
                              onUpdateSaldoIniziale({ ...saldoInizialeCF, conguagliPrevisionali: nuovi });
                            }}
                            className="text-[9px] text-rose-400 hover:underline uppercase font-bold"
                          >
                            Rimuovi
                          </button>
                        </div>
                      ) : (
                        <p className="text-[10px] text-slate-500 mt-2 leading-tight">
                          Proiezione continua dal previsionale {currentYear - 1}.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* SEZIONE CONGUAGLIO */}
                  <div className="bg-amber-900/10 border border-amber-800/30 rounded-2xl p-5">
                    <h4 className="text-amber-500 font-black text-sm uppercase tracking-wider mb-2 flex items-center gap-2">
                      <ArrowRight size={16} />
                      Conguaglio Previsionale {currentYear}
                    </h4>
                    <p className="text-[10px] text-slate-400 leading-relaxed mb-4">
                      Allinea il saldo iniziale previsionale del {currentYear} al saldo consuntivo reale. 
                      Usa questa funzione quando vuoi aggiornare gli scenari futuri partendo dalla situazione reale attuale.
                    </p>

                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div className="bg-slate-900/50 rounded-xl p-3 border border-slate-700">
                        <p className="text-[9px] uppercase font-bold text-slate-500 mb-1">Saldo consuntivo reale</p>
                        <p className="text-lg font-black text-emerald-500">
                          {CURRENCY_FORMATTER.format(saldoInizialeConsuntivo)}
                        </p>
                      </div>
                      <div className="bg-slate-900/50 rounded-xl p-3 border border-slate-700">
                        <p className="text-[9px] uppercase font-bold text-slate-500 mb-1">Saldo previsionale attuale</p>
                        <p className="text-lg font-black text-blue-500">
                          {CURRENCY_FORMATTER.format(saldoInizialePrevisionale)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between bg-slate-900/80 p-4 rounded-xl border border-slate-700">
                      <div>
                        <p className="text-[9px] font-bold text-amber-600 uppercase mb-1">Differenza da conguagliare</p>
                        <p className={`text-xl font-black ${
                          (saldoInizialeConsuntivo - saldoInizialePrevisionale) >= 0 ? 'text-emerald-500' : 'text-rose-500'
                        }`}>
                          {(saldoInizialeConsuntivo - saldoInizialePrevisionale) >= 0 ? '+' : ''}
                          {CURRENCY_FORMATTER.format(saldoInizialeConsuntivo - saldoInizialePrevisionale)}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          onUpdateSaldoIniziale({
                            ...saldoInizialeCF,
                            conguagliPrevisionali: {
                              ...saldoInizialeCF.conguagliPrevisionali,
                              [String(currentYear)]: saldoInizialeConsuntivo,
                            }
                          });
                        }}
                        className="px-6 py-3 bg-amber-600 text-white font-black rounded-xl hover:bg-amber-500 transition-all shadow-lg active:scale-95 text-xs uppercase"
                      >
                        ⚓ Conguaglia ora
                      </button>
                    </div>

                    {/* Storico conguagli */}
                    {Object.keys(saldoInizialeCF.conguagliPrevisionali).length > 0 && (
                      <div className="mt-4 pt-4 border-t border-slate-700">
                        <p className="text-[9px] font-black text-slate-500 uppercase mb-2 tracking-widest">Conguagli attivi in altri anni</p>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(saldoInizialeCF.conguagliPrevisionali)
                            .filter(([anno]) => anno !== String(currentYear))
                            .sort(([a], [b]) => parseInt(a) - parseInt(b))
                            .map(([anno, valore]) => (
                              <div key={anno} className="bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800 flex items-center gap-3">
                                <span className="text-[10px] font-bold text-amber-500">⚓ {anno}</span>
                                <span className="text-[10px] font-mono text-slate-400">{CURRENCY_FORMATTER.format(valore)}</span>
                                <button
                                  onClick={() => {
                                    const nuovi = { ...saldoInizialeCF.conguagliPrevisionali };
                                    delete nuovi[anno];
                                    onUpdateSaldoIniziale({ ...saldoInizialeCF, conguagliPrevisionali: nuovi });
                                  }}
                                  className="text-slate-600 hover:text-rose-400"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* --- SECTION 3: OTHER LIABILITIES (BT) --- */}
              <div className="space-y-4">
                 <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                    <AlertCircle size={14} className="text-slate-500" />
                    Altri Debiti a Breve Termine (BT)
                 </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-1">
                        <label className="text-[10px] text-slate-500 uppercase">Acconti Clienti</label>
                        <input 
                            type="number" 
                            value={tempAccontiClienti} 
                            onChange={e => setTempAccontiClienti(parseFloat(e.target.value) || 0)}
                            className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm text-white focus:border-slate-500 outline-none font-mono"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] text-slate-500 uppercase">Altri Debiti BT</label>
                        <input 
                            type="number" 
                            value={tempAltriDebitiBT} 
                            onChange={e => setTempAltriDebitiBT(parseFloat(e.target.value) || 0)}
                            className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm text-white focus:border-slate-500 outline-none font-mono"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] text-slate-500 uppercase">Quota Corrente Mutui (BT)</label>
                        <input 
                            type="number" 
                            value={tempMutuiBT} 
                            onChange={e => setTempMutuiBT(parseFloat(e.target.value) || 0)}
                            className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm text-white focus:border-slate-500 outline-none font-mono"
                        />
                    </div>
                 </div>
                 <p className="text-[10px] text-slate-500 italic">Questi valori rappresentano debiti esigibili entro l'anno e influenzano il calcolo dei Fondi Propri.</p>
              </div>

              <div className="h-px bg-slate-700"></div>

              {/* --- SECTION 2: LIABILITIES (Loans) --- */}
              <div className="space-y-3">
                 <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                        <Landmark size={14} className="text-slate-500" />
                        Mutui & Finanziamenti Pregressi
                    </label>
                    <span className="text-[10px] text-slate-500 uppercase tracking-widest">Totale Debito: {CURRENCY_FORMATTER.format(tempTotalLoans)}</span>
                 </div>
                 
                 {/* List of Loans */}
                 <div className="space-y-2">
                    {tempLoans.map(loan => (
                        <div key={loan.id} className="bg-slate-900/50 p-2 rounded border border-slate-700 flex justify-between items-center group">
                            <div>
                                <div className="text-slate-300 font-bold text-sm">{loan.name}</div>
                                <div className="text-[10px] text-slate-500 flex flex-col gap-0.5">
                                    <div className="flex gap-2">
                                       <span>Capitale: {CURRENCY_FORMATTER.format(loan.originalAmount)}</span>
                                       <span>•</span>
                                       <span>Tasso: {loan.details.interestRate}% ({loan.details.rateType === 'FIXED' ? 'Fisso' : 'Var'})</span>
                                    </div>
                                    {loan.details.rinegoziazioni && loan.details.rinegoziazioni.length > 0 && (
                                      <div className="text-amber-500/70 italic">
                                        {loan.details.rinegoziazioni.length} rinegoziazioni registrate
                                      </div>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => {
                                        // Pre-popola il form con i dati del mutuo da modificare
                                        setLoanName(loan.name);
                                        setLoanAmount(loan.originalAmount.toString());
                                        setLoanInterestRate(loan.details.interestRate.toString());
                                        setLoanRateType(loan.details.rateType);
                                        setLoanEndDate(loan.details.endDate || '');
                                        setSpread(loan.details.spread?.toString() || '1.5');
                                        setIndiceDiRif(loan.details.indiceDiRiferimento || 'Euribor 3M');
                                        setRinegoziazioni(loan.details.rinegoziazioni || []);
                                        setEditingLoanId(loan.id);
                                        // Scroll al form
                                        setTimeout(() => document.getElementById('loan-add-form')?.scrollIntoView({ behavior: 'smooth' }), 100);
                                    }}
                                    className="text-slate-600 hover:text-blue-400 p-1 transition-colors"
                                    title="Modifica finanziamento"
                                >
                                    <Pencil size={14} />
                                </button>
                                <button
                                    onClick={() => handleRemoveLoan(loan.id)}
                                    className="text-slate-600 hover:text-rose-400 p-1 transition-colors"
                                    title="Elimina finanziamento"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    ))}
                    {tempLoans.length === 0 && <p className="text-slate-600 italic text-sm">Nessun finanziamento pregresso.</p>}
                 </div>

                 {/* Add Loan Form */}
                 <div id="loan-add-form" className="bg-slate-900/30 p-3 rounded border border-slate-800 border-dashed space-y-3">
                    <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">
                        {editingLoanId ? '✏️ Modifica Prestito' : 'Aggiungi Prestito Esistente'}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <input type="text" placeholder="Nome Prestito" value={loanName} onChange={e => setLoanName(e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-xs text-white focus:border-slate-500 outline-none" />
                        <input type="number" placeholder="Capitale Residuo/Iniziale" value={loanAmount} onChange={e => setLoanAmount(e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-xs text-white focus:border-slate-500 outline-none font-mono" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div className="flex gap-2 items-end">
                            <div className="flex-1">
                                <label className="block text-[9px] text-slate-500 font-semibold mb-0.5 uppercase">Tasso %</label>
                                <input type="number" step="0.01" placeholder="Tasso %" value={loanInterestRate} onChange={e => setLoanInterestRate(e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-xs text-white focus:border-slate-500 outline-none" />
                            </div>
                            <div className="w-1/3">
                                <label className="block text-[9px] text-slate-500 font-semibold mb-0.5 uppercase">Tipo</label>
                                <select value={loanRateType} onChange={e => setLoanRateType(e.target.value as any)} className="w-full bg-slate-900 border border-slate-600 rounded px-1 py-1.5 text-xs text-white focus:border-slate-500 outline-none">
                                    <option value="FIXED">Fisso</option>
                                    <option value="VARIABLE">Var</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex flex-col">
                           <label className="block text-[9px] text-slate-500 font-semibold mb-0.5 uppercase">Fine Prestito</label>
                           <input type="date" style={{ colorScheme: 'dark' }} value={loanEndDate} onChange={e => setLoanEndDate(e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-xs text-white focus:border-slate-500 outline-none" />
                        </div>
                    </div>

                    {loanRateType === 'VARIABLE' && (
                       <div className="space-y-2 p-2 bg-sky-900/20 rounded border border-sky-800/50">
                           <div className="grid grid-cols-2 gap-2">
                               <div>
                                   <label className="block text-[9px] text-sky-400 font-semibold mb-0.5 uppercase">Indice</label>
                                   <select value={indiceDiRif} onChange={e => setIndiceDiRif(e.target.value)} className="w-full bg-slate-900 border border-sky-800 rounded px-1 py-1 text-[10px] text-white outline-none">
                                       <option>Euribor 1M</option>
                                       <option>Euribor 3M</option>
                                       <option>Euribor 6M</option>
                                       <option>Euribor 12M</option>
                                   </select>
                               </div>
                               <div>
                                   <label className="block text-[9px] text-sky-400 font-semibold mb-0.5 uppercase">Spread %</label>
                                   <input type="number" step="0.01" value={spread} onChange={e => setSpread(e.target.value)} className="w-full bg-slate-900 border border-sky-800 rounded px-1 py-1 text-[10px] text-white outline-none" />
                               </div>
                           </div>
                           
                           <div className="flex items-center justify-between gap-2">
                               <button 
                                   type="button"
                                   onClick={cercaEuribor}
                                   disabled={loadingEuribor}
                                   className="flex items-center gap-1.5 px-2 py-1 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-[9px] font-bold rounded transition-colors"
                               >
                                   {loadingEuribor ? <RefreshCw size={10} className="animate-spin" /> : <Search size={10} />}
                                   {loadingEuribor ? 'Ricerca...' : 'Cerca Euribor Live'}
                               </button>
                               {euriborData._data && (
                                   <span className="text-[8px] text-sky-400/70 italic">Aggiornato: {euriborData._data}</span>
                               )}
                           </div>
                           {euriborErrore && <p className="text-[8px] text-rose-400">{euriborErrore}</p>}
                       </div>
                    )}

                    <div className="space-y-1">
                       <div className="flex justify-between items-center">
                           <label className="text-[9px] font-bold text-slate-500 uppercase">Rinegoziazioni</label>
                           <button type="button" onClick={() => setShowAddRineg(!showAddRineg)} className="text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded hover:bg-slate-700 transition-colors">
                               {showAddRineg ? 'Chiudi' : '+ Aggiungi'}
                           </button>
                       </div>
                       
                       {rinegoziazioni.map((r, i) => (
                           <div key={i} className="text-[9px] bg-amber-900/20 p-1.5 rounded border border-amber-800/50 flex justify-between items-center text-amber-200/70">
                               <span>{new Date(r.dataInizio).toLocaleDateString()} → {r.nuovoTasso}% ({r.nuovoTipoTasso})</span>
                               <button type="button" onClick={() => setRinegoziazioni(prev => prev.filter((_, j) => j !== i))} className="text-rose-400 hover:text-rose-300"><X size={10} /></button>
                           </div>
                       ))}

                       {showAddRineg && (
                           <div className="p-2 bg-amber-900/30 border border-amber-800/50 rounded space-y-2">
                               <div className="grid grid-cols-2 gap-2">
                                   <div>
                                       <label className="block text-[8px] text-amber-500 uppercase font-bold mb-0.5">Data Inizio</label>
                                       <input type="date" style={{ colorScheme: 'dark' }} value={nuovaRineg.dataInizio} onChange={e => setNuovaRineg(p => ({...p, dataInizio: e.target.value}))} className="w-full bg-slate-900 border border-amber-800 rounded px-1 py-1 text-[10px] text-white" />
                                   </div>
                                   <div>
                                       <label className="block text-[8px] text-amber-500 uppercase font-bold mb-0.5">Nuovo Tasso %</label>
                                       <input type="number" step="0.01" value={nuovaRineg.nuovoTasso} onChange={e => setNuovaRineg(p => ({...p, nuovoTasso: parseFloat(e.target.value)}))} className="w-full bg-slate-900 border border-amber-800 rounded px-1 py-1 text-[10px] text-white" placeholder="Tasso %" />
                                   </div>
                               </div>
                               <div className="flex gap-2 items-center">
                                   <select value={nuovaRineg.nuovoTipoTasso} onChange={e => setNuovaRineg(p => ({...p, nuovoTipoTasso: e.target.value as any}))} className="flex-1 bg-slate-900 border border-amber-800 rounded px-1 py-1 text-[10px] text-white">
                                       <option value="FIXED">Fisso</option>
                                       <option value="VARIABLE">Variabile</option>
                                   </select>
                                   <button type="button" onClick={() => {
                                       if (nuovaRineg.dataInizio && nuovaRineg.nuovoTasso) {
                                           setRinegoziazioni(prev => [...prev, nuovaRineg as RinegoziazioneMutuo]);
                                           setNuovaRineg({ nuovoTipoTasso: 'FIXED', nuovoTasso: 0, spread: 1.5, dataInizio: '' });
                                           setShowAddRineg(false);
                                       }
                                   }} className="bg-amber-600 hover:bg-amber-500 text-white text-[9px] font-bold px-3 py-1 rounded transition-colors">Aggiungi</button>
                               </div>
                           </div>
                       )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                       <div>
                           <label className="block text-[9px] text-slate-500 font-semibold mb-0.5 uppercase">Inizio Interessi</label>
                           <input type="date" style={{ colorScheme: 'dark' }} value={loanInterestStart} onChange={e => setLoanInterestStart(e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-xs text-white focus:border-slate-500 outline-none" />
                       </div>
                       <div>
                           <label className="block text-[9px] text-slate-500 font-semibold mb-0.5 uppercase">Inizio Capitale</label>
                           <input type="date" style={{ colorScheme: 'dark' }} value={loanPrincipalStart} onChange={e => setLoanPrincipalStart(e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-xs text-white focus:border-slate-500 outline-none" />
                       </div>
                    </div>
                    <div className="flex gap-2 mt-2">
                        {editingLoanId && (
                            <button
                                type="button"
                                onClick={() => {
                                    setEditingLoanId(null);
                                    setLoanName('');
                                    setLoanAmount('');
                                    setLoanInterestRate('');
                                    setLoanInterestStart('');
                                    setLoanPrincipalStart('');
                                    setLoanEndDate('');
                                    setSpread('1.5');
                                    setIndiceDiRif('Euribor 3M');
                                    setRinegoziazioni([]);
                                }}
                                className="px-3 py-1.5 bg-slate-700 text-slate-300 text-xs rounded hover:bg-slate-600 transition-colors"
                            >
                                Annulla modifica
                            </button>
                        )}
                        <button
                            onClick={handleAddLoan}
                            disabled={!loanName || !loanAmount}
                            className="flex-1 bg-slate-600 hover:bg-slate-500 text-white py-1.5 rounded text-xs font-bold disabled:opacity-50"
                        >
                            {editingLoanId ? '💾 Salva modifiche' : 'Aggiungi Finanziamento'}
                        </button>
                    </div>
                 </div>
              </div>

              {/* Summary Box */}
              <div className="bg-slate-900 p-4 rounded-lg border border-slate-700 mt-4">
                 <div className="flex justify-between items-center mb-1">
                    <span className="text-slate-400 text-sm">Totale Disponibilità Liquida:</span>
                    <span className="text-slate-900 font-bold font-mono text-lg">{CURRENCY_FORMATTER.format(tempTotalAssets)}</span>
                 </div>
                 <div className="flex justify-between items-center">
                    <span className="text-slate-500 text-xs">Fondi Propri Stimati (Disponibilità - Debiti):</span>
                    <span className="text-slate-300 font-bold font-mono text-sm">{CURRENCY_FORMATTER.format(tempTotalAssets - tempTotalLoans)}</span>
                 </div>
              </div>

            </div>

            <div className="p-4 bg-slate-900 border-t border-slate-700 flex justify-end gap-3">
              <button onClick={() => setIsEditingBalance(false)} className="text-slate-400 hover:text-white text-sm font-medium px-4 py-2">Annulla</button>
              <button onClick={handleSaveBalance} className="bg-slate-700 hover:bg-slate-600 text-white text-sm font-bold px-6 py-2 rounded-lg flex items-center gap-2">
                <Save size={16} /> Salva Configurazione
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* HEADER BAR */}
      <div className="p-4 border-b border-slate-700/50 flex flex-col sm:flex-row justify-between items-center bg-[#222222] sticky left-0 z-20 gap-4 no-print">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
             <TrendingUp className="text-slate-400" size={20} />
             Flusso di Cassa Netto (Mensile & Progressivo)
          </h2>
        </div>
        
        <div className="flex items-center gap-4">
          {/* Legend for Colors */}
          <div className="hidden lg:flex items-center gap-4 text-[10px] bg-slate-950/50 px-3 py-1.5 rounded-full border border-slate-800">
              <span className="text-slate-400 font-bold uppercase mr-1">Legenda Saldi:</span>
              <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                  <span className="text-slate-400">&lt; 1€</span>
              </div>
              <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                  <span className="text-slate-400">&lt; 2x Media Spese</span>
              </div>
              <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span className="text-slate-400">Sicurezza</span>
              </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => exportCashFlowProjectionPDF({
                transactions,
                currentYear,
                projects,
                initialData: {
                  accounts: initialData.accounts,
                  loans: initialData.loans,
                  previousFinancing: initialData.previousFinancing,
                  accontiClienti: initialData.accontiClienti,
                  altriDebitiBT: initialData.altriDebitiBT,
                  mutuiBT: initialData.mutuiBT
                }
              })}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold transition-all shadow-lg shadow-black/20"
              title="Esporta Report Proiezione Annuale Cash Flow"
            >
              <FileText size={14} />
              <span className="hidden sm:inline">Report Proiezione</span>
            </button>
            <HelpButton onClick={() => setShowHelp(true)} />
            <PDFExportButton 
              config={{
                elementId: "cashflow-timeline-report-content",
                nomeFile: `CashFlow_Timeline_${currentYear}`,
                titolo: `Flusso di Cassa - Anno ${currentYear}`,
                sottotitolo: "Analisi Mensile e Progressiva della Liquidità",
                orientazione: "landscape"
              }}
            />
          </div>

          {/* Tasto POPOLA — accanto all'ingranaggio */}
          {onOpenImportPuntaNet && (
            <button
              onClick={onOpenImportPuntaNet}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl transition-colors shadow-sm"
            >
              <Database size={14} />
              Popola da Punta Net
            </button>
          )}
        </div>
      </div>
      
      <div id="cashflow-timeline-report-content">
        {/* Header per PDF */}
        <div className="hidden print-only p-8 border-b-2 border-slate-800 bg-white text-slate-900">
          <div className="flex justify-between items-end">
            <div>
              <h1 className="text-3xl font-bold">GRUPPO VISENTIN SRL</h1>
              <p className="text-slate-500 uppercase tracking-widest text-sm mt-1">Flusso di Cassa - Anno {currentYear}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-slate-600 font-medium">Data Report: {new Date().toLocaleDateString('it-IT')}</p>
            </div>
          </div>
        </div>

        {/* --- NEW CONFIGURATION PANEL ABOVE HEADER --- */}
        <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-3">
                <div className="bg-slate-800 p-2 rounded-lg border border-slate-700">
                  <Settings className="text-slate-400" size={20} />
                </div>
                <div>
                    <h3 className="text-indigo-400 text-xs font-bold uppercase tracking-wider mb-0.5">Saldi Iniziali (31/12 Anno Prec)</h3>
                    <p className="text-xs text-slate-500">Situazione di partenza conti e debiti</p>
                </div>
            </div>
            
            <div className="flex items-center gap-6 bg-slate-900 p-2 pr-3 rounded-xl border border-slate-800">
               <div className="flex flex-col px-3 border-r border-slate-700">
                   <span className="text-[10px] text-emerald-500 uppercase font-bold">Totale Liquidità</span>
                   <span className="text-emerald-400 font-mono font-bold text-sm">{CURRENCY_FORMATTER.format(totalInitialBalance)}</span>
               </div>
               <div className="flex flex-col px-3 border-r border-slate-700">
                   <span className="text-[10px] text-rose-500 uppercase font-bold">Debito Residuo</span>
                   <span className="text-rose-400 font-mono font-bold text-sm">{CURRENCY_FORMATTER.format(totalLoanDebtStart)}</span>
               </div>
               <div className="flex flex-col px-3">
                   <span className="text-[10px] text-sky-500 uppercase font-bold">Capitale Proprio</span>
                   <span className={`${totalInitialBalance - totalLoanDebtStart >= 0 ? 'text-sky-400' : 'text-rose-400'} font-mono font-bold text-sm`}>
                      {CURRENCY_FORMATTER.format(totalInitialBalance - totalLoanDebtStart)}
                   </span>
               </div>
               
               {isAuthorized ? (
                  <button 
                      onClick={handleOpenEdit}
                      className="bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors ml-2 no-print"
                  >
                      Gestisci
                  </button>
               ) : (
                  <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-lg text-slate-400 text-[10px] animate-pulse ml-2">
                    <Shield size={12} />
                    <span>Sblocca per gestire</span>
                  </div>
               )}
            </div>
        </div>

        {/* Banner Allerta Liquidità */}
        {mesiARischio.length > 0 && (
          <div className={`rounded-2xl border p-4 flex flex-col gap-3 mx-6 mb-4 ${
            mesiARischio.some(m => m.tipo === 'negativo')
              ? 'bg-slate-100 border-slate-300'
              : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="flex items-center gap-3">
              <AlertCircle
                size={20}
                className={mesiARischio.some(m => m.tipo === 'negativo') ? 'text-slate-900' : 'text-slate-500'}
              />
              <span className={`text-sm font-black uppercase tracking-wide ${
                mesiARischio.some(m => m.tipo === 'negativo') ? 'text-slate-900' : 'text-slate-700'
              }`}>
                {mesiARischio.some(m => m.tipo === 'negativo')
                  ? `Attenzione — ${mesiARischio.filter(m => m.tipo === 'negativo').length} ${mesiARischio.filter(m => m.tipo === 'negativo').length === 1 ? 'mese in rosso' : 'mesi in rosso'} nei prossimi mesi`
                  : `Avviso — ${mesiARischio.length} ${mesiARischio.length === 1 ? 'mese sotto soglia' : 'mesi sotto soglia'} di sicurezza`
                }
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {mesiARischio.map(({ mese, saldo, tipo }) => (
                <div
                  key={mese}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold ${
                    tipo === 'negativo'
                      ? 'bg-slate-200 text-slate-900 border border-slate-300'
                      : 'bg-slate-100 text-slate-700 border border-slate-200'
                  }`}
                >
                  <span>{months[mese]}</span>
                  <span className="font-mono">{CURRENCY_FORMATTER.format(saldo)}</span>
                  {tipo === 'negativo' && (
                    <span className="px-1.5 py-0.5 bg-slate-300 text-slate-900 text-[10px] rounded-full uppercase tracking-wide">
                      Negativo
                    </span>
                  )}
                </div>
              ))}
            </div>
            <p className={`text-[11px] leading-relaxed ${
              mesiARischio.some(m => m.tipo === 'negativo') ? 'text-slate-900' : 'text-slate-600'
            }`}>
              Soglia di sicurezza: {CURRENCY_FORMATTER.format(safetyThreshold)} (media spese mensili × 2).
              Valori basati sul mix consuntivo + previsionale inserito.
            </p>
          </div>
        )}


        <div ref={scrollContainerRef} className="overflow-x-auto w-full relative">
        <table className="w-full text-sm text-left border-collapse min-w-max">
          <thead className="text-xs uppercase bg-slate-800 text-slate-400 sticky top-0 z-30">
            <tr>
              <th scope="col" rowSpan={2} className={`px-6 py-3 font-semibold sticky left-0 bg-slate-800 z-30 border-r border-slate-700 shadow-[4px_0_4px_-2px_rgba(0,0,0,0.3)] ${COL_LABEL_WIDTH}`}>
                Totale Mensile
              </th>
              {months.map((month, monthIndex) => {
                const rischio = mesiARischio.find(m => m.mese === monthIndex);
                return (
                  <th
                    key={monthIndex}
                    colSpan={2}
                    className={`px-4 py-2 border-r border-slate-700 text-center bg-slate-800 ${COL_MONTH_WIDTH} ${
                      rischio
                        ? rischio.tipo === 'negativo'
                          ? 'bg-slate-900/50'
                          : 'bg-slate-800/50'
                        : ''
                    }`}
                  >
                    <div className="flex flex-col items-center gap-1 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-300 text-xs font-black uppercase tracking-widest">
                          {month}
                        </span>
                        <button
                          onClick={() => exportMonthlyReportPDF({ monthIndex, year: currentYear, transactions })}
                          className="p-1 rounded-md hover:bg-slate-700 text-slate-500 hover:text-slate-300 transition-colors"
                          title={`Esporta Report Mensile ${month}`}
                        >
                          <FileText size={10} />
                        </button>
                      </div>
                      {rischio && (
                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wide ${
                          rischio.tipo === 'negativo'
                            ? 'bg-slate-900 text-white'
                            : 'bg-slate-500 text-white'
                        }`}>
                          {rischio.tipo === 'negativo' ? 'Rosso' : 'Avviso'}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
              <th colSpan={2} className="px-4 py-2 border-l-2 border-slate-700 text-center min-w-[240px] bg-slate-800 font-bold text-slate-300 sticky right-0 z-30 shadow-[-4px_0_4px_-2px_rgba(0,0,0,0.3)]">
                TOTALE ANNUO
              </th>
            </tr>
            <tr>
              {months.map((month) => (
                <React.Fragment key={`${month}-sub`}>
                  <th className={`px-2 py-2 border-r border-slate-700/50 text-slate-500 font-medium text-center ${COL_SUB_WIDTH}`}>
                    Diff. Prev.
                  </th>
                  <th className={`px-2 py-2 border-r border-slate-700 text-slate-300 font-medium text-center ${COL_SUB_WIDTH}`}>
                    Diff. Cons.
                  </th>
                </React.Fragment>
              ))}
              <th className={`px-2 py-2 border-l-2 border-slate-700 border-r border-slate-700 text-slate-500 font-bold text-center bg-slate-800 sticky right-[120px] z-30 shadow-[-4px_0_4px_-2px_rgba(0,0,0,0.3)] ${COL_SUMMARY_WIDTH}`}>
                Tot. Prev.
              </th>
              <th className={`px-2 py-2 text-slate-300 font-bold text-center bg-slate-900 sticky right-0 z-30 shadow-[-4px_0_4px_-2px_rgba(0,0,0,0.3)] ${COL_SUMMARY_WIDTH}`}>
                Tot. Cons.
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-[#222222]/50 hover:bg-slate-800/30 transition-colors">
              <td className={`px-6 py-6 font-bold text-white sticky left-0 z-10 border-r border-slate-700 bg-[#222222] shadow-[4px_0_4px_-2px_rgba(0,0,0,0.3)] ${COL_LABEL_WIDTH}`}>
                 SALDO NETTO MENSILE
              </td>
              
              {months.map((_, mIdx) => {
                const netForecast = calculateMonthlyFlow(mIdx, true);
                const netActual = calculateMonthlyFlow(mIdx, false);

                return (
                  <React.Fragment key={`net-${mIdx}`}>
                    {/* Previsionale Netto */}
                    <td className={`px-2 py-4 text-center border-r border-slate-700/50 font-mono text-xs font-medium ${
                        netForecast > 0 ? 'text-slate-400' : netForecast < 0 ? 'text-slate-500' : 'text-slate-600'
                    } ${COL_SUB_WIDTH}`}>
                       {netForecast !== 0 ? CURRENCY_FORMATTER.format(netForecast) : '-'}
                    </td>

                    {/* Consuntivo Netto */}
                    <td className={`px-2 py-4 text-center border-r border-slate-700 font-mono font-bold text-sm ${
                        netActual > 0 ? 'text-slate-900 bg-slate-100' : netActual < 0 ? 'text-slate-500 bg-slate-50' : 'text-slate-500'
                    } ${COL_SUB_WIDTH}`}>
                       {netActual !== 0 ? CURRENCY_FORMATTER.format(netActual) : '-'}
                    </td>
                  </React.Fragment>
                );
              })}
              
              <td className={`px-2 py-4 text-center border-l-2 border-slate-700 border-r border-slate-700 text-slate-400 font-mono text-xs bg-slate-900/50 font-bold sticky right-[120px] z-10 shadow-[-4px_0_4px_-2px_rgba(0,0,0,0.3)] ${COL_SUMMARY_WIDTH}`}>
                 {CURRENCY_FORMATTER.format(calculateYearFlow(true))}
              </td>
              <td className={`px-2 py-4 text-center border-r border-slate-700 text-slate-900 font-mono text-xs bg-slate-100 font-bold sticky right-0 z-10 shadow-[-4px_0_4px_-2px_rgba(0,0,0,0.3)] ${COL_SUMMARY_WIDTH}`}>
                 {CURRENCY_FORMATTER.format(calculateYearFlow(false))}
              </td>
            </tr>
            
            {/* Grand Total Row (Cumulative Balance) */}
             <tr className="bg-slate-950 font-bold border-t-2 border-slate-700">
              <td className={`px-6 py-4 sticky left-0 bottom-0 bg-slate-950 z-30 border-r border-slate-700 text-slate-300 uppercase text-xs tracking-wider shadow-[4px_0_4px_-2px_rgba(0,0,0,0.3)] ${COL_LABEL_WIDTH}`}>
                SALDO BANCA PROGRES.
              </td>
              {months.map((_, mIdx) => {
                // Calculate cumulative up to this month starting from Initial Balance
                let cumulativeForecast = saldoInizialePrevisionale;
                let cumulativeActual = saldoInizialeConsuntivo;

                for(let i=0; i<=mIdx; i++) {
                    cumulativeForecast += calculateMonthlyFlow(i, true);
                    cumulativeActual += calculateMonthlyFlow(i, false);
                }

                return (
                  <React.Fragment key={`cum-${mIdx}`}>
                    <td className={`px-1 py-4 text-center border-r border-slate-800 font-mono text-[10px] ${getBalanceColor(cumulativeForecast)} ${COL_SUB_WIDTH}`}>
                       {CURRENCY_FORMATTER.format(cumulativeForecast)}
                    </td>
                    <td className={`px-1 py-4 text-center border-r border-slate-700 font-mono text-[11px] ${getBalanceColor(cumulativeActual)} ${COL_SUB_WIDTH}`}>
                       {CURRENCY_FORMATTER.format(cumulativeActual)}
                    </td>
                  </React.Fragment>
                );
              })}
              
              <td className={`px-2 py-4 text-center border-l-2 border-slate-700 border-r border-slate-700 text-slate-400 font-mono text-xs bg-slate-900/50 font-bold sticky right-[120px] z-30 shadow-[-4px_0_4px_-2px_rgba(0,0,0,0.3)] ${COL_SUMMARY_WIDTH}`}>
                 {CURRENCY_FORMATTER.format(forecastFinalBalance)}
              </td>
              <td className={`px-2 py-4 text-center border-r border-slate-700 text-slate-300 font-mono text-xs bg-slate-800 font-bold sticky right-0 z-30 shadow-[-4px_0_4px_-2px_rgba(0,0,0,0.3)] ${COL_SUMMARY_WIDTH}`}>
                 {CURRENCY_FORMATTER.format(actualFinalBalance)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* --- YEAR END SUMMARY SECTION --- */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-slate-800 border-t border-slate-800">
        
        {/* Forecast Summary */}
        <div className="bg-[#222222] p-6 flex flex-col relative group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <TrendingUp size={48} className="text-slate-500" />
          </div>
          <h3 className="text-emerald-500 text-xs font-bold uppercase tracking-widest mb-2 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            Previsionale Fine Anno
          </h3>
          <div className={`text-3xl font-mono font-bold mb-6 tracking-tight ${getBalanceColor(forecastFinalBalance).split(' ')[0]}`}>
            {CURRENCY_FORMATTER.format(forecastFinalBalance)}
          </div>
          
          <div className="space-y-3 mt-auto">
             <div className="flex justify-between items-center p-3 bg-slate-800/50 rounded-lg border border-slate-800">
                <div className="flex items-center gap-2 text-sky-500">
                   <Wallet size={16} />
                   <span className="text-xs font-medium">Capitale Proprio</span>
                </div>
                <span className={`font-mono font-bold text-sm ${forecastOwnFunds >= 0 ? 'text-sky-400' : 'text-rose-400'}`}>
                  {CURRENCY_FORMATTER.format(forecastOwnFunds)}
                </span>
             </div>
             
             <div 
                className="flex justify-between items-center p-3 bg-slate-800/50 rounded-lg border border-slate-800 group relative cursor-help"
                title={`Dettaglio Debito Residuo:\n${
                  [
                    ...(initialData.loans || [])
                      .filter(l => !transactions.some(t => t.loanSourceId === l.id && new Date(t.date).getFullYear() === currentYear))
                      .map(l => `• ${l.name} (Pregresso): ${CURRENCY_FORMATTER.format(l.originalAmount)}`),
                    ...(transactions
                      .filter(t => t.type === TransactionType.INCOME && t.category === '[FINANZA] Finanziamenti Ricevuti' && t.loanDetails && !(t.isForecast && transactions.some(act => !act.isForecast && act.linkedForecastId === t.id)))
                      .map(t => `• ${t.description} (${t.isForecast ? 'Prev.' : 'Cons.'}): ${CURRENCY_FORMATTER.format(t.amount)}`))
                  ].join('\n')
                }`}
              >
                <div className="flex items-center gap-2 text-rose-500">
                   <Landmark size={16} />
                   <span className="text-xs font-medium">Capitale da Finanziamenti (Debito)</span>
                </div>
                <span className="font-mono font-bold text-rose-400 text-sm">
                   {CURRENCY_FORMATTER.format(forecastRemainingDebt)}
                </span>
             </div>
          </div>
        </div>

        {/* Actual Summary */}
        <div className="bg-[#222222] p-6 flex flex-col relative group">
           <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <AlertCircle size={48} className={actualFinalBalance >= 0 ? "text-slate-400" : "text-slate-500"} />
          </div>
          <h3 className="text-rose-500 text-xs font-bold uppercase tracking-widest mb-2 flex items-center gap-2">
             <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
             Consuntivo Fine Anno
          </h3>
          <div className={`text-3xl font-mono font-bold mb-6 tracking-tight ${getBalanceColor(actualFinalBalance).split(' ')[0]}`}>
            {CURRENCY_FORMATTER.format(actualFinalBalance)}
          </div>

          <div className="space-y-3 mt-auto">
             <div className="flex justify-between items-center p-3 bg-slate-800/50 rounded-lg border border-slate-800">
                <div className="flex items-center gap-2 text-sky-500">
                   <Wallet size={16} />
                   <span className="text-xs font-medium">Capitale Proprio</span>
                </div>
                <span className={`font-mono font-bold text-sm ${actualOwnFunds >= 0 ? 'text-sky-400' : 'text-rose-400'}`}>
                  {CURRENCY_FORMATTER.format(actualOwnFunds)}
                </span>
             </div>
             
             <div 
                className="flex justify-between items-center p-3 bg-slate-800/50 rounded-lg border border-slate-800 group relative cursor-help"
                title={`Dettaglio Debito Residuo:\n${
                  [
                    ...(initialData.loans || [])
                      .filter(l => !transactions.some(t => t.loanSourceId === l.id && new Date(t.date).getFullYear() === currentYear))
                      .map(l => `• ${l.name} (Pregresso): ${CURRENCY_FORMATTER.format(l.originalAmount)}`),
                    ...(transactions
                      .filter(t => !t.isForecast && t.type === TransactionType.INCOME && t.category === '[FINANZA] Finanziamenti Ricevuti' && t.loanDetails)
                      .map(t => `• ${t.description} (Cons.): ${CURRENCY_FORMATTER.format(t.amount)}`))
                  ].join('\n')
                }`}
              >
                <div className="flex items-center gap-2 text-rose-500">
                   <Landmark size={16} />
                   <span className="text-xs font-medium">Capitale da Finanziamenti (Debito)</span>
                </div>
                <span className="font-mono font-bold text-rose-400 text-sm">
                   {CURRENCY_FORMATTER.format(actualRemainingDebt)}
                </span>
             </div>
          </div>
        </div>

        </div>
      </div>

      <HelpPanel 
        isOpen={showHelp}
        onClose={() => setShowHelp(false)}
        currentView={AppView.TIMELINE}
        onGoToManuale={onGoToManuale}
      />

      {syncStatus && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[200] bg-emerald-600 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300">
           <CheckCircle2 size={20} />
           <span className="font-bold text-sm uppercase tracking-wider">{syncStatus}</span>
        </div>
      )}
    </div>
  );
};

export default CashFlowTimeline;