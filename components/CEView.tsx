import React, { useState, useMemo } from 'react';
import { Transaction, CEData, CERow, BudgetData, RimanenzeAnno, RimanenzeData, AppView } from '../types';
import { buildCEData, calcCEMetrics, calcScostamenti, calcEffettoRimanenze } from '../utils/gasCoreEngine';
import { exportCEPDF } from '../utils/cePdfExport';
import InfoTooltip, { InfoTooltipWrapper } from './InfoTooltip';
import CalcoloDrawer, { FormulaStep } from './CalcoloDrawer';
import { HelpButton } from './HelpPanel';
import HelpPanel from './HelpPanel';
import { 
  ChevronLeft, 
  ChevronRight, 
  TrendingUp, 
  PieChart, 
  Target,
  AlertCircle,
  CheckCircle2,
  Info
} from 'lucide-react';

interface CEViewProps {
  transactions: Transaction[];
  manualData: Record<string, Partial<CEData>>;
  onManualDataChange: (anno: number, data: Partial<CEData>) => void;
  budgetData?: Record<string, BudgetData>;
  rimanenze?: RimanenzeData;
  onRimanenzeChange?: (anno: number, data: RimanenzeAnno) => void;
  onGoToManuale?: (section?: string, tab?: 'manuale' | 'glossario') => void;
}

const formatEuro = (val: number) => 
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(val);

const formatPercent = (val: number) => 
  new Intl.NumberFormat('it-IT', { style: 'percent', minimumFractionDigits: 1 }).format(val);

const MONTHS = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

const ManualCell = ({ value, onChange, month }: { value: number, onChange: (m: number, v: number) => void, month: number }) => (
  <td className="p-1 min-w-[100px]">
    <div className="flex items-center bg-amber-50 border border-amber-300 border-dashed rounded px-2 py-1">
      <span className="text-amber-400 mr-1 text-[10px]">✏️</span>
      <input
        type="number"
        value={value || ''}
        placeholder="0"
        onChange={e => onChange(month, parseFloat(e.target.value) || 0)}
        className="w-full bg-transparent text-right text-xs font-medium text-amber-900 outline-none"
      />
    </div>
  </td>
);

const AutoCell = ({ value }: { value: number }) => (
  <td className="p-1 min-w-[100px] relative group">
    <div className="bg-sky-50 border border-sky-200 rounded px-2 py-1 text-right text-xs font-medium text-sky-900">
      {formatEuro(value)}
    </div>
    <span className="absolute -top-1 -right-1 text-[7px] font-bold bg-sky-900 text-white px-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">AUTO</span>
  </td>
);

const CalcCell = ({ value, isKPI }: { value: number, isKPI?: boolean }) => (
  <td className="p-1 min-w-[100px]">
    <div className={`
      ${isKPI ? 'bg-[#222222] text-white' : 'bg-emerald-50 text-emerald-900'}
      border border-emerald-200 rounded px-2 py-1 text-right text-xs font-bold
    `}>
      {formatEuro(value)}
    </div>
  </td>
);

const ProjectionCell = ({ value }: { value: number }) => (
  <td className="p-1 min-w-[110px]">
    <div className="bg-violet-50 border border-violet-200 border-dashed rounded px-2 py-1 text-right text-xs italic text-violet-900 font-bold">
      📈 {formatEuro(value)}
    </div>
  </td>
);

const CEView: React.FC<CEViewProps> = ({
  transactions,
  manualData,
  onManualDataChange,
  budgetData,
  rimanenze,
  onRimanenzeChange,
  onGoToManuale,
}) => {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [activeTab, setActiveTab] = useState<'ytd' | 'projection' | 'monthly' | 'scostamenti'>('ytd');
  const [meseScostamento, setMeseScostamento] = useState<number | null>(null); // null = YTD
  const [modalita, setModalita] = useState<'cassa' | 'competenza'>('cassa');
  const [showHelp, setShowHelp] = useState(false);
  const [drawerKpi, setDrawerKpi] = useState<string | null>(null);

  const ceData = useMemo(() => 
    buildCEData(transactions, selectedYear, manualData[selectedYear.toString()], modalita), 
    [transactions, selectedYear, manualData, modalita]
  );

  const metrics = useMemo(() => calcCEMetrics(ceData, transactions), [ceData, transactions]);

  const scostamenti = useMemo(() => {
    return calcScostamenti(
      transactions,
      selectedYear,
      meseScostamento,
      budgetData?.[selectedYear.toString()],
      manualData[selectedYear.toString()]
    );
  }, [transactions, selectedYear, meseScostamento, budgetData, manualData]);

  const rimanenzeAnno = rimanenze?.[selectedYear.toString()];

  const effettoRimanenze = useMemo(() => {
    if (!rimanenzeAnno) return null;
    return calcEffettoRimanenze(rimanenzeAnno, metrics);
  }, [rimanenzeAnno, metrics]);

  // Helper per aggiornare un singolo campo delle rimanenze
  const handleRimanenzeField = (field: keyof RimanenzeAnno, value: number | string) => {
    const current = rimanenzeAnno ?? {
      wipInizio: 0, wipFine: 0,
      materialiInizio: 0, materialiFine: 0,
    };
    onRimanenzeChange?.(selectedYear, { ...current, [field]: value });
  };

  const handleManualChange = (field: keyof CEData, month: number, value: number) => {
    const currentArray = [...(ceData[field] as number[])];
    currentArray[month] = value;
    onManualDataChange(selectedYear, { [field]: currentArray });
  };

  // Helper locale
  const s12 = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

  const buildDrawerProps = (kpiId: string) => {
    const fat  = metrics.fatturato;
    const cVar = metrics.totCostiVar.reduce((a, b) => a + b, 0);
    const pMar = metrics.primoMargineTot;
    const cStu = metrics.costiStudioTot;
    const amm  = s12(ceData.ammortamenti);
    // costiFissiTot include ammortamenti — li sottraiamo per avere solo operativi
    const cFis = metrics.costiFissiTot - cStu - amm;
    const onFin = metrics.oneriFin;
    const prFin = metrics.proventiFin;
    const str  = metrics.straordinario;
    const imp  = s12(ceData.imposte);
    const ebit = metrics.ebitdaTot;
    const ebit2 = metrics.ebitTot;
    const ebt  = metrics.ebt.reduce((a, b) => a + b, 0);
    const utile = metrics.utileNettoTot;

    const txAnno = transactions.filter(tx =>
      new Date(tx.date).getFullYear() === selectedYear &&
      !tx.isForecast && tx.ceType
    );

    const configs: Record<string, {
      nome: string; valore: number; percentuale?: number;
      steps: FormulaStep[]; ceTypes: string[];
    }> = {
      fatturato: {
        nome: 'Fatturato / Ricavi Core',
        valore: fat,
        percentuale: 1,
        steps: [
          { label: 'Ricavi Core (SAL, saldi, vendite)', valore: s12(ceData.ricaviCore), isPositivo: true },
          { label: 'Altri Ricavi', valore: s12(ceData.ricaviAltro), isPositivo: true, indent: true },
          { label: 'Fatturato Totale', valore: fat, isPositivo: true, isRisultato: true, percentualeSu: fat },
        ],
        ceTypes: ['ricavo_core', 'ricavo_altro', 'ricavo_immobiliare'],
      },
      primo_margine: {
        nome: 'Primo Margine',
        valore: pMar,
        percentuale: fat > 0 ? pMar / fat : 0,
        steps: [
          { label: 'Fatturato', valore: fat, isPositivo: true },
          { label: 'Costi Variabili (materiali, subappalti, manodopera)', valore: cVar, isPositivo: false, percentualeSu: fat },
          { label: 'Primo Margine', valore: pMar, isPositivo: pMar > 0, isRisultato: true, percentualeSu: fat },
        ],
        ceTypes: ['ricavo_core', 'ricavo_altro', 'ricavo_immobiliare', 'costo_variabile'],
      },
      ebitda: {
        nome: 'EBITDA',
        valore: ebit,
        percentuale: fat > 0 ? ebit / fat : 0,
        steps: [
          { label: 'Primo Margine', valore: pMar, isPositivo: true, percentualeSu: fat },
          { label: 'Costi Studio (personale ufficio e tecnici)', valore: cStu, isPositivo: false, indent: true, percentualeSu: fat },
          { label: 'Costi Fissi di Struttura', valore: cFis, isPositivo: false, indent: true, percentualeSu: fat },
          { label: 'EBITDA', valore: ebit, isPositivo: ebit > 0, isRisultato: true, percentualeSu: fat },
        ],
        ceTypes: ['ricavo_core', 'ricavo_altro', 'ricavo_immobiliare', 'costo_variabile', 'costo_fisso', 'costo_studio'],
      },
      ebit: {
        nome: 'EBIT',
        valore: ebit2,
        percentuale: fat > 0 ? ebit2 / fat : 0,
        steps: [
          { label: 'EBITDA', valore: ebit, isPositivo: true, percentualeSu: fat },
          { label: 'Ammortamenti (non monetari)', valore: amm, isPositivo: false, indent: true },
          { label: 'EBIT', valore: ebit2, isPositivo: ebit2 > 0, isRisultato: true, percentualeSu: fat },
        ],
        ceTypes: ['ricavo_core', 'ricavo_altro', 'ricavo_immobiliare', 'costo_variabile', 'costo_fisso', 'costo_studio', 'ammortamento'],
      },
      ebt: {
        nome: 'EBT — Utile Ante Imposte',
        valore: ebt,
        percentuale: fat > 0 ? ebt / fat : 0,
        steps: [
          { label: 'EBIT', valore: ebit2, isPositivo: true, percentualeSu: fat },
          { label: 'Oneri Finanziari', valore: onFin, isPositivo: false, indent: true },
          { label: 'Proventi Finanziari', valore: prFin, isPositivo: true, indent: true },
          { label: 'Risultato Straordinario', valore: str, isPositivo: str > 0, indent: true },
          { label: 'EBT', valore: ebt, isPositivo: ebt > 0, isRisultato: true, percentualeSu: fat },
        ],
        ceTypes: ['ricavo_core', 'ricavo_altro', 'ricavo_immobiliare', 'costo_variabile', 'costo_fisso', 'costo_studio', 'ammortamento', 'onere_finanziario', 'provento_finanziario', 'straordinario'],
      },
      utile_netto: {
        nome: 'Utile Netto',
        valore: utile,
        percentuale: fat > 0 ? utile / fat : 0,
        steps: [
          { label: 'EBT', valore: ebt, isPositivo: true, percentualeSu: fat },
          { label: 'Imposte stimate (IRES + IRAP)', valore: imp, isPositivo: false, indent: true },
          { label: 'Utile Netto', valore: utile, isPositivo: utile > 0, isRisultato: true, percentualeSu: fat },
        ],
        ceTypes: ['ricavo_core', 'ricavo_altro', 'ricavo_immobiliare', 'costo_variabile', 'costo_fisso', 'costo_studio', 'ammortamento', 'onere_finanziario', 'provento_finanziario', 'straordinario', 'imposta_ce'],
      },
      break_even: {
        nome: 'Punto di Pareggio',
        valore: metrics.breakEven,
        steps: [
          { label: 'Costi Fissi Totali (con ammortamenti)', valore: metrics.costiFissiTot, isPositivo: false },
          { label: `Incidenza Costi Variabili su Fatturato`, valore: fat > 0 ? cVar / fat : 0, isPositivo: false, indent: true },
          { label: 'Margine di Contribuzione % (1 − incid. var.)', valore: fat > 0 ? (fat - cVar) / fat : 0, isPositivo: true, indent: true },
          { label: 'Break-even = Costi Fissi ÷ Margine Contrib.', valore: metrics.breakEven, isPositivo: true, isRisultato: true },
        ],
        ceTypes: ['costo_fisso', 'costo_studio', 'ammortamento', 'costo_variabile'],
      },
    };

    const cfg = configs[kpiId];
    if (!cfg) return null;
    return {
      kpiNome: cfg.nome,
      kpiValore: cfg.valore,
      kpiPercentuale: cfg.percentuale,
      formulaSteps: cfg.steps,
      transazioniContribuenti: txAnno.filter(tx => cfg.ceTypes.includes(tx.ceType ?? '')),
      anno: selectedYear,
      onClose: () => setDrawerKpi(null),
    };
  };

  const renderRow = (label: string, data: number[], type: 'auto' | 'manual' | 'calc' | 'kpi', field?: keyof CEData) => {
    const sum = data.reduce((a, b) => a + b, 0);
    const pct = metrics.fatturato > 0 ? sum / metrics.fatturato : 0;
    const projection = metrics.mesiTrascorsi > 0 ? (sum / metrics.mesiTrascorsi) * 12 : 0;

    return (
      <tr className="hover:bg-slate-50/50 transition-colors border-b border-slate-100">
        <td className="py-3 px-4 text-xs font-bold text-slate-700 sticky left-0 bg-white z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
          <div className="flex items-center gap-2">
            {type === 'auto' && <div className="w-2 h-2 rounded-full bg-sky-500" title="Auto-popolato" />}
            {type === 'manual' && <div className="w-2 h-2 rounded-full bg-amber-500" title="Manuale" />}
            {type === 'calc' && <div className="w-2 h-2 rounded-full bg-emerald-500" title="Calcolato" />}
            {label}
          </div>
        </td>
        {activeTab === 'monthly' ? (
          MONTHS.map((_, i) => (
            type === 'manual' && field ? (
              <ManualCell key={i} month={i} value={data[i]} onChange={(m, v) => handleManualChange(field, m, v)} />
            ) : (
              <AutoCell key={i} value={data[i]} />
            )
          ))
        ) : null}
        <CalcCell value={sum} isKPI={type === 'kpi'} />
        <td className="p-1 text-right text-[10px] font-medium text-slate-500">
          {formatPercent(pct)}
        </td>
        <ProjectionCell value={projection} />
      </tr>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      {/* Header & Navigation */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-200 no-print">
        <div>
          <h2 className="text-2xl font-black text-slate-900 flex items-center gap-3">
            <TrendingUp className="text-slate-900" />
            Conto Economico Riclassificato
          </h2>
          <p className="text-slate-500 text-sm mt-1">Analisi economica e margini del Gruppo Visentin</p>
        </div>

        <div className="flex items-center gap-4">
          <HelpButton onClick={() => setShowHelp(true)} />
          <div className="flex items-center bg-slate-100 rounded-xl p-1">
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

          <div className="flex bg-slate-100 rounded-xl p-1">
            <button 
              onClick={() => setActiveTab('ytd')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'ytd' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
            >
              YTD Consuntivo
            </button>
            <button 
              onClick={() => setActiveTab('monthly')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'monthly' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
            >
              Mese per Mese
            </button>
            <button
              onClick={() => setActiveTab('projection')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'projection' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
            >
              Proiezione Anno
            </button>
            <button
              onClick={() => setActiveTab('scostamenti')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'scostamenti' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
            >
              Scostamenti
            </button>
          </div>

          {/* Toggle modalità */}
          <div className="flex items-center bg-slate-100 rounded-xl p-1">
            <button
              onClick={() => setModalita('cassa')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                modalita === 'cassa'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Per cassa
            </button>
            <button
              onClick={() => setModalita('competenza')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                modalita === 'competenza'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Per competenza
            </button>
          </div>

          <button
            onClick={() => exportCEPDF({
              selectedYear,
              modalita,
              metrics,
              ceData,
              activeTab,
              scostamenti
            })}
            className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-slate-800 transition-all shadow-sm"
          >
            <TrendingUp size={14} />
            Esporta PDF
          </button>
        </div>
      </div>

      {modalita === 'competenza' && (
        <div className={`flex items-start gap-3 rounded-2xl border p-4 ${
          metrics.coperturainvoiceDate < 0.5
            ? 'bg-slate-100 border-slate-300'
            : 'bg-slate-50 border-slate-200'
        }`}>
          <Info
            size={16}
            className={`shrink-0 mt-0.5 ${
              metrics.coperturainvoiceDate < 0.5 ? 'text-slate-500' : 'text-slate-500'
            }`}
          />
          <div className={`text-[11px] leading-relaxed space-y-1 ${
            metrics.coperturainvoiceDate < 0.5 ? 'text-slate-800' : 'text-slate-800'
          }`}>
            <p>
              <span className="font-black uppercase tracking-wide">Modalità competenza attiva</span> —
              i ricavi sono attribuiti alla data di emissione fattura, non alla data di incasso.
              I costi restano sempre per cassa.
            </p>
            <p>
              Copertura data fattura sui ricavi:{' '}
              <span className="font-black">
                {metrics.ricaviConInvoiceDate} / {metrics.totaleRicavi} transazioni
                ({Math.round(metrics.coperturainvoiceDate * 100)}%)
              </span>
              {metrics.coperturainvoiceDate < 0.5 && (
                <span className="text-slate-700">
                  {' '}— compilare il campo "Data Fattura" sulle transazioni SAL
                  per risultati accurati.
                </span>
              )}
            </p>
          </div>
        </div>
      )}

      {(activeTab === 'ytd' || activeTab === 'monthly') && (
        <div className="flex items-start gap-3 bg-slate-50 border border-slate-100 rounded-2xl p-4">
          <Info size={16} className="text-slate-500 shrink-0 mt-0.5" />
          <div className="text-[11px] text-slate-800 leading-relaxed space-y-1">
            <p>
              <span className="font-black uppercase tracking-wide">KPI in cima</span> — 
              proiezione basata su consuntivo YTD + transazioni previsionali future inserite manualmente.
            </p>
            <p>
              <span className="font-black uppercase tracking-wide">Colonna Proiezione nelle righe</span> — 
              estrapolazione lineare: <span className="font-mono">(YTD ÷ mesi trascorsi) × 12</span>. 
              Usata quando i previsionali non sono stati inseriti.
            </p>
            {metrics.mesiTrascorsi < 12 && (
              <p className="text-slate-600 italic">
                Basato su {metrics.mesiTrascorsi} {metrics.mesiTrascorsi === 1 ? 'mese' : 'mesi'} di consuntivo su 12.
              </p>
            )}
          </div>
        </div>
      )}

      <div id="ce-report-content" className="space-y-6">
        {/* Header for PDF only (hidden in UI) */}
        <div className="hidden print-only bg-white p-6 rounded-3xl border border-slate-200 mb-6">
           <h2 className="text-2xl font-black text-slate-900">Conto Economico {selectedYear}</h2>
           <p className="text-slate-500 text-sm">Analisi economica e margini del Gruppo Visentin</p>
        </div>


      {/* KPI Summary Cards */}
      <InfoTooltipWrapper className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Fatturato YTD</span>
              <InfoTooltip termId="fatturato" />
            </div>
            <button
              onClick={() => setDrawerKpi('fatturato')}
              className="text-[9px] font-black text-slate-400 hover:text-slate-600 uppercase tracking-widest transition-colors"
            >
              Spiega →
            </button>
          </div>
          <div className="text-2xl font-black text-slate-900">{formatEuro(metrics.fatturato)}</div>
          <div className="text-[10px] text-slate-500 mt-1 italic">Proiezione: {formatEuro(metrics.proiezioneFatturato)}</div>
        </div>

        <div className={`p-5 rounded-3xl border shadow-sm bg-indigo-50 border-indigo-100`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-black text-indigo-600 uppercase tracking-wider">Primo Margine</span>
              <InfoTooltip termId="primo_margine" />
            </div>
            <button
              onClick={() => setDrawerKpi('primo_margine')}
              className="text-[9px] font-black text-indigo-400 hover:text-indigo-600 uppercase tracking-widest transition-colors"
            >
              Spiega →
            </button>
          </div>
          <div className="text-2xl font-black text-slate-900">{formatPercent(metrics.primoMarginePercent)}</div>
          <div className="text-[10px] text-slate-500 mt-1">{formatEuro(metrics.primoMargineTot)}</div>
        </div>

        <div className={`p-5 rounded-3xl border shadow-sm bg-emerald-50 border-emerald-100`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-black text-emerald-600 uppercase tracking-wider">EBITDA %</span>
              <InfoTooltip termId="ebitda" />
            </div>
            <button
              onClick={() => setDrawerKpi('ebitda')}
              className="text-[9px] font-black text-emerald-400 hover:text-emerald-600 uppercase tracking-widest transition-colors"
            >
              Spiega →
            </button>
          </div>
          <div className="text-2xl font-black text-slate-900">{formatPercent(metrics.ebitdaPercent)}</div>
          <div className="text-[10px] text-slate-500 mt-1">{formatEuro(metrics.ebitdaTot)}</div>
        </div>

        <div className={`p-5 rounded-3xl border shadow-sm bg-amber-50 border-amber-100`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-black text-amber-600 uppercase tracking-wider">EBIT %</span>
              <InfoTooltip termId="ebit" />
            </div>
            <button
              onClick={() => setDrawerKpi('ebit')}
              className="text-[9px] font-black text-amber-400 hover:text-amber-600 uppercase tracking-widest transition-colors"
            >
              Spiega →
            </button>
          </div>
          <div className="text-2xl font-black text-slate-900">{formatPercent(metrics.fatturato > 0 ? metrics.ebitTot / metrics.fatturato : 0)}</div>
          <div className="text-[10px] text-slate-500 mt-1">{formatEuro(metrics.ebitTot)}</div>
        </div>

        <div className="bg-[#222222] p-5 rounded-3xl border border-slate-800 shadow-lg text-white">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Punto di Pareggio</span>
              <InfoTooltip termId="break_even" />
            </div>
            <button
              onClick={() => setDrawerKpi('break_even')}
              className="text-[9px] font-black text-slate-500 hover:text-white uppercase tracking-widest transition-colors"
            >
              Spiega →
            </button>
          </div>
          <div className="text-2xl font-black">{formatEuro(metrics.breakEven)}</div>
          <div className="text-[10px] text-slate-400 mt-1">Contabile (con ammortamenti)</div>
          <div className="mt-3 pt-3 border-t border-white/10">
            <div className="text-lg font-black text-slate-400">{formatEuro(metrics.breakEvenCassa)}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Di cassa (rate capitale incluse)</div>
          </div>
        </div>
      </InfoTooltipWrapper>

      {/* Main CE Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="py-4 px-4 text-[10px] font-black text-slate-500 uppercase tracking-wider sticky left-0 bg-slate-50 z-20">Voce di Conto</th>
                {activeTab === 'monthly' && MONTHS.map(m => (
                  <th key={m} className="py-4 px-2 text-[10px] font-black text-slate-500 uppercase tracking-wider text-right">{m}</th>
                ))}
                <th className="py-4 px-4 text-[10px] font-black text-slate-500 uppercase tracking-wider text-right">Totale YTD</th>
                <th className="py-4 px-2 text-[10px] font-black text-slate-500 uppercase tracking-wider text-right">% Fatt.</th>
                <th className="py-4 px-4 text-[10px] font-black text-slate-500 uppercase tracking-wider text-right">Proiezione 📈</th>
              </tr>
            </thead>
            <tbody>
              {/* RICAVI */}
              <tr className="bg-slate-50/50"><td colSpan={activeTab === 'monthly' ? 16 : 4} className="py-2 px-4 text-[10px] font-black text-slate-900 uppercase">① Ricavi di Struttura</td></tr>
              {renderRow('Ricavi Core (SAL/Commesse)', ceData.ricaviCore, 'auto')}
              {renderRow('Altri Ricavi (Affitti/Sviluppo)', ceData.ricaviAltro, 'auto')}
              <tr className="bg-slate-100 font-bold">
                <td className="py-3 px-4 text-xs sticky left-0 bg-slate-100 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">TOTALE RICAVI (A)</td>
                {activeTab === 'monthly' && metrics.totRicavi.map((v, i) => <CalcCell key={i} value={v} />)}
                <CalcCell value={metrics.fatturato} isKPI />
                <td className="p-1 text-right text-[10px]">100%</td>
                <ProjectionCell value={metrics.proiezioneFatturato} />
              </tr>

              {/* COSTI VARIABILI */}
              <tr className="bg-slate-50/50"><td colSpan={activeTab === 'monthly' ? 16 : 4} className="py-2 px-4 text-[10px] font-black text-slate-600 uppercase">② Costi Variabili</td></tr>
              {renderRow('Costi Variabili (Materiali/Subappalti)', ceData.costiVariabili, 'auto')}
              <tr className="bg-slate-50/30 font-bold">
                <td className="py-3 px-4 text-xs sticky left-0 bg-slate-50/30 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">TOTALE COSTI VARIABILI (B)</td>
                {activeTab === 'monthly' && metrics.totCostiVar.map((v, i) => <CalcCell key={i} value={v} />)}
                <CalcCell value={metrics.totCostiVar.reduce((a,b)=>a+b,0)} isKPI />
                <td className="p-1 text-right text-[10px]">{formatPercent(metrics.fatturato > 0 ? metrics.totCostiVar.reduce((a,b)=>a+b,0)/metrics.fatturato : 0)}</td>
                <ProjectionCell value={metrics.mesiTrascorsi > 0 ? (metrics.totCostiVar.reduce((a,b)=>a+b,0)/metrics.mesiTrascorsi)*12 : 0} />
              </tr>

              <tr className="bg-[#222222] text-white font-black">
                <td className="py-4 px-4 text-sm sticky left-0 bg-[#222222] z-10">PRIMO MARGINE (A - B)</td>
                {activeTab === 'monthly' && metrics.primoMargine.map((v, i) => <td key={i} className="text-right px-2 text-xs">{formatEuro(v)}</td>)}
                <td className="text-right px-4 text-sm">{formatEuro(metrics.primoMargineTot)}</td>
                <td className="text-right px-2 text-xs">{formatPercent(metrics.primoMarginePercent)}</td>
                <td className="text-right px-4 text-sm italic text-slate-400">📈 {formatEuro(metrics.mesiTrascorsi > 0 ? (metrics.primoMargineTot/metrics.mesiTrascorsi)*12 : 0)}</td>
              </tr>

              {/* COSTI FISSI */}
              <tr className="bg-slate-50/50"><td colSpan={activeTab === 'monthly' ? 16 : 4} className="py-2 px-4 text-[10px] font-black text-slate-600 uppercase">③ Costi Fissi di Struttura</td></tr>
              {renderRow('Costi Studio (Personale/Amm.)', ceData.costiStudio, 'auto')}
              {renderRow('Altri Costi Fissi (Sedi/Marketing)', ceData.costiFissi, 'auto')}
              {renderRow('Ammortamenti (Manuale)', ceData.ammortamenti, 'manual', 'ammortamenti')}
              
              <tr className="bg-[#222222] text-white font-black">
                <td className="py-4 px-4 text-sm sticky left-0 bg-[#222222] z-10">EBITDA</td>
                {activeTab === 'monthly' && metrics.ebitda.map((v, i) => <td key={i} className="text-right px-2 text-xs">{formatEuro(v)}</td>)}
                <td className="text-right px-4 text-sm">{formatEuro(metrics.ebitdaTot)}</td>
                <td className="text-right px-2 text-xs">{formatPercent(metrics.ebitdaPercent)}</td>
                <td className="text-right px-4 text-sm italic text-slate-400">📈 {formatEuro(metrics.proiezioneEbitda)}</td>
              </tr>

              <tr className="border-b border-slate-200 bg-slate-900/5">
                <td className="py-4 px-4 text-sm sticky left-0 bg-[#1a1a1a] z-10 text-slate-300">
                  EBIT (dopo ammortamenti)
                </td>
                {activeTab === 'monthly' && metrics.ebit.map((v, i) => 
                  <td key={i} className="text-right px-2 text-xs text-slate-300">{formatEuro(v)}</td>
                )}
                <td className="text-right px-4 text-sm text-slate-300">{formatEuro(metrics.ebitTot)}</td>
                <td className="text-right px-2 text-xs text-slate-400">
                  {formatPercent(metrics.fatturato > 0 ? metrics.ebitTot / metrics.fatturato : 0)}
                </td>
              </tr>

              {/* ONERI E IMPOSTE */}
              <tr className="bg-slate-50/50"><td colSpan={activeTab === 'monthly' ? 16 : 4} className="py-2 px-4 text-[10px] font-black text-slate-600 uppercase">④ Oneri, Proventi e Imposte</td></tr>
              {renderRow('Oneri Finanziari', ceData.oneriFin, 'auto')}
              {renderRow('Proventi Finanziari', ceData.proventiFin, 'auto')}
              {renderRow('Risultato Straordinario', ceData.straordinario, 'auto')}
              
              <tr className="bg-slate-100 font-bold">
                <td className="py-3 px-4 text-xs sticky left-0 bg-slate-100 z-10">
                  <div className="flex items-center justify-between">
                    <span>UTILE ANTE IMPOSTE (EBT)</span>
                    <button
                      onClick={() => setDrawerKpi('ebt')}
                      className="text-[9px] font-black text-slate-400 hover:text-slate-600 uppercase tracking-widest transition-colors no-print"
                    >
                      Spiega →
                    </button>
                  </div>
                </td>
                {activeTab === 'monthly' && metrics.ebt.map((v, i) => <CalcCell key={i} value={v} />)}
                <CalcCell value={metrics.ebt.reduce((a,b)=>a+b,0)} isKPI />
                <td className="p-1 text-right text-[10px]">{formatPercent(metrics.fatturato > 0 ? metrics.ebt.reduce((a,b)=>a+b,0)/metrics.fatturato : 0)}</td>
                <ProjectionCell value={metrics.mesiTrascorsi > 0 ? (metrics.ebt.reduce((a,b)=>a+b,0)/metrics.mesiTrascorsi)*12 : 0} />
              </tr>

              {renderRow('Imposte Stimate (Manuale)', ceData.imposte, 'manual', 'imposte')}

              <tr className="bg-slate-900 text-white font-black">
                <td className="py-4 px-4 text-sm sticky left-0 bg-slate-900 z-10">
                  <div className="flex items-center justify-between">
                    <span>UTILE NETTO</span>
                    <button
                      onClick={() => setDrawerKpi('utile_netto')}
                      className="text-[9px] font-black text-slate-400 hover:text-white uppercase tracking-widest transition-colors no-print"
                    >
                      Spiega →
                    </button>
                  </div>
                </td>
                {activeTab === 'monthly' && metrics.utileNetto.map((v, i) => <td key={i} className="text-right px-2 text-xs">{formatEuro(v)}</td>)}
                <td className="text-right px-4 text-sm">{formatEuro(metrics.utileNettoTot)}</td>
                <td className="text-right px-2 text-xs">{formatPercent(metrics.utileNettoPercent)}</td>
                <td className="text-right px-4 text-sm italic text-slate-400">📈 {formatEuro(metrics.proiezioneUtile)}</td>
              </tr>

              {/* SOCI */}
              <tr className="bg-slate-50/50"><td colSpan={activeTab === 'monthly' ? 16 : 4} className="py-2 px-4 text-[10px] font-black text-slate-900 uppercase">⑤ Compenso Imprenditore</td></tr>
              {renderRow('Prelievo Utile Soci', ceData.compensoImprenditore, 'auto')}
            </tbody>
          </table>
        </div>
      </div>

      {activeTab === 'projection' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="py-4 px-4 text-[10px] font-black text-slate-500 uppercase tracking-wider sticky left-0 bg-slate-50 z-20">
                    Voce di Conto
                  </th>
                  <th className="py-4 px-4 text-[10px] font-black text-slate-500 uppercase tracking-wider text-right">
                    YTD Consuntivo
                  </th>
                  <th className="py-4 px-4 text-[10px] font-black text-slate-500 uppercase tracking-wider text-right">
                    Mesi
                  </th>
                  <th className="py-4 px-4 text-[10px] font-black text-slate-500 uppercase tracking-wider text-right">
                    Proiezione 12m
                  </th>
                  <th className="py-4 px-4 text-[10px] font-black text-slate-500 uppercase tracking-wider text-right">
                    % su Ricavi
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[
                  { label: 'Ricavi Totali', ytd: metrics.fatturato, proj: metrics.proiezioneFatturato, isBold: true },
                  { label: 'Costi Variabili', ytd: metrics.totCostiVar.reduce((a,b)=>a+b,0), proj: (metrics.totCostiVar.reduce((a,b)=>a+b,0) / metrics.mesiTrascorsi) * 12 },
                  { label: 'Primo Margine', ytd: metrics.primoMargineTot, proj: (metrics.primoMargineTot / metrics.mesiTrascorsi) * 12, isBold: true, color: 'text-slate-900' },
                  { label: 'Costi di Struttura', ytd: metrics.costiFissiTot, proj: (metrics.costiFissiTot / metrics.mesiTrascorsi) * 12 },
                  { label: 'EBITDA', ytd: metrics.ebitdaTot, proj: metrics.proiezioneEbitda, isBold: true, color: 'text-slate-900' },
                  { label: 'EBIT', ytd: metrics.ebitTot, proj: (metrics.ebitTot / metrics.mesiTrascorsi) * 12 },
                  { label: 'Utile Netto', ytd: metrics.utileNettoTot, proj: metrics.proiezioneUtile, isBold: true, color: 'text-slate-900' },
                ].map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                    <td className={`py-4 px-4 text-xs ${row.isBold ? 'font-black uppercase' : 'font-medium text-slate-600'}`}>
                      {row.label}
                    </td>
                    <td className="py-4 px-4 text-right text-xs font-mono text-slate-500">
                      {formatEuro(row.ytd)}
                    </td>
                    <td className="py-4 px-4 text-right text-xs font-mono text-slate-400">
                      {metrics.mesiTrascorsi} / 12
                    </td>
                    <td className={`py-4 px-4 text-right text-sm font-black font-mono ${row.color || 'text-slate-900'}`}>
                      {formatEuro(row.proj)}
                    </td>
                    <td className="py-4 px-4 text-right text-xs font-mono text-slate-500">
                      {formatPercent(metrics.proiezioneFatturato > 0 ? row.proj / metrics.proiezioneFatturato : 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Info Box */}
          <div className="p-6 bg-slate-50 border-t border-slate-100">
            <div className="flex items-start gap-4">
              <div className="p-2 bg-slate-100 rounded-xl">
                <Info size={20} className="text-slate-600" />
              </div>
              <div className="space-y-2">
                <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight">Nota sulla Proiezione</h4>
                <p className="text-xs text-slate-500 leading-relaxed max-w-2xl">
                  Questa proiezione è <span className="font-bold text-slate-700">puramente lineare</span> e basata sulla media dei mesi trascorsi ({metrics.mesiTrascorsi}). 
                  Non tiene conto di stagionalità specifiche o di ordini già acquisiti ma non ancora fatturati, a meno che non siano stati inseriti come 
                  <span className="font-bold text-slate-700"> Previsionali</span> nel modulo transazioni.
                </p>
                <div className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest pt-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-pulse" />
                  Calcolo: (Valore YTD / {metrics.mesiTrascorsi}) × 12
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'scostamenti' && (
        <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-500">

          {/* Selettore periodo */}
          <div className="flex items-center gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Periodo:</span>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setMeseScostamento(null)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${meseScostamento === null ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                YTD
              </button>
              {MONTHS.map((m, i) => (
                <button
                  key={i}
                  onClick={() => setMeseScostamento(i)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${meseScostamento === i ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Tabella scostamenti */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="py-4 px-4 text-[10px] font-black text-slate-500 uppercase tracking-wider sticky left-0 bg-slate-50 z-20 min-w-[180px]">
                      Voce
                    </th>
                    <th className="py-4 px-4 text-[10px] font-black text-slate-500 uppercase tracking-wider text-right min-w-[120px]">
                      Budget
                    </th>
                    <th className="py-4 px-4 text-[10px] font-black text-slate-500 uppercase tracking-wider text-right min-w-[120px]">
                      Previsionale
                    </th>
                    <th className="py-4 px-4 text-[10px] font-black text-slate-500 uppercase tracking-wider text-right min-w-[120px]">
                      Consuntivo
                    </th>
                    <th className="py-4 px-4 text-[10px] font-black text-slate-500 uppercase tracking-wider text-right min-w-[140px]">
                      Scost. vs Budget
                    </th>
                    <th className="py-4 px-4 text-[10px] font-black text-slate-500 uppercase tracking-wider text-right min-w-[140px]">
                      Scost. vs Prev.
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {scostamenti.map((riga, i) => {
                    const coloreBudget = riga.scostamentoBudgetPct > 0.05
                      ? 'text-slate-900 bg-slate-100'
                      : riga.scostamentoBudgetPct < -0.05
                      ? 'text-slate-600 bg-slate-200'
                      : 'text-slate-500 bg-slate-50';

                    const colorePrev = riga.scostamentoPrevPct > 0.05
                      ? 'text-slate-900 bg-slate-100'
                      : riga.scostamentoPrevPct < -0.05
                      ? 'text-slate-600 bg-slate-200'
                      : 'text-slate-500 bg-slate-50';

                    const semaforoBudget = riga.scostamentoBudgetPct > 0.05 ? '●'
                      : riga.scostamentoBudgetPct < -0.05 ? '○' : '◌';

                    const semaforoPrev = riga.scostamentoPrevPct > 0.05 ? '●'
                      : riga.scostamentoPrevPct < -0.05 ? '○' : '◌';

                    return (
                      <tr key={i} className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-3 px-4 text-xs font-bold text-slate-700 sticky left-0 bg-white z-10">
                          {riga.label}
                        </td>
                        <td className="py-3 px-4 text-right text-xs font-medium text-slate-500 font-mono">
                          {riga.budget > 0 ? formatEuro(riga.budget) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="py-3 px-4 text-right text-xs font-medium text-slate-500 font-mono">
                          {riga.previsionale > 0 ? formatEuro(riga.previsionale) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="py-3 px-4 text-right text-sm font-black text-slate-900 font-mono">
                          {formatEuro(riga.consuntivo)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {riga.budget > 0 ? (
                            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-black ${coloreBudget}`}>
                              <span>{semaforoBudget}</span>
                              <span>{riga.scostamentoBudget >= 0 ? '+' : ''}{formatEuro(riga.scostamentoBudget)}</span>
                              <span className="text-[10px] opacity-70">
                                ({riga.scostamentoBudgetPct >= 0 ? '+' : ''}{formatPercent(riga.scostamentoBudgetPct)})
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-300 text-xs">no budget</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {riga.previsionale > 0 ? (
                            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-black ${colorePrev}`}>
                              <span>{semaforoPrev}</span>
                              <span>{riga.scostamentoPrevisionale >= 0 ? '+' : ''}{formatEuro(riga.scostamentoPrevisionale)}</span>
                              <span className="text-[10px] opacity-70">
                                ({riga.scostamentoPrevPct >= 0 ? '+' : ''}{formatPercent(riga.scostamentoPrevPct)})
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-300 text-xs">no prev.</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Legenda semaforo */}
            <div className="bg-slate-50 p-4 border-t border-slate-100 flex items-center gap-6">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Legenda:</span>
              <span className="text-[10px] text-slate-500">● Scostamento positivo &gt;5%</span>
              <span className="text-[10px] text-slate-500">◌ Scostamento neutro ±5%</span>
              <span className="text-[10px] text-slate-500">○ Scostamento negativo &gt;5%</span>
              <span className="text-[10px] text-slate-400 italic ml-auto">
                Per ricavi: pieno = sopra target. Vuoto = sotto target.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-6 p-4 bg-slate-50 rounded-2xl border border-slate-200">
        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500">
          <div className="w-3 h-3 rounded bg-sky-50 border border-sky-300" />
          AUTO-POPOLATO DA TRANSAZIONI
        </div>
        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500">
          <div className="w-3 h-3 rounded bg-amber-50 border border-amber-300 border-dashed" />
          INPUT MANUALE RICHIESTO
        </div>
        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500">
          <div className="w-3 h-3 rounded bg-emerald-50 border border-emerald-300" />
          CALCOLATO DA FORMULE
        </div>
        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500">
          <div className="w-3 h-3 rounded bg-violet-50 border border-violet-200 border-dashed" />
          PROIEZIONE FINE ANNO
        </div>
      </div>

      {/* ── SEZIONE RIMANENZE ── */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">

        {/* Header sezione */}
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">
              Rettifiche di Fine Anno — Rimanenze
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Variazione WIP e materiali — allinea l'utile a quello del commercialista
            </p>
          </div>
          {effettoRimanenze && (
            <span className={`px-3 py-1.5 rounded-xl text-xs font-black ${
              effettoRimanenze.variazioneRimanenzeNetta >= 0
                ? 'bg-emerald-500 text-white shadow-sm'
                : 'bg-rose-500 text-white shadow-sm'
            }`}>
              Rettifica netta: {effettoRimanenze.variazioneRimanenzeNetta >= 0 ? '+' : ''}
              {formatEuro(effettoRimanenze.variazioneRimanenzeNetta)}
            </span>
          )}
        </div>

        <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-8">

          {/* INPUT — Lavori in corso (WIP) */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <div className="w-2 h-2 rounded-full bg-sky-500" />
              <h4 className="text-xs font-black text-sky-700 uppercase tracking-widest">
                Lavori in Corso (WIP)
              </h4>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-sky-500 uppercase tracking-widest">
                  WIP a inizio {selectedYear} (= fine {selectedYear - 1})
                </label>
                <div className="flex items-center bg-sky-50 border border-sky-200 rounded-xl px-4 py-3 focus-within:border-sky-400 transition-all">
                  <span className="text-sm font-bold text-sky-400 mr-3">€</span>
                  <input
                    type="number"
                    value={rimanenzeAnno?.wipInizio || ''}
                    placeholder="0"
                    onChange={e => handleRimanenzeField('wipInizio', parseFloat(e.target.value) || 0)}
                    className="w-full bg-transparent text-sm font-bold text-slate-900 outline-none"
                  />
                </div>
                <p className="text-[10px] text-slate-400">
                  Valore lavori eseguiti ma non ancora fatturati al 31/12/{selectedYear - 1}
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-sky-500 uppercase tracking-widest">
                  WIP a fine {selectedYear}
                </label>
                <div className="flex items-center bg-sky-50 border border-sky-200 rounded-xl px-4 py-3 focus-within:border-sky-400 transition-all">
                  <span className="text-sm font-bold text-sky-400 mr-3">€</span>
                  <input
                    type="number"
                    value={rimanenzeAnno?.wipFine || ''}
                    placeholder="0"
                    onChange={e => handleRimanenzeField('wipFine', parseFloat(e.target.value) || 0)}
                    className="w-full bg-transparent text-sm font-bold text-slate-900 outline-none"
                  />
                </div>
                <p className="text-[10px] text-slate-400">
                  Valore lavori eseguiti ma non ancora fatturati al 31/12/{selectedYear}
                </p>
              </div>

              {rimanenzeAnno && (
                <div className={`flex items-center justify-between px-4 py-3 rounded-xl ${
                  rimanenzeAnno.wipFine - rimanenzeAnno.wipInizio >= 0
                    ? 'bg-emerald-50 border border-emerald-200'
                    : 'bg-rose-50 border border-rose-200'
                }`}>
                  <span className="text-xs font-black text-slate-600 uppercase tracking-wide">
                    Δ WIP
                  </span>
                  <span className={`text-sm font-black ${
                    rimanenzeAnno.wipFine - rimanenzeAnno.wipInizio >= 0
                      ? 'text-emerald-600'
                      : 'text-rose-600'
                  }`}>
                    {rimanenzeAnno.wipFine - rimanenzeAnno.wipInizio >= 0 ? '+' : ''}
                    {formatEuro(rimanenzeAnno.wipFine - rimanenzeAnno.wipInizio)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* INPUT — Rimanenze Materiali */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <div className="w-2 h-2 rounded-full bg-amber-500" />
              <h4 className="text-xs font-black text-amber-700 uppercase tracking-widest">
                Rimanenze Materiali
              </h4>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-amber-500 uppercase tracking-widest">
                  Materiali a inizio {selectedYear} (= fine {selectedYear - 1})
                </label>
                <div className="flex items-center bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 focus-within:border-amber-400 transition-all">
                  <span className="text-sm font-bold text-amber-400 mr-3">€</span>
                  <input
                    type="number"
                    value={rimanenzeAnno?.materialiInizio || ''}
                    placeholder="0"
                    onChange={e => handleRimanenzeField('materialiInizio', parseFloat(e.target.value) || 0)}
                    className="w-full bg-transparent text-sm font-bold text-amber-900 outline-none"
                  />
                </div>
                <p className="text-[10px] text-slate-400">
                  Valore materiali in magazzino al 31/12/{selectedYear - 1}
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-amber-500 uppercase tracking-widest">
                  Materiali a fine {selectedYear}
                </label>
                <div className="flex items-center bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 focus-within:border-amber-400 transition-all">
                  <span className="text-sm font-bold text-amber-400 mr-3">€</span>
                  <input
                    type="number"
                    value={rimanenzeAnno?.materialiFine || ''}
                    placeholder="0"
                    onChange={e => handleRimanenzeField('materialiFine', parseFloat(e.target.value) || 0)}
                    className="w-full bg-transparent text-sm font-bold text-amber-900 outline-none"
                  />
                </div>
                <p className="text-[10px] text-slate-400">
                  Valore materiali in magazzino al 31/12/{selectedYear}
                </p>
              </div>

              {rimanenzeAnno && (
                <div className={`flex items-center justify-between px-4 py-3 rounded-xl ${
                  rimanenzeAnno.materialiFine - rimanenzeAnno.materialiInizio >= 0
                    ? 'bg-emerald-50 border border-emerald-200'
                    : 'bg-rose-50 border border-rose-200'
                }`}>
                  <span className="text-xs font-black text-slate-600 uppercase tracking-wide">
                    Δ Materiali
                  </span>
                  <span className={`text-sm font-black ${
                    rimanenzeAnno.materialiFine - rimanenzeAnno.materialiInizio >= 0
                      ? 'text-emerald-600'
                      : 'text-rose-600'
                  }`}>
                    {rimanenzeAnno.materialiFine - rimanenzeAnno.materialiInizio >= 0 ? '+' : ''}
                    {formatEuro(rimanenzeAnno.materialiFine - rimanenzeAnno.materialiInizio)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RISULTATI RETTIFICATI — visibili solo se rimanenze inserite */}
        {effettoRimanenze && (
          <>
            <div className="mx-6 border-t border-slate-100" />

            <div className="p-6 space-y-4">
              <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest">
                CE Rettificato — Confronto Cassa vs Competenza con Rimanenze
              </h4>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="pb-3 text-[10px] font-black text-indigo-500 uppercase tracking-wider w-[220px]">Voce</th>
                      <th className="pb-3 text-right text-[10px] font-black text-sky-500 uppercase tracking-wider">Per Cassa (app)</th>
                      <th className="pb-3 text-right text-[10px] font-black text-amber-500 uppercase tracking-wider">Rettifica Rimanenze</th>
                      <th className="pb-3 text-right text-[10px] font-black text-emerald-500 uppercase tracking-wider">Valore Rettificato</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    <tr>
                      <td className="py-3 text-xs font-bold text-slate-600">Fatturato / Ricavi</td>
                      <td className="py-3 text-right text-xs font-medium text-slate-500 font-mono">{formatEuro(metrics.fatturato)}</td>
                      <td className={`py-3 text-right text-xs font-bold font-mono ${effettoRimanenze.deltaWip >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {effettoRimanenze.deltaWip >= 0 ? '+' : ''}{formatEuro(effettoRimanenze.deltaWip)}
                      </td>
                      <td className="py-3 text-right text-sm font-black text-slate-900 font-mono">{formatEuro(effettoRimanenze.fatturatoCompetenzaRettificato)}</td>
                    </tr>
                    <tr>
                      <td className="py-3 text-xs font-bold text-slate-600">Costi Variabili</td>
                      <td className="py-3 text-right text-xs font-medium text-slate-500 font-mono">{formatEuro(metrics.totCostiVar.reduce((a,b)=>a+b,0))}</td>
                      <td className={`py-3 text-right text-xs font-bold font-mono ${effettoRimanenze.deltaMateriali >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {effettoRimanenze.deltaMateriali >= 0 ? '-' : '+'}{formatEuro(Math.abs(effettoRimanenze.deltaMateriali))}
                      </td>
                      <td className="py-3 text-right text-sm font-black text-slate-900 font-mono">{formatEuro(effettoRimanenze.costiVariabiliRettificati)}</td>
                    </tr>
                    <tr className="bg-slate-50/50">
                      <td className="py-3 text-xs font-black text-slate-800 uppercase">Utile Netto</td>
                      <td className="py-3 text-right text-xs font-bold text-slate-500 font-mono">{formatEuro(metrics.utileNettoTot)}</td>
                      <td className={`py-3 text-right text-xs font-black font-mono ${effettoRimanenze.variazioneRimanenzeNetta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {effettoRimanenze.variazioneRimanenzeNetta >= 0 ? '+' : ''}{formatEuro(effettoRimanenze.variazioneRimanenzeNetta)}
                      </td>
                      <td className={`py-3 text-right text-lg font-black font-mono ${effettoRimanenze.utileRettificato >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {formatEuro(effettoRimanenze.utileRettificato)}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 text-xs font-bold text-slate-600">Base Imponibile IRES (stima)</td>
                      <td className="py-3 text-right text-xs font-medium text-slate-400 font-mono">—</td>
                      <td className="py-3 text-right text-xs font-medium text-slate-400 font-mono">—</td>
                      <td className="py-3 text-right text-sm font-black text-slate-700 font-mono">{formatEuro(effettoRimanenze.baseImponibileIRES)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Nota rimanenze */}
              <div className="flex items-start gap-3 bg-slate-50 rounded-2xl p-4 border border-slate-100">
                <Info size={14} className="text-slate-400 shrink-0 mt-0.5" />
                <div className="text-[10px] text-slate-500 leading-relaxed space-y-1">
                  <p>
                    <span className="font-black">Δ WIP positivo</span> = hai prodotto più di quanto fatturato →
                    aumenta il fatturato di competenza e l'utile fiscale.
                  </p>
                  <p>
                    <span className="font-black">Δ Materiali positivo</span> = hai in magazzino più di quanto usato →
                    riduce i costi variabili e aumenta l'utile fiscale.
                  </p>
                  <p>
                    La base imponibile IRES è una stima semplificata — il commercialista applica
                    ulteriori rettifiche (deduzioni ACE, variazioni permanenti/temporanee, ecc.).
                  </p>
                </div>
              </div>

              {/* Campo note */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">
                  Note / Riferimento inventario
                </label>
                <textarea
                  value={rimanenzeAnno?.note || ''}
                  onChange={e => handleRimanenzeField('note', e.target.value)}
                  placeholder="es. Inventario del 31/12 a cura di Ragionier Ferreri — WIP da perizia cantiere Rossanese"
                  rows={2}
                  className="w-full bg-indigo-50/30 border border-indigo-100 rounded-xl px-4 py-3 text-xs text-slate-700 outline-none focus:border-indigo-300 resize-none"
                />
              </div>
            </div>
          </>
        )}

        {/* Placeholder se rimanenze non ancora inserite */}
        {!effettoRimanenze && (
          <div className="px-6 pb-6">
            <div className="flex items-center gap-3 bg-slate-50 rounded-2xl p-5 border border-slate-100 border-dashed">
              <Info size={16} className="text-slate-300 shrink-0" />
              <p className="text-xs text-slate-400">
                Inserisci i valori WIP e/o materiali per vedere l'utile rettificato
                allineato al CE del commercialista.
              </p>
            </div>
          </div>
        )}

      </div>
      </div>
      {showHelp && (
        <HelpPanel 
          isOpen={true}
          onClose={() => setShowHelp(false)}
          currentView={AppView.CE_RICLASSIFICATO}
          onGoToManuale={onGoToManuale}
        />
      )}

      {/* CalcoloDrawer — "Spiega questo numero" */}
      {drawerKpi && (() => {
        const props = buildDrawerProps(drawerKpi);
        return props ? <CalcoloDrawer {...props} /> : null;
      })()}
    </div>
  );
};

export default CEView;
