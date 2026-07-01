// Trigger rebuild and deploy: 2026-07-01
import React, { useState, useMemo } from 'react';
import { parseUTCDate, buildCEData, calcCEMetrics, calcSPMetrics } from '../utils/gasCoreEngine';
import { 
  FileCode, 
  Receipt, 
  ShieldCheck, 
  TrendingUp, 
  ArrowUpRight, 
  ArrowDownRight, 
  AlertCircle, 
  CheckCircle2, 
  Info,
  CalendarClock
} from 'lucide-react';
import { Transaction, TransactionType, AppView, SPSnapshot, CEData, InitialBalanceBreakdown, Project } from '../types';
import SummaryCard from './SummaryCard';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  Tooltip, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  LineChart, 
  Line,
  ComposedChart,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar
} from 'recharts';
import PDFExportButton from './PDFExportButton';
import { HelpButton } from './HelpPanel';
import HelpPanel from './HelpPanel';
import { calcPosizIoneIVA } from '../utils/gasCoreEngine';
import { CURRENCY_FORMATTER, FIXED_COST_CATEGORIES, VARIABLE_COST_CATEGORIES } from '../constants';
import InfoTooltip from './InfoTooltip';

interface DashboardProps {
  transactions: Transaction[];
  expenseCategories: string[];
  onGoToManuale?: (section?: string, tab?: 'manuale' | 'glossario') => void;
  initialAccounts?: any[];
  initialData?: InitialBalanceBreakdown;
  projects?: Project[];
  spSnapshots?: SPSnapshot[];
  ceManualData?: Record<string, Partial<CEData>>;
}

const COLORS = [
  '#4f46e5', // indigo-600
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#f43f5e', // rose-500
  '#8b5cf6', // violet-500
  '#06b6d4', // cyan-500
  '#14b8a6', // teal-500
  '#ec4899', // pink-500
  '#84cc16', // lime-500
  '#eab308', // yellow-500
  '#3b82f6', // blue-500
  '#64748b'  // slate-500
];

const getGrossAmount = (t: Transaction) => t.amount * (1 + (t.vatRate || 0) / 100);

const Dashboard: React.FC<DashboardProps> = ({ 
  transactions, 
  expenseCategories, 
  onGoToManuale,
  initialAccounts = [],
  initialData = {},
  projects = [],
  spSnapshots = [],
  ceManualData = {}
}) => {
  const [showHelp, setShowHelp] = useState(false);
  
  // Stati degli anni indipendenti per ciascuna sezione
  const [kpiYear, setKpiYear] = useState<number>(() => new Date().getFullYear());
  const [ratingSelectedYear, setRatingSelectedYear] = useState<number>(() => new Date().getFullYear());
  const [patrimonioYear, setPatrimonioYear] = useState<number>(() => new Date().getFullYear());
  const [speseYear, setSpeseYear] = useState<number>(() => new Date().getFullYear());
  const [trendMensileYear, setTrendMensileYear] = useState<number>(() => new Date().getFullYear());
  const [contoCorrenteYear, setContoCorrenteYear] = useState<number>(() => new Date().getFullYear());
  const [confrontoEntrateYear, setConfrontoEntrateYear] = useState<number>(() => new Date().getFullYear());
  const [confrontoUsciteYear, setConfrontoUsciteYear] = useState<number>(() => new Date().getFullYear());
  const [costiFissiYear, setCostiFissiYear] = useState<number>(() => new Date().getFullYear());
  const [costiVariabiliYear, setCostiVariabiliYear] = useState<number>(() => new Date().getFullYear());

  // Calcolo degli anni disponibili per il filtro della dashboard
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    years.add(new Date().getFullYear());
    if (Array.isArray(transactions)) {
      transactions.forEach(t => {
        if (t && t.date) {
          const d = parseUTCDate(t.date);
          if (d) years.add(d.getUTCFullYear());
        }
      });
    }
    if (Array.isArray(spSnapshots)) {
      spSnapshots.forEach(s => {
        if (s && s.dataRiferimento) {
          const d = parseUTCDate(s.dataRiferimento);
          if (!isNaN(d.getTime())) {
            years.add(d.getUTCFullYear());
          }
        }
      });
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [transactions, spSnapshots]);

  // Calcolo Rating Bancario (Basilea 3)
  const ratingData = useMemo(() => {
    const txList = Array.isArray(transactions) ? transactions : [];
    const snapshots = Array.isArray(spSnapshots) ? spSnapshots.filter(Boolean) : [];
    
    // Filtra gli snapshot per l'anno selezionato per il rating
    const snapshotsForYear = snapshots.filter(s => {
      if (s && s.dataRiferimento) {
        const d = parseUTCDate(s.dataRiferimento);
        return !isNaN(d.getTime()) && d.getUTCFullYear() === ratingSelectedYear;
      }
      return false;
    });
    
    // Ordina in modo decrescente per data per prendere il più recente di quell'anno
    const sortedSnapshotsForYear = [...snapshotsForYear].sort((a, b) => {
      const dateA = a.dataRiferimento ? parseUTCDate(a.dataRiferimento).getTime() : 0;
      const dateB = b.dataRiferimento ? parseUTCDate(b.dataRiferimento).getTime() : 0;
      return dateB - dateA;
    });
    
    let activeSP = sortedSnapshotsForYear[0] || null;
    if (!activeSP && snapshots.length > 0) {
      // Fallback: se non c'è uno snapshot per quell'anno, prendi il più recente in assoluto
      const sortedAllSnapshots = [...snapshots].sort((a, b) => {
        const dateA = a.dataRiferimento ? parseUTCDate(a.dataRiferimento).getTime() : 0;
        const dateB = b.dataRiferimento ? parseUTCDate(b.dataRiferimento).getTime() : 0;
        return dateB - dateA;
      });
      activeSP = sortedAllSnapshots[0] || null;
    }
    
    const ratingYear = activeSP && activeSP.dataRiferimento ? parseUTCDate(activeSP.dataRiferimento).getUTCFullYear() : ratingSelectedYear;
    
    const manualData = ceManualData || {};
    const ceData = buildCEData(txList, ratingYear, manualData[ratingYear.toString()]);
    const ceMetrics = calcCEMetrics(ceData, txList);
    const spMetrics = activeSP ? calcSPMetrics(activeSP, ceMetrics, txList) : null;
    
    if (!spMetrics) return { score: 0, label: 'B / C — Incompleto', color: 'text-rose-600', dscr: 0, breakdown: [], radarData: [], spMetrics: null };
    
    let score = 0;
    
    // BUG-004 FIX: negative EBITDA or negative PFN (net cash) need special handling
    // PFN / EBITDA
    let pfnEbitdaScore = 0;
    let pfnEbitdaHealth = 'red';
    if (spMetrics.pfn <= 0) {
      // PFN negativa = più cassa che debiti finanziario = ottimo
      score += 1;
      pfnEbitdaScore = 1;
      pfnEbitdaHealth = 'green';
    } else if (spMetrics.pfnSuEbitda >= 0 && spMetrics.pfnSuEbitda <= 3) {
      score += 1;
      pfnEbitdaScore = 1;
      pfnEbitdaHealth = 'green';
    } else if (spMetrics.pfnSuEbitda >= 0 && spMetrics.pfnSuEbitda <= 4.5) {
      score += 0.5;
      pfnEbitdaScore = 0.5;
      pfnEbitdaHealth = 'orange';
    }
    
    // EBITDA / Oneri Fin.
    let ebitdaOneriScore = 0;
    let ebitdaOneriHealth = 'red';
    if (ceMetrics.oneriFin <= 0) {
      score += 1;
      ebitdaOneriScore = 1;
      ebitdaOneriHealth = 'green';
    } else {
      const ratio = ceMetrics.ebitdaTot / ceMetrics.oneriFin;
      if (ratio >= 3) {
        score += 1;
        ebitdaOneriScore = 1;
        ebitdaOneriHealth = 'green';
      } else if (ratio >= 1.5) {
        score += 0.5;
        ebitdaOneriScore = 0.5;
        ebitdaOneriHealth = 'orange';
      }
    }
    
    // Current Ratio
    let currentRatioScore = 0;
    let currentRatioHealth = 'red';
    if (spMetrics.currentRatio >= 1.2) {
      score += 1;
      currentRatioScore = 1;
      currentRatioHealth = 'green';
    } else if (spMetrics.currentRatio >= 1.0) {
      score += 0.5;
      currentRatioScore = 0.5;
      currentRatioHealth = 'orange';
    }
    
    // Solidità Patrimoniale
    let soliditaScore = 0;
    let soliditaHealth = 'red';
    if (spMetrics.soliditaPatr >= 0.3) {
      score += 1;
      soliditaScore = 1;
      soliditaHealth = 'green';
    } else if (spMetrics.soliditaPatr >= 0.15) {
      score += 0.5;
      soliditaScore = 0.5;
      soliditaHealth = 'orange';
    }
    
    // Utile Netto %
    let utileScore = 0;
    let utileHealth = 'red';
    if (ceMetrics.utileNettoPercent >= 0.03) {
      score += 1;
      utileScore = 1;
      utileHealth = 'green';
    } else if (ceMetrics.utileNettoPercent >= 0) {
      score += 0.5;
      utileScore = 0.5;
      utileHealth = 'orange';
    }
    
    // DSO
    let dsoScore = 0;
    let dsoHealth = 'red';
    if (spMetrics.dso <= 60) {
      score += 1;
      dsoScore = 1;
      dsoHealth = 'green';
    } else if (spMetrics.dso <= 90) {
      score += 0.5;
      dsoScore = 0.5;
      dsoHealth = 'orange';
    }
    
    // DPO
    let dpoScore = 0;
    let dpoHealth = 'red';
    if (spMetrics.dpo >= 30 && spMetrics.dpo <= 90) {
      score += 1;
      dpoScore = 1;
      dpoHealth = 'green';
    } else if ((spMetrics.dpo >= 20 && spMetrics.dpo < 30) || (spMetrics.dpo > 90 && spMetrics.dpo <= 120)) {
      score += 0.5;
      dpoScore = 0.5;
      dpoHealth = 'orange';
    }
    
    const label = score >= 5.5 ? 'AAA / AA — Eccellente' :
                  score >= 4 ? 'A / BBB — Solido' :
                  score >= 2.5 ? 'BB — Attenzione' :
                  'B / C — Critico';
                  
    const color = score >= 5.5 ? 'text-emerald-600' :
                  score >= 4 ? 'text-blue-600' :
                  score >= 2.5 ? 'text-amber-500' :
                  'text-rose-600';
                  
    const breakdown = [
      { name: 'PFN / EBITDA', score: pfnEbitdaScore, target: '< 3x', color: pfnEbitdaHealth === 'green' ? '#10b981' : pfnEbitdaHealth === 'orange' ? '#f59e0b' : '#ef4444' },
      { name: 'EBITDA / Oneri Fin.', score: ebitdaOneriScore, target: '> 3x', color: ebitdaOneriHealth === 'green' ? '#10b981' : ebitdaOneriHealth === 'orange' ? '#f59e0b' : '#ef4444' },
      { name: 'Current Ratio', score: currentRatioScore, target: '> 1.2', color: currentRatioHealth === 'green' ? '#10b981' : currentRatioHealth === 'orange' ? '#f59e0b' : '#ef4444' },
      { name: 'Solidità Patrimoniale', score: soliditaScore, target: '> 30%', color: soliditaHealth === 'green' ? '#10b981' : soliditaHealth === 'orange' ? '#f59e0b' : '#ef4444' },
      { name: 'Utile Netto %', score: utileScore, target: '> 3%', color: utileHealth === 'green' ? '#10b981' : utileHealth === 'orange' ? '#f59e0b' : '#ef4444' },
      { name: 'DSO (Incassi)', score: dsoScore, target: '< 60 gg', color: dsoHealth === 'green' ? '#10b981' : dsoHealth === 'orange' ? '#f59e0b' : '#ef4444' },
      { name: 'DPO (Pagamenti)', score: dpoScore, target: '30-90 gg', color: dpoHealth === 'green' ? '#10b981' : dpoHealth === 'orange' ? '#f59e0b' : '#ef4444' }
    ];

    const radarData = [
      { subject: 'PFN/EBITDA', A: pfnEbitdaScore * 100, fullMark: 100 },
      { subject: 'EBITDA/Oneri', A: ebitdaOneriScore * 100, fullMark: 100 },
      { subject: 'Current Ratio', A: currentRatioScore * 100, fullMark: 100 },
      { subject: 'Solidità', A: soliditaScore * 100, fullMark: 100 },
      { subject: 'Utile Netto', A: utileScore * 100, fullMark: 100 },
      { subject: 'DSO (Incasso)', A: dsoScore * 100, fullMark: 100 },
      { subject: 'DPO (Pagamento)', A: dpoScore * 100, fullMark: 100 }
    ];
                  
    // BUG-003 FIX: DSCR reale = EBITDA / (Interessi Passivi + Quota Capitale Rate)
    // non solo EBITDA / oneriFin (che sarebbe solo Interest Coverage)
    const dscrDenominatore = (ceMetrics.oneriFin + ceMetrics.costiCapitaleRate) || 1;
    return { score, label, color, dscr: ceMetrics.ebitdaTot / dscrDenominatore, breakdown, radarData, spMetrics };
  }, [transactions, spSnapshots, ceManualData, ratingSelectedYear]);

  // Andamento Conto Corrente (Liquidità Cumulata)
  const contoCorrenteData = useMemo(() => {
    const txList = Array.isArray(transactions) ? transactions : [];
    const accountsList = Array.isArray(initialAccounts) ? initialAccounts : [];
    const months = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
    let cumulative = accountsList.reduce((sum, acc) => sum + (acc?.balance || 0), 0) || 0;
    
    return months.map((m, index) => {
      const monthTxs = txList.filter(t => {
        const d = t && t.date ? parseUTCDate(t.date) : null;
        return d && d.getUTCFullYear() === contoCorrenteYear && d.getUTCMonth() === index;
      });
      
      const entrateReali = monthTxs
        .filter(t => t.type === TransactionType.INCOME && !t.isForecast)
        .reduce((sum, t) => sum + getGrossAmount(t), 0);

      const usciteReali = monthTxs
        .filter(t => t.type === TransactionType.EXPENSE && !t.isForecast && t.ceType !== 'ammortamento')
        .reduce((sum, t) => sum + getGrossAmount(t), 0);
        
      cumulative += (entrateReali - usciteReali);
      
      return {
        name: m,
        LiquiditaCumulata: cumulative
      };
    });
  }, [transactions, contoCorrenteYear, initialAccounts]);

  // Confronto Entrate
  const confrontoEntrateData = useMemo(() => {
    const txList = Array.isArray(transactions) ? transactions : [];
    const months = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
    
    return months.map((m, index) => {
      const monthTxs = txList.filter(t => {
        const d = t && t.date ? parseUTCDate(t.date) : null;
        return d && d.getUTCFullYear() === confrontoEntrateYear && d.getUTCMonth() === index;
      });
      
      const entratePreviste = monthTxs
        .filter(t => t.type === TransactionType.INCOME && t.isForecast)
        .reduce((sum, t) => sum + getGrossAmount(t), 0);
        
      const entrateReali = monthTxs
        .filter(t => t.type === TransactionType.INCOME && !t.isForecast)
        .reduce((sum, t) => sum + getGrossAmount(t), 0);
        
      return {
        name: m,
        EntratePreviste: entratePreviste,
        EntrateReali: entrateReali
      };
    });
  }, [transactions, confrontoEntrateYear]);

  // Confronto Uscite
  const confrontoUsciteData = useMemo(() => {
    const txList = Array.isArray(transactions) ? transactions : [];
    const months = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
    
    return months.map((m, index) => {
      const monthTxs = txList.filter(t => {
        const d = t && t.date ? parseUTCDate(t.date) : null;
        return d && d.getUTCFullYear() === confrontoUsciteYear && d.getUTCMonth() === index;
      });
      
      const uscitePreviste = monthTxs
        .filter(t => t.type === TransactionType.EXPENSE && t.isForecast && t.ceType !== 'ammortamento')
        .reduce((sum, t) => sum + getGrossAmount(t), 0);

      const usciteReali = monthTxs
        .filter(t => t.type === TransactionType.EXPENSE && !t.isForecast && t.ceType !== 'ammortamento')
        .reduce((sum, t) => sum + getGrossAmount(t), 0);
        
      return {
        name: m,
        UscitePreviste: uscitePreviste,
        UsciteReali: usciteReali
      };
    });
  }, [transactions, confrontoUsciteYear]);

  // Costi Fissi con confronto Previsionale, Consuntivo e Scostamento
  const fixedCostTableData = useMemo(() => {
    const txList = Array.isArray(transactions) ? transactions : [];
    const actTxs = txList.filter(t =>
      t &&
      !t.isForecast &&
      t.ceType !== 'ammortamento' &&
      t.date &&
      parseUTCDate(t.date).getUTCFullYear() === costiFissiYear
    );
    
    const prevTxs = txList.filter(t =>
      t &&
      t.isForecast &&
      t.ceType !== 'ammortamento' &&
      t.date &&
      parseUTCDate(t.date).getUTCFullYear() === costiFissiYear
    );

    return FIXED_COST_CATEGORIES.map(cat => {
      const forecast = prevTxs
        .filter(t => t && t.type === TransactionType.EXPENSE && t.category === cat)
        .reduce((sum, t) => sum + getGrossAmount(t), 0);
        
      const actual = actTxs
        .filter(t => t && t.type === TransactionType.EXPENSE && t.category === cat)
        .reduce((sum, t) => sum + getGrossAmount(t), 0);
        
      return {
        name: cat,
        forecast,
        actual,
        diff: actual - forecast
      };
    }).filter(item => item.forecast > 0 || item.actual > 0);
  }, [transactions, costiFissiYear]);

  // Costi Variabili con confronto Previsionale, Consuntivo e Scostamento
  const variableCostTableData = useMemo(() => {
    const txList = Array.isArray(transactions) ? transactions : [];
    const actTxs = txList.filter(t =>
      t &&
      !t.isForecast &&
      t.ceType !== 'ammortamento' &&
      t.date &&
      parseUTCDate(t.date).getUTCFullYear() === costiVariabiliYear
    );
    
    const prevTxs = txList.filter(t =>
      t &&
      t.isForecast &&
      t.ceType !== 'ammortamento' &&
      t.date &&
      parseUTCDate(t.date).getUTCFullYear() === costiVariabiliYear
    );

    return VARIABLE_COST_CATEGORIES.map(cat => {
      const forecast = prevTxs
        .filter(t => t && t.type === TransactionType.EXPENSE && t.category === cat)
        .reduce((sum, t) => sum + getGrossAmount(t), 0);
        
      const actual = actTxs
        .filter(t => t && t.type === TransactionType.EXPENSE && t.category === cat)
        .reduce((sum, t) => sum + getGrossAmount(t), 0);
        
      return {
        name: cat,
        forecast,
        actual,
        diff: actual - forecast
      };
    }).filter(item => item.forecast > 0 || item.actual > 0);
  }, [transactions, costiVariabiliYear]);

  const renderDashboardCostTable = (data: {name: string, forecast: number, actual: number, diff: number}[]) => {
    if (data.length === 0) return <p className="text-xs text-slate-400 p-4 italic">Nessun dato registrato per questo periodo.</p>;
    
    return (
      <div className="overflow-x-auto mt-2">
        <table className="w-full text-xs text-left">
          <thead className="text-[10px] uppercase text-slate-400 bg-slate-50/50">
            <tr>
              <th className="px-3 py-2 font-bold">Voce di Spesa</th>
              <th className="px-3 py-2 font-bold text-right">Previsto</th>
              <th className="px-3 py-2 font-bold text-right">Effettivo</th>
              <th className="px-3 py-2 font-bold text-right">Scostamento</th>
              <th className="px-3 py-2 font-bold text-center">Stato</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 text-xs">
            {data.map((item) => {
              const limit = item.forecast * 1.05; // 5% tolleranza
              let semaforo = '🟢';
              if (item.actual > limit) {
                semaforo = '🔴';
              } else if (item.actual > item.forecast) {
                semaforo = '🟡';
              }
              
              const pct = item.forecast > 0 ? (item.actual / item.forecast) * 100 : 0;
              
              return (
                <tr key={item.name} className="hover:bg-slate-50/50">
                  <td className="px-3 py-2 font-medium text-slate-700">
                    <div className="truncate max-w-[150px] font-semibold text-slate-800" title={item.name}>
                      {item.name.split('] ')[1] || item.name}
                    </div>
                    {/* Barra di avanzamento sotto la voce di spesa */}
                    <div className="w-full bg-slate-100 rounded-full h-1 mt-1 max-w-[150px]">
                      <div 
                        className={`h-1 rounded-full transition-all ${
                          item.actual > limit ? 'bg-rose-500' : item.actual > item.forecast ? 'bg-amber-500' : 'bg-emerald-500'
                        }`} 
                        style={{ width: `${Math.min(100, pct)}%` }} 
                      />
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-500">
                    {CURRENCY_FORMATTER.format(item.forecast)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-bold text-slate-800">
                    {CURRENCY_FORMATTER.format(item.actual)}
                  </td>
                  <td className={`px-3 py-2 text-right font-mono font-bold ${item.diff > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {item.diff > 0 ? '+' : ''}{CURRENCY_FORMATTER.format(item.diff)}
                  </td>
                  <td className="px-3 py-2 text-center text-sm">{semaforo}</td>
                </tr>
              );
            })}
            <tr className="bg-slate-50 font-bold border-t border-slate-200">
              <td className="px-3 py-2 text-slate-800 uppercase text-[9px]">Totale</td>
              <td className="px-3 py-2 text-right font-mono text-slate-600">
                {CURRENCY_FORMATTER.format(data.reduce((s, i) => s + i.forecast, 0))}
              </td>
              <td className="px-3 py-2 text-right font-mono text-slate-800">
                {CURRENCY_FORMATTER.format(data.reduce((s, i) => s + i.actual, 0))}
              </td>
              <td className="px-3 py-2 text-right font-mono text-slate-800">
                {CURRENCY_FORMATTER.format(data.reduce((s, i) => s + i.diff, 0))}
              </td>
              <td className="px-3 py-2"></td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  };

  // Calcolo KPI di riepilogo usando kpiYear
  const { totalIncome, totalExpense, balance } = useMemo(() => {
    const txList = Array.isArray(transactions) ? transactions : [];
    const actTxs = txList.filter(t =>
      t &&
      !t.isForecast &&
      t.ceType !== 'ammortamento' &&
      t.date &&
      parseUTCDate(t.date).getUTCFullYear() === kpiYear
    );

    const inc = actTxs
      .filter(t => t && t.type === TransactionType.INCOME)
      .reduce((sum, t) => sum + getGrossAmount(t), 0);

    const exp = actTxs
      .filter(t => t && t.type === TransactionType.EXPENSE)
      .reduce((sum, t) => sum + getGrossAmount(t), 0);

    return { totalIncome: inc, totalExpense: exp, balance: inc - exp };
  }, [transactions, kpiYear]);

  // Calcolo spese per categoria usando speseYear
  const expenseData = useMemo(() => {
    const txList = Array.isArray(transactions) ? transactions : [];
    const actTxs = txList.filter(t =>
      t &&
      !t.isForecast &&
      t.ceType !== 'ammortamento' &&
      t.date &&
      parseUTCDate(t.date).getUTCFullYear() === speseYear
    );
    
    const expCategoriesList = Array.isArray(expenseCategories) ? expenseCategories : [];
    return expCategoriesList.map(cat => {
      const value = actTxs
        .filter(t => t && t.type === TransactionType.EXPENSE && t.category === cat)
        .reduce((sum, t) => sum + getGrossAmount(t), 0);
      return { name: cat, value };
    }).filter(item => item.value > 0).sort((a, b) => b.value - a.value);
  }, [transactions, speseYear, expenseCategories]);

  // Prepare data for Bar Chart (12 months of trendMensileYear)
  const monthlyData = useMemo(() => {
    const data = [];
    const txList = Array.isArray(transactions) ? transactions : [];
    
    const actTxs = txList.filter(t =>
      t &&
      !t.isForecast &&
      t.ceType !== 'ammortamento' &&
      t.date &&
      parseUTCDate(t.date).getUTCFullYear() === trendMensileYear
    );
    
    for (let targetMonth = 0; targetMonth < 12; targetMonth++) {
      const targetYear = trendMensileYear;
      
      const dForLabel = new Date(targetYear, targetMonth, 1);
      const monthLabel = dForLabel.toLocaleString('it-IT', { month: 'short' });
      
      const monthTransactions = actTxs.filter(t => {
        const tDate = t && t.date ? parseUTCDate(t.date) : null;
        return tDate && tDate.getUTCMonth() === targetMonth && tDate.getUTCFullYear() === targetYear;
      });
      
      const income = monthTransactions
        .filter(t => t.type === TransactionType.INCOME)
        .reduce((sum, t) => sum + getGrossAmount(t), 0);
        
      const expense = monthTransactions
        .filter(t => t.type === TransactionType.EXPENSE)
        .reduce((sum, t) => sum + getGrossAmount(t), 0);
        
      data.push({ name: monthLabel, Entrate: income, Uscite: expense });
    }
    return data;
  }, [transactions, trendMensileYear]);

  // BUG-002 FIX: ivaData deve essere memoizzata per evitare ricalcoli su ogni render
  const ivaData = useMemo(
    () => calcPosizIoneIVA(Array.isArray(transactions) ? transactions : [], kpiYear),
    [transactions, kpiYear]
  );

  // Calcolo stringhe calculatedValues per i tooltip della Dashboard
  const entrateCalculatedValues = `Analisi Entrate ${kpiYear}:\n- Totale Entrate Consuntive: ${CURRENCY_FORMATTER.format(totalIncome)}\n- Composto da ricavi operativi reali incassati per SAL, vendite immobili, affitti e manutenzioni.`;

  const usciteCalculatedValues = `Analisi Uscite ${kpiYear}:\n- Totale Uscite Consuntive: ${CURRENCY_FORMATTER.format(totalExpense)}\n- Composto da costi fissi, variabili, oneri finanziari, tasse e investimenti pagati.`;

  const saldoCalculatedValues = `Flusso di Cassa Netto ${kpiYear}:\n- Entrate Consuntive: ${CURRENCY_FORMATTER.format(totalIncome)}\n- Uscite Consuntive: -${CURRENCY_FORMATTER.format(totalExpense)}\n--------------------\n- Saldo Netto: ${CURRENCY_FORMATTER.format(balance)}`;

  const ivaCalculatedValues = `Posizione IVA ${kpiYear}:\n- Liquidazione cumulativa calcolata: ${CURRENCY_FORMATTER.format(Math.abs(ivaData.creditoDebitoResiduo))} ${ivaData.creditoDebitoResiduo > 0 ? '(a Debito)' : '(a Credito)'}\n- Include l'IVA a debito sulle entrate e l'IVA a credito deducibile sugli acquisti consuntivati.`;

  const ratingCalculatedValues = ratingData.breakdown && ratingData.breakdown.length > 0
    ? `Scomposizione Punteggio Rating (Basilea 3) ${ratingSelectedYear}:\n` + 
      ratingData.breakdown.map(i => `- ${i.name}: Punteggio ${i.score.toFixed(1)} / 1.0 (Target: ${i.target})`).join('\n') +
      `\n--------------------\n- Punteggio Totale: ${ratingData.score.toFixed(1)} / 7.0\n- Giudizio: ${ratingData.label}`
    : `Dati patrimoniali o Conto Economico incompleti per calcolare il rating.`;

  const speseCategoriaCalculatedValues = expenseData && expenseData.length > 0
    ? `Spese per Categoria (Top Costi) ${speseYear}:\n` +
      expenseData.slice(0, 3).map((e, idx) => `${idx + 1}. ${e.name}: ${CURRENCY_FORMATTER.format(e.value)}`).join('\n') +
      `\n- Altre categorie: ${CURRENCY_FORMATTER.format(expenseData.slice(3).reduce((s, e) => s + e.value, 0))}`
    : `Nessun costo registrato per le categorie di spesa.`;

  const andamentoMensileCalculatedValues = monthlyData && monthlyData.length > 0
    ? `Andamento Mensile ${trendMensileYear}:\n- Mese con maggiori Entrate: ${
        [...monthlyData].sort((a,b) => b.Entrate - a.Entrate)[0]?.name || 'N/A'
      } (${CURRENCY_FORMATTER.format([...monthlyData].sort((a,b) => b.Entrate - a.Entrate)[0]?.Entrate || 0)})\n- Mese con maggiori Uscite: ${
        [...monthlyData].sort((a,b) => b.Uscite - a.Uscite)[0]?.name || 'N/A'
      } (${CURRENCY_FORMATTER.format([...monthlyData].sort((a,b) => b.Uscite - a.Uscite)[0]?.Uscite || 0)})`
    : `Nessun dato mensile disponibile.`;

  const initialAccountsBalance = Array.isArray(initialAccounts) ? initialAccounts.reduce((sum, acc) => sum + (acc?.balance || 0), 0) : 0;
  const finalCCBalance = contoCorrenteData[contoCorrenteData.length - 1]?.LiquiditaCumulata ?? initialAccountsBalance;
  const netCCFlow = finalCCBalance - initialAccountsBalance;
  const contoCorrenteCalculatedValues = `Liquidità Cumulata ${contoCorrenteYear}:\n- Saldo iniziale conti corrente: ${
    CURRENCY_FORMATTER.format(initialAccountsBalance)
  }\n- Flusso netto cumulato dell'anno: ${CURRENCY_FORMATTER.format(netCCFlow)}\n- Saldo finale progressivo stimato: ${
    CURRENCY_FORMATTER.format(finalCCBalance)
  }`;

  const confrontoEntrateCalculatedValues = `Confronto Entrate ${confrontoEntrateYear}:\n- Previste (Budget): ${
    CURRENCY_FORMATTER.format(confrontoEntrateData.reduce((s, m) => s + m.EntratePreviste, 0))
  }\n- Reali (Consuntivate): ${
    CURRENCY_FORMATTER.format(confrontoEntrateData.reduce((s, m) => s + m.EntrateReali, 0))
  }\n- Scostamento complessivo YTD: ${
    CURRENCY_FORMATTER.format(
      confrontoEntrateData.reduce((s, m) => s + m.EntrateReali, 0) - confrontoEntrateData.reduce((s, m) => s + m.EntratePreviste, 0)
    )
  }`;

  const confrontoUsciteCalculatedValues = `Confronto Uscite ${confrontoUsciteYear}:\n- Previste (Budget): ${
    CURRENCY_FORMATTER.format(confrontoUsciteData.reduce((s, m) => s + m.UscitePreviste, 0))
  }\n- Reali (Consuntivate): ${
    CURRENCY_FORMATTER.format(confrontoUsciteData.reduce((s, m) => s + m.UsciteReali, 0))
  }\n- Scostamento complessivo YTD: ${
    CURRENCY_FORMATTER.format(
      confrontoUsciteData.reduce((s, m) => s + m.UsciteReali, 0) - confrontoUsciteData.reduce((s, m) => s + m.UscitePreviste, 0)
    )
  }`;

  const costiFissiCalculatedValues = `Dettaglio Costi Fissi ${costiFissiYear}:\n- Previsto Totale: ${
    CURRENCY_FORMATTER.format(fixedCostTableData.reduce((s, i) => s + i.forecast, 0))
  }\n- Reale Consuntivato: ${
    CURRENCY_FORMATTER.format(fixedCostTableData.reduce((s, i) => s + i.actual, 0))
  }\n- Scostamento Totale: ${
    CURRENCY_FORMATTER.format(fixedCostTableData.reduce((s, i) => s + i.diff, 0))
  }`;

  const costiVariabiliCalculatedValues = `Dettaglio Costi Variabili ${costiVariabiliYear}:\n- Previsto Totale: ${
    CURRENCY_FORMATTER.format(variableCostTableData.reduce((s, i) => s + i.forecast, 0))
  }\n- Reale Consuntivato: ${
    CURRENCY_FORMATTER.format(variableCostTableData.reduce((s, i) => s + i.actual, 0))
  }\n- Scostamento Totale: ${
    CURRENCY_FORMATTER.format(variableCostTableData.reduce((s, i) => s + i.diff, 0))
  }`;

  // Calcolo spMetrics e dati per la struttura patrimoniale usando patrimonioYear
  const spMetrics = useMemo(() => {
    const txList = Array.isArray(transactions) ? transactions : [];
    const snapshots = Array.isArray(spSnapshots) ? spSnapshots.filter(Boolean) : [];
    
    const snapshotsForYear = snapshots.filter(s => {
      if (s && s.dataRiferimento) {
        const d = parseUTCDate(s.dataRiferimento);
        return !isNaN(d.getTime()) && d.getUTCFullYear() === patrimonioYear;
      }
      return false;
    });
    
    const sortedSnapshots = [...snapshotsForYear].sort((a, b) => {
      const dateA = a.dataRiferimento ? parseUTCDate(a.dataRiferimento).getTime() : 0;
      const dateB = b.dataRiferimento ? parseUTCDate(b.dataRiferimento).getTime() : 0;
      return dateB - dateA;
    });
    
    let activeSP = sortedSnapshots[0] || null;
    if (!activeSP && snapshots.length > 0) {
      const sortedAllSnapshots = [...snapshots].sort((a, b) => {
        const dateA = a.dataRiferimento ? parseUTCDate(a.dataRiferimento).getTime() : 0;
        const dateB = b.dataRiferimento ? parseUTCDate(b.dataRiferimento).getTime() : 0;
        return dateB - dateA;
      });
      activeSP = sortedAllSnapshots[0] || null;
    }
    
    const yearToUse = activeSP && activeSP.dataRiferimento ? parseUTCDate(activeSP.dataRiferimento).getUTCFullYear() : patrimonioYear;
    const manualData = ceManualData || {};
    const ceData = buildCEData(txList, yearToUse, manualData[yearToUse.toString()]);
    const ceMetrics = calcCEMetrics(ceData, txList);
    return activeSP ? calcSPMetrics(activeSP, ceMetrics, txList) : null;
  }, [transactions, spSnapshots, ceManualData, patrimonioYear]);

  const structureChartData = useMemo(() => {
    if (!spMetrics) return [];
    return [
      {
        name: 'Impieghi (Attivo)',
        'Capitale Immobilizzato': spMetrics.totAttivoImm,
        'Capitale Circolante': spMetrics.totAttivoCirc,
      },
      {
        name: 'Fonti (Passivo & Netto)',
        'Patrimonio Netto': spMetrics.totPN,
        'Debiti a M/L Termine': spMetrics.totPassivoLT,
        'Debiti a Breve Termine': spMetrics.totPassivoBT,
      }
    ];
  }, [spMetrics]);

  const formatPercent = (val: number, total: number) => {
    if (total <= 0) return '0.0%';
    return `${((val / total) * 100).toFixed(1)}%`;
  };

  const renderYearSelect = (value: number, onChange: (year: number) => void) => (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-semibold text-slate-700 shadow-sm focus:outline-none focus:ring-1 focus:ring-slate-400 transition-all cursor-pointer font-sans no-print"
    >
      {availableYears.map(year => (
        <option key={year} value={year}>{year}</option>
      ))}
    </select>
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center no-print">
        <h2 className="text-2xl font-bold text-slate-800">Dashboard</h2>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200/60 rounded-xl px-2.5 py-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Filtro KPIs:</span>
            {renderYearSelect(kpiYear, setKpiYear)}
          </div>
          <HelpButton onClick={() => setShowHelp(true)} />
          <PDFExportButton 
            config={{
              elementId: "dashboard-report-content",
              nomeFile: "Dashboard_Finanziaria_Completa",
              titolo: "Dashboard Finanziaria",
              sottotitolo: "Riepilogo Consuntivo e Andamento",
              orientazione: "portrait"
            }}
          />
        </div>
      </div>

      <div id="dashboard-report-content" className="space-y-6">
        {/* Header per PDF */}
        <div className="hidden print-only mb-8 border-b-2 border-slate-800 pb-4">
          <div className="flex justify-between items-end">
              <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-white shrink-0 shadow-lg">
                  <FileCode size={24} />
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-slate-900">GRUPPO VISENTIN SRL</h1>
                  <p className="text-slate-500 uppercase tracking-widest text-sm mt-1">Dashboard Finanziaria</p>
                </div>
              </div>
            <div className="text-right">
              <p className="text-sm text-slate-600">Data Report: {new Date().toLocaleDateString('it-IT')}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard title={`Entrate ${kpiYear}`} amount={totalIncome} type="income" termId="fatturato" calculatedValues={entrateCalculatedValues} />
          <SummaryCard title={`Uscite ${kpiYear}`} amount={totalExpense} type="expense" termId="uscite" calculatedValues={usciteCalculatedValues} />
          <SummaryCard title={`Saldo ${kpiYear}`} amount={balance} type="balance" termId="saldo_cassa" calculatedValues={saldoCalculatedValues} />
          
          {/* Posizione IVA Card */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-start justify-between">
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <p className="text-sm font-medium text-slate-500">Posizione IVA {kpiYear}</p>
                <InfoTooltip termId="posizione_iva" size="sm" calculatedValues={ivaCalculatedValues} />
              </div>
              <h3 className={`text-2xl font-bold tracking-tight ${ivaData.creditoDebitoResiduo > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {CURRENCY_FORMATTER.format(Math.abs(ivaData.creditoDebitoResiduo))}
                <span className="text-xs ml-1 font-medium text-slate-400">
                  {ivaData.creditoDebitoResiduo > 0 ? '(Debito)' : '(Credito)'}
                </span>
              </h3>
            </div>
            <div className={`p-3 rounded-xl ${ivaData.creditoDebitoResiduo > 0 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
              <Receipt size={24} />
            </div>
          </div>
        </div>

        {/* Rating Score Card (Valutazione Banca con Grafico) */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <ShieldCheck size={20} className="text-slate-900" />
              Valutazione Banca (Merito Creditizio Basilea 3)
              <span className="print-only ml-2 text-slate-400 text-xs font-semibold">({ratingSelectedYear})</span>
              <InfoTooltip termId="rating_bancario" size="md" calculatedValues={ratingCalculatedValues} />
            </h3>
            <div className="flex items-center gap-3">
              {renderYearSelect(ratingSelectedYear, setRatingSelectedYear)}
              <span className={`text-sm font-black px-3 py-1 bg-slate-100 rounded-full ${ratingData.color}`}>
                Punteggio: {ratingData.score.toFixed(1)} / 7.0
              </span>
            </div>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            {/* KPI Column */}
            <div className="lg:col-span-5 flex flex-col gap-3">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex justify-between items-center">
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Giudizio Sintetico</span>
                  <span className={`text-lg font-black ${ratingData.color}`}>{ratingData.label}</span>
                </div>
                <span className="text-2xl">🏆</span>
              </div>
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex justify-between items-center">
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Copertura Oneri (DSCR)</span>
                  <span className="text-lg font-black text-slate-800 font-mono">
                    {ratingData.dscr > 0 ? `${ratingData.dscr.toFixed(2)}x` : 'N/A'}
                  </span>
                </div>
                <span className="text-2xl">💰</span>
              </div>
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex justify-between items-center">
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Livello di Rischio</span>
                  <span className="text-lg font-black text-slate-800">
                    {ratingData.score >= 5.5 ? 'Minimo' : ratingData.score >= 4 ? 'Basso' : ratingData.score >= 2.5 ? 'Medio' : 'Alto'}
                  </span>
                </div>
                <span className="text-2xl">⚖️</span>
              </div>
            </div>

            {/* Chart Column (Radar Bancario) */}
            <div className="lg:col-span-7 flex flex-col items-center justify-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 block self-start">Radar del Rating Bancario</span>
              {ratingData.radarData.length > 0 ? (
                <div className="h-64 w-full flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={ratingData.radarData}>
                      <PolarGrid stroke="#e2e8f0" />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: '#475569', fontSize: 9, fontWeight: 'bold' }} />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 8 }} />
                      <Radar name="Punteggio" dataKey="A" stroke="#2563eb" fill="#3b82f6" fillOpacity={0.25} />
                      <Tooltip 
                        formatter={(value: number) => [`${value}%`, 'Punteggio']}
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center text-slate-400 text-xs italic">
                  Dati patrimoniali assenti per il grafico radar
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Struttura Patrimoniale (Fonti vs Impieghi) */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <TrendingUp size={20} className="text-slate-900" />
              Struttura Patrimoniale (Fonti vs Impieghi)
              <span className="print-only ml-2 text-slate-400 text-xs font-semibold">({patrimonioYear})</span>
              <InfoTooltip termId="struttura_patrimoniale" size="md" calculatedValues={
                spMetrics 
                  ? `Analisi Struttura Patrimoniale ${patrimonioYear}:\n- Totale Attivo (Impieghi): ${CURRENCY_FORMATTER.format(spMetrics.totAttivo)}\n- Totale Passivo & Netto (Fonti): ${CURRENCY_FORMATTER.format(spMetrics.totPassivo)}\n- Capitale Immobilizzato: ${CURRENCY_FORMATTER.format(spMetrics.totAttivoImm)} (${formatPercent(spMetrics.totAttivoImm, spMetrics.totAttivo)})\n- Capitale Circolante: ${CURRENCY_FORMATTER.format(spMetrics.totAttivoCirc)} (${formatPercent(spMetrics.totAttivoCirc, spMetrics.totAttivo)})`
                  : 'Nessun dato di Stato Patrimoniale disponibile per questo anno.'
              } />
            </h3>
            <div className="flex items-center gap-3">
              {renderYearSelect(patrimonioYear, setPatrimonioYear)}
              {spMetrics && (
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${spMetrics.quadratura ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'}`}>
                  {spMetrics.quadratura ? 'Stato Patrimoniale Quadrato' : 'Differenza di Quadratura rilevata'}
                </span>
              )}
            </div>
          </div>

          {spMetrics ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
              {/* Grafico Column */}
              <div className="lg:col-span-6 flex flex-col items-center justify-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 block self-start font-sans">Rappresentazione Grafica</span>
                <div className="h-64 w-full font-sans">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={structureChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10, fontWeight: 'bold' }} />
                      <YAxis tickFormatter={(val) => CURRENCY_FORMATTER.format(val).replace(',00', '')} axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 9 }} />
                      <Tooltip formatter={(value: number) => CURRENCY_FORMATTER.format(value)} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '11px' }} />
                      
                      {/* Impieghi */}
                      <Bar dataKey="Capitale Immobilizzato" stackId="a" fill="#3b82f6" name="Capitale Immobilizzato" barSize={35} />
                      <Bar dataKey="Capitale Circolante" stackId="a" fill="#60a5fa" radius={[4, 4, 0, 0]} name="Capitale Circolante" barSize={35} />
                      
                      {/* Fonti */}
                      <Bar dataKey="Patrimonio Netto" stackId="b" fill="#10b981" name="Patrimonio Netto" barSize={35} />
                      <Bar dataKey="Debiti a M/L Termine" stackId="b" fill="#f59e0b" name="Debiti a M/L Termine" barSize={35} />
                      <Bar dataKey="Debiti a Breve Termine" stackId="b" fill="#ef4444" radius={[4, 4, 0, 0]} name="Debiti a Breve Termine" barSize={35} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Tabella Column */}
              <div className="lg:col-span-6 overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse font-sans">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-3 py-2 font-bold text-slate-700">Voce</th>
                      <th className="px-3 py-2 font-bold text-right text-slate-700">Valore</th>
                      <th className="px-3 py-2 font-bold text-right text-slate-700">% Attivo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {/* IMPIEGHI SECTION */}
                    <tr className="bg-slate-50/50">
                      <td className="px-3 py-1.5 font-bold text-slate-900 uppercase text-[9px]" colSpan={3}>
                        Impieghi (Attivo)
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 flex items-center gap-2 text-slate-600">
                        <span className="w-2.5 h-2.5 rounded bg-blue-500 shrink-0"></span>
                        Capitale Immobilizzato (Attivo Fisso)
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-700 font-semibold">
                        {CURRENCY_FORMATTER.format(spMetrics.totAttivoImm)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-500 font-semibold">
                        {formatPercent(spMetrics.totAttivoImm, spMetrics.totAttivo)}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 flex items-center gap-2 text-slate-600">
                        <span className="w-2.5 h-2.5 rounded bg-blue-400 shrink-0"></span>
                        Capitale Circolante (Attivo Circolante)
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-700 font-semibold">
                        {CURRENCY_FORMATTER.format(spMetrics.totAttivoCirc)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-500 font-semibold">
                        {formatPercent(spMetrics.totAttivoCirc, spMetrics.totAttivo)}
                      </td>
                    </tr>
                    <tr className="font-bold border-b border-slate-200 bg-slate-50/20">
                      <td className="px-3 py-2 text-slate-800">Totale Impieghi (Attivo)</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-800 font-bold">
                        {CURRENCY_FORMATTER.format(spMetrics.totAttivo)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-800 font-bold">100.0%</td>
                    </tr>

                    {/* FONTI SECTION */}
                    <tr className="bg-slate-50/50">
                      <td className="px-3 py-1.5 font-bold text-slate-900 uppercase text-[9px]" colSpan={3}>
                        Fonti (Passivo e Netto)
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 flex items-center gap-2 text-slate-600">
                        <span className="w-2.5 h-2.5 rounded bg-emerald-500 shrink-0"></span>
                        Patrimonio Netto (Mezzi Propri)
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-700 font-semibold">
                        {CURRENCY_FORMATTER.format(spMetrics.totPN)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-500 font-semibold">
                        {formatPercent(spMetrics.totPN, spMetrics.totAttivo)}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 flex items-center gap-2 text-slate-600">
                        <span className="w-2.5 h-2.5 rounded bg-amber-500 shrink-0"></span>
                        Debiti a Medio/Lungo Termine
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-700 font-semibold">
                        {CURRENCY_FORMATTER.format(spMetrics.totPassivoLT)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-500 font-semibold">
                        {formatPercent(spMetrics.totPassivoLT, spMetrics.totAttivo)}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 flex items-center gap-2 text-slate-600">
                        <span className="w-2.5 h-2.5 rounded bg-rose-500 shrink-0"></span>
                        Debiti a Breve Termine
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-700 font-semibold">
                        {CURRENCY_FORMATTER.format(spMetrics.totPassivoBT)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-500 font-semibold">
                        {formatPercent(spMetrics.totPassivoBT, spMetrics.totAttivo)}
                      </td>
                    </tr>
                    <tr className="font-bold border-t border-slate-200 bg-slate-50/20">
                      <td className="px-3 py-2 text-slate-800">Totale Fonti (Passivo + Netto)</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-800 font-bold">
                        {CURRENCY_FORMATTER.format(spMetrics.totPassivo)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-800 font-bold">
                        {formatPercent(spMetrics.totPassivo, spMetrics.totAttivo)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="py-8 flex flex-col items-center justify-center text-slate-400 gap-2 border border-dashed border-slate-200 rounded-xl">
              <AlertCircle size={24} className="text-slate-300" />
              <span className="text-xs italic">Nessuno Stato Patrimoniale caricato o calcolato per l'anno {patrimonioYear}.</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Expense Breakdown Pie */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                Spese per Categoria
                <span className="print-only ml-2 text-slate-400 text-xs font-semibold">({speseYear})</span>
                <InfoTooltip termId="spese_categoria" size="md" calculatedValues={speseCategoriaCalculatedValues} />
              </h3>
              {renderYearSelect(speseYear, setSpeseYear)}
            </div>
            {expenseData.length > 0 ? (
              <div className="flex flex-col gap-4">
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={expenseData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={80}
                        paddingAngle={3}
                        dataKey="value"
                        label={({ name, percent }) => percent > 0.04 ? `${(percent * 100).toFixed(0)}%` : ''}
                        labelLine={false}
                      >
                        {expenseData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        formatter={(value: number, name: string) => [CURRENCY_FORMATTER.format(value), name]}
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                {/* Legenda completa con valori */}
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {expenseData.map((entry, index) => (
                    <div key={entry.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }}></span>
                        <span className="text-slate-600 truncate" title={entry.name}>{entry.name}</span>
                      </div>
                      <span className="text-slate-800 font-semibold ml-2 shrink-0">{CURRENCY_FORMATTER.format(entry.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-slate-400">
                Nessuna spesa registrata per questo anno.
              </div>
            )}
          </div>

          {/* Monthly Trend */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                Andamento Mensile
                <span className="print-only ml-2 text-slate-400 text-xs font-semibold">({trendMensileYear})</span>
                <InfoTooltip termId="andamento_mensile" size="md" calculatedValues={andamentoMensileCalculatedValues} />
              </h3>
              {renderYearSelect(trendMensileYear, setTrendMensileYear)}
            </div>
            {monthlyData.length > 0 ? (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#64748b', fontSize: 12 }} 
                      dy={10}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#64748b', fontSize: 12 }}
                    />
                    <Tooltip 
                      cursor={{ fill: '#f1f5f9' }}
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                    <Bar dataKey="Entrate" fill="#10b981" radius={[4, 4, 0, 0]} barSize={20} name="Entrate" />
                    <Bar dataKey="Uscite" fill="#f43f5e" radius={[4, 4, 0, 0]} barSize={20} name="Uscite" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-slate-400">
                Nessun dato mensile disponibile per questo anno.
              </div>
            )}
          </div>
        </div>

        {/* --- COMPARISON CHARTS SECTION --- */}
        <div className="space-y-6">
          
          {/* Conto Corrente (Liquidità Cumulata) */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col w-full">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <CalendarClock size={18} className="text-slate-900" />
                Andamento Conto Corrente (Liquidità Cumulata)
                <span className="print-only ml-2 text-slate-400 text-xs font-semibold">({contoCorrenteYear})</span>
                <InfoTooltip termId="conto_corrente" size="md" calculatedValues={contoCorrenteCalculatedValues} />
              </h3>
              {renderYearSelect(contoCorrenteYear, setContoCorrenteYear)}
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={contoCorrenteData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                  <Tooltip 
                    formatter={(value: number) => CURRENCY_FORMATTER.format(value)}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Line type="monotone" dataKey="LiquiditaCumulata" name="Saldo Conto" stroke="#3b82f6" strokeWidth={3} dot={{r: 4, fill: '#2563eb'}} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Confronto Entrate */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col w-full">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <ArrowUpRight size={18} className="text-emerald-600" />
                Confronto Entrate (Consuntivo vs Previsionale)
                <span className="print-only ml-2 text-slate-400 text-xs font-semibold">({confrontoEntrateYear})</span>
                <InfoTooltip termId="confronto_entrate" size="md" calculatedValues={confrontoEntrateCalculatedValues} />
              </h3>
              {renderYearSelect(confrontoEntrateYear, setConfrontoEntrateYear)}
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={confrontoEntrateData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                  <Tooltip 
                    formatter={(value: number) => CURRENCY_FORMATTER.format(value)}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar dataKey="EntratePreviste" fill="#a7f3d0" radius={[4, 4, 0, 0]} name="Previsto" barSize={20} />
                  <Bar dataKey="EntrateReali" fill="#10b981" radius={[4, 4, 0, 0]} name="Reale" barSize={20} />
                  <Line type="monotone" dataKey="EntratePreviste" stroke="#34d399" strokeDasharray="5 5" dot={false} strokeWidth={2} name="Previsto Trend" />
                  <Line type="monotone" dataKey="EntrateReali" stroke="#047857" strokeWidth={2} dot={{r: 3, fill: '#047857'}} name="Reale Trend" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Confronto Uscite */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col w-full">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <ArrowDownRight size={18} className="text-rose-600" />
                Confronto Uscite (Consuntivo vs Previsionale)
                <span className="print-only ml-2 text-slate-400 text-xs font-semibold">({confrontoUsciteYear})</span>
                <InfoTooltip termId="confronto_uscite" size="md" calculatedValues={confrontoUsciteCalculatedValues} />
              </h3>
              {renderYearSelect(confrontoUsciteYear, setConfrontoUsciteYear)}
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={confrontoUsciteData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                  <Tooltip 
                    formatter={(value: number) => CURRENCY_FORMATTER.format(value)}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar dataKey="UscitePreviste" fill="#fecdd3" radius={[4, 4, 0, 0]} name="Previsto" barSize={20} />
                  <Bar dataKey="UsciteReali" fill="#f43f5e" radius={[4, 4, 0, 0]} name="Reale" barSize={20} />
                  <Line type="monotone" dataKey="UscitePreviste" stroke="#fb7185" strokeDasharray="5 5" dot={false} strokeWidth={2} name="Previsto Trend" />
                  <Line type="monotone" dataKey="UsciteReali" stroke="#be123c" strokeWidth={2} dot={{r: 3, fill: '#be123c'}} name="Reale Trend" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>

        {/* ─── COSTI FISSI E VARIABILI ───────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Costi Fissi Table */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                Costi Fissi
                <span className="print-only ml-2 text-slate-400 text-xs font-semibold">({costiFissiYear})</span>
                <InfoTooltip termId="costi_fissi" size="md" calculatedValues={costiFissiCalculatedValues} />
              </h3>
              {renderYearSelect(costiFissiYear, setCostiFissiYear)}
            </div>
            {renderDashboardCostTable(fixedCostTableData)}
          </div>

          {/* Costi Variabili Table */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                Costi Variabili
                <span className="print-only ml-2 text-slate-400 text-xs font-semibold">({costiVariabiliYear})</span>
                <InfoTooltip termId="costi_variabili" size="md" calculatedValues={costiVariabiliCalculatedValues} />
              </h3>
              {renderYearSelect(costiVariabiliYear, setCostiVariabiliYear)}
            </div>
            {renderDashboardCostTable(variableCostTableData)}
          </div>
        </div>
      </div>
      
      <HelpPanel 
        isOpen={showHelp}
        onClose={() => setShowHelp(false)}
        currentView={AppView.DASHBOARD}
        onGoToManuale={onGoToManuale}
      />
    </div>
  );
};

export default Dashboard;