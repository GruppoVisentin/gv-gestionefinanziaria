import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Transaction, TransactionType, Project, InitialBalanceBreakdown, LoanDetails, AppView } from '../types';
import { CURRENCY_FORMATTER, DATE_FORMATTER, CATEGORY_TO_CE_TYPE } from '../constants';
import { Plus, X, Save, ListFilter, Pencil, Trash2, ChevronDown, Calendar, CalendarClock, Landmark, Printer, Briefcase, Shield, FileText } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { HelpButton } from './HelpPanel';
import HelpPanel from './HelpPanel';
import { exportMonthlyReportPDF } from '../utils/monthlyPdfExport';
import { buildCEData, calcCEMetrics, calcPrevisioneFiscale, calcPosizIoneIVA, parseUTCDate } from '../utils/gasCoreEngine';

interface ExpenseTimelineProps {
  transactions: Transaction[];
  projects?: Project[];
  initialData?: InitialBalanceBreakdown;
  onSaveTransaction?: (data: Omit<Transaction, 'id'>) => void;
  onUpdateTransaction?: (transaction: Transaction) => void;
  onDeleteTransaction?: (id: string) => void;
  scrollContainerRef?: React.RefObject<HTMLDivElement>;
  fixedCategories: string[];
  variableCategories: string[];
  supplierPresets?: Record<string, string[]>;
  currentYear: number;
  isAuthorized?: boolean;
  onGoToManuale?: (section?: string, tab?: 'manuale' | 'glossario') => void;
}

const ExpenseTimeline: React.FC<ExpenseTimelineProps> = ({ 
  transactions, 
  projects = [], 
  initialData, 
  onSaveTransaction, 
  onUpdateTransaction, 
  onDeleteTransaction, 
  scrollContainerRef,
  fixedCategories,
  variableCategories,
  supplierPresets = {},
  currentYear,
  isAuthorized = false,
  onGoToManuale
}) => {
  const [showHelp, setShowHelp] = useState(false);
  const months = [
    'Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 
    'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'
  ];

  // COL WIDTH CONSTANTS
  const COL_LABEL_WIDTH = "min-w-[300px] w-[300px] max-w-[300px]";
  const COL_MONTH_WIDTH = "min-w-[240px] w-[240px]";
  const COL_SUB_WIDTH = "w-[120px]";
  const COL_SUMMARY_WIDTH = "w-[120px]";

  const [activeCell, setActiveCell] = useState<{ category: string; monthIndex: number } | null>(null);
  const [activeTab, setActiveTab] = useState<'budget' | 'new'>('budget'); 
  const [breakdownView, setBreakdownView] = useState<{ category: string; monthIndex: number } | null>(null);
  const [expandedForecastCell, setExpandedForecastCell] = useState<{ category: string; monthIndex: number } | null>(null);

  const [newActualAmount, setNewActualAmount] = useState('');
  const [newActualVat, setNewActualVat] = useState('22');
  const [newActualSupplier, setNewActualSupplier] = useState('');
  const [newActualDate, setNewActualDate] = useState('');
  const [newActualInvoiceRef, setNewActualInvoiceRef] = useState('');
  const [newActualProject, setNewActualProject] = useState('');
  const [editingActualId, setEditingActualId] = useState<string | null>(null);

  const [addingForecast, setAddingForecast] = useState<{ category: string; monthIndex: number } | null>(null);
  const [newForecastAmount, setNewForecastAmount] = useState('');
  const [newForecastVat, setNewForecastVat] = useState('22');
  const [newForecastDesc, setNewForecastDesc] = useState('');
  const [newForecastCassa, setNewForecastCassa] = useState('');
  const [newForecastCassaPerc, setNewForecastCassaPerc] = useState(0);
  const [isManualCassa, setIsManualCassa] = useState(false);
  const [applyToAllMonths, setApplyToAllMonths] = useState(false);
  const [editingForecastId, setEditingForecastId] = useState<string | null>(null);
  const [formType, setFormType] = useState<'FORECAST' | 'ACTUAL'>('FORECAST');

  const dropdownRef = useRef<HTMLDivElement>(null);
  const forecastFormRef = useRef<HTMLDivElement>(null);

  const taxForecasts = useMemo(() => {
    const ceData = buildCEData(transactions, currentYear, undefined, 'competenza', projects, initialData);
    const ceMetrics = calcCEMetrics(ceData, transactions, projects, initialData);
    const prevFiscale = calcPrevisioneFiscale(transactions, currentYear, ceMetrics, undefined, 0.24, 0.039, true, initialData);
    const posIva = calcPosizIoneIVA(transactions, currentYear, true);
    return { prevFiscale, posIva };
  }, [transactions, currentYear, projects, initialData]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setActiveCell(null);
        setEditingActualId(null);
      }
      if (forecastFormRef.current && !forecastFormRef.current.contains(event.target as Node)) {
        setAddingForecast(null);
        setEditingForecastId(null);
        setNewForecastCassa('');
        setNewForecastCassaPerc(0);
        setIsManualCassa(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (activeCell && !editingActualId) {
      setNewActualAmount('');
      setNewActualSupplier('');
      setNewActualVat('22');
      setNewActualDate(`${currentYear}-${String(activeCell.monthIndex + 1).padStart(2, '0')}-15`);
      setNewActualInvoiceRef('');
      setNewActualProject('');
      
      const hasForecasts = getUnpaidForecasts(activeCell.category).length > 0;
      setActiveTab(hasForecasts ? 'budget' : 'new');
    }
  }, [activeCell, editingActualId, currentYear]); 

  const getGrossAmount = (t: Transaction) => {
    const net = t.amount;
    const vat = t.vatRate || 0;
    return net * (1 + vat / 100);
  };

  const expenseTransactions = transactions.filter(t => t.type === TransactionType.EXPENSE);

  const isForecastPaid = (forecastId: string) => {
    return expenseTransactions.some(t => !t.isForecast && t.linkedForecastId === forecastId);
  };

  const getCellTransactions = (category: string, monthIndex: number, isForecast: boolean) => {
    return expenseTransactions.filter(t => {
      const tDate = parseUTCDate(t.date);
      const tForecast = !!t.isForecast;
      return (
        t.category === category &&
        tDate.getUTCMonth() === monthIndex &&
        tDate.getUTCFullYear() === currentYear &&
        tForecast === isForecast
      );
    });
  };

  // --- PROJECT ESTIMATE LOGIC ---
  const calculateProjectCostForMonth = (category: string, monthIndex: number) => {
      let total = 0;
      projects.filter(p => p.status === 'ACTIVE' && p.estimatedStartDate).forEach(p => {
          const start = parseUTCDate(p.estimatedStartDate!);
          const startMonthGlobal = start.getUTCFullYear() * 12 + start.getUTCMonth();
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

  // --- LOAN REPAYMENT LOGIC (French Amortization / Rata Costante) ---
  const calculateRepayment = (
      principal: number, 
      details: LoanDetails, 
      targetMonthIndex: number
  ) => {
      if (!details || !details.interestStartDate) return { total: 0, principal: 0, interest: 0, rateUsed: 0, typeUsed: 'FIXED' };

      const targetDate = new Date(Date.UTC(currentYear, targetMonthIndex, 15));
      const intStart = parseUTCDate(details.interestStartDate);
      const princStart = details.principalStartDate ? parseUTCDate(details.principalStartDate) : intStart;
      const end = details.endDate ? parseUTCDate(details.endDate) : new Date(Date.UTC(intStart.getUTCFullYear() + 20, intStart.getUTCMonth(), intStart.getUTCDate()));

      if (targetDate < intStart || targetDate > end) return { total: 0, principal: 0, interest: 0, rateUsed: 0, typeUsed: 'FIXED' };

      // Determina il tasso applicabile per questa specifica data (considerando rinegoziazioni)
      let currentRate = details.interestRate;
      let currentType = details.rateType;
      
      if (details.rinegoziazioni && details.rinegoziazioni.length > 0) {
        // Ordina per data e prendi l'ultima rinegoziazione valida per targetDate
        const rinegValide = [...details.rinegoziazioni]
          .filter(r => parseUTCDate(r.dataInizio) <= targetDate)
          .sort((a, b) => parseUTCDate(b.dataInizio).getTime() - parseUTCDate(a.dataInizio).getTime());
        
        if (rinegValide.length > 0) {
          currentRate = rinegValide[0].nuovoTasso;
          currentType = rinegValide[0].nuovoTipoTasso;
        }
      }

      const i = (currentRate / 100) / 12;
      const amortizationStart = !isNaN(princStart.getTime()) ? princStart : intStart;
      
      if (targetDate >= intStart && targetDate < amortizationStart) {
          return { 
            total: principal * i, 
            principal: 0, 
            interest: principal * i,
            rateUsed: currentRate,
            typeUsed: currentType
          };
      }

      const n = (end.getUTCFullYear() - amortizationStart.getUTCFullYear()) * 12 + (end.getUTCMonth() - amortizationStart.getUTCMonth());
      if (n <= 0) return { total: 0, principal: 0, interest: 0, rateUsed: currentRate, typeUsed: currentType };

      const rataFissa = i > 0
        ? principal * (i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1)
        : principal / n;

      const monthsPassed = (targetDate.getUTCFullYear() - amortizationStart.getUTCFullYear()) * 12 + (targetDate.getUTCMonth() - amortizationStart.getUTCMonth());
      if (monthsPassed <= 0 || monthsPassed > n) return { total: 0, principal: 0, interest: 0, rateUsed: currentRate, typeUsed: currentType };

      const paymentsMade = monthsPassed - 1;

      const residualCapital = i > 0
        ? principal * (Math.pow(1 + i, n) - Math.pow(1 + i, paymentsMade)) / (Math.pow(1 + i, n) - 1)
        : Math.max(0, principal - (principal / n * paymentsMade));

      const interestPayment = Math.max(0, residualCapital * i);
      const principalPayment = Math.min(residualCapital, rataFissa - interestPayment);

      return {
        total: Math.round((principalPayment + interestPayment) * 100) / 100,
        principal: Math.round(principalPayment * 100) / 100,
        interest: Math.round(interestPayment * 100) / 100,
        rateUsed: currentRate,
        typeUsed: currentType
      };
  };

  const calculateLoanRepaymentForMonth = (monthIndex: number) => {
      let total = 0;
      let interest = 0;
      let principal = 0;
      const details: { name: string; amount: number; rate: number; type: string; principal: number; interest: number; total: number }[] = [];

      // 1. From New INCOME Transactions (that have loan details)
      // Escludi forecast se esiste un actual collegato via linkedForecastId O loanSourceId
      const incomeLoans = transactions.filter(t => 
          t.type === TransactionType.INCOME && 
          t.category === '[FINANZA] Finanziamenti Ricevuti' && 
          t.loanDetails &&
          !(t.isForecast && transactions.some(act => 
            !act.isForecast && 
            (act.linkedForecastId === t.id || (t.loanSourceId && act.loanSourceId === t.loanSourceId))
          ))
      );

      incomeLoans.forEach(t => {
          const comps = calculateRepayment(t.amount, t.loanDetails!, monthIndex);
          total += comps.total;
          interest += comps.interest;
          principal += comps.principal;
          if (comps.total > 0) {
            details.push({
              name: t.description,
              amount: t.amount,
              rate: comps.rateUsed,
              type: comps.typeUsed,
              principal: comps.principal,
              interest: comps.interest,
              total: comps.total
            });
          }
      });

      // 2. From Existing Loans (Initial Balance)
      if (initialData?.loans) {
          initialData.loans
            .filter(l => !transactions.some(t => t.loanSourceId === l.id && parseUTCDate(t.date).getUTCFullYear() === currentYear))
            .forEach(l => {
              const comps = calculateRepayment(l.originalAmount, l.details, monthIndex);
              total += comps.total;
              interest += comps.interest;
              principal += comps.principal;
              if (comps.total > 0) {
                details.push({
                  name: l.name,
                  amount: l.originalAmount,
                  rate: comps.rateUsed,
                  type: comps.typeUsed,
                  principal: comps.principal,
                  interest: comps.interest,
                  total: comps.total
                });
              }
          });
      }

      return { total, interest, principal, details };
  };

  // Helpers to check if the current row is a Loan-related row
  const isInterestCategory = (cat: string) =>
    cat === '[FINANZA] Interessi Passivi Finanziamenti';

  const isPrincipalCategory = (cat: string) =>
    cat === '[FINANZA] Quota Capitale Rate Finanziamenti';

  const getMonthlyTotal = (monthIndex: number, isForecast: boolean) => {
    let transactionTotal = expenseTransactions
      .filter(t => {
        const tDate = parseUTCDate(t.date);
        const tForecast = !!t.isForecast;
        return (
          tDate.getUTCMonth() === monthIndex &&
          tDate.getUTCFullYear() === currentYear &&
          tForecast === isForecast &&
          t.ceType !== 'ammortamento' && // N5 fix: ammortamenti non monetari esclusi
          (fixedCategories.includes(t.category) || variableCategories.includes(t.category))
        );
      })
      .reduce((sum, t) => sum + getGrossAmount(t), 0);

    // If Forecast, add calculated estimates
    if (isForecast) {
        // Add Project Estimates
        // INC-01 Fix: use correct categories consistent with constants.ts
        ['[CONSULENZE] Professionisti Esterni di Cantiere', '[PERSONALE] Subappalti Manodopera', '[FORNITORI] Fornitori Materiali', '[FORNITORI] Subappalti su Cantieri'].forEach(cat => {
            // Se la categoria usata nei costruttori cantieri è corretta in constants.ts
            // come '[PERSONALE] Subappalti Manodopera' (oppure '[CANTIERE] Subappalti Manodopera')
            // controlliamo se è nei variableCategories. In constants.ts:
            // "[PERSONALE] Subappalti Manodopera" è nei variable_cost_categories.
            transactionTotal += calculateProjectCostForMonth(cat, monthIndex);
        });
        
        // Add Loan Repayments (Global for the month)
        // BUG-01 Fix: Check if we already have transactions for loan categories in this month/year.
        // If there are manual/imported actuals or manual forecasts for '[FINANZA] Interessi Passivi Finanziamenti' or '[FINANZA] Quota Capitale Rate Finanziamenti',
        // we shouldn't add the calculated repayments to avoid double counting.
        const hasLoanTransactions = expenseTransactions.some(t => {
          const tDate = parseUTCDate(t.date);
          return (
            tDate.getUTCMonth() === monthIndex &&
            tDate.getUTCFullYear() === currentYear &&
            (t.category === '[FINANZA] Interessi Passivi Finanziamenti' || t.category === '[FINANZA] Quota Capitale Rate Finanziamenti')
          );
        });

        if (!hasLoanTransactions) {
            transactionTotal += calculateLoanRepaymentForMonth(monthIndex).total;
        }

        // Add Tax Estimates
        const ivaMese = taxForecasts.posIva.mensile[monthIndex];
        if (ivaMese && ivaMese.isForecastMese && ivaMese.versamentoIVA > 0) {
            transactionTotal += ivaMese.versamentoIVA;
        }

        if (monthIndex === 5) {
            const paidJune = expenseTransactions.some(t => parseUTCDate(t.date).getUTCFullYear() === currentYear && parseUTCDate(t.date).getUTCMonth() === 5 && !t.isForecast && t.category === '[FISCO] F24 — IRPEF / IRES / IRAP');
            if (!paidJune) {
                transactionTotal += taxForecasts.prevFiscale.accontoGiugno + taxForecasts.prevFiscale.saldoGiugnom;
            }
        } else if (monthIndex === 10) {
            const paidNov = expenseTransactions.some(t => parseUTCDate(t.date).getUTCFullYear() === currentYear && parseUTCDate(t.date).getUTCMonth() === 10 && !t.isForecast && t.category === '[FISCO] F24 — IRPEF / IRES / IRAP');
            if (!paidNov) {
                transactionTotal += taxForecasts.prevFiscale.accontoNovembre;
            }
        }
    }

    return transactionTotal;
  };

  const getCategoryAnnualTotal = (category: string, isForecast: boolean) => {
    let total = expenseTransactions.filter(t => {
      const tDate = parseUTCDate(t.date);
      const tForecast = !!t.isForecast;
      return (
        t.category === category &&
        tDate.getUTCFullYear() === currentYear &&
        tForecast === isForecast &&
        t.ceType !== 'ammortamento' // N5 fix: ammortamenti non monetari esclusi
      );
    }).reduce((sum, t) => sum + getGrossAmount(t), 0);

    if (isForecast) {
        for (let m = 0; m < 12; m++) {
            total += calculateProjectCostForMonth(category, m);
        }
        if (isInterestCategory(category)) {
            // BUG-01 Fix: Only add calculations if there are no manual transactions for interests in the whole year
            const hasInterests = expenseTransactions.some(t => {
              const tDate = parseUTCDate(t.date);
              return tDate.getUTCFullYear() === currentYear && t.category === '[FINANZA] Interessi Passivi Finanziamenti';
            });
            if (!hasInterests) {
                for (let m = 0; m < 12; m++) {
                    total += calculateLoanRepaymentForMonth(m).interest;
                }
            }
        }
        if (isPrincipalCategory(category)) {
            // BUG-01 Fix: Only add calculations if there are no manual transactions for principal in the whole year
            const hasPrincipal = expenseTransactions.some(t => {
              const tDate = parseUTCDate(t.date);
              return tDate.getUTCFullYear() === currentYear && t.category === '[FINANZA] Quota Capitale Rate Finanziamenti';
            });
            if (!hasPrincipal) {
                for (let m = 0; m < 12; m++) {
                    total += calculateLoanRepaymentForMonth(m).principal;
                }
            }
        }
        if (category === '[FISCO] F24 — IVA') {
            for (let m = 0; m < 12; m++) {
                const ivaMese = taxForecasts.posIva.mensile[m];
                if (ivaMese && ivaMese.isForecastMese && ivaMese.versamentoIVA > 0) {
                    total += ivaMese.versamentoIVA;
                }
            }
        }
        if (category === '[FISCO] F24 — IRPEF / IRES / IRAP') {
            const paidJune = expenseTransactions.some(t => parseUTCDate(t.date).getUTCFullYear() === currentYear && parseUTCDate(t.date).getUTCMonth() === 5 && !t.isForecast && t.category === '[FISCO] F24 — IRPEF / IRES / IRAP');
            if (!paidJune) {
                total += taxForecasts.prevFiscale.accontoGiugno;
                total += taxForecasts.prevFiscale.saldoGiugnom;
            }
            const paidNov = expenseTransactions.some(t => parseUTCDate(t.date).getUTCFullYear() === currentYear && parseUTCDate(t.date).getUTCMonth() === 10 && !t.isForecast && t.category === '[FISCO] F24 — IRPEF / IRES / IRAP');
            if (!paidNov) total += taxForecasts.prevFiscale.accontoNovembre;
        }
    }
    return total;
  };

  const getSectionAnnualTotal = (categories: string[], isForecast: boolean) => {
    let total = expenseTransactions.filter(t => {
      const tDate = parseUTCDate(t.date);
      const tForecast = !!t.isForecast;
      return (
        categories.includes(t.category) &&
        tDate.getUTCFullYear() === currentYear &&
        tForecast === isForecast
      );
    }).reduce((sum, t) => sum + getGrossAmount(t), 0);

    if (isForecast) {
        categories.forEach(cat => {
            for (let m = 0; m < 12; m++) {
                total += calculateProjectCostForMonth(cat, m);
            }
            if (isInterestCategory(cat)) {
                const hasInterests = expenseTransactions.some(t => {
                  const tDate = parseUTCDate(t.date);
                  return tDate.getUTCFullYear() === currentYear && t.category === '[FINANZA] Interessi Passivi Finanziamenti';
                });
                if (!hasInterests) {
                    for (let m = 0; m < 12; m++) {
                        total += calculateLoanRepaymentForMonth(m).interest;
                    }
                }
            }
            if (isPrincipalCategory(cat)) {
                const hasPrincipal = expenseTransactions.some(t => {
                  const tDate = parseUTCDate(t.date);
                  return tDate.getUTCFullYear() === currentYear && t.category === '[FINANZA] Quota Capitale Rate Finanziamenti';
                });
                if (!hasPrincipal) {
                    for (let m = 0; m < 12; m++) {
                        total += calculateLoanRepaymentForMonth(m).principal;
                    }
                }
            }
            if (cat === '[FISCO] Versamento IVA') {
                for (let m = 0; m < 12; m++) {
                    const ivaMese = taxForecasts.posIva.mensile[m];
                    if (ivaMese && ivaMese.isForecastMese && ivaMese.versamentoIVA > 0) {
                        total += ivaMese.versamentoIVA;
                    }
                }
            }
            if (cat === '[FISCO] F24 — IRPEF / IRES / IRAP') {
                const paidJune = expenseTransactions.some(t => parseUTCDate(t.date).getUTCFullYear() === currentYear && parseUTCDate(t.date).getUTCMonth() === 5 && !t.isForecast && t.category === '[FISCO] F24 — IRPEF / IRES / IRAP');
                if (!paidJune) {
                    total += taxForecasts.prevFiscale.accontoGiugno;
                    total += taxForecasts.prevFiscale.saldoGiugnom;
                }
                const paidNov = expenseTransactions.some(t => parseUTCDate(t.date).getUTCFullYear() === currentYear && parseUTCDate(t.date).getUTCMonth() === 10 && !t.isForecast && t.category === '[FISCO] F24 — IRPEF / IRES / IRAP');
                if (!paidNov) total += taxForecasts.prevFiscale.accontoNovembre;
            }
        });
    }
    return total;
  };

  const getGrandAnnualTotal = (isForecast: boolean) => {
    let total = expenseTransactions.filter(t => {
      const tDate = parseUTCDate(t.date);
      const tForecast = !!t.isForecast;
      return tDate.getUTCFullYear() === currentYear && 
             tForecast === isForecast &&
             t.ceType !== 'ammortamento' && // N5 fix: ammortamenti non monetari esclusi
             (fixedCategories.includes(t.category) || variableCategories.includes(t.category));
    }).reduce((sum, t) => sum + getGrossAmount(t), 0);

    if (isForecast) {
        // Projects
        ['[CONSULENZE] Professionisti Esterni di Cantiere', '[PERSONALE] Subappalti Manodopera', '[FORNITORI] Fornitori Materiali', '[FORNITORI] Subappalti su Cantieri'].forEach(cat => {
            for (let m = 0; m < 12; m++) {
                total += calculateProjectCostForMonth(cat, m);
            }
        });
        // Loans
        const hasLoanTransactionsGlobal = expenseTransactions.some(t => {
          const tDate = parseUTCDate(t.date);
          return (
            tDate.getUTCFullYear() === currentYear &&
            (t.category === '[FINANZA] Interessi Passivi Finanziamenti' || t.category === '[FINANZA] Quota Capitale Rate Finanziamenti')
          );
        });
        if (!hasLoanTransactionsGlobal) {
            for (let m = 0; m < 12; m++) {
                total += calculateLoanRepaymentForMonth(m).total;
            }
        }
        
        // Add Tax Estimates
        for (let m = 0; m < 12; m++) {
            const ivaMese = taxForecasts.posIva.mensile[m];
            if (ivaMese && ivaMese.isForecastMese && ivaMese.versamentoIVA > 0) {
                total += ivaMese.versamentoIVA;
            }
        }
        const paidJune = expenseTransactions.some(t => parseUTCDate(t.date).getUTCFullYear() === currentYear && parseUTCDate(t.date).getUTCMonth() === 5 && !t.isForecast && t.category === '[FISCO] F24 — IRPEF / IRES / IRAP');
        if (!paidJune) {
            total += taxForecasts.prevFiscale.accontoGiugno;
            total += taxForecasts.prevFiscale.saldoGiugnom;
        }
        const paidNov = expenseTransactions.some(t => parseUTCDate(t.date).getUTCFullYear() === currentYear && parseUTCDate(t.date).getUTCMonth() === 10 && !t.isForecast && t.category === '[FISCO] F24 — IRPEF / IRES / IRAP');
        if (!paidNov) total += taxForecasts.prevFiscale.accontoNovembre;
    }
    return total;
  };

  const getUnpaidForecasts = (category: string) => {
    return expenseTransactions.filter(t => t.isForecast && t.category === category && !isForecastPaid(t.id));
  };

  const getSupplierName = (t: Transaction): string => {
    if (t.sourceRef) {
      const descr = t.description;
      let m = descr.match(/(?:Pagamento|Incasso)\s+(?:FEP|NEP)\s+n\.\s+[\w/]+\s+-\s+(.+?)\s+-\s+/i);
      if (m) return m[1].trim();
      m = descr.match(/RIF\.TO\s+(.+?)\s+-\s+/i);
      if (m) return m[1].trim();
      m = descr.match(/^.+?\s+-\s+(.+?)\s+-\s+Home banking/i);
      if (m) return m[1].trim();
      m = descr.match(/-\s+(.+?)\s+-\s+Bonifico/i);
      if (m) return m[1].trim();
      return descr.slice(0, 30);
    } else {
      const match = t.description.match(/(.*) \(Rif\. (.*)\)$/);
      if (match) return match[1].trim();
      return t.description.trim();
    }
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isAuthorized) return;
    if (confirm("Sei sicuro di voler eliminare questa voce?")) {
        if (onDeleteTransaction) onDeleteTransaction(id);
    }
  };

  const handleSelectForecast = (forecast: Transaction, monthIndex: number) => {
    if (!onSaveTransaction) return;
    const dateString = `${currentYear}-${String(monthIndex + 1).padStart(2, '0')}-15`;
    onSaveTransaction({
      amount: forecast.amount,
      vatRate: forecast.vatRate,
      date: dateString,
      description: `Pagamento: ${forecast.description}`,
      type: TransactionType.EXPENSE,
      category: forecast.category,
      project: forecast.project,
      isForecast: false,
      linkedForecastId: forecast.id
    });
    setActiveCell(null);
  };

  const openEditActual = (transaction: Transaction, category: string, monthIndex: number) => {
      if (!isAuthorized) return;
      setNewActualAmount(transaction.amount.toString());
      const desc = transaction.description;
      const match = desc.match(/(.*) \(Rif\. (.*)\)$/);
      if (match) {
          setNewActualSupplier(match[1]);
          setNewActualInvoiceRef(match[2]);
      } else {
          setNewActualSupplier(desc);
          setNewActualInvoiceRef('');
      }
      setNewActualVat(transaction.vatRate?.toString() || '22');
      setNewActualDate(transaction.date);
      setNewActualProject(transaction.project || '');
      setEditingActualId(transaction.id);
      setActiveTab('new');
      setActiveCell({ category, monthIndex });
  };

  const handleSaveNewActual = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCell || !newActualAmount) return;
    let finalDesc = newActualSupplier || 'Spesa generica';
    if (newActualInvoiceRef.trim()) finalDesc += ` (Rif. ${newActualInvoiceRef.trim()})`;

    const transactionData = {
        amount: parseFloat(newActualAmount),
        vatRate: parseFloat(newActualVat),
        date: newActualDate,
        description: finalDesc,
        type: TransactionType.EXPENSE,
        category: activeCell.category,
        project: newActualProject,
        isForecast: false,
        ceType: CATEGORY_TO_CE_TYPE[activeCell.category] || 'solo_cashflow'
    };

    if (editingActualId && onUpdateTransaction) {
        const original = transactions.find(t => t.id === editingActualId);
        onUpdateTransaction({
          ...original!,
          ...transactionData,
          isForecast: false,
          id: editingActualId,
          sourceRef: original?.sourceRef,   // ← preserva sempre l'origine originale
        });
    } else if (onSaveTransaction) {
        onSaveTransaction(transactionData);
    }
    setActiveCell(null);
    setEditingActualId(null);
  }

  const openForecastForm = (category: string, monthIndex: number, transaction?: Transaction, type: 'FORECAST' | 'ACTUAL' = 'FORECAST') => {
    if (!isAuthorized) return;
    setFormType(type);
    if (transaction) {
      setNewForecastAmount(transaction.amount.toString());
      setNewForecastDesc(transaction.description);
      setNewForecastVat(transaction.vatRate?.toString() || '22');
      setNewForecastCassa(transaction.date);
      setEditingForecastId(transaction.id);
      setFormType(transaction.isForecast ? 'FORECAST' : 'ACTUAL');
    } else {
      setNewForecastAmount('');
      setNewForecastDesc('');
      setNewForecastVat('22');
      setNewForecastCassa(`${currentYear}-${String(monthIndex + 1).padStart(2, '0')}-15`);
      setNewForecastCassaPerc(0);
      setIsManualCassa(false);
      setEditingForecastId(null);
    }
    setApplyToAllMonths(false); 
    setAddingForecast({ category, monthIndex });
    setActiveCell(null);
    setNewForecastCassaPerc(0);
    setIsManualCassa(false);
  };

  const handleSaveNewForecast = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addingForecast || !newForecastAmount) return;
    const amountVal = parseFloat(newForecastAmount);
    const cassaPercVal = parseFloat(newForecastCassaPerc.toString());
    const vatVal = parseFloat(newForecastVat);
    
    const cassaAmount = amountVal * (cassaPercVal / 100);
    const finalAmount = amountVal + cassaAmount; // Base imponibile per l'IVA
    
    const descriptionVal = newForecastDesc || 'Budget spesa';
    const dateCassaVal = newForecastCassa;
    
    if (applyToAllMonths && !editingForecastId && onSaveTransaction) {
        // Estraiamo il giorno dalla data selezionata
        const day = dateCassaVal.split('-')[2] || '15';
        for (let i = 0; i < 12; i++) {
            const dateString = `${currentYear}-${String(i + 1).padStart(2, '0')}-${day}`;
            onSaveTransaction({
                amount: finalAmount, vatRate: vatVal, date: dateString, description: descriptionVal,
                type: TransactionType.EXPENSE, category: addingForecast.category, isForecast: true,
                ceType: CATEGORY_TO_CE_TYPE[addingForecast.category] || 'solo_cashflow'
            });
        }
    } else {
        const transactionData = {
            amount: finalAmount, vatRate: vatVal, date: dateCassaVal, description: descriptionVal,
            type: TransactionType.EXPENSE, category: addingForecast.category, isForecast: formType === 'FORECAST',
            ceType: CATEGORY_TO_CE_TYPE[addingForecast.category] || 'solo_cashflow'
        };
        if (editingForecastId && onUpdateTransaction) {
            const original = transactions.find(t => t.id === editingForecastId);
            onUpdateTransaction({ ...original!, ...transactionData, isForecast: formType === 'FORECAST', id: editingForecastId });
        } else if (onSaveTransaction) {
            onSaveTransaction(transactionData);
        }
    }
    setAddingForecast(null);
    setEditingForecastId(null);
    setNewForecastCassa('');
    setNewForecastCassaPerc(0);
    setIsManualCassa(false);
  };

  const getSuppliersForCategory = (cat: string) => supplierPresets[cat] || [];

  const renderSectionHeader = (title: string, categories: string[], color: string = 'rose') => {
      const totalForecast = getSectionAnnualTotal(categories, true);
      const totalActual = getSectionAnnualTotal(categories, false);
      return (
        <tr className={`bg-${color}-900 text-white border-y border-${color}-800 shadow-md relative z-20`}>
            <td className={`px-6 py-3 font-bold uppercase text-xs tracking-wider sticky left-0 z-30 bg-${color}-900 border-r border-${color}-800 shadow-[4px_0_4px_-2px_rgba(0,0,0,0.3)] ${COL_LABEL_WIDTH}`}>{title}</td>
            {months.map(m => <td key={m} colSpan={2} className={`px-1 py-1 border-r border-${color}-800/50 bg-${color}-900 ${COL_MONTH_WIDTH}`}></td>)}
            <td className={`px-2 py-3 text-center border-l-2 border-${color}-700 border-r border-${color}-800 font-mono text-xs font-bold text-${color}-100 ${COL_SUMMARY_WIDTH}`}>{CURRENCY_FORMATTER.format(totalForecast)}</td>
            <td className={`px-2 py-3 text-center border-r border-${color}-800 font-mono text-xs font-bold text-${color}-100 ${COL_SUMMARY_WIDTH}`}>{CURRENCY_FORMATTER.format(totalActual)}</td>
        </tr>
      );
  };

  const esportaBreakdownPDF = (category: string, monthIndex: number) => {
    const txs = getCellTransactions(category, monthIndex, false);
    const monthName = months[monthIndex];

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pdfW = pdf.internal.pageSize.getWidth();

    // Header
    pdf.setFillColor(34, 34, 34);
    pdf.rect(0, 0, pdfW, 22, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.text('GRUPPO VISENTIN SRL', 10, 10);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Dettaglio Spese — ${category.replace(/\[.*?\]\s*/, '')}`, 10, 16);
    pdf.setFontSize(8);
    pdf.text(`${monthName} ${currentYear}  •  Generato il ${new Date().toLocaleDateString('it-IT')}`, pdfW - 10, 16, { align: 'right' });

    // Totale
    const totale = txs.reduce((s, t) => s + getGrossAmount(t), 0);
    const totaleImponibile = txs.reduce((s, t) => s + t.amount, 0);

    // Tabella transazioni
    autoTable(pdf, {
      startY: 28,
      head: [['Data', 'Descrizione / Fornitore', 'Commessa', 'Imponibile', 'IVA %', 'Totale Lordo']],
      body: txs.length > 0
        ? txs.map(t => [
            parseUTCDate(t.date).toLocaleDateString('it-IT', { timeZone: 'UTC' }),
            t.description || '-',
            t.project || '-',
            CURRENCY_FORMATTER.format(t.amount),
            `${t.vatRate || 0}%`,
            CURRENCY_FORMATTER.format(getGrossAmount(t)),
          ])
        : [['', '', 'Nessuna transazione trovata', '', '', '']],
      theme: 'striped',
      headStyles: { fillColor: [34, 34, 34], fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8 },
      alternateRowStyles: { fillColor: [250, 250, 250] },
      foot: [[
        '', '', 'TOTALE',
        CURRENCY_FORMATTER.format(totaleImponibile),
        '',
        CURRENCY_FORMATTER.format(totale),
      ]],
      footStyles: { fillColor: [240, 240, 240], fontStyle: 'bold', fontSize: 9 },
    });

    pdf.save(`GV_Spese_${category.replace(/\[.*?\]\s*/, '').replace(/\s+/g, '_')}_${monthName}_${currentYear}.pdf`);
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
    doc.text(`Riepilogo Uscite Annuale ${currentYear} — Prev. vs Cons.`, 15, 30);
    doc.setFontSize(10);
    doc.text(`Data generazione: ${today}`, pageWidth - 15, 30, { align: 'right' });

    const allCategories = [...fixedCategories, ...variableCategories];
    const tableData = allCategories.map(category => {
      const prev = getCategoryAnnualTotal(category, true);
      const cons = getCategoryAnnualTotal(category, false);
      const scostamento = cons - prev;
      const percentuale = prev !== 0 ? ((scostamento / prev) * 100).toFixed(1) + '%' : '-';
      
      const cleanCategory = category.replace(/\[.*?\]\s?/, '');

      return [
        cleanCategory,
        CURRENCY_FORMATTER.format(prev),
        CURRENCY_FORMATTER.format(cons),
        CURRENCY_FORMATTER.format(scostamento),
        percentuale,
        scostamento // Hidden field for conditional styling
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
      head: [['CATEGORIA', 'PREVISIONALE', 'CONSUNTIVO', 'SCOSTAMENTO', '%']],
      body: tableData.map(row => row.slice(0, 5)),
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
            data.cell.styles.textColor = [185, 28, 28]; // Red (text-red-700)
          } else if (scostamento < 0) {
            data.cell.styles.textColor = [21, 128, 61]; // Green (text-green-700)
          } else if (scostamento === 0 && data.cell.raw !== '-') {
             data.cell.styles.textColor = [21, 128, 61]; // Zero is also green per user request (<= 0)
          }
        }
        if (data.row.index === tableData.length - 1) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [241, 245, 249]; // bg-slate-100
        }
      }
    });

    doc.save(`GV_Uscite_Annuale_${currentYear}.pdf`);
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col animate-in fade-in duration-500 min-h-[500px]">
      {/* Breakdown Modal */}
      {breakdownView && (
        <div className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <div>
                        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><ListFilter size={16} className="text-slate-500" /> Dettaglio Spese</h3>
                        <p className="text-xs text-slate-500">{breakdownView.category} • {months[breakdownView.monthIndex]} {currentYear}</p>
                    </div>
                    <div className="flex gap-2">
                        <button
                          onClick={() => esportaBreakdownPDF(breakdownView!.category, breakdownView!.monthIndex)}
                          className="p-1.5 hover:bg-slate-200 rounded text-slate-500"
                          title="Esporta PDF strutturato"
                        >
                          <FileText size={18} />
                        </button>
                        <button onClick={() => setBreakdownView(null)} className="text-slate-400 hover:text-slate-600 p-1.5"><X size={20} /></button>
                    </div>
                </div>
                <div className="overflow-y-auto flex-1 p-4 print:p-0">
                    <table className="w-full text-xs text-left">
                        <thead className="text-slate-400 font-medium border-b border-slate-100 uppercase tracking-wide">
                            <tr>
                                <th className="pb-2 text-left">Data</th>
                                <th className="pb-2 text-left">Descrizione / Fornitore</th>
                                <th className="pb-2 text-right">Imponibile</th>
                                <th className="pb-2 text-right">IVA</th>
                                <th className="pb-2 text-right">Totale Lordo</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {getCellTransactions(breakdownView.category, breakdownView.monthIndex, false).length === 0 ? (
                                <tr><td colSpan={5} className="py-8 text-center text-slate-400 italic">Nessuna transazione trovata.</td></tr>
                            ) : (
                                getCellTransactions(breakdownView.category, breakdownView.monthIndex, false).map(t => (
                                    <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="py-3 text-slate-500 font-mono text-xs">{parseUTCDate(t.date).toLocaleDateString('it-IT', { timeZone: 'UTC' })}</td>
                                        <td className="py-3 font-medium text-slate-700 text-xs">{t.description}{t.project && <span className="block text-[9px] text-slate-400 font-normal">{t.project}</span>}</td>
                                        <td className="py-3 text-right font-mono text-xs text-slate-600">{CURRENCY_FORMATTER.format(t.amount)}</td>
                                        <td className="py-3 text-right font-mono text-xs text-slate-400">
                                          {t.vatRate !== undefined
                                            ? t.vatRate === 0 ? 'Esente' : `${t.vatRate}%`
                                            : '—'}
                                        </td>
                                        <td className="py-3 text-right font-mono font-bold text-xs text-slate-700">{CURRENCY_FORMATTER.format(getGrossAmount(t))}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                        <tfoot className="border-t-2 border-slate-100 font-bold bg-slate-50">
                            <tr>
                                <td colSpan={2} className="py-3 pl-2 text-slate-600 uppercase text-[10px] font-black">Totale Mese</td>
                                <td className="py-3 text-right text-slate-700 text-xs font-bold">
                                    {CURRENCY_FORMATTER.format(getCellTransactions(breakdownView.category, breakdownView.monthIndex, false).reduce((sum, t) => sum + t.amount, 0))}
                                </td>
                                <td className="py-3 text-right text-slate-400 text-xs">
                                    {CURRENCY_FORMATTER.format(getCellTransactions(breakdownView.category, breakdownView.monthIndex, false).reduce((sum, t) => sum + (t.amount * (t.vatRate || 0) / 100), 0))}
                                </td>
                                <td className="py-3 text-right text-slate-900 text-sm font-black">
                                    {CURRENCY_FORMATTER.format(getCellTransactions(breakdownView.category, breakdownView.monthIndex, false).reduce((sum, t) => sum + getGrossAmount(t), 0))}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        </div>
      )}

      {/* Forecast Breakdown Modal */}
      {expandedForecastCell && (
        <div className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setExpandedForecastCell(null)}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh] animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-rose-50/50">
                    <div>
                        <h3 className="text-sm font-bold text-rose-800 flex items-center gap-2"><CalendarClock size={16} className="text-rose-500" /> Budget Previsionale</h3>
                        <p className="text-xs text-slate-500">{expandedForecastCell.category} • {months[expandedForecastCell.monthIndex]} {currentYear}</p>
                    </div>
                    <button onClick={() => setExpandedForecastCell(null)} className="text-slate-400 hover:text-slate-600 p-1.5 transition-colors">
                        <X size={20} />
                    </button>
                </div>
                <div className="overflow-y-auto flex-1 p-4">
                    <table className="w-full text-xs text-left">
                        <thead className="text-slate-400 font-medium border-b border-slate-100 uppercase tracking-wide">
                            <tr>
                                <th className="pb-2 text-left">Descrizione</th>
                                <th className="pb-2 text-right">Totale Lordo</th>
                                {isAuthorized && <th className="pb-2 text-center w-16">Azioni</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {getCellTransactions(expandedForecastCell.category, expandedForecastCell.monthIndex, true).length === 0 ? (
                                <tr><td colSpan={3} className="py-8 text-center text-slate-400 italic font-medium">Nessun budget inserito per questo mese.</td></tr>
                            ) : (
                                getCellTransactions(expandedForecastCell.category, expandedForecastCell.monthIndex, true).map(t => (
                                    <tr key={t.id} className="group/item hover:bg-slate-50 transition-colors">
                                        <td className="py-3 font-medium text-slate-700 text-xs">
                                            {t.description}
                                            {t.sourceRef === 'Wizard Inizio Anno' ? (
                                                <span className="ml-2 text-[9px] px-1.5 py-0.5 bg-sky-100 text-sky-700 rounded-full uppercase font-black tracking-tighter" title="Costo generato dal wizard inizio anno">Da Wizard</span>
                                            ) : t.sourceRef ? (
                                                <span className="ml-2 text-[9px] px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded-full uppercase font-black tracking-tighter" title="Costo calcolato in automatico dal cantiere previsionale">Da Cantiere Prev.</span>
                                            ) : (
                                                <span className="ml-2 text-[9px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-full uppercase font-black tracking-tighter" title="Costo inserito manualmente">Manuale</span>
                                            )}
                                            {isForecastPaid(t.id) && <span className="ml-2 text-[9px] px-1.5 py-0.5 bg-rose-100 text-rose-600 rounded-full uppercase font-black tracking-tighter">Saldato</span>}
                                        </td>
                                        <td className="py-3 text-right font-mono font-bold text-xs text-slate-700">{CURRENCY_FORMATTER.format(getGrossAmount(t))}</td>
                                        {isAuthorized && (
                                            <td className="py-3 text-center">
                                                <div className="flex items-center justify-center gap-1.5 opacity-0 group-hover/item:opacity-100 transition-opacity">
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); openForecastForm(expandedForecastCell.category, expandedForecastCell.monthIndex, t); }} 
                                                        className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                                                        title="Modifica"
                                                    >
                                                        <Pencil size={12} />
                                                    </button>
                                                    <button 
                                                        onClick={(e) => handleDelete(t.id, e)} 
                                                        className="p-1 text-slate-400 hover:text-rose-900 transition-colors"
                                                        title="Elimina"
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))
                            )}
                        </tbody>
                        <tfoot className="border-t-2 border-slate-100 font-bold bg-slate-50 sticky bottom-0">
                            <tr>
                                <td className="py-3 pl-2 text-slate-600 uppercase text-[10px] font-black tracking-wider">Totale Budget Mensile</td>
                                <td className="py-3 text-right text-rose-700 text-sm font-black">
                                    {CURRENCY_FORMATTER.format(getCellTransactions(expandedForecastCell.category, expandedForecastCell.monthIndex, true).reduce((sum, t) => sum + getGrossAmount(t), 0))}
                                </td>
                                {isAuthorized && <td></td>}
                            </tr>
                        </tfoot>
                    </table>
                </div>
                {isAuthorized && (
                    <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-center">
                        <button 
                            onClick={() => openForecastForm(expandedForecastCell.category, expandedForecastCell.monthIndex)}
                            className="flex items-center gap-2 bg-slate-900 text-white px-8 py-2.5 rounded-xl text-xs font-bold hover:bg-slate-800 transition-all shadow-lg active:scale-95"
                        >
                            <Plus size={16} /> Aggiungi Budget
                        </button>
                    </div>
                )}
            </div>
        </div>
      )}

      {/* Global Forecast Form Modal */}
      {addingForecast && (
        <div className="fixed inset-0 z-[110] bg-slate-900/40 flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => {setAddingForecast(null); setEditingForecastId(null); setNewForecastCassa(''); setNewForecastCassaPerc(0); setIsManualCassa(false);}}>
            <div ref={forecastFormRef} className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <span className="text-xs font-black text-slate-600 uppercase tracking-wider">{editingForecastId ? 'Modifica' : 'Nuovo'} Budget</span>
                    <button onClick={() => {setAddingForecast(null); setEditingForecastId(null); setNewForecastCassa(''); setNewForecastCassaPerc(0); setIsManualCassa(false);}} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                </div>
                <form onSubmit={handleSaveNewForecast} className="p-6 space-y-5">
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Descrizione / Fornitore</label>
                        <input autoFocus type="text" list="forecast-suppliers-global" value={newForecastDesc} onChange={e => setNewForecastDesc(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 text-sm outline-none focus:ring-2 focus:ring-slate-900" placeholder="es. Officina Fantin" />
                        <datalist id="forecast-suppliers-global">{getSuppliersForCategory(addingForecast.category).map((s,i) => <option key={i} value={s} />)}</datalist>
                    </div>

                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Imponibile (Netto)</label>
                            <input type="number" step="0.01" value={newForecastAmount} onChange={e => setNewForecastAmount(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 text-sm outline-none focus:ring-2 focus:ring-slate-900" placeholder="0.00" />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Contributo Cassa Previdenziale</label>
                            <div className="flex gap-2">
                                <select 
                                    className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 text-sm outline-none focus:ring-2 focus:ring-slate-900 appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%20fill%3D%22none%20stroke%3D%22%2364748b%22%20stroke-width%3D%222%20stroke-linecap%3D%22round%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[position:right_0.75rem_center] bg-[length:1rem_1rem] bg-no-repeat"
                                    value={isManualCassa ? 'manual' : newForecastCassaPerc}
                                    onChange={(e) => {
                                        if (e.target.value === 'manual') {
                                            setIsManualCassa(true);
                                        } else {
                                            setIsManualCassa(false);
                                            setNewForecastCassaPerc(parseFloat(e.target.value));
                                        }
                                    }}
                                >
                                    <option value="0">Nessuna (0%)</option>
                                    <option value="4">Inarcassa 4%</option>
                                    <option value="4">Cassa Geometri 4%</option>
                                    <option value="4">Cassa Forense 4%</option>
                                    <option value="2">ENPAM 2%</option>
                                    <option value="manual">Manuale...</option>
                                </select>
                                {isManualCassa && (
                                    <div className="w-24 relative">
                                        <input 
                                            type="number" 
                                            step="0.1" 
                                            value={newForecastCassaPerc} 
                                            onChange={e => setNewForecastCassaPerc(parseFloat(e.target.value) || 0)} 
                                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 text-sm outline-none focus:ring-2 focus:ring-slate-900" 
                                        />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">%</span>
                                    </div>
                                )}
                            </div>
                            <div className="text-[10px] text-slate-500 font-bold ml-1 flex justify-between">
                                <span>Cassa professionale ({newForecastCassaPerc}%):</span>
                                <span>{CURRENCY_FORMATTER.format(parseFloat(newForecastAmount || '0') * (newForecastCassaPerc / 100))}</span>
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase ml-1">IVA %</label>
                            <select value={newForecastVat} onChange={e => setNewForecastVat(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 text-sm outline-none focus:ring-2 focus:ring-slate-900 appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%20fill%3D%22none%20stroke%3D%22%2364748b%22%20stroke-width%3D%222%20stroke-linecap%3D%22round%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[position:right_0.75rem_center] bg-[length:1rem_1rem] bg-no-repeat">
                                <option value="22">22%</option>
                                <option value="10">10%</option>
                                <option value="4">4%</option>
                                <option value="0">0%</option>
                            </select>
                        </div>
                    </div>

                    <div className="space-y-2 pt-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Totale da pagare (lordo)</label>
                        <div className="w-full p-4 bg-slate-100 border border-slate-200 rounded-xl">
                            {(() => {
                                const imp = parseFloat(newForecastAmount || '0');
                                const cas = imp * (newForecastCassaPerc / 100);
                                const base = imp + cas;
                                const iva = base * (parseFloat(newForecastVat) / 100);
                                const tot = base + iva;
                                return (
                                    <>
                                        <div className="font-black text-slate-900 text-xl tracking-tight leading-none mb-1">
                                            {CURRENCY_FORMATTER.format(tot)}
                                        </div>
                                        <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider flex flex-wrap gap-x-2">
                                            <span>Imp. {CURRENCY_FORMATTER.format(imp)}</span>
                                            <span className="opacity-50">+</span>
                                            <span>Cassa {CURRENCY_FORMATTER.format(cas)}</span>
                                            <span className="opacity-50">+</span>
                                            <span>IVA {CURRENCY_FORMATTER.format(iva)}</span>
                                        </div>
                                    </>
                                );
                            })()}
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Data prevista pagamento</label>
                        <input type="date" value={newForecastCassa} onChange={e => setNewForecastCassa(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 text-sm outline-none focus:ring-2 focus:ring-slate-900" />
                    </div>

                    {!editingForecastId && (
                        <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
                            <input type="checkbox" id="applyAllGlobal" checked={applyToAllMonths} onChange={e => setApplyToAllMonths(e.target.checked)} className="w-4 h-4 text-slate-900 rounded border-slate-300 focus:ring-slate-900" />
                            <label htmlFor="applyAllGlobal" className="text-xs text-slate-600 font-bold cursor-pointer select-none">Ripeti per ogni mese dell'anno</label>
                        </div>
                    )}

                    <div className="flex gap-3 pt-3">
                        <button type="submit" className="flex-1 bg-slate-900 text-white py-4 rounded-xl font-bold hover:bg-black transition-all shadow-lg shadow-slate-900/20 active:scale-95">Salva Budget</button>
                        {editingForecastId && formType === 'FORECAST' && (
                            <button
                                type="button"
                                onClick={() => setFormType('ACTUAL')}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-4 rounded-xl font-bold transition-all shadow-lg shadow-emerald-600/20 active:scale-95"
                                title="Converti in spesa reale"
                            >
                                Converti
                            </button>
                        )}
                    </div>
                </form>
            </div>
        </div>
      )}

      {/* Main Table */}
      <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white sticky left-0 z-20 rounded-t-2xl">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Timeline Uscite {currentYear}</h2>
          <div className="flex items-center gap-4 mt-1 text-sm text-slate-500">
             <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-300"></span><span>Budget (Previsto)</span></div>
             <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-600"></span><span>Speso (Consuntivo)</span></div>
             <div className="flex items-center gap-1 ml-4"><span className="w-2 h-2 rounded-full bg-violet-400"></span><span>Costi Variabili</span></div>
             <div className="text-xs text-slate-400 ml-4">* Importi lordi (IVATI)</div>
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
      
      <div ref={scrollContainerRef} className="overflow-x-auto w-full max-h-[calc(100vh-320px)] relative">
        <table className="w-full text-sm text-left border-collapse min-w-max">
          <thead className="text-xs uppercase bg-slate-50 text-slate-500 sticky top-0 z-40 shadow-sm">
            <tr>
              <th scope="col" rowSpan={2} className={`px-6 py-3 font-semibold sticky left-0 bg-slate-50 z-40 border-r border-slate-200 shadow-[4px_0_4px_-2px_rgba(0,0,0,0.05)] ${COL_LABEL_WIDTH}`}>Categoria</th>
              {months.map((month, monthIndex) => (
                <th key={month} colSpan={2} className={`px-4 py-2 border-r border-slate-200 text-center bg-slate-50 ${COL_MONTH_WIDTH}`}>
                  <div className="flex items-center justify-center gap-2">
                    {month}
                    <button
                      onClick={() => exportMonthlyReportPDF({ monthIndex, year: currentYear, transactions })}
                      className="p-1 rounded-md hover:bg-slate-200 text-slate-400 hover:text-slate-900 transition-colors"
                      title={`Esporta Report Mensile ${month}`}
                    >
                      <FileText size={12} />
                    </button>
                  </div>
                </th>
              ))}
              <th colSpan={2} className="px-4 py-2 border-l-2 border-slate-200 text-center min-w-[240px] bg-slate-100 font-bold text-slate-700 sticky right-0 z-40 shadow-[-4px_0_4px_-2px_rgba(0,0,0,0.05)]">
                <div className="flex items-center justify-center gap-2">
                  TOTALE ANNUO
                  <button
                    onClick={esportaTotaleAnnuoPDF}
                    className="p-1 rounded-md hover:bg-slate-200 text-slate-400 hover:text-slate-900 transition-colors"
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
                  <th className={`px-2 py-2 border-r border-slate-100 text-slate-400 font-medium text-center bg-slate-50 ${COL_SUB_WIDTH}`}>Prev.</th>
                  <th className={`px-2 py-2 border-r border-slate-200 text-slate-600 font-medium text-center bg-slate-100 ${COL_SUB_WIDTH}`}>Cons.</th>
                </React.Fragment>
              ))}
              <th className={`px-2 py-2 border-l-2 border-slate-200 border-r border-slate-300 text-slate-500 font-bold text-center bg-slate-100 sticky right-[120px] z-40 shadow-[-4px_0_4px_-2px_rgba(0,0,0,0.05)] ${COL_SUMMARY_WIDTH}`}>Tot. Prev.</th>
              <th className={`px-2 py-2 text-slate-700 font-bold text-center bg-slate-200 sticky right-0 z-40 shadow-[-4px_0_4px_-2px_rgba(0,0,0,0.05)] ${COL_SUMMARY_WIDTH}`}>Tot. Cons.</th>
            </tr>
          </thead>
          <tbody>
            {/* FIXED COSTS */}
            {renderSectionHeader('COSTI FISSI', fixedCategories)}
            {[...fixedCategories].sort().map((category, idx) => {
                const annualForecast = getCategoryAnnualTotal(category, true);
                const annualActual = getCategoryAnnualTotal(category, false);
                const isEven = idx % 2 === 0;
                const rowClass = isEven ? 'bg-rose-50' : 'bg-rose-50';

                return (
                    <tr key={category} className={`border-b border-rose-100 hover:bg-rose-100 transition-colors ${rowClass}`}>
                        <td className={`px-6 py-4 font-medium text-rose-900 text-xs sticky left-0 z-10 border-r border-rose-200 bg-inherit shadow-[4px_0_4px_-2px_rgba(0,0,0,0.05)] align-middle truncate ${COL_LABEL_WIDTH}`} title={category}>{category}</td>
                        {months.map((_, mIdx) => {
                            const forecasts = getCellTransactions(category, mIdx, true);
                            const actuals = getCellTransactions(category, mIdx, false);
                            const actualSum = actuals.reduce((sum, t) => sum + getGrossAmount(t), 0);
                            
                            const isCellActive = activeCell?.category === category && activeCell?.monthIndex === mIdx;
                            const isAddingForecast = addingForecast?.category === category && addingForecast?.monthIndex === mIdx;

                            const projectEstimate = calculateProjectCostForMonth(category, mIdx);
                            let loanRepayment = 0;
                            let loanDetails: { name: string; amount: number; rate: number; type: string; principal: number; interest: number; total: number }[] = [];
                            
                            if (isInterestCategory(category)) {
                                const loanInfo = calculateLoanRepaymentForMonth(mIdx);
                                loanRepayment = loanInfo.interest;
                                loanDetails = loanInfo.details;
                            } else if (isPrincipalCategory(category)) {
                                const loanInfo = calculateLoanRepaymentForMonth(mIdx);
                                loanRepayment = loanInfo.principal;
                                loanDetails = loanInfo.details;
                            }
                            const totalAutoEstimate = projectEstimate + loanRepayment;

                            return (
                                <React.Fragment key={`${category}-${mIdx}`}>
                                    {/* Forecast Cell */}
                                    <td className={`px-1 py-2 text-center border-r border-slate-200 align-top relative group min-h-[50px] ${COL_SUB_WIDTH}`}>
                                        <div className="flex flex-col gap-1 items-center w-full">
                                            {totalAutoEstimate > 0 && (
                                                <div 
                                                  className={`w-full px-1.5 py-0.5 rounded border flex flex-col items-center justify-center mb-1 ${loanRepayment > 0 ? 'bg-slate-50 border-slate-200 text-slate-700' : 'bg-slate-50 border-slate-200 text-slate-700'}`} 
                                                  title={loanRepayment > 0 
                                                    ? `Dettaglio Rate:\n${loanDetails.map(d => `• ${d.name}: ${CURRENCY_FORMATTER.format(isInterestCategory(category) ? d.interest : d.principal)} (Tasso: ${d.rate}% ${d.type === 'FIXED' ? 'Fisso' : 'Var'})\n  [Cap: ${CURRENCY_FORMATTER.format(d.principal)} | Int: ${CURRENCY_FORMATTER.format(d.interest)}]`).join('\n')}`
                                                    : "Stima da Commesse"
                                                  }
                                                >
                                                    <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider opacity-70">
                                                        {loanRepayment > 0 ? <Landmark size={8} /> : <CalendarClock size={8} />} Auto
                                                    </div>
                                                    <span className="text-[10px] font-mono font-medium leading-none">{CURRENCY_FORMATTER.format(totalAutoEstimate)}</span>
                                                </div>
                                            )}
                                            {/* Tax estimates inside the forecast column */}
                                            {(() => {
                                                if (category === '[FISCO] Versamento IVA') {
                                                    const ivaMese = taxForecasts.posIva.mensile[mIdx];
                                                    if (ivaMese && ivaMese.isForecastMese && ivaMese.versamentoIVA > 0) {
                                                        return (
                                                            <div className="relative group/item flex flex-col items-center justify-center px-2 py-1 rounded-md w-full border transition-all bg-rose-50 text-rose-700 border-rose-100 shadow-sm" title="IVA stimata da pagare">
                                                                <span className="text-[11px] font-mono font-medium leading-none flex items-center gap-1">
                                                                    {CURRENCY_FORMATTER.format(ivaMese.versamentoIVA)}
                                                                </span>
                                                                <span className="text-[9px] opacity-80 truncate w-full text-center mt-0.5 max-w-[90px] font-bold text-rose-800">
                                                                    IVA Stimata
                                                                </span>
                                                            </div>
                                                        );
                                                    }
                                                }
                                                if (category === '[FISCO] F24 — IRPEF / IRES / IRAP') {
                                                    let taxVal = 0;
                                                    let taxName = '';
                                                    if (mIdx === 5) {
                                                        const paidJune = expenseTransactions.some(t => parseUTCDate(t.date).getUTCFullYear() === currentYear && parseUTCDate(t.date).getUTCMonth() === 5 && !t.isForecast && t.category === '[FISCO] F24 — IRPEF / IRES / IRAP');
                                                        if (!paidJune) {
                                                            taxVal = taxForecasts.prevFiscale.accontoGiugno + taxForecasts.prevFiscale.saldoGiugnom;
                                                            taxName = 'Acconto 1 + Saldo';
                                                        }
                                                    } else if (mIdx === 10) {
                                                        const paidNov = expenseTransactions.some(t => parseUTCDate(t.date).getUTCFullYear() === currentYear && parseUTCDate(t.date).getUTCMonth() === 10 && !t.isForecast && t.category === '[FISCO] F24 — IRPEF / IRES / IRAP');
                                                        if (!paidNov) {
                                                            taxVal = taxForecasts.prevFiscale.accontoNovembre;
                                                            taxName = 'Acconto 2';
                                                        }
                                                    }
                                                    if (taxVal > 0) {
                                                        return (
                                                            <div className="relative group/item flex flex-col items-center justify-center px-2 py-1 rounded-md w-full border transition-all bg-rose-50 text-rose-700 border-rose-100 shadow-sm" title="IRES/IRAP stimata da pagare">
                                                                <span className="text-[11px] font-mono font-medium leading-none flex items-center gap-1">
                                                                    {CURRENCY_FORMATTER.format(taxVal)}
                                                                </span>
                                                                <span className="text-[9px] opacity-80 truncate w-full text-center mt-0.5 max-w-[90px] font-bold text-rose-800">
                                                                    {taxName}
                                                                </span>
                                                            </div>
                                                        );
                                                    }
                                                }
                                                return null;
                                            })()}
                                            {forecasts.map(t => (
                                                <div 
                                                    key={t.id} 
                                                    className="relative group/item flex items-center justify-between w-full px-1.5 py-0.5 rounded border border-rose-200 bg-white shadow-sm text-rose-700 cursor-pointer hover:shadow-md transition-all text-[10px]"
                                                    onClick={(e) => { e.stopPropagation(); setExpandedForecastCell({ category, monthIndex: mIdx }); }}
                                                >
                                                    <span className="truncate flex-1 text-left" title={t.description}>
                                                        {t.description.length > 12 ? `${t.description.substring(0, 12)}...` : t.description}
                                                    </span>
                                                    <span className="font-mono font-bold ml-1">{CURRENCY_FORMATTER.format(getGrossAmount(t))}</span>
                                                    
                                                    {isAuthorized && !isForecastPaid(t.id) && (
                                                        <div className="absolute inset-0 bg-white/95 hidden group-hover/item:flex items-center justify-center gap-1.5 rounded z-10">
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); openForecastForm(category, mIdx, t); }} 
                                                                className="text-rose-400 hover:text-rose-900 transition-colors"
                                                                title="Modifica"
                                                            >
                                                                <Pencil size={10} />
                                                            </button>
                                                            <button 
                                                                onClick={(e) => handleDelete(t.id, e)} 
                                                                className="text-rose-400 hover:text-rose-600 transition-colors"
                                                                title="Elimina"
                                                            >
                                                                <Trash2 size={10} />
                                                            </button>
                                                        </div>
                                                    )}
                                                    {isForecastPaid(t.id) && (
                                                        <div className="absolute inset-0 bg-rose-50/60 flex items-center justify-center rounded pointer-events-none">
                                                            <div className="w-1 h-1 rounded-full bg-rose-400" />
                                                        </div>
                                                    )}
                                                </div>
                                            ))}

                                            {forecasts.length > 1 && (
                                                <div 
                                                    onClick={(e) => { e.stopPropagation(); setExpandedForecastCell({ category, monthIndex: mIdx }); }}
                                                    className="w-full flex items-center justify-center gap-1 cursor-pointer group/totrow"
                                                >
                                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">TOT</span>
                                                    <span className="text-[9px] font-black text-slate-500">{CURRENCY_FORMATTER.format(forecasts.reduce((sum, t) => sum + getGrossAmount(t), 0))}</span>
                                                </div>
                                            )}

                                            {forecasts.length > 0 && (
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); setExpandedForecastCell({ category, monthIndex: mIdx }); }}
                                                    className="absolute top-1 right-1 p-0.5 text-slate-400 hover:text-rose-600 rounded opacity-0 group-hover:opacity-100 transition-all z-20"
                                                    title="Espandi dettaglio"
                                                >
                                                    <ListFilter size={10} />
                                                </button>
                                            )}

                                            {isAuthorized && (
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); openForecastForm(category, mIdx); }} 
                                                    className={`mt-0.5 p-1 rounded-full bg-slate-50 border border-slate-200 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all shadow-sm ${forecasts.length === 0 && totalAutoEstimate === 0 ? 'opacity-80' : 'opacity-0 group-hover:opacity-100'}`}
                                                    title="Aggiungi Budget"
                                                >
                                                    <Plus size={12} />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                    {/* Actual Cell */}
                                    <td className={`px-1 py-2 text-center border-r border-slate-200 bg-white align-top relative group ${COL_SUB_WIDTH}`}>
                                        <div className="flex flex-col items-center justify-between h-full w-full">
                                            {actualSum > 0 ? (
                                                <div className="flex flex-col items-center w-full gap-0.5">
                                                    <div className="flex items-center gap-1 mb-1"><span className="font-mono font-bold text-rose-700 text-[11px]">{CURRENCY_FORMATTER.format(actualSum)}</span><button onClick={(e) => { e.stopPropagation(); setBreakdownView({ category, monthIndex: mIdx }); }} className="text-rose-400 hover:text-rose-700 transition-colors p-0.5"><ListFilter size={10} /></button></div>
                                                    {actuals.map(t => (
                                                        <div key={t.id} className="group/item flex items-center justify-center w-full relative min-h-[14px]">
                                                            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.sourceRef ? 'bg-blue-400' : 'bg-rose-400'}`}
                                                                 title={t.sourceRef ?? undefined} />
                                                            {(isInterestCategory(category) || isPrincipalCategory(category)) && <Landmark size={8} className="text-slate-400 ml-1 shrink-0" />}
                                                            <span 
                                                              className={`text-[8px] font-bold ml-1 truncate max-w-[80px] leading-none ${t.sourceRef ? 'text-blue-500' : 'text-slate-500'}`}
                                                              title={t.description}
                                                            >
                                                              {getSupplierName(t)}
                                                            </span>
                                                            {isAuthorized && (
                                                                <div className="absolute right-0 -top-1 bg-white shadow-sm border border-slate-100 rounded px-1 hidden group-hover/item:flex gap-1 z-20">
                                                                    <button onClick={(e) => { e.stopPropagation(); openEditActual(t, category, mIdx); }} className="text-slate-400 hover:text-slate-900"><Pencil size={10} /></button>
                                                                    <button onClick={(e) => handleDelete(t.id, e)} className="text-slate-400 hover:text-slate-500"><Trash2 size={10} /></button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : <span className="text-slate-300 text-[10px]">-</span>}
                                            {isAuthorized && (
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); setActiveCell({ category, monthIndex: mIdx }); setAddingForecast(null); }} 
                                                    className={`mt-1 p-1 rounded-full bg-slate-50 border border-slate-100 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all shadow-sm ${actualSum > 0 ? 'opacity-0 group-hover:opacity-100' : 'opacity-80'}`}
                                                    title="Registra Spesa"
                                                >
                                                    <Plus size={12} />
                                                </button>
                                            )}
                                            {activeCell?.category === category && activeCell?.monthIndex === mIdx && (
                                                <div ref={dropdownRef} className="absolute top-full right-0 mt-1 w-80 bg-white rounded-lg shadow-xl border border-slate-200 z-50 overflow-hidden flex flex-col text-left">
                                                    <div className="bg-slate-50 p-2 flex justify-between items-center border-b border-slate-100"><span className="text-[10px] font-bold text-slate-600 uppercase">{editingActualId ? 'Modifica' : 'Registra'} Spesa</span><button onClick={() => { setActiveCell(null); setEditingActualId(null); }}><X size={12} /></button></div>
                                                    {!editingActualId && <div className="flex text-[10px] font-semibold bg-slate-50 border-b border-slate-100"><button onClick={() => setActiveTab('budget')} className={`flex-1 py-1.5 ${activeTab === 'budget' ? 'text-slate-600 bg-white border-r' : 'text-slate-400'}`}>Da Budget</button><button onClick={() => setActiveTab('new')} className={`flex-1 py-1.5 ${activeTab === 'new' ? 'text-slate-600 bg-white border-l' : 'text-slate-400'}`}>Nuova</button></div>}
                                                    <div className="p-3 bg-white">
                                                        {activeTab === 'budget' && !editingActualId ? (
                                                            <div className="space-y-1 max-h-40 overflow-y-auto">
                                                                {getUnpaidForecasts(category).length === 0 ? <div className="text-center py-2 text-slate-400 text-[10px]">Nessun budget.</div> : getUnpaidForecasts(category).map(f => (
                                                                    <button key={f.id} onClick={() => handleSelectForecast(f, mIdx)} className="w-full text-left p-2 hover:bg-slate-50 rounded flex justify-between items-center text-xs group"><span>{f.description}</span><span className="font-mono font-bold text-slate-600">{CURRENCY_FORMATTER.format(getGrossAmount(f))}</span></button>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <form onSubmit={handleSaveNewActual} className="space-y-2">
                                                                <div className="flex gap-2"><input type="date" value={newActualDate} onChange={e => setNewActualDate(e.target.value)} className="w-2/3 pl-2 py-1 text-[10px] border rounded text-slate-900" /><input type="text" value={newActualInvoiceRef} onChange={e => setNewActualInvoiceRef(e.target.value)} className="w-1/3 px-1 py-1 text-[10px] border rounded text-slate-900" placeholder="Rif." /></div>
                                                                <input type="text" list={`actual-suppliers-${category}-${mIdx}`} value={newActualSupplier} onChange={e => setNewActualSupplier(e.target.value)} className="w-full text-xs p-1.5 border rounded text-slate-900" placeholder="Fornitore" /><datalist id={`actual-suppliers-${category}-${mIdx}`}>{getSuppliersForCategory(category).map((s,i) => <option key={i} value={s} />)}</datalist>
                                                                <select value={newActualProject} onChange={(e) => setNewActualProject(e.target.value)} className="w-full text-[10px] p-1.5 border rounded bg-white text-slate-900"><option value="">-- Commessa --</option>{projects.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}</select>
                                                                <div className="flex gap-2"><input type="number" step="0.01" value={newActualAmount} onChange={e => setNewActualAmount(e.target.value)} className="w-2/3 text-xs p-1.5 border rounded text-slate-900" placeholder="€" /><select value={newActualVat} onChange={e => setNewActualVat(e.target.value)} className="w-1/3 text-xs p-1.5 border rounded text-slate-900"><option value="22">22%</option><option value="10">10%</option><option value="4">4%</option><option value="0">0%</option></select></div>
                                                                
                                                                {/* Info origine — solo in lettura se transazione importata */}
                                                                {editingActualId && (() => {
                                                                  const tx = transactions.find(t => t.id === editingActualId);
                                                                  return tx?.sourceRef ? (
                                                                    <div className="flex items-center gap-1.5 px-2 py-1.5 bg-blue-50 rounded border border-blue-100">
                                                                      <span className="text-[9px] font-black text-blue-500 uppercase tracking-widest">PN</span>
                                                                      <span className="text-[9px] text-blue-600 flex-1 truncate">{tx.sourceRef}</span>
                                                                    </div>
                                                                  ) : null;
                                                                })()}

                                                                <button type="submit" className="w-full bg-slate-800 text-white text-xs py-1.5 rounded font-bold">Salva Spesa</button>
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
                        <td className={`px-2 py-2 text-center border-l-2 border-rose-200 border-r border-rose-200 text-rose-600 font-mono text-[10px] font-bold bg-rose-50 sticky right-[120px] z-10 shadow-[-4px_0_4px_-2px_rgba(0,0,0,0.05)] ${COL_SUMMARY_WIDTH}`}>{annualForecast > 0 ? CURRENCY_FORMATTER.format(annualForecast) : '-'}</td>
                        <td className={`px-2 py-2 text-center border-r border-rose-200 text-rose-700 font-mono text-[10px] font-bold bg-rose-50 sticky right-0 z-10 shadow-[-4px_0_4px_-2px_rgba(0,0,0,0.05)] ${COL_SUMMARY_WIDTH}`}>{annualActual > 0 ? CURRENCY_FORMATTER.format(annualActual) : '-'}</td>
                    </tr>
                );
            })}

            {/* VARIABLE COSTS */}
            {renderSectionHeader('COSTI VARIABILI', variableCategories, 'violet')}
            {[...variableCategories].sort().map((category, idx) => {
                const annualForecast = getCategoryAnnualTotal(category, true);
                const annualActual = getCategoryAnnualTotal(category, false);
                const isEven = idx % 2 === 0;
                const rowClass = isEven ? 'bg-violet-50' : 'bg-violet-50';

                return (
                    <tr key={category} className={`border-b border-violet-100 hover:bg-violet-100 transition-colors ${rowClass}`}>
                         <td className={`px-6 py-4 font-medium text-violet-900 text-xs sticky left-0 z-10 border-r border-violet-200 bg-inherit shadow-[4px_0_4px_-2px_rgba(0,0,0,0.05)] align-middle truncate ${COL_LABEL_WIDTH}`} title={category}>{category}</td>
                        {months.map((_, mIdx) => {
                             const forecasts = getCellTransactions(category, mIdx, true);
                            const actuals = getCellTransactions(category, mIdx, false);
                            const actualSum = actuals.reduce((sum, t) => sum + getGrossAmount(t), 0);
                            
                            const isCellActive = activeCell?.category === category && activeCell?.monthIndex === mIdx;
                            const isAddingForecast = addingForecast?.category === category && addingForecast?.monthIndex === mIdx;
                             const projectEstimate = calculateProjectCostForMonth(category, mIdx);
                             let loanPrincipal = 0;
                             let loanPrincipalDetails: { name: string; amount: number; rate: number; type: string; principal: number; interest: number; total: number }[] = [];
                             if (isPrincipalCategory(category)) {
                               const loanInfo = calculateLoanRepaymentForMonth(mIdx);
                               loanPrincipal = loanInfo.details.reduce((s,d) => s + d.principal, 0);
                               loanPrincipalDetails = loanInfo.details;
                             }
                             const totalAutoVariabile = projectEstimate + loanPrincipal;

                             return (
                                 <React.Fragment key={`${category}-${mIdx}`}>
                                     {/* Forecast */}
                                     <td className={`px-1 py-2 text-center border-r border-slate-200 align-top relative group min-h-[50px] ${COL_SUB_WIDTH}`}>
                                         <div className="flex flex-col gap-1 items-center w-full">
                                             {totalAutoVariabile > 0 && (
                                                 <div 
                                                     className={`w-full px-1.5 py-0.5 rounded border flex flex-col items-center justify-center mb-1 ${loanPrincipal > 0 ? 'bg-slate-50 border-slate-200 text-slate-700' : 'bg-slate-50 border-slate-200 text-slate-700'}`} 
                                                     title={loanPrincipal > 0 
                                                         ? `Dettaglio Rate:\n${loanPrincipalDetails.map(d => `• ${d.name}: ${CURRENCY_FORMATTER.format(d.principal)} (quota capitale) (Tasso: ${d.rate}% ${d.type === 'FIXED' ? 'Fisso' : 'Var'})\n  [Cap: ${CURRENCY_FORMATTER.format(d.principal)} | Int: ${CURRENCY_FORMATTER.format(d.interest)}]`).join('\n')}`
                                                         : "Stima generata da Commesse"
                                                     }
                                                 >
                                                     <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider opacity-70">
                                                         {loanPrincipal > 0 ? <Landmark size={8} /> : <CalendarClock size={8} />} Auto
                                                     </div>
                                                     <span className="text-[10px] font-mono font-medium leading-none">{CURRENCY_FORMATTER.format(totalAutoVariabile)}</span>
                                                 </div>
                                             )}
                                            {forecasts.map(t => (
                                                <div 
                                                    key={t.id} 
                                                    className="relative group/item flex items-center justify-between w-full px-1.5 py-0.5 rounded border border-violet-200 bg-white shadow-sm text-violet-700 cursor-pointer hover:shadow-md transition-all text-[10px]"
                                                    onClick={(e) => { e.stopPropagation(); setExpandedForecastCell({ category, monthIndex: mIdx }); }}
                                                >
                                                    <span className="truncate flex-1 text-left" title={t.description}>
                                                        {t.description.length > 12 ? `${t.description.substring(0, 12)}...` : t.description}
                                                    </span>
                                                    <span className="font-mono font-bold ml-1">{CURRENCY_FORMATTER.format(getGrossAmount(t))}</span>
                                                    
                                                    {isAuthorized && !isForecastPaid(t.id) && (
                                                        <div className="absolute inset-0 bg-white/95 hidden group-hover/item:flex items-center justify-center gap-1.5 rounded z-10">
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); openForecastForm(category, mIdx, t); }} 
                                                                className="text-violet-400 hover:text-violet-900 transition-colors"
                                                                title="Modifica"
                                                            >
                                                                <Pencil size={10} />
                                                            </button>
                                                            <button 
                                                                onClick={(e) => handleDelete(t.id, e)} 
                                                                className="text-violet-400 hover:text-violet-600 transition-colors"
                                                                title="Elimina"
                                                            >
                                                                <Trash2 size={10} />
                                                            </button>
                                                        </div>
                                                    )}
                                                    {isForecastPaid(t.id) && (
                                                        <div className="absolute inset-0 bg-violet-50/60 flex items-center justify-center rounded pointer-events-none">
                                                            <div className="w-1 h-1 rounded-full bg-violet-400" />
                                                        </div>
                                                    )}
                                                </div>
                                            ))}

                                            {forecasts.length > 1 && (
                                                <div 
                                                    onClick={(e) => { e.stopPropagation(); setExpandedForecastCell({ category, monthIndex: mIdx }); }}
                                                    className="w-full flex items-center justify-center gap-1 cursor-pointer group/totrow"
                                                >
                                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">TOT</span>
                                                    <span className="text-[9px] font-black text-slate-500">{CURRENCY_FORMATTER.format(forecasts.reduce((sum, t) => sum + getGrossAmount(t), 0))}</span>
                                                </div>
                                            )}

                                            {forecasts.length > 0 && (
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); setExpandedForecastCell({ category, monthIndex: mIdx }); }}
                                                    className="absolute top-1 right-1 p-0.5 text-slate-400 hover:text-violet-600 rounded opacity-0 group-hover:opacity-100 transition-all z-20"
                                                    title="Espandi dettaglio"
                                                >
                                                    <ListFilter size={10} />
                                                </button>
                                            )}

                                            {isAuthorized && (
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); openForecastForm(category, mIdx); }} 
                                                    className={`mt-0.5 p-1 rounded-full bg-slate-50 border border-slate-200 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-all shadow-sm ${forecasts.length === 0 && totalAutoVariabile === 0 ? 'opacity-80' : 'opacity-0 group-hover:opacity-100'}`}
                                                    title="Aggiungi Budget"
                                                >
                                                    <Plus size={12} />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                    {/* Actual */}
                                    <td className={`px-1 py-2 text-center border-r border-slate-200 bg-white align-top relative group ${COL_SUB_WIDTH}`}>
                                        <div className="flex flex-col items-center justify-between h-full w-full">
                                            {actualSum > 0 ? (
                                                <div className="flex flex-col items-center w-full gap-0.5">
                                                    <div className="flex items-center gap-1 mb-1"><span className="font-mono font-bold text-violet-700 text-[11px]">{CURRENCY_FORMATTER.format(actualSum)}</span><button onClick={(e) => { e.stopPropagation(); setBreakdownView({ category, monthIndex: mIdx }); }} className="text-violet-400 hover:text-violet-700 transition-colors p-0.5"><ListFilter size={10} /></button></div>
                                                    {actuals.map(t => (
                                                        <div key={t.id} className="group/item flex items-center justify-center w-full relative min-h-[14px]">
                                                            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.sourceRef ? 'bg-blue-400' : 'bg-violet-400'}`}
                                                                 title={t.sourceRef ?? undefined} />
                                                            <span 
                                                              className={`text-[8px] font-bold ml-1 truncate max-w-[80px] leading-none ${t.sourceRef ? 'text-blue-500' : 'text-slate-500'}`}
                                                              title={t.description}
                                                            >
                                                              {getSupplierName(t)}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : <span className="text-slate-300 text-[10px]">-</span>}
                                            {isAuthorized && (
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); setActiveCell({ category, monthIndex: mIdx }); setAddingForecast(null); }} 
                                                    className={`mt-1 p-1 rounded-full bg-slate-50 border border-slate-100 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all shadow-sm ${actualSum > 0 ? 'opacity-0 group-hover:opacity-100' : 'opacity-80'}`}
                                                    title="Registra Spesa"
                                                >
                                                    <Plus size={12} />
                                                </button>
                                            )}
                                            {activeCell?.category === category && activeCell?.monthIndex === mIdx && (
                                                <div ref={dropdownRef} className="absolute top-full right-0 mt-1 w-80 bg-white rounded-lg shadow-xl border border-slate-200 z-50 overflow-hidden flex flex-col text-left">
                                                    {/* Same dropdown form logic... */}
                                                    <div className="bg-slate-50 p-2 flex justify-between items-center border-b border-slate-100"><span className="text-[10px] font-bold text-slate-600 uppercase">{editingActualId ? 'Modifica' : 'Registra'} Spesa</span><button onClick={() => { setActiveCell(null); setEditingActualId(null); }}><X size={12} /></button></div>
                                                    {!editingActualId && <div className="flex text-[10px] font-semibold bg-slate-50 border-b border-slate-100"><button onClick={() => setActiveTab('budget')} className={`flex-1 py-1.5 ${activeTab === 'budget' ? 'text-slate-600 bg-white border-r' : 'text-slate-400'}`}>Da Budget</button><button onClick={() => setActiveTab('new')} className={`flex-1 py-1.5 ${activeTab === 'new' ? 'text-slate-600 bg-white border-l' : 'text-slate-400'}`}>Nuova</button></div>}
                                                    <div className="p-3 bg-white">
                                                        {activeTab === 'budget' && !editingActualId ? (
                                                            <div className="space-y-1 max-h-40 overflow-y-auto">
                                                                {getUnpaidForecasts(category).length === 0 ? <div className="text-center py-2 text-slate-400 text-[10px]">Nessun budget.</div> : getUnpaidForecasts(category).map(f => (<button key={f.id} onClick={() => handleSelectForecast(f, mIdx)} className="w-full text-left p-2 hover:bg-slate-50 rounded flex justify-between items-center text-xs group"><span>{f.description}</span><span className="font-mono font-bold text-slate-600">{CURRENCY_FORMATTER.format(getGrossAmount(f))}</span></button>))}
                                                            </div>
                                                        ) : (
                                                            <form onSubmit={handleSaveNewActual} className="space-y-2">
                                                                <div className="flex gap-2"><input type="date" value={newActualDate} onChange={e => setNewActualDate(e.target.value)} className="w-2/3 pl-2 py-1 text-[10px] border rounded text-slate-900" /><input type="text" value={newActualInvoiceRef} onChange={e => setNewActualInvoiceRef(e.target.value)} className="w-1/3 px-1 py-1 text-[10px] border rounded text-slate-900" placeholder="Rif." /></div>
                                                                <input type="text" list={`actual-suppliers-${category}-${mIdx}`} value={newActualSupplier} onChange={e => setNewActualSupplier(e.target.value)} className="w-full text-xs p-1.5 border rounded text-slate-900" placeholder="Fornitore" /><datalist id={`actual-suppliers-${category}-${mIdx}`}>{getSuppliersForCategory(category).map((s,i) => <option key={i} value={s} />)}</datalist>
                                                                <select value={newActualProject} onChange={(e) => setNewActualProject(e.target.value)} className="w-full text-[10px] p-1.5 border rounded bg-white text-slate-900"><option value="">-- Commessa --</option>{projects.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}</select>
                                                                <div className="flex gap-2"><input type="number" step="0.01" value={newActualAmount} onChange={e => setNewActualAmount(e.target.value)} className="w-2/3 text-xs p-1.5 border rounded text-slate-900" placeholder="€" /><select value={newActualVat} onChange={e => setNewActualVat(e.target.value)} className="w-1/3 text-xs p-1.5 border rounded text-slate-900"><option value="22">22%</option><option value="10">10%</option><option value="4">4%</option><option value="0">0%</option></select></div>
                                                                
                                                                {/* Info origine — solo in lettura se transazione importata */}
                                                                {editingActualId && (() => {
                                                                  const tx = transactions.find(t => t.id === editingActualId);
                                                                  return tx?.sourceRef ? (
                                                                    <div className="flex items-center gap-1.5 px-2 py-1.5 bg-blue-50 rounded border border-blue-100">
                                                                      <span className="text-[9px] font-black text-blue-500 uppercase tracking-widest">PN</span>
                                                                      <span className="text-[9px] text-blue-600 flex-1 truncate">{tx.sourceRef}</span>
                                                                    </div>
                                                                  ) : null;
                                                                })()}

                                                                <button type="submit" className="w-full bg-slate-800 text-white text-xs py-1.5 rounded font-bold">Salva Spesa</button>
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
                        <td className={`px-2 py-2 text-center border-l-2 border-violet-200 border-r border-violet-200 text-violet-600 font-mono text-[10px] font-bold bg-violet-50 sticky right-[120px] z-10 shadow-[-4px_0_4px_-2px_rgba(0,0,0,0.05)] ${COL_SUMMARY_WIDTH}`}>{annualForecast > 0 ? CURRENCY_FORMATTER.format(annualForecast) : '-'}</td>
                        <td className={`px-2 py-2 text-center border-r border-violet-200 text-violet-700 font-mono text-[10px] font-bold bg-violet-50 sticky right-0 z-10 shadow-[-4px_0_4px_-2px_rgba(0,0,0,0.05)] ${COL_SUMMARY_WIDTH}`}>{annualActual > 0 ? CURRENCY_FORMATTER.format(annualActual) : '-'}</td>
                    </tr>
                );
            })}

            {/* Totals Row */}
            <tr className="bg-rose-100 font-bold border-t-2 border-rose-300 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] sticky bottom-0 z-40">
              <td className={`px-6 py-4 sticky left-0 bottom-0 bg-rose-100 z-40 border-r border-rose-300 text-rose-800 uppercase text-xs tracking-wider shadow-[4px_0_4px_-2px_rgba(0,0,0,0.05)] ${COL_LABEL_WIDTH}`}>TOTALE USCITE</td>
              {months.map((_, mIdx) => {
                const totalForecast = getMonthlyTotal(mIdx, true);
                const totalActual = getMonthlyTotal(mIdx, false);
                return (
                  <React.Fragment key={`total-${mIdx}`}>
                    <td className={`px-1 py-4 text-center border-r border-rose-200 text-rose-500 font-mono text-[11px] bg-rose-50 backdrop-blur-sm ${COL_SUB_WIDTH}`}>{totalForecast > 0 ? CURRENCY_FORMATTER.format(totalForecast) : ''}</td>
                    <td className={`px-1 py-4 text-center border-r border-rose-300 text-rose-700 font-mono text-[11px] bg-rose-100 backdrop-blur-sm ${COL_SUB_WIDTH}`}>{totalActual > 0 ? CURRENCY_FORMATTER.format(totalActual) : ''}</td>
                  </React.Fragment>
                );
              })}
              <td className={`px-2 py-4 text-center border-l-2 border-rose-300 border-r border-rose-200 text-rose-600 font-mono text-xs bg-rose-200 font-bold sticky right-[120px] z-40 shadow-[-4px_0_4px_-2px_rgba(0,0,0,0.05)] ${COL_SUMMARY_WIDTH}`}>{CURRENCY_FORMATTER.format(getGrandAnnualTotal(true))}</td>
              <td className={`px-2 py-4 text-center border-r border-rose-300 text-rose-800 font-mono text-xs bg-rose-100 font-bold sticky right-0 z-40 shadow-[-4px_0_4px_-2px_rgba(0,0,0,0.05)] ${COL_SUMMARY_WIDTH}`}>{CURRENCY_FORMATTER.format(getGrandAnnualTotal(false))}</td>
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

export default ExpenseTimeline;