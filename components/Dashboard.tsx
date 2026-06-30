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
import { Transaction, TransactionType, AppView, SPSnapshot, CEData } from '../types';
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
  ComposedChart
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
  initialData?: any;
  projects?: any[];
  spSnapshots?: SPSnapshot[];
  ceManualData?: Record<string, Partial<CEData>>;
}

const COLORS = ['#1e293b', '#475569', '#64748b', '#94a3b8', '#cbd5e1', '#e2e8f0', '#334155', '#0f172a', '#1e293b', '#334155', '#475569'];

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
  const currentYear = new Date().getFullYear();

  // Calcolo Rating Bancario (Basilea 3)
  const ratingData = useMemo(() => {
    const sortedSnapshots = [...spSnapshots].sort((a, b) => new Date(b.dataRiferimento).getTime() - new Date(a.dataRiferimento).getTime());
    const activeSP = sortedSnapshots[0] || null;
    const ratingYear = activeSP ? new Date(activeSP.dataRiferimento).getFullYear() : currentYear;
    
    const ceData = buildCEData(transactions, ratingYear, ceManualData[ratingYear.toString()]);
    const ceMetrics = calcCEMetrics(ceData, transactions);
    const spMetrics = activeSP ? calcSPMetrics(activeSP, ceMetrics, transactions) : null;
    
    if (!spMetrics) return { score: 0, label: 'B / C — Incompleto', color: 'text-rose-600', dscr: 0 };
    
    let score = 0;
    
    // PFN / EBITDA
    if (spMetrics.pfnSuEbitda <= 3) score += 1;
    else if (spMetrics.pfnSuEbitda <= 4.5) score += 0.5;
    
    // EBITDA / Oneri Fin.
    if (ceMetrics.oneriFin <= 0) score += 1;
    else {
      const ratio = ceMetrics.ebitdaTot / ceMetrics.oneriFin;
      if (ratio >= 3) score += 1;
      else if (ratio >= 1.5) score += 0.5;
    }
    
    // Current Ratio
    if (spMetrics.currentRatio >= 1.2) score += 1;
    else if (spMetrics.currentRatio >= 1.0) score += 0.5;
    
    // Solidità Patrimoniale
    if (spMetrics.soliditaPatr >= 0.3) score += 1;
    else if (spMetrics.soliditaPatr >= 0.15) score += 0.5;
    
    // Utile Netto %
    if (ceMetrics.utileNettoPercent >= 0.03) score += 1;
    else if (ceMetrics.utileNettoPercent >= 0) score += 0.5;
    
    // DSO
    if (spMetrics.dso <= 60) score += 1;
    else if (spMetrics.dso <= 90) score += 0.5;
    
    // DPO
    if (spMetrics.dpo >= 30 && spMetrics.dpo <= 90) score += 1;
    else if ((spMetrics.dpo >= 20 && spMetrics.dpo < 30) || (spMetrics.dpo > 90 && spMetrics.dpo <= 120)) score += 0.5;
    
    const label = score >= 5.5 ? 'AAA / AA — Eccellente' :
                  score >= 4 ? 'A / BBB — Solido' :
                  score >= 2.5 ? 'BB — Attenzione' :
                  'B / C — Critico';
                  
    const color = score >= 5.5 ? 'text-emerald-600' :
                  score >= 4 ? 'text-blue-600' :
                  score >= 2.5 ? 'text-amber-500' :
                  'text-rose-600';
                  
    return { score, label, color, dscr: ceMetrics.ebitdaTot / (ceMetrics.oneriFin || 1) };
  }, [transactions, spSnapshots, ceManualData, currentYear]);

  // Dati mensili per i tre grafici di andamento
  const monthlyComparisonData = useMemo(() => {
    const months = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
    let cumulative = initialAccounts?.reduce((sum, acc) => sum + (acc.saldoIniziale || 0), 0) || 0;
    
    return months.map((m, index) => {
      const monthTxs = transactions.filter(t => {
        const d = parseUTCDate(t.date);
        return d.getUTCFullYear() === currentYear && d.getUTCMonth() === index;
      });
      
      const entratePreviste = monthTxs
        .filter(t => t.type === TransactionType.INCOME && t.isForecast)
        .reduce((sum, t) => sum + getGrossAmount(t), 0);
        
      const entrateReali = monthTxs
        .filter(t => t.type === TransactionType.INCOME && !t.isForecast)
        .reduce((sum, t) => sum + getGrossAmount(t), 0);

      const uscitePreviste = monthTxs
        .filter(t => t.type === TransactionType.EXPENSE && t.isForecast && t.ceType !== 'ammortamento')
        .reduce((sum, t) => sum + getGrossAmount(t), 0);

      const usciteReali = monthTxs
        .filter(t => t.type === TransactionType.EXPENSE && !t.isForecast && t.ceType !== 'ammortamento')
        .reduce((sum, t) => sum + getGrossAmount(t), 0);
        
      cumulative += (entrateReali - usciteReali);
      
      return {
        name: m,
        EntratePreviste: entratePreviste,
        EntrateReali: entrateReali,
        UscitePreviste: uscitePreviste,
        UsciteReali: usciteReali,
        LiquiditaCumulata: cumulative
      };
    });
  }, [transactions, currentYear, initialAccounts]);

  // Costi Fissi con confronto Previsionale, Consuntivo e Scostamento
  const fixedCostTableData = useMemo(() => {
    const actTxs = transactions.filter(t =>
      !t.isForecast &&
      t.ceType !== 'ammortamento' &&
      parseUTCDate(t.date).getUTCFullYear() === currentYear
    );
    
    const prevTxs = transactions.filter(t =>
      t.isForecast &&
      t.ceType !== 'ammortamento' &&
      parseUTCDate(t.date).getUTCFullYear() === currentYear
    );

    return FIXED_COST_CATEGORIES.map(cat => {
      const forecast = prevTxs
        .filter(t => t.type === TransactionType.EXPENSE && t.category === cat)
        .reduce((sum, t) => sum + getGrossAmount(t), 0);
        
      const actual = actTxs
        .filter(t => t.type === TransactionType.EXPENSE && t.category === cat)
        .reduce((sum, t) => sum + getGrossAmount(t), 0);
        
      return {
        name: cat,
        forecast,
        actual,
        diff: actual - forecast
      };
    }).filter(item => item.forecast > 0 || item.actual > 0);
  }, [transactions, currentYear]);

  // Costi Variabili con confronto Previsionale, Consuntivo e Scostamento
  const variableCostTableData = useMemo(() => {
    const actTxs = transactions.filter(t =>
      !t.isForecast &&
      t.ceType !== 'ammortamento' &&
      parseUTCDate(t.date).getUTCFullYear() === currentYear
    );
    
    const prevTxs = transactions.filter(t =>
      t.isForecast &&
      t.ceType !== 'ammortamento' &&
      parseUTCDate(t.date).getUTCFullYear() === currentYear
    );

    return VARIABLE_COST_CATEGORIES.map(cat => {
      const forecast = prevTxs
        .filter(t => t.type === TransactionType.EXPENSE && t.category === cat)
        .reduce((sum, t) => sum + getGrossAmount(t), 0);
        
      const actual = actTxs
        .filter(t => t.type === TransactionType.EXPENSE && t.category === cat)
        .reduce((sum, t) => sum + getGrossAmount(t), 0);
        
      return {
        name: cat,
        forecast,
        actual,
        diff: actual - forecast
      };
    }).filter(item => item.forecast > 0 || item.actual > 0);
  }, [transactions, currentYear]);

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
              
              return (
                <tr key={item.name} className="hover:bg-slate-50/50">
                  <td className="px-3 py-2 font-medium text-slate-700 truncate max-w-[150px]" title={item.name}>
                    {item.name.split('] ')[1] || item.name}
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

  const { actualTransactions, totalIncome, totalExpense, balance, expenseData, fixedCostData, variableCostData } = useMemo(() => {
    const actTxs = transactions.filter(t =>
      !t.isForecast &&
      t.ceType !== 'ammortamento' &&
      parseUTCDate(t.date).getUTCFullYear() === currentYear
    );

    const inc = actTxs
      .filter(t => t.type === TransactionType.INCOME)
      .reduce((sum, t) => sum + getGrossAmount(t), 0);

    const exp = actTxs
      .filter(t => t.type === TransactionType.EXPENSE)
      .reduce((sum, t) => sum + getGrossAmount(t), 0);

    const expData = expenseCategories.map(cat => {
      const value = actTxs
        .filter(t => t.type === TransactionType.EXPENSE && t.category === cat)
        .reduce((sum, t) => sum + getGrossAmount(t), 0);
      return { name: cat, value };
    }).filter(item => item.value > 0).sort((a, b) => b.value - a.value);

    // Costi Fissi per categoria
    const fixedData = FIXED_COST_CATEGORIES.map(cat => {
      const value = actTxs
        .filter(t => t.type === TransactionType.EXPENSE && t.category === cat)
        .reduce((sum, t) => sum + getGrossAmount(t), 0);
      return { name: cat, value };
    }).filter(item => item.value > 0).sort((a, b) => b.value - a.value);

    // Costi Variabili per categoria
    const varData = VARIABLE_COST_CATEGORIES.map(cat => {
      const value = actTxs
        .filter(t => t.type === TransactionType.EXPENSE && t.category === cat)
        .reduce((sum, t) => sum + getGrossAmount(t), 0);
      return { name: cat, value };
    }).filter(item => item.value > 0).sort((a, b) => b.value - a.value);

    return { actualTransactions: actTxs, totalIncome: inc, totalExpense: exp, balance: inc - exp, expenseData: expData, fixedCostData: fixedData, variableCostData: varData };
  }, [transactions, currentYear, expenseCategories]);

  // Prepare data for Bar Chart (Last 6 months)
  const monthlyData = useMemo(() => {
    const today = new Date();
    const data = [];
    for (let i = 5; i >= 0; i--) {
      // Usiamo UTC local time matching per evitare sfasamenti sui fusi orari.
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const targetMonth = d.getMonth();
      const targetYear = d.getFullYear();
      const monthLabel = d.toLocaleString('it-IT', { month: 'short' });
      
      const monthTransactions = actualTransactions.filter(t => {
        const tDate = parseUTCDate(t.date);
        return tDate.getUTCMonth() === targetMonth && tDate.getUTCFullYear() === targetYear;
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
  }, [actualTransactions]);

  const ivaData = calcPosizIoneIVA(transactions, currentYear);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center no-print">
        <h2 className="text-2xl font-bold text-slate-800">Dashboard</h2>
        <div className="flex items-center gap-4">
          <HelpButton onClick={() => setShowHelp(true)} />
          <PDFExportButton 
            config={{
              elementId: "dashboard-report-content",
              nomeFile: "Dashboard_Finanziaria",
              titolo: "Dashboard Finanziaria",
              sottotitolo: "Riepilogo Consuntivo e Andamento",
              orientazione: "landscape"
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
          <SummaryCard title={`Entrate ${currentYear}`} amount={totalIncome} type="income" />
          <SummaryCard title={`Uscite ${currentYear}`} amount={totalExpense} type="expense" />
          <SummaryCard title={`Saldo ${currentYear}`} amount={balance} type="balance" />
          
          {/* Posizione IVA Card */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500 mb-1">Posizione IVA {currentYear}</p>
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

        {/* Rating Score Card (Valutazione Banca) */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <ShieldCheck size={20} className="text-slate-900" />
              Valutazione Banca (Rating Merito Creditizio)
            </h3>
            <span className={`text-sm font-black px-3 py-1 bg-slate-100 rounded-full ${ratingData.color}`}>
              Punteggio: {ratingData.score.toFixed(1)} / 7.0
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
            <div className="text-center p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Giudizio Sintetico</span>
              <span className={`text-xl font-black ${ratingData.color}`}>{ratingData.label}</span>
            </div>
            <div className="text-center p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Copertura Oneri (DSCR)</span>
              <span className="text-xl font-black text-slate-800 font-mono">
                {ratingData.dscr > 0 ? `${ratingData.dscr.toFixed(2)}x` : 'N/A'}
              </span>
            </div>
            <div className="text-center p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Livello di Rischio</span>
              <span className="text-xl font-black text-slate-800">
                {ratingData.score >= 5.5 ? 'Minimo' : ratingData.score >= 4 ? 'Basso' : ratingData.score >= 2.5 ? 'Medio' : 'Alto'}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Expense Breakdown Pie */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col">
            <h3 className="text-lg font-semibold text-slate-800 mb-4">Spese per Categoria</h3>
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
                Nessuna spesa registrata
              </div>
            )}
          </div>

          {/* Monthly Trend */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col">
            <h3 className="text-lg font-semibold text-slate-800 mb-6">Andamento Mensile</h3>
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
                  <Bar dataKey="Entrate" fill="#0f172a" radius={[4, 4, 0, 0]} barSize={20} />
                  <Bar dataKey="Uscite" fill="#64748b" radius={[4, 4, 0, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* --- COMPARISON CHARTS SECTION --- */}
        <div className="space-y-6">
          
          {/* Conto Corrente (Liquidità Cumulata) */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col w-full">
            <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
              <CalendarClock size={18} className="text-slate-900" />
              Andamento Conto Corrente (Liquidità Cumulata)
            </h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyComparisonData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                  <Tooltip 
                    formatter={(value: number) => CURRENCY_FORMATTER.format(value)}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Line type="monotone" dataKey="LiquiditaCumulata" name="Saldo Conto" stroke="#0f172a" strokeWidth={3} dot={{r: 4, fill: '#0f172a'}} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Confronto Entrate */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col w-full">
            <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
              <ArrowUpRight size={18} className="text-emerald-600" />
              Confronto Entrate (Consuntivo vs Previsionale)
            </h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={monthlyComparisonData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                  <Tooltip 
                    formatter={(value: number) => CURRENCY_FORMATTER.format(value)}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar dataKey="EntratePreviste" fill="#cbd5e1" radius={[4, 4, 0, 0]} name="Previsto" barSize={20} />
                  <Bar dataKey="EntrateReali" fill="#0f172a" radius={[4, 4, 0, 0]} name="Reale" barSize={20} />
                  <Line type="monotone" dataKey="EntratePreviste" stroke="#94a3b8" strokeDasharray="5 5" dot={false} strokeWidth={2} name="Previsto Trend" />
                  <Line type="monotone" dataKey="EntrateReali" stroke="#1e293b" strokeWidth={2} dot={{r: 3, fill: '#1e293b'}} name="Reale Trend" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Confronto Uscite */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col w-full">
            <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
              <ArrowDownRight size={18} className="text-rose-600" />
              Confronto Uscite (Consuntivo vs Previsionale)
            </h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={monthlyComparisonData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                  <Tooltip 
                    formatter={(value: number) => CURRENCY_FORMATTER.format(value)}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar dataKey="UscitePreviste" fill="#cbd5e1" radius={[4, 4, 0, 0]} name="Previsto" barSize={20} />
                  <Bar dataKey="UsciteReali" fill="#64748b" radius={[4, 4, 0, 0]} name="Reale" barSize={20} />
                  <Line type="monotone" dataKey="UscitePreviste" stroke="#94a3b8" strokeDasharray="5 5" dot={false} strokeWidth={2} name="Previsto Trend" />
                  <Line type="monotone" dataKey="UsciteReali" stroke="#475569" strokeWidth={2} dot={{r: 3, fill: '#475569'}} name="Reale Trend" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>

        {/* ─── COSTI FISSI E VARIABILI ───────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Costi Fissi Table */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col">
            <h3 className="text-lg font-semibold text-slate-800 mb-4">Costi Fissi</h3>
            {renderDashboardCostTable(fixedCostTableData)}
          </div>

          {/* Costi Variabili Table */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col">
            <h3 className="text-lg font-semibold text-slate-800 mb-4">Costi Variabili</h3>
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