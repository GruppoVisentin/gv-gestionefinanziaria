import React, { useState, useMemo } from 'react';
import { parseUTCDate } from '../utils/gasCoreEngine';
import { FileCode, Receipt } from 'lucide-react';
import { Transaction, TransactionType, AppView } from '../types';
import SummaryCard from './SummaryCard';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import PDFExportButton from './PDFExportButton';
import { HelpButton } from './HelpPanel';
import HelpPanel from './HelpPanel';
import { calcPosizIoneIVA } from '../utils/gasCoreEngine';
import { CURRENCY_FORMATTER, FIXED_COST_CATEGORIES, VARIABLE_COST_CATEGORIES } from '../constants';

interface DashboardProps {
  transactions: Transaction[];
  expenseCategories: string[];
  onGoToManuale?: (section?: string, tab?: 'manuale' | 'glossario') => void;
}

const COLORS = ['#1e293b', '#475569', '#64748b', '#94a3b8', '#cbd5e1', '#e2e8f0', '#334155', '#0f172a', '#1e293b', '#334155', '#475569'];

const getGrossAmount = (t: Transaction) => t.amount * (1 + (t.vatRate || 0) / 100);

const Dashboard: React.FC<DashboardProps> = ({ transactions, expenseCategories, onGoToManuale }) => {
  const [showHelp, setShowHelp] = useState(false);
  // Filter out Forecasts for the main dashboard. Only show Actuals.
  const currentYear = new Date().getFullYear();

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

        {/* ─── COSTI FISSI E VARIABILI ───────────────────────────── */}
        {(fixedCostData.length > 0 || variableCostData.length > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Costi Fissi */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-800">Costi Fissi</h3>
                <span className="text-sm font-bold text-slate-700 bg-slate-100 px-3 py-1 rounded-full">
                  {CURRENCY_FORMATTER.format(fixedCostData.reduce((s, i) => s + i.value, 0))}
                </span>
              </div>
              {fixedCostData.length > 0 ? (
                <div className="space-y-3">
                  {fixedCostData.map((item) => {
                    const maxVal = fixedCostData[0].value;
                    const pct = maxVal > 0 ? (item.value / maxVal) * 100 : 0;
                    return (
                      <div key={item.name}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-slate-600 truncate mr-2" title={item.name}>{item.name}</span>
                          <span className="text-slate-800 font-semibold shrink-0">{CURRENCY_FORMATTER.format(item.value)}</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-1.5">
                          <div className="bg-slate-700 h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-slate-400">Nessun costo fisso registrato</p>
              )}
            </div>

            {/* Costi Variabili */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-800">Costi Variabili</h3>
                <span className="text-sm font-bold text-slate-700 bg-slate-100 px-3 py-1 rounded-full">
                  {CURRENCY_FORMATTER.format(variableCostData.reduce((s, i) => s + i.value, 0))}
                </span>
              </div>
              {variableCostData.length > 0 ? (
                <div className="space-y-3">
                  {variableCostData.map((item) => {
                    const maxVal = variableCostData[0].value;
                    const pct = maxVal > 0 ? (item.value / maxVal) * 100 : 0;
                    return (
                      <div key={item.name}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-slate-600 truncate mr-2" title={item.name}>{item.name}</span>
                          <span className="text-slate-800 font-semibold shrink-0">{CURRENCY_FORMATTER.format(item.value)}</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-1.5">
                          <div className="bg-slate-500 h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-slate-400">Nessun costo variabile registrato</p>
              )}
            </div>

          </div>
        )}
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