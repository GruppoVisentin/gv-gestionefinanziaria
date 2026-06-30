import React, { useMemo, useState } from 'react';
import { parseUTCDate } from '../utils/gasCoreEngine';
import { Transaction, TransactionType, Project } from '../types';
import { CURRENCY_FORMATTER } from '../constants';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  BarChart, Bar, Legend, Cell, PieChart, Pie, ComposedChart, Line, LabelList, ReferenceLine, LineChart
} from 'recharts';
import { TrendingUp, PieChart as PieIcon, BarChart3, ArrowUpRight, ArrowDownRight, Briefcase, Layers, FileText, Printer, X, Filter, AlignLeft, Activity, Calendar } from 'lucide-react';

interface AnalyticsViewProps {
  transactions: Transaction[];
  projects: Project[];
  fixedCategories: string[];
  variableCategories: string[];
}

const COLORS = ['#020617', '#0f172a', '#1e293b', '#334155', '#475569', '#64748b', '#94a3b8', '#cbd5e1'];

const RADIAN = Math.PI / 180;
const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight="bold">
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

const AnalyticsView: React.FC<AnalyticsViewProps> = ({ transactions, projects, fixedCategories, variableCategories }) => {
  const today = new Date();
  // Global Filter States
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number | 'all'>('all');
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [showReport, setShowReport] = useState(false);

  // --- LOCAL CHART FILTERS ---
  const [cashFlowTime, setCashFlowTime] = useState<'FY' | '1H' | '2H'>('FY');
  
  const [incomeFilter, setIncomeFilter] = useState<{ time: 'FY' | '1H' | '2H', type: 'ALL' | 'OPS' | 'FIN' }>({ 
      time: 'FY', type: 'ALL' 
  });
  
  const [expenseFilter, setExpenseFilter] = useState<{ time: 'FY' | '1H' | '2H', type: 'ALL' | 'FIXED' | 'VAR' }>({ 
      time: 'FY', type: 'ALL' 
  });

  // Available Years
  const availableYears = useMemo(() => {
    const years = new Set<number>(transactions.map(t => new Date(t.date).getFullYear()));
    years.add(today.getFullYear());
    return Array.from(years).sort((a, b) => b - a);
  }, [transactions]);

  // --- HELPER FUNCTIONS FOR FILTERING ---
  
  const filterDataByTime = (data: any[], timeFilter: 'FY' | '1H' | '2H') => {
      if (timeFilter === '1H') return data.slice(0, 6);
      if (timeFilter === '2H') return data.slice(6, 12);
      return data;
  };

  const getFilteredTransactionsByType = (source: Transaction[], type: TransactionType, filterType: string) => {
      return source.filter(t => {
          if (t.type !== type) return false;
          
          if (type === TransactionType.INCOME) {
              if (filterType === 'OPS') return t.category !== '[FINANZA] Finanziamenti Ricevuti' && t.category !== '[FINANZA] Ritorno da Investimenti / Dividendi';
              if (filterType === 'FIN') return t.category === '[FINANZA] Finanziamenti Ricevuti' || t.category === '[FINANZA] Ritorno da Investimenti / Dividendi';
          } 
          if (type === TransactionType.EXPENSE) {
              if (t.ceType === 'ammortamento') return false; // N5 / Cash Flow alignment: esclude ammortamenti (costi non monetari)
              if (filterType === 'FIXED') return fixedCategories.includes(t.category);
              if (filterType === 'VAR') return !fixedCategories.includes(t.category);
          }
          return true; // 'ALL'
      });
  };

  // --- DATA AGGREGATION LOGIC ---

  // 1. BASE COMPARISON DATA GENERATOR (Reusable)
  const generateComparisonData = (
      timeFilter: 'FY' | '1H' | '2H', 
      typeFilterIncome: 'ALL' | 'OPS' | 'FIN',
      typeFilterExpense: 'ALL' | 'FIXED' | 'VAR'
  ) => {
    const data = Array(12).fill(0).map((_, i) => {
        const d = new Date(selectedYear, i, 1);
        return {
            name: d.toLocaleString('it-IT', { month: 'short' }),
            monthIndex: i,
            EntratePreviste: 0,
            EntrateReali: 0,
            UscitePreviste: 0,
            UsciteReali: 0,
            FlussoPrevisto: 0,
            FlussoReale: 0,
        };
    });

    // Income Processing
    const filteredIncome = getFilteredTransactionsByType(transactions, TransactionType.INCOME, typeFilterIncome);
    filteredIncome.forEach(t => {
        const tDate = parseUTCDate(t.date);
        if (tDate.getUTCFullYear() !== selectedYear) return;
        if (selectedProject !== 'all' && (t.project || '') !== selectedProject) return; // Apply Global Project Filter

        const month = tDate.getUTCMonth();
        const gross = t.amount * (1 + (t.vatRate || 0) / 100);
        if (t.isForecast) data[month].EntratePreviste += gross;
        else data[month].EntrateReali += gross;
    });

    // Expense Processing
    const filteredExpense = getFilteredTransactionsByType(transactions, TransactionType.EXPENSE, typeFilterExpense);
    filteredExpense.forEach(t => {
        const tDate = parseUTCDate(t.date);
        if (tDate.getUTCFullYear() !== selectedYear) return;
        if (selectedProject !== 'all' && (t.project || '') !== selectedProject) return;

        const month = tDate.getUTCMonth();
        const gross = t.amount * (1 + (t.vatRate || 0) / 100);
        if (t.isForecast) data[month].UscitePreviste += gross;
        else data[month].UsciteReali += gross;
    });

    // Calculate Net
    data.forEach(d => {
        d.FlussoPrevisto = d.EntratePreviste - d.UscitePreviste;
        d.FlussoReale = d.EntrateReali - d.UsciteReali;
    });

    return filterDataByTime(data, timeFilter);
  };

  // 2. SPECIFIC CHART DATA MEMOS
  const cashFlowChartData = useMemo(() => 
      generateComparisonData(cashFlowTime, 'ALL', 'ALL'), 
  [transactions, selectedYear, selectedProject, cashFlowTime, fixedCategories]);

  const incomeChartData = useMemo(() => 
      generateComparisonData(incomeFilter.time, incomeFilter.type, 'ALL'), 
  [transactions, selectedYear, selectedProject, incomeFilter, fixedCategories]);

  const expenseChartData = useMemo(() => 
      generateComparisonData(expenseFilter.time, 'ALL', expenseFilter.type), 
  [transactions, selectedYear, selectedProject, expenseFilter, fixedCategories]);


  // Calculate Summaries for Tables (Based on Chart Data)
  const incomeSummary = useMemo(() => {
      const prev = incomeChartData.reduce((acc: number, c: any) => acc + c.EntratePreviste, 0);
      const real = incomeChartData.reduce((acc: number, c: any) => acc + c.EntrateReali, 0);
      const count = incomeChartData.length || 1;
      return { prev, real, diff: real - prev, avgPrev: prev / count, avgReal: real / count };
  }, [incomeChartData]);

  const expenseSummary = useMemo(() => {
      const prev = expenseChartData.reduce((acc: number, c: any) => acc + c.UscitePreviste, 0);
      const real = expenseChartData.reduce((acc: number, c: any) => acc + c.UsciteReali, 0);
      const count = expenseChartData.length || 1;
      return { prev, real, diff: real - prev, avgPrev: prev / count, avgReal: real / count };
  }, [expenseChartData]);


  // Base filtering for other components (Global Filters still apply)
  const actualsForYear = useMemo(() => {
      return transactions.filter(t => 
        !t.isForecast && 
        new Date(t.date).getFullYear() === selectedYear &&
        t.ceType !== 'ammortamento' && // N5 / Cash Flow alignment: esclude ammortamenti
        (selectedProject === 'all' || (t.project || '') === selectedProject)
      );
  }, [transactions, selectedYear, selectedProject]);

  const actualsForPeriod = useMemo(() => {
      return actualsForYear.filter(t => 
          selectedMonth === 'all' || new Date(t.date).getMonth() === selectedMonth
      );
  }, [actualsForYear, selectedMonth]);

  const forecastsForPeriod = useMemo(() => {
    return transactions.filter(t => 
        t.isForecast &&
        new Date(t.date).getFullYear() === selectedYear &&
        t.ceType !== 'ammortamento' && // N5 / Cash Flow alignment: esclude ammortamenti
        (selectedMonth === 'all' || new Date(t.date).getMonth() === selectedMonth) &&
        (selectedProject === 'all' || (t.project || '') === selectedProject)
    );
  }, [transactions, selectedYear, selectedMonth, selectedProject]);


  // 3. Project Profitability
  const projectPerformanceData = useMemo(() => {
     const projMap: Record<string, { income: number, expense: number }> = {};
     actualsForPeriod.filter(t => t.project).forEach(t => {
         const gross = t.amount * (1 + (t.vatRate || 0) / 100);
         const pName = t.project!;
         if (!projMap[pName]) projMap[pName] = { income: 0, expense: 0 };
         if (t.type === TransactionType.INCOME) projMap[pName].income += gross;
         else projMap[pName].expense += gross;
     });
     
     return Object.entries(projMap)
        .map(([name, data]) => ({ 
            name, 
            Entrate: data.income, 
            Uscite: data.expense, 
            labelIncome: data.income > 0 ? CURRENCY_FORMATTER.format(data.income) : '',
            labelExpense: data.expense > 0 ? CURRENCY_FORMATTER.format(data.expense) : ''
        }))
        .sort((a, b) => b.Entrate - a.Entrate);
  }, [actualsForPeriod]);

  // 4. Category Breakdown
  const getCategoryBreakdown = (type: TransactionType) => {
      const map = new Map<string, { forecast: number, actual: number }>();
      forecastsForPeriod.filter(t => t.type === type).forEach(t => {
          const gross = t.amount * (1 + (t.vatRate || 0) / 100);
          const current = map.get(t.category) || { forecast: 0, actual: 0 };
          map.set(t.category, { ...current, forecast: current.forecast + gross });
      });
      actualsForPeriod.filter(t => t.type === type).forEach(t => {
          const gross = t.amount * (1 + (t.vatRate || 0) / 100);
          const current = map.get(t.category) || { forecast: 0, actual: 0 };
          map.set(t.category, { ...current, actual: current.actual + gross });
      });

      const totalForecast = Array.from(map.values()).reduce((sum, item) => sum + item.forecast, 0);
      const totalActual = Array.from(map.values()).reduce((sum, item) => sum + item.actual, 0);

      const data = Array.from(map.entries()).map(([name, values]) => ({
          name,
          forecast: values.forecast,
          actual: values.actual,
          forecastPerc: totalForecast > 0 ? (values.forecast / totalForecast) * 100 : 0,
          actualPerc: totalActual > 0 ? (values.actual / totalActual) * 100 : 0,
          value: values.actual
      })).filter(d => d.forecast > 0 || d.actual > 0).sort((a, b) => b.actual - a.actual);

      return { data, totalForecast, totalActual };
  };

  const expenseBreakdown = useMemo(() => getCategoryBreakdown(TransactionType.EXPENSE), [forecastsForPeriod, actualsForPeriod]);
  const incomeBreakdown = useMemo(() => getCategoryBreakdown(TransactionType.INCOME), [forecastsForPeriod, actualsForPeriod]);

  // 5. Fixed vs Variable Tables
  const generateCostTableData = (isFixed: boolean) => {
      const map: Record<string, {forecast: number, actual: number}> = {};
      const filterFn = (t: Transaction) => {
         const isDebt = t.category === '[FINANZA] Quota Capitale Rate Finanziamenti' || t.category === '[FINANZA] Interessi Passivi Finanziamenti' || t.category === '[FINANZA] Mutuo' || t.category === '[FINANZA] Prestiti Soci';
         if (t.type !== TransactionType.EXPENSE) return false;
         if (isDebt) return false; // Exclude debt from fixed/var tables
         const isCatFixed = fixedCategories.includes(t.category);
         return isFixed ? isCatFixed : !isCatFixed;
      };

      forecastsForPeriod.filter(filterFn).forEach(t => {
           const gross = t.amount * (1 + (t.vatRate || 0) / 100);
           if (!map[t.category]) map[t.category] = { forecast: 0, actual: 0 };
           map[t.category].forecast += gross;
      });
      actualsForPeriod.filter(filterFn).forEach(t => {
           const gross = t.amount * (1 + (t.vatRate || 0) / 100);
           if (!map[t.category]) map[t.category] = { forecast: 0, actual: 0 };
           map[t.category].actual += gross;
      });
      
      return Object.entries(map).map(([name, val]) => ({
          name, forecast: val.forecast, actual: val.actual, diff: val.actual - val.forecast 
      })).sort((a, b) => b.actual - a.actual);
  };

  const fixedCostTableData = useMemo(() => generateCostTableData(true), [actualsForPeriod, forecastsForPeriod, fixedCategories]);
  const variableCostTableData = useMemo(() => generateCostTableData(false), [actualsForPeriod, forecastsForPeriod, fixedCategories]);

  // 6. Expense Trend Area
  const expenseTrendData = useMemo(() => {
      const topCategories = expenseBreakdown.data.slice(0, 5).map(c => c.name);
      const data = Array(12).fill(0).map((_, i) => {
          const d = new Date(selectedYear, i, 1);
          const monthObj: any = { name: d.toLocaleString('it-IT', { month: 'short' }) };
          topCategories.forEach(c => monthObj[c] = 0);
          monthObj['Altro'] = 0;
          return monthObj;
      });

      actualsForYear.filter(t => t.type === TransactionType.EXPENSE).forEach(t => {
          const month = new Date(t.date).getMonth();
          const gross = t.amount * (1 + (t.vatRate || 0) / 100);
          if (topCategories.includes(t.category)) data[month][t.category] += gross;
          else data[month]['Altro'] += gross;
      });
      return { data, keys: [...topCategories, 'Altro'] };
  }, [actualsForYear, expenseBreakdown, selectedYear]);

  // KPIs
  // INC-06 Fix: Exclude financing/capital/non-operative flows (ceType: solo_cashflow, capex, distribuzione_utile) from the main cash flow KPIs to show operational net flow.
  const totalIncome = actualsForPeriod
    .filter(t => t.type === TransactionType.INCOME && !['solo_cashflow', 'capex', 'distribuzione_utile'].includes(t.ceType ?? ''))
    .reduce((acc, t) => acc + (t.amount * (1 + (t.vatRate || 0)/100)), 0);

  const totalExpense = actualsForPeriod
    .filter(t => t.type === TransactionType.EXPENSE && !['solo_cashflow', 'capex', 'distribuzione_utile'].includes(t.ceType ?? ''))
    .reduce((acc, t) => acc + (t.amount * (1 + (t.vatRate || 0)/100)), 0);

  const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpense) / totalIncome) * 100 : 0;

  const renderDetailedTable = (
      data: {name: string, forecast: number, actual: number, forecastPerc: number, actualPerc: number}[], 
      totalForecast: number, 
      totalActual: number,
      isIncome: boolean
  ) => {
      return (
        <div className="overflow-x-auto mt-4 border-t border-slate-100 pt-4">
             <table className="w-full text-xs text-left">
                <thead className="uppercase text-slate-400 bg-slate-50">
                    <tr>
                        <th className="px-2 py-2 font-semibold">Categoria</th>
                        <th className="px-2 py-2 font-semibold text-right">Previsto</th>
                        <th className="px-2 py-2 font-semibold text-right">% Prev</th>
                        <th className="px-2 py-2 font-semibold text-right">Consuntivo</th>
                        <th className="px-2 py-2 font-semibold text-right">% Cons</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                    {data.map((item) => (
                        <tr key={item.name} className="hover:bg-slate-50/50">
                            <td className="px-2 py-1.5 font-medium text-slate-700 truncate max-w-[150px]" title={item.name}>{item.name}</td>
                            <td className="px-2 py-1.5 text-right font-mono text-slate-500">{CURRENCY_FORMATTER.format(item.forecast)}</td>
                            <td className="px-2 py-1.5 text-right text-slate-400">{item.forecastPerc.toFixed(1)}%</td>
                            <td className={`px-2 py-1.5 text-right font-mono font-bold ${isIncome ? 'text-slate-900' : 'text-slate-600'}`}>
                                {CURRENCY_FORMATTER.format(item.actual)}
                            </td>
                            <td className={`px-2 py-1.5 text-right font-semibold ${isIncome ? 'text-slate-700' : 'text-slate-500'}`}>
                                {item.actualPerc.toFixed(1)}%
                            </td>
                        </tr>
                    ))}
                     <tr className="bg-slate-50 font-bold border-t border-slate-200">
                        <td className="px-2 py-2 text-slate-800 uppercase">Totale</td>
                        <td className="px-2 py-2 text-right font-mono text-slate-600">{CURRENCY_FORMATTER.format(totalForecast)}</td>
                        <td className="px-2 py-2 text-right text-slate-500">100%</td>
                        <td className={`px-2 py-2 text-right font-mono ${isIncome ? 'text-slate-900' : 'text-slate-700'}`}>
                            {CURRENCY_FORMATTER.format(totalActual)}
                        </td>
                        <td className={`px-2 py-2 text-right ${isIncome ? 'text-slate-800' : 'text-slate-600'}`}>100%</td>
                    </tr>
                </tbody>
            </table>
        </div>
      );
  };

  const renderCostComparisonTable = (data: {name: string, forecast: number, actual: number, diff: number}[]) => {
      if (data.length === 0) return <p className="text-xs text-slate-400 p-2 italic">Nessun dato disponibile.</p>;
      
      return (
        <div className="overflow-x-auto mt-4 border-t border-slate-100 pt-4">
             <table className="w-full text-xs text-left">
                <thead className="text-[10px] uppercase text-slate-400 bg-slate-50/50">
                    <tr>
                        <th className="px-2 py-2 font-semibold">Voce di Spesa</th>
                        <th className="px-2 py-2 font-semibold text-right">Previsionale</th>
                        <th className="px-2 py-2 font-semibold text-right">Consuntivo</th>
                        <th className="px-2 py-2 font-semibold text-right">Differenza</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-xs">
                    {data.map((item) => (
                        <tr key={item.name}>
                            <td className="px-2 py-1.5 font-medium text-slate-700 truncate max-w-[180px]" title={item.name}>{item.name}</td>
                            <td className="px-2 py-1.5 text-right font-mono text-slate-500">{CURRENCY_FORMATTER.format(item.forecast)}</td>
                            <td className="px-2 py-1.5 text-right font-mono font-bold text-slate-800">{CURRENCY_FORMATTER.format(item.actual)}</td>
                            <td className={`px-2 py-1.5 text-right font-mono font-bold ${item.diff > 0 ? 'text-slate-600' : 'text-slate-900'}`}>
                                {item.diff > 0 ? '+' : ''}{CURRENCY_FORMATTER.format(item.diff)}
                            </td>
                        </tr>
                    ))}
                    <tr className="bg-slate-50 font-bold border-t border-slate-200">
                        <td className="px-2 py-2 text-slate-800 uppercase text-[10px]">Totale</td>
                        <td className="px-2 py-2 text-right font-mono text-slate-600">
                            {CURRENCY_FORMATTER.format(data.reduce((acc, i) => acc + i.forecast, 0))}
                        </td>
                        <td className="px-2 py-2 text-right font-mono text-slate-800">
                             {CURRENCY_FORMATTER.format(data.reduce((acc, i) => acc + i.actual, 0))}
                        </td>
                         <td className="px-2 py-2 text-right font-mono text-slate-800">
                             {CURRENCY_FORMATTER.format(data.reduce((acc, i) => acc + i.diff, 0))}
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
      );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
        
        {/* --- HEADER & FILTERS --- */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
            <div className="flex items-center gap-3">
                <h2 className="text-2xl font-bold text-slate-800">Analisi Finanziaria</h2>
                <span className="bg-slate-100 text-slate-700 text-xs px-2 py-1 rounded-full font-bold uppercase tracking-wide">Report</span>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
                 {/* Filters */}
                 <div className="flex items-center bg-white border border-slate-200 rounded-lg p-1 shadow-sm">
                    <div className="px-2 text-slate-400 border-r border-slate-100">
                        <Filter size={16} />
                    </div>
                    
                    {/* Year */}
                    <select 
                        value={selectedYear} 
                        onChange={(e) => setSelectedYear(Number(e.target.value))}
                        className="bg-transparent text-sm font-semibold text-slate-700 outline-none px-3 py-1 cursor-pointer hover:bg-slate-50 rounded"
                    >
                        {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>

                    {/* Month */}
                    <select 
                        value={selectedMonth} 
                        onChange={(e) => setSelectedMonth(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                        className="bg-transparent text-sm font-semibold text-slate-700 outline-none px-3 py-1 border-l border-slate-100 cursor-pointer hover:bg-slate-50 rounded"
                    >
                        <option value="all">Tutto l'anno</option>
                        {Array.from({length: 12}).map((_, i) => (
                            <option key={i} value={i}>{new Date(2024, i, 1).toLocaleString('it-IT', {month: 'long'})}</option>
                        ))}
                    </select>

                     {/* Project */}
                     <select 
                        value={selectedProject} 
                        onChange={(e) => setSelectedProject(e.target.value)}
                        className="bg-transparent text-sm font-semibold text-slate-700 outline-none px-3 py-1 border-l border-slate-100 cursor-pointer hover:bg-slate-50 rounded max-w-[150px] truncate"
                    >
                        <option value="all">Tutte le commesse</option>
                        <option value="Altra tipologia di entrata">Altra tipologia</option>
                        {projects.map(p => (
                            <option key={p.id} value={p.name}>{p.name}</option>
                        ))}
                    </select>
                 </div>

                 <button 
                    onClick={() => setShowReport(true)}
                    className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors flex items-center gap-2 shadow-sm"
                 >
                    <FileText size={16} />
                    Genera Report
                 </button>
            </div>
        </div>

        {/* --- KPI CARDS --- */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm flex items-center justify-between">
                <div>
                    <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Flusso Netto (Periodo)</p>
                    <p className={`text-2xl font-mono font-bold ${totalIncome - totalExpense >= 0 ? 'text-slate-900' : 'text-slate-600'}`}>
                        {CURRENCY_FORMATTER.format(totalIncome - totalExpense)}
                    </p>
                </div>
                <div className="bg-slate-50 p-3 rounded-full text-slate-400">
                    <TrendingUp size={20} />
                </div>
            </div>
            <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm flex items-center justify-between">
                <div>
                    <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Margine Risparmio</p>
                    <p className={`text-2xl font-mono font-bold ${savingsRate >= 20 ? 'text-slate-900' : savingsRate > 0 ? 'text-slate-600' : 'text-slate-400'}`}>
                        {savingsRate.toFixed(1)}%
                    </p>
                </div>
                <div className="bg-slate-50 p-3 rounded-full text-slate-400">
                    <PieIcon size={20} />
                </div>
            </div>
             <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm flex items-center justify-between">
                <div>
                    <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Volume Transato</p>
                    <p className="text-2xl font-mono font-bold text-slate-700">
                        {CURRENCY_FORMATTER.format(totalIncome + totalExpense)}
                    </p>
                </div>
                <div className="bg-slate-50 p-3 rounded-full text-slate-400">
                    <BarChart3 size={20} />
                </div>
            </div>
        </div>

        {/* --- NEW: NET CASH FLOW LINE CHART (Top) --- */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <Activity size={18} className="text-slate-500" />
                    Andamento Flusso di Cassa Netto (Previsionale vs Reale)
                </h3>
                
                {/* CHART FILTERS TOOLBAR */}
                <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-lg border border-slate-100">
                    <button onClick={() => setCashFlowTime('1H')} className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${cashFlowTime === '1H' ? 'bg-white shadow text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}>1° Sem</button>
                    <button onClick={() => setCashFlowTime('2H')} className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${cashFlowTime === '2H' ? 'bg-white shadow text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}>2° Sem</button>
                    <button onClick={() => setCashFlowTime('FY')} className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${cashFlowTime === 'FY' ? 'bg-white shadow text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}>Anno</button>
                </div>
            </div>
            
            <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={cashFlowChartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                        <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                        <Tooltip 
                            formatter={(value: number) => CURRENCY_FORMATTER.format(value)}
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        />
                        <ReferenceLine y={0} stroke="#cbd5e1" strokeWidth={1} />
                        <Legend iconType="plainline" />
                        <Line 
                            type="monotone" 
                            dataKey="FlussoPrevisto" 
                            stroke="#94a3b8" 
                            strokeDasharray="5 5" 
                            dot={false} 
                            strokeWidth={2} 
                            name="Flusso Previsto" 
                        />
                        <Line 
                            type="monotone" 
                            dataKey="FlussoReale" 
                            stroke="#0f172a" 
                            strokeWidth={3} 
                            dot={{r: 4, fill: '#0f172a', strokeWidth: 2, stroke: '#fff'}} 
                            activeDot={{r: 6}}
                            name="Flusso Reale" 
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>

        {/* --- COMPARISON CHARTS SECTION --- */}
        <div className="space-y-6">
            
            {/* Income Comparison Chart */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col w-full">
                <div className="flex flex-col gap-4 mb-6">
                    <div className="flex justify-between items-center">
                        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <ArrowUpRight size={18} className="text-slate-900" />
                            Entrate (Trend)
                        </h3>
                    </div>
                    {/* FILTERS TOOLBAR */}
                    <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                        {/* Time Toggle */}
                        <div className="flex items-center bg-slate-200/50 p-0.5 rounded-md">
                            <button onClick={() => setIncomeFilter({...incomeFilter, time: '1H'})} className={`px-2 py-1 text-[10px] font-bold rounded transition-all ${incomeFilter.time === '1H' ? 'bg-white shadow text-slate-900' : 'text-slate-400'}`}>1S</button>
                            <button onClick={() => setIncomeFilter({...incomeFilter, time: '2H'})} className={`px-2 py-1 text-[10px] font-bold rounded transition-all ${incomeFilter.time === '2H' ? 'bg-white shadow text-slate-900' : 'text-slate-400'}`}>2S</button>
                            <button onClick={() => setIncomeFilter({...incomeFilter, time: 'FY'})} className={`px-2 py-1 text-[10px] font-bold rounded transition-all ${incomeFilter.time === 'FY' ? 'bg-white shadow text-slate-900' : 'text-slate-400'}`}>AN</button>
                        </div>
                        {/* Type Toggle */}
                        <div className="flex items-center bg-slate-200/50 p-0.5 rounded-md">
                            <button onClick={() => setIncomeFilter({...incomeFilter, type: 'ALL'})} className={`px-2 py-1 text-[10px] font-bold rounded transition-all ${incomeFilter.type === 'ALL' ? 'bg-white shadow text-slate-900' : 'text-slate-400'}`}>Tutte</button>
                            <button onClick={() => setIncomeFilter({...incomeFilter, type: 'OPS'})} className={`px-2 py-1 text-[10px] font-bold rounded transition-all ${incomeFilter.type === 'OPS' ? 'bg-white shadow text-slate-900' : 'text-slate-400'}`}>Oper.</button>
                            <button onClick={() => setIncomeFilter({...incomeFilter, type: 'FIN'})} className={`px-2 py-1 text-[10px] font-bold rounded transition-all ${incomeFilter.type === 'FIN' ? 'bg-white shadow text-slate-900' : 'text-slate-400'}`}>Fin.</button>
                        </div>
                    </div>
                </div>

                <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={incomeChartData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                            <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                            <Tooltip 
                                formatter={(value: number) => CURRENCY_FORMATTER.format(value)}
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            />
                            <Bar dataKey="EntratePreviste" fill="#cbd5e1" radius={[4, 4, 0, 0]} name="Previsto" barSize={20} />
                            <Bar dataKey="EntrateReali" fill="#0f172a" radius={[4, 4, 0, 0]} name="Reale" barSize={20} />
                            <Line type="monotone" dataKey="EntratePreviste" stroke="#94a3b8" strokeDasharray="5 5" dot={false} strokeWidth={2} />
                            <Line type="monotone" dataKey="EntrateReali" stroke="#1e293b" strokeWidth={2} dot={{r: 3, fill: '#1e293b'}} />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
                
                {/* Summary Table Income */}
                <div className="mt-6 pt-6 border-t border-slate-100">
                    <div className="flex justify-between items-center mb-3">
                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Riepilogo Entrate ({incomeFilter.time})</h4>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-[10px] uppercase text-slate-400 bg-slate-50/50">
                                <tr>
                                    <th className="px-2 py-1 font-semibold">Voce</th>
                                    <th className="px-2 py-1 font-semibold text-right">Totale Periodo</th>
                                    <th className="px-2 py-1 font-semibold text-right">Media Mensile</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50 text-xs">
                                <tr>
                                    <td className="px-2 py-2 font-medium text-slate-600">Entrate Previste (Somma)</td>
                                    <td className="px-2 py-2 text-right font-mono text-slate-500">{CURRENCY_FORMATTER.format(incomeSummary.prev)}</td>
                                    <td className="px-2 py-2 text-right font-mono text-slate-500">{CURRENCY_FORMATTER.format(incomeSummary.avgPrev)}</td>
                                </tr>
                                <tr>
                                    <td className="px-2 py-2 font-medium text-slate-900">Entrate Consuntive (Somma)</td>
                                    <td className="px-2 py-2 text-right font-mono text-slate-900 font-bold">{CURRENCY_FORMATTER.format(incomeSummary.real)}</td>
                                    <td className="px-2 py-2 text-right font-mono text-slate-900">{CURRENCY_FORMATTER.format(incomeSummary.avgReal)}</td>
                                </tr>
                                <tr className="bg-slate-50 font-bold">
                                    <td className="px-2 py-2 text-slate-700">Differenza</td>
                                    <td className={`px-2 py-2 text-right font-mono ${incomeSummary.diff >= 0 ? 'text-slate-900' : 'text-slate-600'}`}>
                                        {incomeSummary.diff > 0 ? '+' : ''}{CURRENCY_FORMATTER.format(incomeSummary.diff)}
                                    </td>
                                    <td className="px-2 py-2 text-right text-slate-400 italic">
                                        -
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Expense Comparison Chart */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col w-full">
                 <div className="flex flex-col gap-4 mb-6">
                    <div className="flex justify-between items-center">
                        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <ArrowDownRight size={18} className="text-slate-600" />
                            Uscite (Trend)
                        </h3>
                    </div>
                    {/* FILTERS TOOLBAR */}
                    <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                        {/* Time Toggle */}
                        <div className="flex items-center bg-slate-200/50 p-0.5 rounded-md">
                            <button onClick={() => setExpenseFilter({...expenseFilter, time: '1H'})} className={`px-2 py-1 text-[10px] font-bold rounded transition-all ${expenseFilter.time === '1H' ? 'bg-white shadow text-slate-900' : 'text-slate-400'}`}>1S</button>
                            <button onClick={() => setExpenseFilter({...expenseFilter, time: '2H'})} className={`px-2 py-1 text-[10px] font-bold rounded transition-all ${expenseFilter.time === '2H' ? 'bg-white shadow text-slate-900' : 'text-slate-400'}`}>2S</button>
                            <button onClick={() => setExpenseFilter({...expenseFilter, time: 'FY'})} className={`px-2 py-1 text-[10px] font-bold rounded transition-all ${expenseFilter.time === 'FY' ? 'bg-white shadow text-slate-900' : 'text-slate-400'}`}>AN</button>
                        </div>
                        {/* Type Toggle */}
                        <div className="flex items-center bg-slate-200/50 p-0.5 rounded-md">
                            <button onClick={() => setExpenseFilter({...expenseFilter, type: 'ALL'})} className={`px-2 py-1 text-[10px] font-bold rounded transition-all ${expenseFilter.type === 'ALL' ? 'bg-white shadow text-slate-900' : 'text-slate-400'}`}>Tutte</button>
                            <button onClick={() => setExpenseFilter({...expenseFilter, type: 'FIXED'})} className={`px-2 py-1 text-[10px] font-bold rounded transition-all ${expenseFilter.type === 'FIXED' ? 'bg-white shadow text-slate-900' : 'text-slate-400'}`}>Fisse</button>
                            <button onClick={() => setExpenseFilter({...expenseFilter, type: 'VAR'})} className={`px-2 py-1 text-[10px] font-bold rounded transition-all ${expenseFilter.type === 'VAR' ? 'bg-white shadow text-slate-900' : 'text-slate-400'}`}>Var.</button>
                        </div>
                    </div>
                </div>

                <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={expenseChartData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                            <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                            <Tooltip 
                                formatter={(value: number) => CURRENCY_FORMATTER.format(value)}
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            />
                            <Bar dataKey="UscitePreviste" fill="#cbd5e1" radius={[4, 4, 0, 0]} name="Budget" barSize={20} />
                            <Bar dataKey="UsciteReali" fill="#475569" radius={[4, 4, 0, 0]} name="Speso" barSize={20} />
                            <Line type="monotone" dataKey="UscitePreviste" stroke="#94a3b8" strokeDasharray="5 5" dot={false} strokeWidth={2} />
                            <Line type="monotone" dataKey="UsciteReali" stroke="#334155" strokeWidth={2} dot={{r: 3, fill: '#334155'}} />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>

                {/* Summary Table Expense */}
                <div className="mt-6 pt-6 border-t border-slate-100">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Riepilogo Uscite ({expenseFilter.time})</h4>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-[10px] uppercase text-slate-400 bg-slate-50/50">
                                <tr>
                                    <th className="px-2 py-1 font-semibold">Voce</th>
                                    <th className="px-2 py-1 font-semibold text-right">Totale Periodo</th>
                                    <th className="px-2 py-1 font-semibold text-right">Media Mensile</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50 text-xs">
                                <tr>
                                    <td className="px-2 py-2 font-medium text-slate-600">Uscite Previste (Somma)</td>
                                    <td className="px-2 py-2 text-right font-mono text-slate-500">{CURRENCY_FORMATTER.format(expenseSummary.prev)}</td>
                                    <td className="px-2 py-2 text-right font-mono text-slate-500">{CURRENCY_FORMATTER.format(expenseSummary.avgPrev)}</td>
                                </tr>
                                <tr>
                                    <td className="px-2 py-2 font-medium text-slate-600">Uscite Consuntive (Somma)</td>
                                    <td className="px-2 py-2 text-right font-mono text-slate-600 font-bold">{CURRENCY_FORMATTER.format(expenseSummary.real)}</td>
                                    <td className="px-2 py-2 text-right font-mono text-slate-600">{CURRENCY_FORMATTER.format(expenseSummary.avgReal)}</td>
                                </tr>
                                <tr className="bg-slate-50 font-bold">
                                    <td className="px-2 py-2 text-slate-700">Differenza</td>
                                    <td className={`px-2 py-2 text-right font-mono ${expenseSummary.diff <= 0 ? 'text-slate-900' : 'text-slate-600'}`}>
                                        {expenseSummary.diff > 0 ? '+' : ''}{CURRENCY_FORMATTER.format(expenseSummary.diff)}
                                    </td>
                                    <td className="px-2 py-2 text-right text-slate-400 italic">
                                        -
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>

        {/* --- PROJECT PERFORMANCE DISTRIBUTION (HORIZONTAL BARS) --- */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                <Briefcase size={18} className="text-slate-500" />
                Performance Commesse (Distribuzione Entrate vs Uscite)
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                 {/* Income by Project */}
                 <div>
                     <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wide border-b border-slate-100 pb-2 mb-4">Entrate per Commessa</h4>
                     <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart layout="vertical" data={projectPerformanceData.filter(p => p.Entrate > 0)} margin={{ top: 0, right: 80, left: 10, bottom: 0 }}>
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" width={140} tick={{fontSize: 11, fill: '#475569'}} />
                                <Tooltip cursor={{fill: 'transparent'}} formatter={(value:number) => CURRENCY_FORMATTER.format(value)} />
                                <Bar dataKey="Entrate" fill="#0f172a" barSize={18} radius={[0, 4, 4, 0]}>
                                    <LabelList dataKey="labelIncome" position="right" style={{fontSize: 10, fill: '#0f172a', fontWeight: 'bold'}} />
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                     </div>
                 </div>
                 
                 {/* Expenses by Project */}
                 <div>
                     <h4 className="text-sm font-bold text-slate-600 uppercase tracking-wide border-b border-slate-100 pb-2 mb-4">Uscite per Commessa</h4>
                     <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart layout="vertical" data={projectPerformanceData.filter(p => p.Uscite > 0).sort((a,b) => b.Uscite - a.Uscite)} margin={{ top: 0, right: 80, left: 10, bottom: 0 }}>
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" width={140} tick={{fontSize: 11, fill: '#475569'}} />
                                <Tooltip cursor={{fill: 'transparent'}} formatter={(value:number) => CURRENCY_FORMATTER.format(value)} />
                                <Bar dataKey="Uscite" fill="#64748b" barSize={18} radius={[0, 4, 4, 0]}>
                                    <LabelList dataKey="labelExpense" position="right" style={{fontSize: 10, fill: '#64748b', fontWeight: 'bold'}} />
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                     </div>
                 </div>
            </div>
        </div>

        {/* --- CATEGORY BREAKDOWN PIE CHARTS (RESTORED WITH TABLE) --- */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Expense Pie + Table */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col">
                <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                    <PieIcon size={18} className="text-slate-500" />
                    Ripartizione Spese per Categoria
                </h3>
                <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={expenseBreakdown.data.filter(d => d.value > 0)}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                label={renderCustomLabel}
                                outerRadius={100}
                                fill="#8884d8"
                                dataKey="value"
                            >
                                {expenseBreakdown.data.filter(d => d.value > 0).map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip formatter={(value:number) => CURRENCY_FORMATTER.format(value)} />
                            <Legend layout="horizontal" verticalAlign="bottom" align="center" wrapperStyle={{fontSize: '10px'}} />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
                {/* Summary Table for Expenses */}
                {renderDetailedTable(expenseBreakdown.data, expenseBreakdown.totalForecast, expenseBreakdown.totalActual, false)}
            </div>

            {/* Income Pie + Table */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col">
                <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                    <PieIcon size={18} className="text-slate-900" />
                    Ripartizione Entrate per Categoria
                </h3>
                <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={incomeBreakdown.data.filter(d => d.value > 0)}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                label={renderCustomLabel}
                                outerRadius={100}
                                fill="#8884d8"
                                dataKey="value"
                            >
                                {incomeBreakdown.data.filter(d => d.value > 0).map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip formatter={(value:number) => CURRENCY_FORMATTER.format(value)} />
                            <Legend layout="horizontal" verticalAlign="bottom" align="center" wrapperStyle={{fontSize: '10px'}} />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
                {/* Summary Table for Income */}
                {renderDetailedTable(incomeBreakdown.data, incomeBreakdown.totalForecast, incomeBreakdown.totalActual, true)}
            </div>
        </div>

        {/* --- NEW: DETAILED FIXED vs VARIABLE ANALYSIS --- */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                <Activity size={18} className="text-slate-900" />
                Analisi Dettagliata Costi Fissi e Variabili (Budget vs Consuntivo)
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                
                {/* Fixed Costs Column */}
                <div>
                    <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wide border-b border-slate-100 pb-2 mb-4">Costi Fissi</h4>
                    <div className="h-[250px] mb-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart layout="vertical" data={fixedCostTableData.slice(0, 10)} margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" width={140} tick={{fontSize: 10, fill: '#475569'}} />
                                <Tooltip cursor={{fill: 'transparent'}} formatter={(value:number) => CURRENCY_FORMATTER.format(value)} />
                                <Legend wrapperStyle={{fontSize: '10px'}} />
                                <Bar dataKey="forecast" name="Budget" fill="#cbd5e1" barSize={12} radius={[0, 4, 4, 0]} />
                                <Bar dataKey="actual" name="Consuntivo" fill="#334155" barSize={12} radius={[0, 4, 4, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    {/* Fixed Costs Table */}
                    {renderCostComparisonTable(fixedCostTableData)}
                </div>

                {/* Variable Costs Column */}
                <div>
                    <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wide border-b border-slate-100 pb-2 mb-4">Costi Variabili</h4>
                    <div className="h-[250px] mb-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart layout="vertical" data={variableCostTableData.slice(0, 10)} margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" width={140} tick={{fontSize: 10, fill: '#475569'}} />
                                <Tooltip cursor={{fill: 'transparent'}} formatter={(value:number) => CURRENCY_FORMATTER.format(value)} />
                                <Legend wrapperStyle={{fontSize: '10px'}} />
                                <Bar dataKey="forecast" name="Budget" fill="#fdba74" barSize={12} radius={[0, 4, 4, 0]} />
                                <Bar dataKey="actual" name="Consuntivo" fill="#ea580c" barSize={12} radius={[0, 4, 4, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    {/* Variable Costs Table */}
                    {renderCostComparisonTable(variableCostTableData)}
                </div>
            </div>
        </div>

        {/* --- TREND COMPOSITION STACKED AREA --- */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                <Layers size={18} className="text-slate-500" />
                Trend Composizione Spese
            </h3>
            <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={expenseTrendData.data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                        <defs>
                            {expenseTrendData.keys.map((key, index) => (
                                <linearGradient key={key} id={`color${index}`} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={COLORS[index % COLORS.length]} stopOpacity={0.8}/>
                                    <stop offset="95%" stopColor={COLORS[index % COLORS.length]} stopOpacity={0}/>
                                </linearGradient>
                            ))}
                        </defs>
                        <XAxis dataKey="name" tick={{fontSize: 12}} />
                        <YAxis tick={{fontSize: 12}} />
                        <Tooltip formatter={(value:number) => CURRENCY_FORMATTER.format(value)} />
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <Legend iconType="circle" wrapperStyle={{fontSize: '11px', paddingTop: '10px'}}/>
                        {expenseTrendData.keys.map((key, index) => (
                            <Area 
                                key={key}
                                type="monotone" 
                                dataKey={key} 
                                stackId="1" 
                                stroke={COLORS[index % COLORS.length]} 
                                fillOpacity={1} 
                                fill={`url(#color${index})`} 
                            />
                        ))}
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    </div>
  );
};

export default AnalyticsView;