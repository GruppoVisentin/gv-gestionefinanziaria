import React, { useState } from 'react';
import { 
  Transaction, 
  CEData, 
  BudgetData, 
  SPSnapshot, 
  RimanenzeData, 
  InitialBalanceBreakdown,
  AppView,
  Project,
  SaldoInizialeCashFlow
} from '../types';
import CEView from './CEView';
import SPView from './SPView';
import BudgetView from './BudgetView';
import RatingView from './RatingView';
import AnalisiView from './AnalisiView';
import IVAView from './IVAView';
import PDFExportButton from './PDFExportButton';
import { 
  TrendingUp, 
  Building2, 
  Target, 
  ShieldCheck, 
  BarChart2, 
  Receipt,
  LayoutDashboard,
  ArrowRight
} from 'lucide-react';

interface BilancioViewProps {
  transactions: Transaction[];
  initialData: InitialBalanceBreakdown;
  saldoInizialeCF: SaldoInizialeCashFlow;
  ceManualData: Record<string, Partial<CEData>>;
  onManualDataChange: (anno: number, data: Partial<CEData>) => void;
  spSnapshots: SPSnapshot[];
  onUpdateSnapshots: (snaps: SPSnapshot[]) => void;
  budgetData: Record<string, BudgetData>;
  onBudgetChange: (anno: number, data: BudgetData) => void;
  oreStorico: Record<string, number>;
  setOreStorico: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  oreOperaiStorico: Record<string, any>;
  setOreOperaiStorico: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  rimanenze: RimanenzeData;
  onRimanenzeChange: (anno: number, data: any) => void;
  onGoToManuale: (section?: string, tab?: 'manuale' | 'glossario') => void;
  aliquotaIRES: number;
  aliquotaIRAP: number;
  onChangeAliquotaIRES: (v: number) => void;
  onChangeAliquotaIRAP: (v: number) => void;
  initialTab?: 'summary' | 'pl' | 'sp' | 'budget' | 'rating' | 'analisi' | 'iva';
  projects?: Project[];
}

const BilancioView: React.FC<BilancioViewProps> = (props) => {
  const [activeTab, setActiveTab] = useState<'summary' | 'pl' | 'sp' | 'budget' | 'rating' | 'analisi' | 'iva'>(props.initialTab === 'pl' ? 'pl' : (props.initialTab as any) || 'summary');

  // Sync with initialTab if it changes (e.g. when navigating from HomeScreen multiple times)
  React.useEffect(() => {
    if (props.initialTab) {
      setActiveTab(props.initialTab as any);
    }
  }, [props.initialTab]);

  const tabs = [
    { id: 'summary', label: 'Riepilogo Generale', icon: LayoutDashboard, color: 'text-slate-900', bgColor: 'bg-slate-100' },
    { id: 'pl', label: 'P&L (Conto Economico)', icon: TrendingUp, color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
    { id: 'sp', label: 'Stato Patrimoniale', icon: Building2, color: 'text-blue-600', bgColor: 'bg-blue-50' },
    { id: 'budget', label: 'Budget & Forecast', icon: Target, color: 'text-purple-600', bgColor: 'bg-purple-50' },
    { id: 'rating', label: 'Rating & Banche', icon: ShieldCheck, color: 'text-rose-600', bgColor: 'bg-rose-50' },
    { id: 'analisi', label: 'Analisi & Indici', icon: BarChart2, color: 'text-cyan-600', bgColor: 'bg-cyan-50' },
    { id: 'iva', label: 'Posizione IVA', icon: Receipt, color: 'text-amber-600', bgColor: 'bg-amber-50' },
  ];

  return (
    <div id="bilancio-content" className="space-y-6 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between no-print">
        <div>
          <h2 className="text-2xl font-black text-slate-900">Bilancio & Analisi</h2>
          <p className="text-sm text-slate-500">Gestione completa della salute finanziaria del Gruppo Visentin</p>
        </div>
      </div>

      {/* Internal Tabs Navigation */}
      <div className="flex bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm overflow-x-auto scrollbar-hide no-print">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2.5 px-5 py-2.5 rounded-xl text-xs font-black whitespace-nowrap transition-all ${
              activeTab === tab.id 
                ? `${tab.bgColor} ${tab.color} shadow-sm ring-1 ring-inset ring-slate-200` 
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
            }`}
          >
            <tab.icon size={16} className={activeTab === tab.id ? tab.color : 'text-slate-400'} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="animate-in fade-in duration-500">
        {activeTab === 'summary' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Quick Links / Summary Cards */}
            <button 
              onClick={() => setActiveTab('pl')}
              className="group bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md hover:border-emerald-200 transition-all text-left"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                  <TrendingUp size={24} />
                </div>
                <ArrowRight size={20} className="text-slate-300 group-hover:text-emerald-500 transition-colors" />
              </div>
              <h3 className="text-lg font-black text-slate-900">Conto Economico</h3>
              <p className="text-sm text-slate-500 mt-1">Analisi ricavi, margini e EBITDA. Monitora la redditività aziendale.</p>
            </button>

            <button 
              onClick={() => setActiveTab('sp')}
              className="group bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-200 transition-all text-left"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <Building2 size={24} />
                </div>
                <ArrowRight size={20} className="text-slate-300 group-hover:text-blue-500 transition-colors" />
              </div>
              <h3 className="text-lg font-black text-slate-900">Stato Patrimoniale</h3>
              <p className="text-sm text-slate-500 mt-1">Patrimonio, debiti e liquidità. La solidità del Gruppo Visentin.</p>
            </button>

            <button 
              onClick={() => setActiveTab('budget')}
              className="group bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md hover:border-purple-200 transition-all text-left"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-purple-50 text-purple-600 rounded-2xl group-hover:bg-purple-600 group-hover:text-white transition-colors">
                  <Target size={24} />
                </div>
                <ArrowRight size={20} className="text-slate-300 group-hover:text-purple-500 transition-colors" />
              </div>
              <h3 className="text-lg font-black text-slate-900">Budget & Forecast</h3>
              <p className="text-sm text-slate-500 mt-1">Confronto tra obiettivi e realtà. Pianifica la crescita futura.</p>
            </button>

            <button 
              onClick={() => setActiveTab('rating')}
              className="group bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md hover:border-rose-200 transition-all text-left"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl group-hover:bg-rose-600 group-hover:text-white transition-colors">
                  <ShieldCheck size={24} />
                </div>
                <ArrowRight size={20} className="text-slate-300 group-hover:text-rose-500 transition-colors" />
              </div>
              <h3 className="text-lg font-black text-slate-900">Rating & Banche</h3>
              <p className="text-sm text-slate-500 mt-1">Analisi Centrale Rischi e merito creditizio. Gestisci il rapporto con gli istituti.</p>
            </button>

            <button 
              onClick={() => setActiveTab('analisi')}
              className="group bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md hover:border-cyan-200 transition-all text-left"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-cyan-50 text-cyan-600 rounded-2xl group-hover:bg-cyan-600 group-hover:text-white transition-colors">
                  <BarChart2 size={24} />
                </div>
                <ArrowRight size={20} className="text-slate-300 group-hover:text-cyan-500 transition-colors" />
              </div>
              <h3 className="text-lg font-black text-slate-900">Analisi & Indici</h3>
              <p className="text-sm text-slate-500 mt-1">KPI, DSCR e indici di bilancio. I numeri sacri del controllo di gestione.</p>
            </button>

            <button 
              onClick={() => setActiveTab('iva')}
              className="group bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md hover:border-amber-200 transition-all text-left"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl group-hover:bg-amber-600 group-hover:text-white transition-colors">
                  <Receipt size={24} />
                </div>
                <ArrowRight size={20} className="text-slate-300 group-hover:text-amber-500 transition-colors" />
              </div>
              <h3 className="text-lg font-black text-slate-900">Posizione IVA</h3>
              <p className="text-sm text-slate-500 mt-1">Monitoraggio IVA a debito/credito. Prevedi i versamenti F24.</p>
            </button>
          </div>
        )}
        {activeTab === 'pl' && (
          <CEView 
            transactions={props.transactions}
            manualData={props.ceManualData}
            onManualDataChange={props.onManualDataChange}
            budgetData={props.budgetData}
            rimanenze={props.rimanenze}
            onRimanenzeChange={props.onRimanenzeChange}
            onGoToManuale={props.onGoToManuale}
            projects={props.projects}
            initialData={props.initialData}
            aliquotaIRES={props.aliquotaIRES}
            aliquotaIRAP={props.aliquotaIRAP}
          />
        )}
        {activeTab === 'sp' && (
          <SPView 
            transactions={props.transactions}
            initialData={props.initialData}
            snapshots={props.spSnapshots}
            onUpdateSnapshots={props.onUpdateSnapshots}
            ceManualData={props.ceManualData}
            onGoToManuale={props.onGoToManuale}
            saldoInizialeCF={props.saldoInizialeCF}
            rimanenze={props.rimanenze}
            projects={props.projects}
            aliquotaIRES={props.aliquotaIRES}
            aliquotaIRAP={props.aliquotaIRAP}
          />
        )}
        {activeTab === 'budget' && (
          <BudgetView 
            transactions={props.transactions}
            budgetData={props.budgetData}
            onBudgetChange={props.onBudgetChange}
            onGoToManuale={props.onGoToManuale}
            projects={props.projects}
          />
        )}
        {activeTab === 'rating' && (
          <RatingView 
            transactions={props.transactions}
            spSnapshots={props.spSnapshots}
            ceManualData={props.ceManualData}
            onGoToManuale={props.onGoToManuale}
            projects={props.projects}
            initialData={props.initialData}
            rimanenze={props.rimanenze}
            aliquotaIRES={props.aliquotaIRES}
            aliquotaIRAP={props.aliquotaIRAP}
          />
        )}
        {activeTab === 'analisi' && (
          <AnalisiView 
            transactions={props.transactions}
            ceManualData={props.ceManualData}
            oreStorico={props.oreStorico}
            setOreStorico={props.setOreStorico}
            oreOperaiStorico={props.oreOperaiStorico}
            setOreOperaiStorico={props.setOreOperaiStorico}
            rimanenze={props.rimanenze}
            onGoToManuale={props.onGoToManuale}
            aliquotaIRES={props.aliquotaIRES}
            aliquotaIRAP={props.aliquotaIRAP}
            onChangeAliquotaIRES={props.onChangeAliquotaIRES}
            onChangeAliquotaIRAP={props.onChangeAliquotaIRAP}
            initialData={props.initialData}
            projects={props.projects}
          />
        )}
        {activeTab === 'iva' && (
          <IVAView 
            transactions={props.transactions} 
            onGoToManuale={props.onGoToManuale}
          />
        )}
      </div>
    </div>
  );
};

export default BilancioView;
