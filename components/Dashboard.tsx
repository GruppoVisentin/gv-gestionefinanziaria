import React, { useState } from 'react';
import { FileCode, Receipt } from 'lucide-react';
import { Transaction, TransactionType, AppView } from '../types';
import SummaryCard from './SummaryCard';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import PDFExportButton from './PDFExportButton';
import { HelpButton } from './HelpPanel';
import HelpPanel from './HelpPanel';
import { calcPosizIoneIVA } from '../utils/gasCoreEngine';
import { CURRENCY_FORMATTER } from '../constants';

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

  const actualTransactions = transactions.filter(t =>
    !t.isForecast &&
    t.ceType !== 'ammortamento' &&
    new Date(t.date).getFullYear() === currentYear
  );

  const totalIncome = actualTransactions
    .filter(t => t.type === TransactionType.INCOME)
    .reduce((sum, t) => sum + getGrossAmount(t), 0);

  const totalExpense = actualTransactions
    .filter(t => t.type === TransactionType.EXPENSE)
    .reduce((sum, t) => sum + getGrossAmount(t), 0);

  const balance = totalIncome - totalExpense;

  // Prepare data for Pie Chart (Expenses by Category)
  const expenseData = expenseCategories.map(cat => {
    const value = actualTransactions
      .filter(t => t.type === TransactionType.EXPENSE && t.category === cat)
      .reduce((sum, t) => sum + getGrossAmount(t), 0);
    return { name: cat, value };
  }).filter(item => item.value > 0).sort((a, b) => b.value - a.value);

  // Prepare data for Bar Chart (Last 6 months)
  const getMonthlyData = () => {
    const today = new Date();
    const data = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const monthLabel = d.toLocaleString('it-IT', { month: 'short' });
      const monthTransactions = actualTransactions.filter(t => {
        const tDate = new Date(t.date);
        return tDate.getMonth() === d.getMonth() && tDate.getFullYear() === d.getFullYear();
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
  };

  const monthlyData = getMonthlyData();

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
          {/* Expense Breakdown */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col">
            <h3 className="text-lg font-semibold text-slate-800 mb-6">Spese per Categoria</h3>
            {expenseData.length > 0 ? (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={expenseData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {expenseData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value: number) => `€${value.toFixed(2)}`}
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-4 flex flex-wrap gap-2 justify-center">
                  {expenseData.slice(0, 5).map((entry, index) => (
                    <div key={entry.name} className="flex items-center text-xs text-slate-500">
                      <span className="w-2 h-2 rounded-full mr-1" style={{ backgroundColor: COLORS[index % COLORS.length] }}></span>
                      {entry.name}
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