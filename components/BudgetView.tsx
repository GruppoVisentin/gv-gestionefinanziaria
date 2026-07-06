import React, { useState, useMemo, useEffect } from 'react';
import { Transaction, BudgetData, BudgetRow, AppView, Project } from '../types';
import { aggregateByMonthAndType } from '../utils/gasCoreEngine';
import { exportBudgetPDF } from '../utils/budgetPdfExport';
import PDFExportButton from './PDFExportButton';
import InfoTooltip, { InfoTooltipWrapper } from './InfoTooltip';
import { HelpButton } from './HelpPanel';
import HelpPanel from './HelpPanel';
import { 
  Target, 
  TrendingUp, 
  TrendingDown, 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Save,
  AlertCircle,
  CheckCircle2,
  PieChart,
  Copy
} from 'lucide-react';

interface BudgetViewProps {
  transactions: Transaction[];
  budgetData: Record<string, BudgetData>;
  onBudgetChange: (anno: number, data: BudgetData) => void;
  onGoToManuale?: (section?: string, tab?: 'manuale' | 'glossario') => void;
  projects?: Project[];
}

const formatEuro = (val: number) => 
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(val);

const formatPercent = (val: number) => 
  new Intl.NumberFormat('it-IT', { style: 'percent', minimumFractionDigits: 1 }).format(val);

const DEFAULT_BUDGET_ROWS: BudgetRow[] = [
  { categoria: 'Ricavi Core (SAL/Commesse)', ceType: 'ricavo_core', budgetAnnuo: 0, budgetMensile: Array(12).fill(0) },
  { categoria: 'Vendite Immobiliari', ceType: 'ricavo_immobiliare', budgetAnnuo: 0, budgetMensile: Array(12).fill(0) },
  { categoria: 'Altri Ricavi', ceType: 'ricavo_altro', budgetAnnuo: 0, budgetMensile: Array(12).fill(0) },
  { categoria: 'Costi Variabili', ceType: 'costo_variabile', budgetAnnuo: 0, budgetMensile: Array(12).fill(0) },
  { categoria: 'Costi Fissi', ceType: 'costo_fisso', budgetAnnuo: 0, budgetMensile: Array(12).fill(0) },
  { categoria: 'Costi Studio', ceType: 'costo_studio', budgetAnnuo: 0, budgetMensile: Array(12).fill(0) },
  { categoria: 'Oneri Finanziari', ceType: 'onere_finanziario', budgetAnnuo: 0, budgetMensile: Array(12).fill(0) },
  { categoria: 'Compenso Soci', ceType: 'distribuzione_utile', budgetAnnuo: 0, budgetMensile: Array(12).fill(0) },
];

const BudgetView: React.FC<BudgetViewProps> = ({ transactions, budgetData, onBudgetChange, onGoToManuale, projects = [] }) => {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [isEditing, setIsEditing] = useState(false);
  const [showCopyBanner, setShowCopyBanner] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [modalita, setModalita] = useState<'cassa' | 'competenza'>('cassa');

  const currentBudget = useMemo(() => 
    budgetData[selectedYear.toString()] || { anno: selectedYear, righe: DEFAULT_BUDGET_ROWS }, 
    [budgetData, selectedYear]
  );

  const hasBudgetData = useMemo(() => {
    return currentBudget.righe.some(r => r.budgetAnnuo > 0);
  }, [currentBudget]);

  const previousYearBudget = useMemo(() => {
    return budgetData[(selectedYear - 1).toString()];
  }, [budgetData, selectedYear]);

  const handleCopyFromPreviousYear = () => {
    const annoPrecedente = selectedYear - 1;
    const budgetPrecedente = budgetData[annoPrecedente.toString()];

    if (!budgetPrecedente) {
      alert(`Nessun budget trovato per il ${annoPrecedente}`);
      return;
    }

    const nuovoBudget: BudgetData = {
      anno: selectedYear,
      righe: budgetPrecedente.righe.map(riga => ({
        ...riga,
        budgetAnnuo: riga.budgetAnnuo,
        budgetMensile: [...riga.budgetMensile],
      })),
    };

    const conferma = window.confirm(
      `Vuoi copiare il budget ${annoPrecedente} come base per il ${selectedYear}?\n` +
      `Potrai modificare tutti i valori dopo la copia.`
    );

    if (conferma) {
      onBudgetChange(selectedYear, nuovoBudget);
      setShowCopyBanner(true);
      setTimeout(() => setShowCopyBanner(false), 4000);
    }
  };

  const actuals = useMemo(() => 
    aggregateByMonthAndType(transactions, selectedYear, modalita, projects), 
    [transactions, selectedYear, modalita, projects]
  );

  const totalBudgetRevenues = useMemo(() => currentBudget.righe.filter(r => r.ceType.startsWith('ricavo')).reduce((sum, r) => sum + r.budgetAnnuo, 0), [currentBudget]);
  const totalActualRevenues = useMemo(() => currentBudget.righe.filter(r => r.ceType.startsWith('ricavo')).reduce((sum, r) => sum + Math.abs(actuals[r.ceType].reduce((a, b) => a + b, 0)), 0), [currentBudget, actuals]);
  const totalBudgetCosts = useMemo(() => currentBudget.righe.filter(r => !r.ceType.startsWith('ricavo') && r.ceType !== 'distribuzione_utile').reduce((sum, r) => sum + r.budgetAnnuo, 0), [currentBudget]);
  const totalActualCosts = useMemo(() => currentBudget.righe.filter(r => !r.ceType.startsWith('ricavo') && r.ceType !== 'distribuzione_utile').reduce((sum, r) => sum + Math.abs(actuals[r.ceType].reduce((a, b) => a + b, 0)), 0), [currentBudget, actuals]);

  const handleBudgetChange = (index: number, value: number) => {
    const newRighe = [...currentBudget.righe];
    newRighe[index] = { 
      ...newRighe[index], 
      budgetAnnuo: value,
      budgetMensile: Array(12).fill(value / 12) // Distribuzione uniforme di default
    };
    onBudgetChange(selectedYear, { ...currentBudget, righe: newRighe });
  };

  const calculateScostamento = (actual: number, budget: number, ceType: string) => {
    const isIncome = ceType.startsWith('ricavo');
    const diff = isIncome ? (actual - budget) : (budget - actual);
    const isPositive = diff >= 0;
    return { diff, isPositive };
  };

  return (
    <div id="budget-content" className="space-y-6 animate-in fade-in duration-500 pb-20">
      {showCopyBanner && (
        <div className="bg-slate-50 border-l-4 border-slate-400 p-4 rounded-r-xl animate-in slide-in-from-top-4 duration-300 no-print">
          <div className="flex items-center gap-3">
            <AlertCircle className="text-slate-500" size={20} />
            <div>
              <p className="text-sm font-bold text-slate-800">⚠️ Budget copiato da {selectedYear - 1} come base.</p>
              <p className="text-xs text-slate-700">Ricorda di aggiornare i target in base alla strategia {selectedYear}.</p>
            </div>
          </div>
        </div>
      )}

      <div id="budget-report-content" className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
          <div>
            <h2 className="text-2xl font-black text-slate-900 flex items-center gap-3">
              <Target className="text-slate-900" />
              Budget e Scostamenti
            </h2>
            <p className="text-slate-500 text-sm mt-1">Pianificazione annuale e monitoraggio obiettivi</p>
          </div>

          <div className="flex items-center gap-4">
            <HelpButton onClick={() => setShowHelp(true)} />

            {/* Toggle modalità */}
            <div className="flex items-center bg-slate-100 rounded-xl p-1 no-print">
              <button
                onClick={() => setModalita('cassa')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  modalita === 'cassa'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Per cassa
              </button>
              <button
                onClick={() => setModalita('competenza')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  modalita === 'competenza'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Per competenza
              </button>
            </div>

            <div className="flex items-center bg-slate-100 rounded-xl p-1 no-print">
              <button 
                onClick={() => setSelectedYear(prev => prev - 1)}
                className="p-2 hover:bg-white rounded-lg transition-all text-slate-600"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="px-4 font-black text-slate-800">{selectedYear}</span>
              <button 
                onClick={() => setSelectedYear(prev => prev + 1)}
                className="p-2 hover:bg-white rounded-lg transition-all text-slate-600"
              >
                <ChevronRight size={18} />
              </button>
            </div>

            {!hasBudgetData && previousYearBudget && (
              <button
                onClick={handleCopyFromPreviousYear}
                className="no-print flex items-center gap-2 bg-slate-100 text-slate-600 px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-200 transition-all"
              >
                <Copy size={16} />
                Copia da {selectedYear - 1} come base
              </button>
            )}

            <button
              onClick={() => exportBudgetPDF({ selectedYear, budgetData: currentBudget, actuals, modalita })}
              className="flex items-center gap-1.5 px-3 py-2 border-2 border-slate-200 text-slate-600 hover:border-slate-400 hover:text-slate-800 text-xs font-black rounded-xl transition-all active:scale-95 shadow-sm bg-white"
              title="Esporta Budget e Scostamenti in PDF Tecnico"
            >
              <span>Esporta PDF</span>
            </button>
          </div>
        </div>

      {/* Summary Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {currentBudget.righe.filter(r => ['ricavo_core', 'costo_variabile', 'costo_fisso'].includes(r.ceType)).map(r => {
          const actualTotal = Math.abs(actuals[r.ceType].reduce((a, b) => a + b, 0));
          const { diff, isPositive } = calculateScostamento(actualTotal, r.budgetAnnuo, r.ceType);
          const pct = r.budgetAnnuo > 0 ? (actualTotal / r.budgetAnnuo) : 0;

          // Map category to glossary term if possible
          const termId = r.ceType === 'ricavo_core' ? 'fatturato' : 
                         r.ceType === 'costo_variabile' ? 'primo_margine' : 
                         r.ceType === 'costo_fisso' ? 'ebitda' : undefined;

          return (
            <div key={r.ceType} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{r.categoria}</span>
                  {termId && (
                    <InfoTooltip 
                      termId={termId} 
                      calculatedValues={`${r.categoria}:\n- Consuntivo YTD: ${formatEuro(actualTotal)}\n- Budget Target: ${formatEuro(r.budgetAnnuo)}\n- Scostamento: ${isPositive ? '+' : ''}${formatEuro(diff)} (${formatPercent(pct)})`}
                    />
                  )}
                </div>
                {isPositive ? <CheckCircle2 size={16} className="text-slate-900" /> : <AlertCircle size={16} className="text-slate-500" />}
              </div>
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-2xl font-black text-slate-900">{formatEuro(actualTotal)}</div>
                  <div className="text-[10px] text-slate-500 mt-1">Target: {formatEuro(r.budgetAnnuo)}</div>
                </div>
                <div className={`text-right ${isPositive ? 'text-slate-900' : 'text-slate-600'}`}>
                  <div className="text-sm font-black">{formatPercent(pct)}</div>
                  <div className="text-[10px] font-bold">{isPositive ? '+' : ''}{formatEuro(diff)}</div>
                </div>
              </div>
              <div className="mt-4 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-1000 ${isPositive ? 'bg-slate-900' : 'bg-slate-50'}`}
                  style={{ width: `${Math.min(pct * 100, 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Budget Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-visible">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="py-4 px-6 text-[10px] font-black text-slate-500 uppercase tracking-wider">Categoria</th>
              <th className="py-4 px-6 text-[10px] font-black text-amber-500 uppercase tracking-wider text-right">
                <InfoTooltipWrapper className="justify-end w-full">
                  <span>Budget Annuo 🟡</span>
                  <InfoTooltip 
                    termId="budget_annuo" 
                    calculatedValues={`Budget Annuo:\n- Target Ricavi: ${formatEuro(totalBudgetRevenues)}\n- Target Costi Operativi: ${formatEuro(totalBudgetCosts)}\n- Target Totale (Netto): ${formatEuro(totalBudgetRevenues - totalBudgetCosts)}`}
                  />
                </InfoTooltipWrapper>
              </th>
              <th className="py-4 px-6 text-[10px] font-black text-sky-500 uppercase tracking-wider text-right">
                <InfoTooltipWrapper className="justify-end w-full">
                  <span>Consuntivo YTD 🔵</span>
                  <InfoTooltip 
                    termId="consuntivo_ytd" 
                    calculatedValues={`Consuntivo YTD:\n- Consuntivo Ricavi YTD: ${formatEuro(totalActualRevenues)}\n- Consuntivo Costi YTD: ${formatEuro(totalActualCosts)}\n- Risultato Netto YTD: ${formatEuro(totalActualRevenues - totalActualCosts)}`}
                  />
                </InfoTooltipWrapper>
              </th>
              <th className="py-4 px-6 text-[10px] font-black text-emerald-500 uppercase tracking-wider text-right">
                <InfoTooltipWrapper className="justify-end w-full">
                  <span>Scostamento 🟢</span>
                  <InfoTooltip 
                    termId="scostamento_budget" 
                    calculatedValues={`Scostamento Budget:\n- Scostamento Ricavi: ${totalActualRevenues - totalBudgetRevenues >= 0 ? '+' : ''}${formatEuro(totalActualRevenues - totalBudgetRevenues)}\n- Scostamento Costi: ${totalActualCosts - totalBudgetCosts <= 0 ? '-' : '+'}${formatEuro(totalActualCosts - totalBudgetCosts)}\n- Differenza Netta: ${formatEuro((totalActualRevenues - totalActualCosts) - (totalBudgetRevenues - totalBudgetCosts))}`}
                  />
                </InfoTooltipWrapper>
              </th>
              <th className="py-4 px-6 text-[10px] font-black text-indigo-500 uppercase tracking-wider text-right">
                <InfoTooltipWrapper className="justify-end w-full">
                  <span>Avanzamento %</span>
                  <InfoTooltip 
                    termId="avanzamento_budget" 
                    calculatedValues={`Avanzamento Target %:\n- Ricavi realizzati: ${formatPercent(totalBudgetRevenues > 0 ? totalActualRevenues / totalBudgetRevenues : 0)}\n- Budget Costi spesi: ${formatPercent(totalBudgetCosts > 0 ? totalActualCosts / totalBudgetCosts : 0)}`}
                  />
                </InfoTooltipWrapper>
              </th>
            </tr>
          </thead>
          <tbody>
            {currentBudget.righe.map((r, i) => {
              const actualTotal = Math.abs(actuals[r.ceType].reduce((a, b) => a + b, 0));
              const { diff, isPositive } = calculateScostamento(actualTotal, r.budgetAnnuo, r.ceType);
              const pct = r.budgetAnnuo > 0 ? (actualTotal / r.budgetAnnuo) : 0;

              return (
                <tr key={r.ceType} className="hover:bg-slate-50/50 transition-colors border-b border-slate-100">
                  <td className="py-4 px-6">
                    <div className="text-sm font-bold text-slate-800">{r.categoria}</div>
                    <div className="text-[10px] text-slate-400 font-mono uppercase">{r.ceType}</div>
                  </td>
                  <td className="py-4 px-6">
                    <div className="flex items-center justify-end bg-amber-50 border border-amber-200 border-dashed rounded-xl px-3 py-2">
                      <span className="text-amber-400 mr-2 text-xs">✏️</span>
                      <input 
                        type="number"
                        value={r.budgetAnnuo || ''}
                        placeholder="0"
                        onChange={(e) => handleBudgetChange(i, parseFloat(e.target.value) || 0)}
                        className="w-24 bg-transparent text-right text-sm font-black text-amber-900 outline-none"
                      />
                    </div>
                  </td>
                  <td className="py-4 px-6 text-right">
                    <div className="bg-sky-50 border border-sky-200 rounded-xl px-3 py-2 text-sm font-black text-sky-900 inline-block min-w-[120px]">
                      {formatEuro(actualTotal)}
                    </div>
                  </td>
                  <td className="py-4 px-6 text-right">
                    <div className={`text-sm font-black px-3 py-2 rounded-xl inline-block min-w-[100px] ${
                      isPositive ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100'
                    }`}>
                      {isPositive ? '+' : ''}{formatEuro(diff)}
                    </div>
                  </td>
                  <td className="py-4 px-6 text-right">
                    <div className={`text-sm font-black px-3 py-2 rounded-xl inline-block ${
                      isPositive ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-50 text-slate-600'
                    }`}>
                      {formatPercent(pct)}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-6 p-4 bg-slate-50 rounded-2xl border border-slate-200">
        <div className="flex items-center gap-2 text-[10px] font-bold text-sky-600">
          <div className="w-3 h-3 rounded bg-sky-100 border border-sky-300" />
          CONSUNTIVO YTD (AUTO)
        </div>
        <div className="flex items-center gap-2 text-[10px] font-bold text-amber-600">
          <div className="w-3 h-3 rounded bg-amber-50 border border-amber-300 border-dashed" />
          BUDGET ANNUO (MANUALE)
        </div>
        <div className="flex items-center gap-2 text-[10px] font-bold text-emerald-600">
          <div className="w-3 h-3 rounded bg-emerald-100 border border-emerald-300" />
          SCOSTAMENTO POSITIVO
        </div>
        <div className="flex items-center gap-2 text-[10px] font-bold text-rose-600">
          <div className="w-3 h-3 rounded bg-rose-100 border border-rose-300" />
          SCOSTAMENTO NEGATIVO
        </div>
      </div>
      </div>
      
      <HelpPanel 
        isOpen={showHelp}
        onClose={() => setShowHelp(false)}
        currentView={AppView.BUDGET}
        onGoToManuale={onGoToManuale}
      />
    </div>
  );
};

export default BudgetView;
