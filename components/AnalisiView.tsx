import React, { useState, useMemo, useEffect } from 'react';
import { Transaction, CEData, AppView, RimanenzeData } from '../types';
import { buildCEData, calcCEMetrics, calcPrevisioneFiscale } from '../utils/gasCoreEngine';
import { exportAnalisiPDF } from '../utils/analisiPdfExport';
import InfoTooltip, { InfoTooltipWrapper } from './InfoTooltip';
import { HelpButton } from './HelpPanel';
import HelpPanel from './HelpPanel';
import { 
  calculateOverheadRates, 
  calcolaPreventivoCantiere, 
  calcolaPreventivoImmobiliare, 
  calcolaCostoOrario 
} from '../utils/overheadCalculations';
import { 
  BarChart2, 
  TrendingUp, 
  Target, 
  Calculator, 
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Zap,
  Clock,
  HardHat,
  Building2,
  ChevronDown,
  ChevronUp,
  Info,
  Calendar,
  FileText
} from 'lucide-react';

interface AnalisiViewProps {
  transactions: Transaction[];
  ceManualData?: Record<string, Partial<CEData>>;
  oreStorico: Record<string, number>;
  setOreStorico: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  rimanenze?: RimanenzeData;
  onGoToManuale?: (section?: string, tab?: 'manuale' | 'glossario') => void;
  aliquotaIRES: number;
  aliquotaIRAP: number;
  onChangeAliquotaIRES: (v: number) => void;
  onChangeAliquotaIRAP: (v: number) => void;
}

type Coloresoglia = 'ottimo' | 'buono' | 'attenzione' | 'critico';

interface FasciaSoglia {
  min?: number;
  max?: number;
  label: string;
  colore: Coloresoglia;
}

interface Soglie {
  valore: number;
  tipo: 'piu_alto_meglio' | 'piu_basso_meglio';
  fasce: FasciaSoglia[];
  customLabel?: string;
}

const getFascia = (s: Soglie, val: number): FasciaSoglia | undefined => {
  return s.fasce.find(f => {
    const minOk = f.min === undefined || val >= f.min;
    const maxOk = f.max === undefined || val < f.max;
    return minOk && maxOk;
  });
};

const COLORE_SOGLIA: Record<Coloresoglia, { bg: string; text: string; progress: string; border: string }> = {
  ottimo: { bg: 'bg-emerald-50', text: 'text-emerald-600', progress: 'bg-emerald-500', border: 'border-emerald-100' },
  buono: { bg: 'bg-blue-50', text: 'text-blue-600', progress: 'bg-blue-500', border: 'border-blue-100' },
  attenzione: { bg: 'bg-amber-50', text: 'text-amber-600', progress: 'bg-amber-500', border: 'border-amber-100' },
  critico: { bg: 'bg-rose-50', text: 'text-rose-600', progress: 'bg-rose-500', border: 'border-rose-100' },
};

const LABEL_SOGLIA: Record<Coloresoglia, string> = {
  ottimo: 'Ottimo',
  buono: 'Buono',
  attenzione: 'Attenzione',
  critico: 'Critico'
};

const formatEuro = (val: number) => 
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(val);

const formatPercent = (val: number) => 
  new Intl.NumberFormat('it-IT', { style: 'percent', minimumFractionDigits: 1 }).format(val);

const AnalisiView: React.FC<AnalisiViewProps> = ({ 
  transactions, 
  ceManualData, 
  oreStorico, 
  setOreStorico,
  rimanenze,
  onGoToManuale,
  aliquotaIRES,
  aliquotaIRAP,
  onChangeAliquotaIRES,
  onChangeAliquotaIRAP,
}) => {
  const [activeTab, setActiveTab] = useState<'indici' | 'preventivo' | 'orario' | 'sacri' | 'fiscale'>('indici');
  const [showHelp, setShowHelp] = useState(false);
  const [anno, setAnno] = useState(new Date().getFullYear());
  const [modalitaCalc, setModalitaCalc] = useState<'cantiere' | 'immobiliare'>('cantiere');

  const currentYear = new Date().getFullYear();
  const availableYears = [currentYear - 2, currentYear - 1, currentYear];

  // Calcolatore cantiere
  const [costoDiretto, setCostoDiretto] = useState<number>(0);
  const [margineTarget, setMargineTarget] = useState<number>(10); // %

  // Calcolatore immobiliare
  const [costoTerreno, setCostoTerreno] = useState<number>(0);
  const [costoCostruzione, setCostoCostruzione] = useState<number>(0);
  const [margineTargetImm, setMargineTargetImm] = useState<number>(15); // %

  // Costo orario
  const [meseOrario, setMeseOrario] = useState(new Date().getMonth() + 1);
  const [costoContrattuale, setCostoContrattuale] = useState<number>(28);

  const keyMese = `${anno}-${String(meseOrario).padStart(2, '0')}`;
  const oreInput = oreStorico[keyMese] || 0;

  const setOreInput = (val: number) => {
    setOreStorico(prev => ({ ...prev, [keyMese]: val }));
  };

  // Calcoli base
  const rates = useMemo(() => calculateOverheadRates(transactions, anno), [transactions, anno]);
  
  const ceData = useMemo(() => {
    const manual = ceManualData ? ceManualData[anno.toString()] : undefined;
    return buildCEData(transactions, anno, manual);
  }, [transactions, anno, ceManualData]);

  const metrics = useMemo(() => calcCEMetrics(ceData, transactions), [ceData, transactions]);

  const rimanenzeAnno = rimanenze?.[anno.toString()];

  const previsioneFiscale = useMemo(() =>
    calcPrevisioneFiscale(
      transactions,
      anno,
      metrics,
      rimanenzeAnno,
      aliquotaIRES / 100,
      aliquotaIRAP / 100
    ),
    [transactions, anno, metrics, rimanenzeAnno, aliquotaIRES, aliquotaIRAP]
  );

  // Risultati Calcolatori
  const resCantiere = useMemo(() => 
    calcolaPreventivoCantiere(costoDiretto, margineTarget / 100, rates),
    [costoDiretto, margineTarget, rates]
  );

  const resImmobiliare = useMemo(() => 
    calcolaPreventivoImmobiliare(costoTerreno, costoCostruzione, margineTargetImm / 100, rates),
    [costoTerreno, costoCostruzione, margineTargetImm, rates]
  );

  const resOrario = useMemo(() => 
    calcolaCostoOrario(transactions, anno, meseOrario, oreInput, costoContrattuale),
    [transactions, anno, meseOrario, oreInput, costoContrattuale]
  );

  const getStatusColor = (val: number, thresholds: { red: number; yellow: number; inverse?: boolean }) => {
    if (thresholds.inverse) {
      if (val < thresholds.red) return 'bg-slate-300';
      if (val < thresholds.yellow) return 'bg-slate-500';
      return 'bg-slate-900';
    }
    if (val > thresholds.red) return 'bg-slate-300';
    if (val > thresholds.yellow) return 'bg-slate-500';
    return 'bg-slate-900';
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      {/* Header & Year Selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-200 no-print">
        <div>
          <h2 className="text-2xl font-black text-slate-900 flex items-center gap-3">
            <BarChart2 className="text-slate-900" />
            Analisi & Indici
          </h2>
          <p className="text-slate-500 text-sm mt-1">Logica Overhead e Calcolatori Professionali</p>
        </div>
        <div className="flex items-center gap-4">
          <HelpButton onClick={() => setShowHelp(true)} />
          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
            {availableYears.map(y => (
              <button
                key={y}
                onClick={() => setAnno(y)}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${anno === y ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {y}
              </button>
            ))}
          </div>
          <button
            onClick={() => exportAnalisiPDF({
              anno,
              rates,
              metrics,
              resCantiere,
              resImmobiliare,
              resOrario,
              previsioneFiscale
            })}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-black hover:bg-slate-800 transition-all shadow-sm"
          >
            <FileText size={14} />
            Esporta PDF Analisi
          </button>
        </div>
      </div>

      <div id="analisi-report-content" className="space-y-6">
        {/* Header for PDF only (hidden in UI) */}
        <div className="hidden print-only bg-white p-6 rounded-3xl border border-slate-200 mb-6">
           <h2 className="text-2xl font-black text-slate-900">Analisi & Indici {anno}</h2>
           <p className="text-slate-500 text-sm">Logica Overhead e Calcolatori Professionali del Gruppo Visentin</p>
        </div>


      {/* Tabs Navigation */}
      <div className="flex bg-slate-200/50 p-1 rounded-2xl overflow-x-auto scrollbar-hide">
        {[
          { id: 'indici', label: 'Indici Struttura', icon: BarChart2 },
          { id: 'preventivo', label: 'Calcolatore Preventivo', icon: Calculator },
          { id: 'orario', label: 'Costo Orario', icon: Clock },
          { id: 'sacri', label: '7+1 Numeri Sacri', icon: Sparkles },
          { id: 'fiscale', label: 'Previsione Fiscale', icon: Calculator },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-black whitespace-nowrap transition-all ${activeTab === tab.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:bg-white/50'}`}
          >
            <tab.icon size={18} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="min-h-[600px]">
        {activeTab === 'indici' && (
          <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Blocco A — Controllo di Gestione */}
              <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm space-y-8">
                <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
                  <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-600">
                    <TrendingUp size={20} />
                  </div>
                  <h3 className="font-black text-slate-900 uppercase tracking-tight">A — Controllo di Gestione (% su fatturato)</h3>
                </div>

                <div className="space-y-8">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Incidenza Studio sul Fatturato</p>
                        <InfoTooltip termId="incidenza_studio_fatturato" />
                      </div>
                      <p className="text-xs text-slate-500">Personale ufficio + Tecnici / Fatturato</p>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <span className="text-3xl font-black text-sky-600">{formatPercent(rates.incidenzaStudioFatturato)}</span>
                        <div className={`w-3 h-3 rounded-full ${getStatusColor(rates.incidenzaStudioFatturato, { red: 0.25, yellow: 0.15 })}`} />
                      </div>
                      <p className="text-sm font-bold text-sky-400">{formatEuro(rates.totaleCostiStudio)}</p>
                    </div>
                  </div>

                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Incidenza Overhead Totale sul Fatturato</p>
                      <p className="text-xs text-slate-500">Tutti i costi fissi / Fatturato</p>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <span className="text-3xl font-black text-indigo-600">{formatPercent(rates.incidenzaCompletaFatturato)}</span>
                        <div className={`w-3 h-3 rounded-full ${getStatusColor(rates.incidenzaCompletaFatturato, { red: 0.35, yellow: 0.25 })}`} />
                      </div>
                      <p className="text-sm font-bold text-indigo-400">{formatEuro(rates.totaleOverheadCompleto)}</p>
                    </div>
                  </div>

                  <div className="flex justify-between items-start pt-4 border-t border-slate-100">
                    <div className="space-y-1">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Oneri Finanziari (sotto EBITDA)</p>
                      <p className="text-xs text-slate-500">Interessi passivi e commissioni</p>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <span className="text-2xl font-black text-amber-600">{formatPercent(rates.totaleOneriFin / (rates.fatturato > 0 ? rates.fatturato : 1))}</span>
                      </div>
                      <p className="text-sm font-bold text-amber-400">{formatEuro(rates.totaleOneriFin)}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Blocco B — Per i Preventivi */}
              <div className="bg-[#222222] p-8 rounded-[32px] text-white shadow-xl space-y-8">
                <div className="flex items-center gap-3 pb-4 border-b border-white/10">
                  <div className="w-10 h-10 bg-slate-700 rounded-xl flex items-center justify-center text-white">
                    <Calculator size={20} />
                  </div>
                  <h3 className="font-black uppercase tracking-tight">B — Per i Preventivi (% su costi diretti)</h3>
                </div>

                <div className="space-y-8">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Overhead Rate — Studio</p>
                      <p className="text-xs text-slate-500">Ogni 100€ di costi diretti, {formatEuro(rates.overheadRateStudio * 100)} vanno allo studio</p>
                    </div>
                    <div className="text-right">
                      <span className="text-3xl font-black text-white">{formatPercent(rates.overheadRateStudio)}</span>
                    </div>
                  </div>

                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Overhead Rate — Struttura Fissa</p>
                      <p className="text-xs text-slate-500">Costi fissi puri / Costi diretti</p>
                    </div>
                    <div className="text-right">
                      <span className="text-3xl font-black text-white">{formatPercent(rates.overheadRateFissi)}</span>
                    </div>
                  </div>

                  <div className="p-6 bg-white/5 rounded-2xl border border-white/10">
                    <div className="flex justify-between items-center">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1">
                          <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Overhead Rate Totale</p>
                          <InfoTooltip termId="overhead_rate_totale" color="text-slate-500 hover:text-white" />
                        </div>
                        <p className="text-[10px] text-slate-400">USA QUESTO NEI PREVENTIVI</p>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-2 justify-end">
                          <span className="text-4xl font-black text-white">{formatPercent(rates.overheadRateCompleto)}</span>
                          <div className={`w-4 h-4 rounded-full ${getStatusColor(rates.overheadRateCompleto, { red: 0.45, yellow: 0.30 })}`} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Nota Esplicativa */}
            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 flex gap-4">
              <Info className="text-slate-600 shrink-0" size={24} />
              <div className="text-sm text-slate-900 leading-relaxed">
                <p className="font-bold mb-1">Nota Metodologica</p>
                Gli indici "su fatturato" servono per il controllo di gestione mensile (metodo Gasparotto). 
                L'overhead rate "su costi diretti" serve per calcolare i prezzi nei preventivi — è l'unico metodo che funziona prima di conoscere il ricavo finale.
              </div>
            </div>

            {/* Proiezione */}
            <div className="flex items-center gap-3 bg-slate-100 p-4 rounded-2xl border border-slate-200 self-start">
              <TrendingUp className="text-slate-900" size={20} />
              <span className="text-sm font-bold text-slate-900">
                Proiezione Overhead Rate a fine anno: <span className="font-black">{formatPercent(rates.overheadRateProiettato)}</span>
              </span>
              <span className="px-2 py-0.5 bg-slate-200 text-slate-800 text-[10px] font-black rounded-full uppercase">📈 Live</span>
            </div>
          </div>
        )}

        {activeTab === 'preventivo' && (
          <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
            {/* Toggle Modalità */}
            <div className="flex justify-center no-print">
              <div className="bg-slate-200 p-1 rounded-2xl flex gap-1">
                <button
                  onClick={() => setModalitaCalc('cantiere')}
                  className={`flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-black transition-all ${modalitaCalc === 'cantiere' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <HardHat size={18} />
                  Cantiere per conto terzi
                </button>
                <button
                  onClick={() => setModalitaCalc('immobiliare')}
                  className={`flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-black transition-all ${modalitaCalc === 'immobiliare' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <Building2 size={18} />
                  Sviluppo Immobiliare
                </button>
              </div>
            </div>

            {modalitaCalc === 'cantiere' ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Card 1: Input */}
                <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm space-y-8">
                  <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
                    <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-600">
                      <Calculator size={20} />
                    </div>
                    <div>
                      <h3 className="font-black text-slate-900 uppercase tracking-tight">Dati Input Cantiere</h3>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Costi dal computo metrico</p>
                    </div>
                  </div>

                  <div className="space-y-8">
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Costi diretti cantiere (dal computo)</label>
                      <div className="flex items-center bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 focus-within:border-slate-400 transition-all">
                        <span className="text-2xl font-black text-slate-400 mr-4">€</span>
                        <input 
                          type="number"
                          value={costoDiretto || ''}
                          placeholder="0"
                          onChange={(e) => setCostoDiretto(parseFloat(e.target.value) || 0)}
                          className="w-full bg-transparent text-3xl font-black text-slate-900 outline-none"
                        />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Margine utile desiderato (%)</label>
                      <div className="flex items-center bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 focus-within:border-slate-400 transition-all">
                        <span className="text-2xl font-black text-slate-400 mr-4">%</span>
                        <input 
                          type="number"
                          value={margineTarget || ''}
                          placeholder="10"
                          onChange={(e) => setMargineTarget(parseFloat(e.target.value) || 0)}
                          className="w-full bg-transparent text-3xl font-black text-slate-900 outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 flex items-center gap-3">
                    <Info size={16} className="text-slate-400" />
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-relaxed">
                      Overhead rate usato: {formatPercent(rates.overheadRateCompleto)} (anno {anno})
                    </p>
                  </div>
                </div>

                {/* Card 2: Result */}
                <div className="bg-[#222222] p-8 rounded-[32px] text-white shadow-xl space-y-8">
                  <div className="flex items-center gap-3 pb-4 border-b border-white/10">
                    <div className="w-10 h-10 bg-slate-700 rounded-xl flex items-center justify-center text-white">
                      <Target size={20} />
                    </div>
                    <h3 className="font-black uppercase tracking-tight">Risultato Preventivo</h3>
                  </div>

                  <div className="space-y-6">
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-white/5 pb-4">Breakdown del Prezzo</h4>
                    <div className="space-y-4">
                      {resCantiere.breakdown.map((item, i) => (
                        <div key={i} className="flex justify-between items-center">
                          <div className="space-y-0.5">
                            <p className="text-xs font-bold text-slate-300">{item.voce}</p>
                            <p className="text-[10px] text-slate-500">{formatPercent(item.percentualeSuPrezzo)} del prezzo</p>
                          </div>
                          <span className="text-sm font-black text-blue-400">{formatEuro(item.importo)}</span>
                        </div>
                      ))}
                    </div>

                    <div className="pt-6 border-t border-white/10">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-black text-white uppercase tracking-widest">Prezzo Minimo da Offrire</span>
                        <span className="text-[10px] font-black text-slate-500">Coeff: {resCantiere.coefficienteRicarico.toFixed(2)}x</span>
                      </div>
                      <div className="text-5xl font-black text-white tracking-tighter">{formatEuro(resCantiere.prezzoMinimo)}</div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Card 1: Input Immobiliare */}
                <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm space-y-8">
                  <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
                    <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-600">
                      <Building2 size={20} />
                    </div>
                    <div>
                      <h3 className="font-black text-slate-900 uppercase tracking-tight">Dati Sviluppo Immobiliare</h3>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Terreno + Costruzione</p>
                    </div>
                  </div>

                  <div className="space-y-8">
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Costo Terreno (Passthrough)</label>
                      <div className="flex items-center bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 focus-within:border-slate-400 transition-all">
                        <span className="text-2xl font-black text-slate-400 mr-4">€</span>
                        <input 
                          type="number"
                          value={costoTerreno || ''}
                          placeholder="0"
                          onChange={(e) => setCostoTerreno(parseFloat(e.target.value) || 0)}
                          className="w-full bg-transparent text-3xl font-black text-slate-900 outline-none"
                        />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Costo Costruzione (Base Overhead)</label>
                      <div className="flex items-center bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 focus-within:border-slate-400 transition-all">
                        <span className="text-2xl font-black text-slate-400 mr-4">€</span>
                        <input 
                          type="number"
                          value={costoCostruzione || ''}
                          placeholder="0"
                          onChange={(e) => setCostoCostruzione(parseFloat(e.target.value) || 0)}
                          className="w-full bg-transparent text-3xl font-black text-slate-900 outline-none"
                        />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Margine Target (%)</label>
                      <div className="flex items-center bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 focus-within:border-slate-400 transition-all">
                        <span className="text-2xl font-black text-slate-400 mr-4">%</span>
                        <input 
                          type="number"
                          value={margineTargetImm || ''}
                          placeholder="15"
                          onChange={(e) => setMargineTargetImm(parseFloat(e.target.value) || 0)}
                          className="w-full bg-transparent text-3xl font-black text-slate-900 outline-none"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card 2: Result Immobiliare */}
                <div className="bg-slate-900 p-8 rounded-[32px] text-white shadow-xl space-y-8">
                  <div className="flex items-center gap-3 pb-4 border-b border-white/10">
                    <div className="w-10 h-10 bg-slate-700 rounded-xl flex items-center justify-center text-white">
                      <Zap size={20} />
                    </div>
                    <h3 className="font-black uppercase tracking-tight">Breakdown Operazione</h3>
                  </div>

                  <div className="space-y-6">
                    <div className="space-y-4">
                      {resImmobiliare.breakdown.map((item, i) => (
                        <div key={i} className="flex justify-between items-center">
                          <div className="space-y-0.5">
                            <p className="text-xs font-bold text-slate-300">{item.voce}</p>
                            <p className="text-[10px] text-slate-500">{formatPercent(item.percentualeSuVendita)} della vendita</p>
                          </div>
                          <span className="text-sm font-black text-emerald-400">{formatEuro(item.importo)}</span>
                        </div>
                      ))}
                    </div>

                    <div className="pt-6 border-t border-white/10">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-black text-white uppercase tracking-widest">Prezzo Vendita Minimo</span>
                        <span className="text-[10px] font-black text-slate-500">ROI: {formatPercent(resImmobiliare.roiOperazione)}</span>
                      </div>
                      <div className="text-5xl font-black text-emerald-400 tracking-tighter">{formatEuro(resImmobiliare.prezzoVenditaMinimo)}</div>
                    </div>
                  </div>

                  <div className="bg-white/5 p-6 rounded-2xl border border-white/10 flex items-center gap-3">
                    <Info size={16} className="text-slate-400" />
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed">
                      Sul terreno non si applica overhead perché è un costo di acquisizione, non di produzione.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'orario' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in slide-in-from-bottom-4 duration-500">
            {/* Card 1: Input Costo Orario */}
            <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm space-y-8">
              <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
                <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-600">
                  <Clock size={20} />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 uppercase tracking-tight">Dati Input Operaio</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Parametri di calcolo</p>
                </div>
              </div>

              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Anno</label>
                    <select 
                      value={anno}
                      onChange={(e) => setAnno(parseInt(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-900 outline-none focus:border-slate-400"
                    >
                      {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Mese</label>
                    <select 
                      value={meseOrario}
                      onChange={(e) => setMeseOrario(parseInt(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-900 outline-none focus:border-slate-400"
                    >
                      {Array.from({ length: 12 }, (_, i) => (
                        <option key={i + 1} value={i + 1}>
                          {new Date(0, i).toLocaleString('it-IT', { month: 'long' })}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ore lavorate su cantiere (Cartellini)</label>
                  <input 
                    type="number"
                    value={oreInput || ''}
                    placeholder="0"
                    onChange={(e) => setOreInput(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-2xl font-black text-slate-900 outline-none focus:border-slate-400"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Costo contrattuale (€/ora)</label>
                  <input 
                    type="number"
                    value={costoContrattuale || ''}
                    placeholder="28"
                    onChange={(e) => setCostoContrattuale(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xl font-black text-slate-900 outline-none focus:border-slate-400"
                  />
                </div>
              </div>

              <div className="flex gap-4 p-6 bg-slate-50 rounded-2xl border border-slate-100">
                <Info size={20} className="text-slate-400 shrink-0" />
                <p className="text-[10px] text-slate-500 leading-relaxed uppercase font-bold">
                  Il costo orario reale è calcolato sui pagamenti effettivi di cassa.
                </p>
              </div>
            </div>

            {/* Card 2: Risultato Costo Orario */}
            <div className="bg-[#222222] p-8 rounded-[32px] text-white shadow-xl space-y-8">
              <div className="flex items-center gap-3 pb-4 border-b border-white/10">
                <div className="w-10 h-10 bg-slate-700 rounded-xl flex items-center justify-center text-white">
                  <HardHat size={20} />
                </div>
                <h3 className="font-black uppercase tracking-tight">Analisi Costo Orario</h3>
              </div>

              <div className="space-y-6">
                <div className="bg-white/5 rounded-2xl p-6 space-y-4 border border-white/10">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-400">Stipendi operativi</span>
                    <span className="text-sm font-black text-white">{formatEuro(resOrario.costoMensileStipendi)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-400">Contributi operativi</span>
                    <span className="text-sm font-black text-white">{formatEuro(resOrario.costoMensileContributi)}</span>
                  </div>
                  <div className="pt-4 border-t border-white/10 flex justify-between items-center">
                    <span className="text-xs font-black text-white uppercase">Costo totale mensile</span>
                    <span className="text-lg font-black text-white">{formatEuro(resOrario.costoMensileTotale)}</span>
                  </div>
                </div>

                <div className="pt-6 text-center space-y-4">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Costo Orario Reale</p>
                  <div className="text-6xl font-black text-rose-500 tracking-tighter">
                    {formatEuro(resOrario.costoOrarioReale)}<span className="text-2xl text-rose-400 font-bold">/ora</span>
                  </div>
                  <p className="text-sm font-bold text-slate-400">
                    Contro un costo contrattuale di {formatEuro(resOrario.costoOrarioContrattuale)}/ora
                  </p>
                  {resOrario.differenzaPerOra !== 0 && (
                    <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-black ${resOrario.differenzaPerOra > 0 ? 'bg-rose-500/10 text-rose-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                      {resOrario.differenzaPerOra > 0 ? '+' : ''}{formatEuro(resOrario.differenzaPerOra)} / ora di overhead nascosto
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'sacri' && (
          <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { 
                  id: 1, 
                  label: 'Fatturato YTD', 
                  termId: 'fatturato',
                  value: formatEuro(metrics.fatturato), 
                  desc: 'Ricavi core realizzati',
                  status: 'blue', 
                  icon: BarChart2,
                  proj: formatEuro(metrics.fatturato * (12 / rates.mesiTrascorsi))
                },
                { 
                  id: 2, 
                  label: 'Primo Margine %', 
                  termId: 'primo_margine',
                  value: formatPercent(metrics.primoMarginePercent), 
                  desc: 'Margine dopo costi diretti',
                  status: 'emerald', 
                  icon: Target,
                  proj: formatPercent(metrics.primoMarginePercent),
                  soglie: {
                    valore: metrics.primoMarginePercent,
                    tipo: 'piu_alto_meglio',
                    fasce: [
                      { min: 0.15, label: 'Ottimo', colore: 'ottimo' },
                      { min: 0.10, max: 0.15, label: 'Buono', colore: 'buono' },
                      { min: 0.05, max: 0.10, label: 'Attenzione', colore: 'attenzione' },
                      { max: 0.05, label: 'Critico', colore: 'critico' },
                    ]
                  }
                },
                { 
                  id: 3, 
                  label: 'EBITDA %', 
                  termId: 'ebitda',
                  value: formatPercent(metrics.ebitdaPercent), 
                  desc: 'Margine operativo lordo',
                  status: 'indigo', 
                  icon: TrendingUp,
                  proj: formatPercent(metrics.ebitdaPercent),
                  soglie: {
                    valore: metrics.ebitdaPercent,
                    tipo: 'piu_alto_meglio',
                    fasce: [
                      { min: 0.10, label: 'Ottimo', colore: 'ottimo' },
                      { min: 0.07, max: 0.10, label: 'Buono', colore: 'buono' },
                      { min: 0.04, max: 0.07, label: 'Attenzione', colore: 'attenzione' },
                      { max: 0.04, label: 'Critico', colore: 'critico' },
                    ]
                  }
                },
                { 
                  id: 4, 
                  label: 'Utile Netto %', 
                  termId: 'utile_netto',
                  value: formatPercent(metrics.utileNettoPercent), 
                  desc: 'Utile dopo tasse e ammortamenti',
                  status: 'violet', 
                  icon: Zap,
                  proj: formatPercent(metrics.utileNettoPercent),
                  soglie: {
                    valore: metrics.utileNettoPercent,
                    tipo: 'piu_alto_meglio',
                    fasce: [
                      { min: 0.06, label: 'Ottimo', colore: 'ottimo' },
                      { min: 0.04, max: 0.06, label: 'Buono', colore: 'buono' },
                      { min: 0.02, max: 0.04, label: 'Attenzione', colore: 'attenzione' },
                      { max: 0.02, label: 'Critico', colore: 'critico' },
                    ]
                  }
                },
                { 
                  id: 5, 
                  label: 'Punto di Pareggio', 
                  termId: 'break_even',
                  value: formatEuro(metrics.breakEven), 
                  desc: 'Fatturato minimo per pareggio',
                  status: 'rose', 
                  icon: AlertCircle,
                  proj: formatEuro(metrics.breakEven),
                  extra: formatEuro(metrics.breakEvenCassa),
                  extraLabel: 'Di cassa',
                  soglie: {
                    valore: metrics.fatturato,
                    tipo: 'piu_alto_meglio',
                    customLabel: metrics.fatturato >= metrics.breakEven ? 'Raggiunto' : 'Mancano ' + formatEuro(metrics.breakEven - metrics.fatturato),
                    fasce: [
                      { min: metrics.breakEven, label: 'Raggiunto', colore: 'ottimo' },
                      { min: metrics.breakEven * 0.8, max: metrics.breakEven, label: 'Quasi', colore: 'attenzione' },
                      { max: metrics.breakEven * 0.8, label: 'Lontano', colore: 'critico' },
                    ]
                  }
                },
                { 
                  id: 6, 
                  label: 'Incidenza Studio %', 
                  termId: 'incidenza_studio_fatturato',
                  value: formatPercent(rates.incidenzaStudioFatturato), 
                  desc: 'Costo tecnici su fatturato',
                  status: 'sky', 
                  icon: Calculator,
                  proj: formatPercent(rates.incidenzaStudioFatturato),
                  soglie: {
                    valore: rates.incidenzaStudioFatturato,
                    tipo: 'piu_basso_meglio',
                    fasce: [
                      { max: 0.15, label: 'Ottimo', colore: 'ottimo' },
                      { min: 0.15, max: 0.20, label: 'Buono', colore: 'buono' },
                      { min: 0.20, max: 0.25, label: 'Attenzione', colore: 'attenzione' },
                      { min: 0.25, label: 'Critico', colore: 'critico' },
                    ]
                  }
                },
                { 
                  id: 7, 
                  label: 'Incidenza Fissi %', 
                  termId: 'incidenza_fissi_fatturato',
                  value: formatPercent(rates.incidenzaFissiFatturato), 
                  desc: 'Costi struttura su fatturato',
                  status: 'amber', 
                  icon: BarChart2,
                  proj: formatPercent(rates.incidenzaFissiFatturato),
                  soglie: {
                    valore: rates.incidenzaFissiFatturato,
                    tipo: 'piu_basso_meglio',
                    fasce: [
                      { max: 0.08, label: 'Ottimo', colore: 'ottimo' },
                      { min: 0.08, max: 0.12, label: 'Buono', colore: 'buono' },
                      { min: 0.12, max: 0.15, label: 'Attenzione', colore: 'attenzione' },
                      { min: 0.15, label: 'Critico', colore: 'critico' },
                    ]
                  }
                },
                { 
                  id: 8, 
                  label: 'Compenso Soci', 
                  termId: undefined,
                  value: formatEuro(rates.compensoSoci), 
                  desc: 'Remunerazione proprietà',
                  status: 'orange', 
                  icon: Sparkles,
                  proj: formatEuro(rates.compensoSoci * (12 / rates.mesiTrascorsi)),
                  soglie: {
                    valore: metrics.utileNettoTot > 0 ? rates.compensoSoci / metrics.utileNettoTot : 1,
                    tipo: 'piu_basso_meglio',
                    fasce: [
                      { max: 0.30, label: 'Ottimo', colore: 'ottimo' },
                      { min: 0.30, max: 0.50, label: 'Buono', colore: 'buono' },
                      { min: 0.50, max: 0.80, label: 'Attenzione', colore: 'attenzione' },
                      { min: 0.80, label: 'Critico', colore: 'critico' },
                    ]
                  }
                },
              ].map((num) => (
                <SacredCard key={num.id} num={num} />
              ))}
            </div>

            {/* LEGENDA VALUTAZIONI */}
            <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm p-6 space-y-6">
              <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
                <div className="w-9 h-9 bg-slate-50 rounded-xl flex items-center justify-center text-slate-600">
                  <Sparkles size={18} />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-xs uppercase tracking-wider">Legenda Valutazioni e Colori</h3>
                  <p className="text-[9px] text-slate-400">Guida alla lettura delle fasce di allerta per i 7+1 Numeri Sacri</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Significato dei Colori */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Significato dei Colori</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-start gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 mt-1" />
                      <div>
                        <p className="text-[10px] font-black text-emerald-800 uppercase">Ottimo</p>
                        <p className="text-[9px] text-emerald-600 font-bold leading-relaxed mt-0.5">Valore ideale raggiunto. Prestazione eccellente.</p>
                      </div>
                    </div>
                    <div className="p-3 bg-blue-50 rounded-2xl border border-blue-100 flex items-start gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-1" />
                      <div>
                        <p className="text-[10px] font-black text-blue-800 uppercase">Buono</p>
                        <p className="text-[9px] text-blue-600 font-bold leading-relaxed mt-0.5">Target standard soddisfatto. Situazione stabile.</p>
                      </div>
                    </div>
                    <div className="p-3 bg-amber-50 rounded-2xl border border-amber-100 flex items-start gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0 mt-1" />
                      <div>
                        <p className="text-[10px] font-black text-amber-800 uppercase">Attenzione</p>
                        <p className="text-[9px] text-amber-600 font-bold leading-relaxed mt-0.5">Deviazione dai target. Monitoraggio consigliato.</p>
                      </div>
                    </div>
                    <div className="p-3 bg-rose-50 rounded-2xl border border-rose-100 flex items-start gap-2">
                      <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0 mt-1" />
                      <div>
                        <p className="text-[10px] font-black text-rose-800 uppercase">Critico</p>
                        <p className="text-[9px] text-rose-600 font-bold leading-relaxed mt-0.5">Soglia di sicurezza superata. Azione richiesta.</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Tabella delle Soglie */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Soglie di Valutazione degli Indici</h4>
                  <div className="overflow-x-auto rounded-xl border border-slate-100">
                    <table className="w-full text-left text-[10px]">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100 font-black text-slate-400 uppercase tracking-widest">
                          <th className="px-3 py-2">Numero Sacro</th>
                          <th className="px-2 py-2 text-emerald-600">Ottimo</th>
                          <th className="px-2 py-2 text-blue-600">Buono</th>
                          <th className="px-2 py-2 text-amber-600">Attenzione</th>
                          <th className="px-2 py-2 text-rose-600">Critico</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 font-bold text-slate-600">
                        <tr>
                          <td className="px-3 py-1.5 font-black text-slate-800">2. Primo Margine %</td>
                          <td className="px-2 py-1.5 font-mono">&ge; 15%</td>
                          <td className="px-2 py-1.5 font-mono">10% - 15%</td>
                          <td className="px-2 py-1.5 font-mono">5% - 10%</td>
                          <td className="px-2 py-1.5 font-mono">&lt; 5%</td>
                        </tr>
                        <tr>
                          <td className="px-3 py-1.5 font-black text-slate-800">3. EBITDA %</td>
                          <td className="px-2 py-1.5 font-mono">&ge; 10%</td>
                          <td className="px-2 py-1.5 font-mono">7% - 10%</td>
                          <td className="px-2 py-1.5 font-mono">4% - 7%</td>
                          <td className="px-2 py-1.5 font-mono">&lt; 4%</td>
                        </tr>
                        <tr>
                          <td className="px-3 py-1.5 font-black text-slate-800">4. Utile Netto %</td>
                          <td className="px-2 py-1.5 font-mono">&ge; 6%</td>
                          <td className="px-2 py-1.5 font-mono">4% - 6%</td>
                          <td className="px-2 py-1.5 font-mono">2% - 4%</td>
                          <td className="px-2 py-1.5 font-mono">&lt; 2%</td>
                        </tr>
                        <tr>
                          <td className="px-3 py-1.5 font-black text-slate-800">5. Punto Pareggio</td>
                          <td className="px-2 py-1.5 font-mono">Fatturato &ge; BEP</td>
                          <td className="px-2 py-1.5 font-mono">—</td>
                          <td className="px-2 py-1.5 font-mono">80% - 100% BEP</td>
                          <td className="px-2 py-1.5 font-mono">&lt; 80% BEP</td>
                        </tr>
                        <tr>
                          <td className="px-3 py-1.5 font-black text-slate-800">6. Incidenza Studio</td>
                          <td className="px-2 py-1.5 font-mono">&le; 15%</td>
                          <td className="px-2 py-1.5 font-mono">15% - 20%</td>
                          <td className="px-2 py-1.5 font-mono">20% - 25%</td>
                          <td className="px-2 py-1.5 font-mono">&gt; 25%</td>
                        </tr>
                        <tr>
                          <td className="px-3 py-1.5 font-black text-slate-800">7. Incidenza Fissi</td>
                          <td className="px-2 py-1.5 font-mono">&le; 8%</td>
                          <td className="px-2 py-1.5 font-mono">8% - 12%</td>
                          <td className="px-2 py-1.5 font-mono">12% - 15%</td>
                          <td className="px-2 py-1.5 font-mono">&gt; 15%</td>
                        </tr>
                        <tr>
                          <td className="px-3 py-1.5 font-black text-slate-800">8. Compenso Soci</td>
                          <td className="px-2 py-1.5 font-mono">&le; 30% Utile</td>
                          <td className="px-2 py-1.5 font-mono">30% - 50%</td>
                          <td className="px-2 py-1.5 font-mono">50% - 80%</td>
                          <td className="px-2 py-1.5 font-mono">&gt; 80%</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'fiscale' && (
          <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">

            {/* Avviso se mancano rimanenze */}
            {!previsioneFiscale.hasRimanenze && (
              <div className="flex items-start gap-3 bg-slate-100 border border-slate-200 rounded-2xl p-4">
                <AlertCircle size={16} className="text-slate-500 shrink-0 mt-0.5" />
                <p className="text-[11px] text-slate-800 leading-relaxed">
                  Le rimanenze non sono state inserite per il {anno} —
                  la previsione fiscale non include la variazione WIP e materiali.
                  Inseriscile nel Conto Economico → sezione "Rettifiche di Fine Anno".
                </p>
              </div>
            )}

            {/* Aliquote personalizzabili */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">
                Aliquote Fiscali
              </h3>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Aliquota IRES (%)
                  </label>
                  <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus-within:border-slate-400 transition-all">
                    <input
                      type="number"
                      value={aliquotaIRES}
                      step="0.1"
                      min="0"
                      max="100"
                      onChange={e => onChangeAliquotaIRES(parseFloat(e.target.value) || 24)}
                      className="w-full bg-transparent text-lg font-black text-slate-900 outline-none"
                    />
                    <span className="text-slate-400 font-bold ml-2">%</span>
                  </div>
                  <p className="text-[10px] text-slate-400">Standard: 24% — invariata dal 2017</p>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Aliquota IRAP (%)
                  </label>
                  <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus-within:border-slate-400 transition-all">
                    <input
                      type="number"
                      value={aliquotaIRAP}
                      step="0.1"
                      min="0"
                      max="100"
                      onChange={e => onChangeAliquotaIRAP(parseFloat(e.target.value) || 3.9)}
                      className="w-full bg-transparent text-lg font-black text-slate-900 outline-none"
                    />
                    <span className="text-slate-400 font-bold ml-2">%</span>
                  </div>
                  <p className="text-[10px] text-slate-400">Standard: 3,9% — Veneto: 3,9% (verifica con commercialista)</p>
                </div>
              </div>
            </div>

            {/* Basi imponibili */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* IRES */}
              <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm space-y-6">
                <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
                  <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-600">
                    <Target size={20} />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-900 uppercase tracking-tight text-sm">IRES</h3>
                    <p className="text-[10px] text-slate-400">Imposta sul Reddito delle Società</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">EBIT per cassa</p>
                      <p className="text-xs text-slate-500">Da CE consuntivo</p>
                    </div>
                    <span className="text-sm font-black text-slate-700 font-mono">{formatEuro(metrics.ebitTot)}</span>
                  </div>

                  {previsioneFiscale.hasRimanenze && (
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Variazione Rimanenze</p>
                        <p className="text-xs text-slate-500">WIP + Materiali</p>
                      </div>
                      <span className={`text-sm font-black font-mono ${previsioneFiscale.variazioneRimanenze >= 0 ? 'text-slate-900' : 'text-slate-400'}`}>
                        {previsioneFiscale.variazioneRimanenze >= 0 ? '+' : ''}{formatEuro(previsioneFiscale.variazioneRimanenze)}
                      </span>
                    </div>
                  )}

                  <div className="p-4 bg-slate-100 rounded-2xl border border-slate-200">
                    <div className="flex justify-between items-center">
                      <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Base Imponibile IRES</p>
                      <span className="text-xl font-black text-slate-900 font-mono">{formatEuro(previsioneFiscale.baseImponibileIRES)}</span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">IRES Stimata</p>
                      <p className="text-xs text-slate-500">Base × {aliquotaIRES}%</p>
                    </div>
                    <span className="text-2xl font-black text-blue-600 font-mono">{formatEuro(previsioneFiscale.iresStimata)}</span>
                  </div>
                </div>
              </div>

              {/* IRAP */}
              <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm space-y-6">
                <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
                  <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
                    <BarChart2 size={20} />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-900 uppercase tracking-tight text-sm">IRAP</h3>
                    <p className="text-[10px] text-slate-400">Imposta Regionale sulle Attività Produttive</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Valore Produzione</p>
                      <p className="text-xs text-slate-500">Ricavi + Δ WIP</p>
                    </div>
                    <span className="text-sm font-black text-slate-700 font-mono">{formatEuro(metrics.fatturato + (previsioneFiscale.hasRimanenze ? (rimanenzeAnno?.wipFine ?? 0) - (rimanenzeAnno?.wipInizio ?? 0) : 0))}</span>
                  </div>

                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Costi Deducibili IRAP</p>
                      <p className="text-xs text-slate-500">Costi operativi escluso personale dipendente</p>
                    </div>
                    <span className="text-sm font-black text-slate-700 font-mono">
                      -{formatEuro(previsioneFiscale.baseImponibileIRAP > 0
                        ? (metrics.fatturato + (previsioneFiscale.hasRimanenze ? (rimanenzeAnno?.wipFine ?? 0) - (rimanenzeAnno?.wipInizio ?? 0) : 0)) - previsioneFiscale.baseImponibileIRAP
                        : 0)}
                    </span>
                  </div>

                  <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100">
                    <div className="flex justify-between items-center">
                      <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Base Imponibile IRAP</p>
                      <span className="text-xl font-black text-emerald-700 font-mono">{formatEuro(previsioneFiscale.baseImponibileIRAP)}</span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">IRAP Stimata</p>
                      <p className="text-xs text-slate-500">Base × {aliquotaIRAP}%</p>
                    </div>
                    <span className="text-2xl font-black text-emerald-600 font-mono">{formatEuro(previsioneFiscale.irapStimata)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Totale imposte e acconti */}
            <div className="bg-[#222222] rounded-[32px] p-8 text-white space-y-6">
              <div className="flex items-center gap-3 pb-4 border-b border-white/10">
                <div className="w-10 h-10 bg-rose-500/20 rounded-xl flex items-center justify-center">
                  <Zap size={20} className="text-rose-400" />
                </div>
                <div>
                  <h3 className="font-black uppercase tracking-tight">Carico Fiscale Totale e Scadenze</h3>
                  <p className="text-[10px] text-slate-400">IRES + IRAP — anno {anno}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                {/* Totale */}
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Totale Imposte Stimate</p>
                  <p className="text-4xl font-black tracking-tighter text-rose-400">{formatEuro(previsioneFiscale.totaleImposteStimate)}</p>
                  <div className="text-[10px] text-slate-400 space-y-0.5">
                    <p>IRES: {formatEuro(previsioneFiscale.iresStimata)}</p>
                    <p>IRAP: {formatEuro(previsioneFiscale.irapStimata)}</p>
                  </div>
                </div>

                {/* Acconti */}
                <div className="space-y-3">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Acconti da Versare</p>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-3">
                      <div>
                        <p className="text-xs font-black text-slate-400">Acconto Giugno</p>
                        <p className="text-[10px] text-slate-400">Scadenza 30/06/{anno} — 40%</p>
                      </div>
                      <span className="text-lg font-black font-mono">{formatEuro(previsioneFiscale.accontoGiugno)}</span>
                    </div>
                    <div className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-3">
                      <div>
                        <p className="text-xs font-black text-slate-400">Acconto Novembre</p>
                        <p className="text-[10px] text-slate-400">Scadenza 30/11/{anno} — 60%</p>
                      </div>
                      <span className="text-lg font-black font-mono">{formatEuro(previsioneFiscale.accontoNovembre)}</span>
                    </div>
                  </div>
                </div>

                {/* Già versato / residuo */}
                <div className="space-y-3">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Posizione Attuale</p>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-3">
                      <div>
                        <p className="text-xs font-black text-slate-300">F24 Già Versati</p>
                        <p className="text-[10px] text-slate-400">Da cash flow {anno}</p>
                      </div>
                      <span className="text-lg font-black font-mono text-slate-400">{formatEuro(previsioneFiscale.impostePagate)}</span>
                    </div>
                    <div className={`flex items-center justify-between rounded-xl px-4 py-3 ${
                      previsioneFiscale.residuoDaVersare > 0
                        ? 'bg-slate-200 border border-slate-300'
                        : 'bg-slate-100 border border-slate-200'
                    }`}>
                      <div>
                        <p className={`text-xs font-black ${previsioneFiscale.residuoDaVersare > 0 ? 'text-slate-900' : 'text-slate-500'}`}>
                          {previsioneFiscale.residuoDaVersare > 0 ? 'Residuo da Versare' : 'In Linea / Credito'}
                        </p>
                        <p className="text-[10px] text-slate-400">Stima — verificare con commercialista</p>
                      </div>
                      <span className={`text-lg font-black font-mono ${previsioneFiscale.residuoDaVersare > 0 ? 'text-slate-900' : 'text-slate-500'}`}>
                        {formatEuro(previsioneFiscale.residuoDaVersare)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Utile netto dopo imposte */}
              <div className="pt-4 border-t border-white/10 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Utile Netto Stimato Dopo Imposte</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {previsioneFiscale.hasRimanenze
                      ? 'EBIT + variazione rimanenze − IRES − IRAP'
                      : 'EBIT − IRES − IRAP (senza rettifica rimanenze)'}
                  </p>
                </div>
                <span className={`text-3xl font-black font-mono ${previsioneFiscale.utileDopoImposte >= 0 ? 'text-slate-100' : 'text-slate-400'}`}>
                  {formatEuro(previsioneFiscale.utileDopoImposte)}
                </span>
              </div>
            </div>

            {/* Disclaimer */}
            <div className="flex items-start gap-3 bg-slate-50 border border-slate-200 rounded-2xl p-5">
              <Info size={16} className="text-slate-400 shrink-0 mt-0.5" />
              <div className="text-[11px] text-slate-500 leading-relaxed space-y-1.5">
                <p>
                  <span className="font-black text-slate-700">Questa è una stima semplificata</span> —
                  non sostituisce il calcolo del commercialista.
                </p>
                <p>
                  La base IRES non include: deduzioni ACE, perdite fiscali pregresse,
                  variazioni permanenti/temporanee, deduzioni per nuove assunzioni.
                </p>
                <p>
                  La base IRAP non include: deduzioni per contratti a tempo indeterminato
                  (cuneo IRAP), contributi INAIL, deduzioni regionali specifiche.
                  L'aliquota varia per regione e per settore — verificare con il commercialista.
                </p>
                <p>
                  Gli acconti sono calcolati sul 100% delle imposte stimate dell'anno corrente
                  (metodo previsionale). Il metodo storico (basato sull'anno precedente)
                  può essere più vantaggioso — valutare con il commercialista.
                </p>
              </div>
            </div>

          </div>
        )}
      </div>
      </div>
      
      {showHelp && (
        <HelpPanel 
          isOpen={true}
          onClose={() => setShowHelp(false)}
          currentView={AppView.ANALISI_INDICI}
          onGoToManuale={onGoToManuale}
        />
      )}
    </div>
  );
};

const SacredCard = ({ num }: { num: any }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const fascia = num.soglie ? getFascia(num.soglie, num.soglie.valore) : undefined;
  const config = fascia ? COLORE_SOGLIA[fascia.colore] : undefined;

  // Calcolo percentuale per la barra di progresso (semplificato)
  const getProgress = () => {
    if (!num.soglie) return 0;
    const { valore, tipo, fasce } = num.soglie;
    
    // Trova il range totale per mappare 0-100%
    const allValues = fasce.flatMap(f => [f.min, f.max]).filter((v): v is number => v !== undefined);
    const minS = Math.min(...allValues, valore);
    const maxS = Math.max(...allValues, valore);
    const range = maxS - minS;
    
    if (range === 0) return 50;
    const rawPerc = ((valore - minS) / range) * 100;
    return tipo === 'piu_alto_meglio' ? rawPerc : 100 - rawPerc;
  };

  return (
    <div className={`bg-white rounded-[32px] border ${config?.border || 'border-slate-200'} shadow-sm overflow-hidden flex flex-col transition-all duration-300`}>
      <div className="p-6 space-y-4 flex-grow">
        <div className="flex items-center justify-between">
          <span className="text-4xl font-black text-slate-100">{num.id}</span>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${config?.bg || 'bg-slate-50'} ${config?.text || 'text-slate-600'}`}>
            <num.icon size={20} />
          </div>
        </div>
        
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{num.label}</h4>
            {num.termId && <InfoTooltip termId={num.termId} />}
            {fascia && (
              <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase ${config?.bg} ${config?.text} border ${config?.border}`}>
                {num.soglie?.customLabel || fascia.label}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 leading-tight">{num.desc}</p>
        </div>

        <div className="space-y-3">
          <div className="flex items-baseline gap-2">
            <div className={`text-2xl font-black ${config?.text || 'text-slate-900'}`}>{num.value}</div>
            <div className="text-[10px] font-black italic text-slate-400">📈 {num.proj}</div>
          </div>

          {/* Progress Bar */}
          {num.soglie && (
            <div className="space-y-1">
              <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-1000 ${config?.progress || 'bg-slate-300'}`}
                  style={{ width: `${Math.min(100, Math.max(5, getProgress()))}%` }}
                />
              </div>
              <div className="flex justify-between text-[8px] font-black text-slate-300 uppercase tracking-tighter">
                <span>Min</span>
                <span>Target</span>
                <span>Max</span>
              </div>
            </div>
          )}

          {num.extra && (
            <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
              <span className="text-[10px] font-bold text-slate-400 uppercase">{num.extraLabel}:</span>
              <span className="text-sm font-black text-slate-600">{num.extra}</span>
            </div>
          )}
        </div>
      </div>

      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        className={`w-full p-4 ${config?.bg || 'bg-slate-50'} border-t ${config?.border || 'border-slate-100'} flex items-center justify-between text-[10px] font-black ${config?.text || 'text-slate-500'} uppercase tracking-widest hover:opacity-80 transition-all`}
      >
        Azioni Correttive
        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {isExpanded && (
        <div className={`p-4 ${config?.bg || 'bg-slate-50'} text-[10px] ${config?.text || 'text-slate-600'} font-bold leading-relaxed border-t ${config?.border || 'border-slate-100'} animate-in slide-in-from-top-2`}>
          <div className="flex gap-2">
            <Sparkles size={12} className="shrink-0" />
            <div>
              {num.id === 1 && "Monitorare il portafoglio ordini e accelerare le fatturazioni dei SAL."}
              {num.id === 2 && "Rinegoziare i contratti con i subappaltatori o ottimizzare l'acquisto materiali."}
              {num.id === 3 && "Ridurre gli sprechi di cantiere e monitorare le ore di manodopera improduttive."}
              {num.id === 4 && "Ottimizzare la gestione fiscale e ridurre gli oneri finanziari bancari."}
              {num.id === 5 && "Ridurre i costi fissi di struttura o aumentare il volume d'affari."}
              {num.id === 6 && "Valutare l'efficienza del personale tecnico rispetto alle commesse gestite."}
              {num.id === 7 && "Tagliare spese non strategiche (software inutilizzati, utenze, marketing inefficiente)."}
              {num.id === 8 && "Allineare il compenso alle reali capacità di generazione cassa dell'azienda."}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnalisiView;
