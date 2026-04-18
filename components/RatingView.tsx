import React, { useMemo, useState } from 'react';
import { Transaction, SPSnapshot, CEData, AppView } from '../types';
import { buildCEData, calcCEMetrics, calcSPMetrics, calcRollingDSODPO } from '../utils/gasCoreEngine';
import PDFExportButton from './PDFExportButton';
import InfoTooltip, { InfoTooltipWrapper } from './InfoTooltip';
import { HelpButton } from './HelpPanel';
import HelpPanel from './HelpPanel';
import { 
  ShieldCheck, 
  TrendingUp, 
  Wallet, 
  ArrowRightLeft, 
  Building2,
  AlertCircle,
  CheckCircle2,
  Info,
  Activity
} from 'lucide-react';

interface RatingViewProps {
  transactions: Transaction[];
  spSnapshots: SPSnapshot[];
  ceManualData: Record<string, Partial<CEData>>;
  onGoToManuale?: (section?: string, tab?: 'manuale' | 'glossario') => void;
}

const formatEuro = (val: number) => 
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(val);

const formatPercent = (val: number) => 
  new Intl.NumberFormat('it-IT', { style: 'percent', minimumFractionDigits: 1 }).format(val);

const RatingView: React.FC<RatingViewProps> = ({ transactions, spSnapshots, ceManualData, onGoToManuale }) => {
  const currentYear = new Date().getFullYear();
  const [showHelp, setShowHelp] = useState(false);
  
  const ceData = useMemo(() => 
    buildCEData(transactions, currentYear, ceManualData[currentYear.toString()]), 
    [transactions, currentYear, ceManualData]
  );

  const ceMetrics = useMemo(() => calcCEMetrics(ceData, transactions), [ceData, transactions]);

  const latestSP = useMemo(() => 
    spSnapshots.sort((a, b) => new Date(b.dataRiferimento).getTime() - new Date(a.dataRiferimento).getTime())[0],
    [spSnapshots]
  );

  const spMetrics = useMemo(() => 
    latestSP ? calcSPMetrics(latestSP, ceMetrics, transactions) : null,
    [latestSP, ceMetrics, transactions]
  );

  const rollingDSODPO = useMemo(() =>
    calcRollingDSODPO(transactions),
    [transactions]
  );

  const indicators = useMemo(() => {
    if (!spMetrics) return [];
    
    return [
      { 
        label: 'PFN / EBITDA', 
        value: spMetrics.pfnSuEbitda.toFixed(2) + 'x',
        score: spMetrics.pfnSuEbitda <= 3 ? 1 : 0,
        target: '< 3x',
        status: spMetrics.pfnSuEbitda <= 3 ? 'slate-600' : 'slate-400'
      },
      { 
        label: 'EBITDA / Oneri Fin.', 
        value: ceMetrics.oneriFin > 0 ? (ceMetrics.ebitdaTot / ceMetrics.oneriFin).toFixed(2) + 'x' : 'N/A',
        score: ceMetrics.oneriFin > 0 && (ceMetrics.ebitdaTot / ceMetrics.oneriFin) >= 3 ? 1 : 0,
        target: '> 3x',
        status: ceMetrics.oneriFin > 0 && (ceMetrics.ebitdaTot / ceMetrics.oneriFin) >= 3 ? 'slate-600' : 'slate-400'
      },
      { 
        label: 'Current Ratio', 
        value: spMetrics.currentRatio.toFixed(2),
        score: spMetrics.currentRatio >= 1.2 ? 1 : 0,
        target: '> 1.2',
        status: spMetrics.currentRatio >= 1.2 ? 'slate-600' : 'slate-400'
      },
      { 
        label: 'Solidità Patrimoniale', 
        value: formatPercent(spMetrics.soliditaPatr),
        score: spMetrics.soliditaPatr >= 0.3 ? 1 : 0,
        target: '> 30%',
        status: spMetrics.soliditaPatr >= 0.3 ? 'slate-600' : 'slate-400'
      },
      { 
        label: 'Utile Netto %', 
        value: formatPercent(ceMetrics.utileNettoPercent),
        score: ceMetrics.utileNettoPercent >= 0.03 ? 1 : 0,
        target: '> 3%',
        status: ceMetrics.utileNettoPercent >= 0.03 ? 'slate-600' : 'slate-400'
      },
      { 
        label: 'DSO (Giorni Incasso)', 
        value: Math.round(spMetrics.dso) + ' gg',
        score: spMetrics.dso <= 60 ? 1 : 0,
        target: '< 60 gg',
        status: spMetrics.dso <= 60 ? 'slate-600' : 'slate-400'
      },
      {
        label: 'DPO (Giorni Pagamento)',
        value: Math.round(spMetrics.dpo) + ' gg',
        score: spMetrics.dpo >= 30 && spMetrics.dpo <= 90 ? 1 : 0,
        target: '30–90 gg',
        status: spMetrics.dpo >= 30 && spMetrics.dpo <= 90 ? 'slate-600' : 'slate-500'
      }
    ];
  }, [spMetrics, ceMetrics]);

  const totalScore = indicators.reduce((a, b) => a + b.score, 0);
  const rating = totalScore >= 6 ? { label: 'AAA / AA — Eccellente', color: 'slate-900' } :
                 totalScore >= 5 ? { label: 'A / BBB — Solido', color: 'slate-700' } :
                 totalScore >= 3 ? { label: 'BB — Attenzione', color: 'slate-500' } :
                 { label: 'B / C — Critico', color: 'slate-400' };

  if (!latestSP) {
    return (
      <div className="flex flex-col items-center justify-center p-20 bg-white rounded-3xl border border-slate-200 shadow-sm">
        <AlertCircle size={48} className="text-slate-300 mb-4" />
        <h3 className="text-xl font-black text-slate-800">Dati Patrimoniali Mancanti</h3>
        <p className="text-slate-500 text-center max-w-md mt-2">Per calcolare il Rating è necessario inserire almeno uno Snapshot nello Stato Patrimoniale.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-200 no-print">
        <div>
          <h2 className="text-2xl font-black text-slate-900 flex items-center gap-3">
            <ShieldCheck className="text-slate-900" />
            Rating Bancario (Basilea 3)
          </h2>
          <p className="text-slate-500 text-sm mt-1">Valutazione automatica del merito creditizio</p>
        </div>
        <div className="flex items-center gap-4">
          <HelpButton onClick={() => setShowHelp(true)} />
          <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-xl text-xs font-bold text-slate-500">
            <Activity size={14} />
            Dati aggiornati al {new Date(latestSP.dataRiferimento).toLocaleDateString('it-IT')}
          </div>
          <PDFExportButton
            config={{
              titolo: `Report Rating Bancario ${currentYear}`,
              sottotitolo: `Valutazione merito creditizio — aggiornato ${new Date().toLocaleDateString('it-IT')}`,
              elementId: 'rating-report-content',
              orientazione: 'portrait',
              nomeFile: `Rating_${currentYear}`,
            }}
          />
        </div>
      </div>

      <div id="rating-report-content" className="space-y-6">
        {/* Header for PDF only (hidden in UI) */}
        <div className="hidden print-only bg-white p-6 rounded-3xl border border-slate-200 mb-6">
           <h2 className="text-2xl font-black text-slate-900">Rating Bancario {currentYear}</h2>
           <p className="text-slate-500 text-sm">Valutazione automatica del merito creditizio del Gruppo Visentin</p>
        </div>


      {/* Rating Score Card */}
      <div className={`p-8 rounded-3xl border shadow-lg text-center ${rating.color === 'slate-900' ? 'bg-slate-900 border-slate-800 text-white' : rating.color === 'slate-700' ? 'bg-slate-700 border-slate-600 text-white' : rating.color === 'slate-500' ? 'bg-slate-500 border-slate-400 text-white' : 'bg-slate-400 border-slate-300 text-white'}`}>
        <div className="text-[10px] font-black uppercase tracking-[0.3em] opacity-70 mb-2">Giudizio Sintetico</div>
        <div className="text-4xl font-black mb-4">{rating.label}</div>
        <div className="flex justify-center gap-1">
          {[1, 2, 3, 4, 5, 6, 7].map(i => (
            <div key={i} className={`w-10 h-2 rounded-full ${i <= totalScore ? 'bg-white' : 'bg-black/20'}`} />
          ))}
        </div>
        <p className="text-xs mt-6 opacity-80 max-w-xl mx-auto italic">
          Questa valutazione si basa sugli indici di bilancio calcolati automaticamente. 
          Il rating reale della banca include anche la Centrale Rischi e fattori qualitativi.
        </p>
      </div>

      {/* Indicators Grid */}
      <InfoTooltipWrapper className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {indicators.map((ind, i) => {
          // Map label to glossary term if possible
          const termId = ind.label === 'PFN / EBITDA' ? 'pfn_ebitda' :
                         ind.label === 'EBITDA / Oneri Fin.' ? 'copertura_interessi' :
                         ind.label === 'Current Ratio' ? 'current_ratio' :
                         ind.label === 'Solidità Patrimoniale' ? 'solidita_patrimoniale' :
                         ind.label === 'Utile Netto %' ? 'utile_netto' :
                         ind.label === 'DSO (Giorni Incasso)' ? 'dso' :
                         ind.label === 'DPO (Giorni Pagamento)' ? 'dpo' : undefined;

          return (
            <div key={i} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{ind.label}</span>
                  {termId && <InfoTooltip termId={termId} />}
                </div>
                {ind.status === 'slate-600' ? <CheckCircle2 size={16} className="text-slate-900" /> : ind.status === 'slate-500' ? <AlertCircle size={16} className="text-slate-500" /> : <AlertCircle size={16} className="text-slate-400" />}
              </div>
              <div className="flex items-baseline justify-between">
                <div className="text-2xl font-black text-slate-900">{ind.value}</div>
                <div className="text-[10px] font-bold text-slate-400">Target: {ind.target}</div>
              </div>
              <div className="mt-4 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-1000 ${ind.status === 'slate-600' ? 'bg-slate-900' : ind.status === 'slate-500' ? 'bg-slate-500' : 'bg-slate-400'}`}
                  style={{ width: `${Math.min(ind.score * 100, 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </InfoTooltipWrapper>

      {/* Pannello DSO / DPO Rolling */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">
              DSO / DPO Rolling 12 mesi
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Calcolato direttamente dalle transazioni — sempre aggiornato
            </p>
          </div>
          <span className="px-3 py-1 bg-slate-100 text-slate-700 text-[10px] font-black rounded-full uppercase tracking-wide">
            Live
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4">

          {/* DSO */}
          <div className="bg-slate-50 rounded-2xl p-5 space-y-3">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              DSO Rolling
            </p>
            <p className="text-xs text-slate-500">Giorni medi incasso clienti</p>
            <div className="text-3xl font-black text-slate-900 font-mono">
              {rollingDSODPO.dsoRolling}
              <span className="text-base font-bold text-slate-400 ml-1">gg</span>
            </div>
            <div className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-black ${
              rollingDSODPO.dsoRolling <= 60
                ? 'bg-slate-100 text-slate-900'
                : rollingDSODPO.dsoRolling <= 90
                ? 'bg-slate-100 text-slate-600'
                : 'bg-slate-100 text-slate-400'
            }`}>
              Target: &lt; 60 gg
            </div>
            <p className="text-[10px] text-slate-400 italic">
              Metodo: {rollingDSODPO.metodoDso === 'preciso'
                ? `lag fattura/incasso (${rollingDSODPO.transazioniDsoUsate} tx)`
                : 'stima da volumi — compila "Data Fattura" sui SAL per maggiore precisione'}
            </p>
            {latestSP && spMetrics && (
              <p className="text-[10px] text-slate-300">
                Da snapshot SP: {Math.round(spMetrics.dso)} gg
              </p>
            )}
          </div>

          {/* DPO */}
          <div className="bg-slate-50 rounded-2xl p-5 space-y-3">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              DPO Rolling
            </p>
            <p className="text-xs text-slate-500">Giorni medi pagamento fornitori</p>
            <div className="text-3xl font-black text-slate-900 font-mono">
              {rollingDSODPO.dpoRolling}
              <span className="text-base font-bold text-slate-400 ml-1">gg</span>
            </div>
            <div className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-black ${
              rollingDSODPO.dpoRolling >= 30 && rollingDSODPO.dpoRolling <= 90
                ? 'bg-slate-100 text-slate-900'
                : 'bg-slate-100 text-slate-600'
            }`}>
              Target: 30–90 gg
            </div>
            <p className="text-[10px] text-slate-400 italic">
              Metodo: {rollingDSODPO.metodoDpo === 'preciso'
                ? `lag fattura/pagamento (${rollingDSODPO.transazioniDpoUsate} tx)`
                : 'stima da volumi — compila "Data Fattura" sulle uscite fornitori per maggiore precisione'}
            </p>
            {latestSP && spMetrics && (
              <p className="text-[10px] text-slate-300">
                Da snapshot SP: {Math.round(spMetrics.dpo)} gg
              </p>
            )}
          </div>
        </div>

        <div className="flex items-start gap-3 bg-slate-50 rounded-2xl p-4 border border-slate-100">
          <Info size={14} className="text-slate-500 shrink-0 mt-0.5" />
          <p className="text-[10px] text-slate-700 leading-relaxed">
            Il calcolo rolling usa le transazioni degli ultimi 12 mesi.
            Se le transazioni hanno il campo <strong>Data Fattura</strong> compilato,
            il lag è calcolato con precisione esatta. Altrimenti viene usata
            una stima da benchmark di settore (edilizia: DSO 45 gg, DPO 60 gg).
            Compila il campo "Data Fattura" sui SAL e sulle fatture fornitori
            per ottenere valori reali.
          </p>
        </div>
      </div>

      {/* Info Card */}
      <div className="bg-slate-50 border border-slate-100 p-6 rounded-3xl flex gap-4">
        <Info className="text-slate-500 shrink-0" size={24} />
        <div className="space-y-2">
          <h4 className="text-sm font-black text-slate-900 uppercase">Come migliorare il Rating?</h4>
          <ul className="text-xs text-slate-700 space-y-1 list-disc list-inside">
            <li>Aumentare la solidità patrimoniale lasciando gli utili in azienda (Riserve).</li>
            <li>Ridurre i giorni di incasso (DSO) per migliorare la liquidità netta.</li>
            <li>Mantenere il DPO tra 30 e 90 giorni: pagare troppo presto spreca liquidità, pagare troppo tardi segnala tensione finanziaria ai fornitori.</li>
            <li>Mantenere un EBITDA superiore al 10% per garantire la copertura degli oneri finanziari.</li>
            <li>Evitare sconfinamenti in Centrale Rischi (anche di pochi euro).</li>
          </ul>
        </div>
      </div>
      </div>
      <HelpPanel 
        isOpen={showHelp}
        onClose={() => setShowHelp(false)}
        currentView={AppView.RATING_BANCHE}
        onGoToManuale={onGoToManuale}
      />
    </div>
  );
};

export default RatingView;
