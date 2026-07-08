import React, { useMemo, useState } from 'react';
import { Transaction, SPSnapshot, CEData, AppView, Project, InitialBalanceBreakdown, RimanenzeData } from '../types';
import { buildCEData, calcCEMetrics, calcSPMetrics, calcRollingDSODPO, calcPrevisioneFiscale } from '../utils/gasCoreEngine';
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
  projects?: Project[];
  initialData?: InitialBalanceBreakdown;
  rimanenze?: RimanenzeData;
  aliquotaIRES?: number;
  aliquotaIRAP?: number;
}

const formatEuro = (val: number) => 
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(val);

const formatPercent = (val: number) => 
  new Intl.NumberFormat('it-IT', { style: 'percent', minimumFractionDigits: 1 }).format(val);

const RatingView: React.FC<RatingViewProps> = ({ 
  transactions, 
  spSnapshots, 
  ceManualData, 
  onGoToManuale, 
  projects = [], 
  initialData,
  rimanenze,
  aliquotaIRES = 24,
  aliquotaIRAP = 3.9
}) => {
  const [showHelp, setShowHelp] = useState(false);
  
  const sortedSnapshots = useMemo(() => 
    [...spSnapshots].sort((a, b) => new Date(b.dataRiferimento).getTime() - new Date(a.dataRiferimento).getTime()),
    [spSnapshots]
  );

  const [selectedDate, setSelectedDate] = useState<string>('');

  const activeSP = useMemo(() => {
    if (sortedSnapshots.length === 0) return null;
    if (selectedDate) {
      return sortedSnapshots.find(s => s.dataRiferimento === selectedDate) || sortedSnapshots[0];
    }
    return sortedSnapshots[0];
  }, [sortedSnapshots, selectedDate]);

  const ratingYear = useMemo(() => 
    activeSP ? new Date(activeSP.dataRiferimento).getFullYear() : new Date().getFullYear(),
    [activeSP]
  );

  const ceData = useMemo(() => 
    buildCEData(transactions, ratingYear, ceManualData[ratingYear.toString()], 'competenza', projects, initialData), 
    [transactions, ratingYear, ceManualData, projects, initialData]
  );

  const ceMetrics = useMemo(() => calcCEMetrics(ceData, transactions, projects, initialData), [ceData, transactions, projects, initialData]);

  const spMetrics = useMemo(() => 
    activeSP ? calcSPMetrics(activeSP, ceMetrics, transactions) : null,
    [activeSP, ceMetrics, transactions]
  );

  const rollingDSODPO = useMemo(() =>
    calcRollingDSODPO(transactions),
    [transactions]
  );

  const previsioneFiscale = useMemo(() => {
    const rimAnno = rimanenze?.[ratingYear.toString()];
    return calcPrevisioneFiscale(
      transactions,
      ratingYear,
      ceMetrics,
      rimAnno,
      aliquotaIRES / 100,
      aliquotaIRAP / 100,
      true,
      initialData
    );
  }, [transactions, ratingYear, ceMetrics, rimanenze, aliquotaIRES, aliquotaIRAP, initialData]);

  const indicators = useMemo(() => {
    if (!spMetrics) return [];

    const rimAnno = rimanenze?.[ratingYear.toString()];
    const deltaWip = rimAnno ? ((rimAnno.wipFine || 0) - (rimAnno.wipInizio || 0)) : 0;
    const deltaMat = rimAnno ? ((rimAnno.materialiFine || 0) - (rimAnno.materialiInizio || 0)) : 0;
    const deltaTer = rimAnno ? ((rimAnno.terreniFine || 0) - (rimAnno.terreniInizio || 0)) : 0;
    const varRim = deltaWip + deltaMat + deltaTer;

    // EBITDA di Competenza
    const ebitdaDiCompetenza = ceMetrics.ebitdaTot + varRim;

    // Utile Netto e Ricavi di Competenza
    const fatturatoCompetenza = ceMetrics.fatturato + deltaWip;
    const utileNettoCompetenza = previsioneFiscale.utileDopoImposte;
    const utileNettoPercentCompetenza = fatturatoCompetenza > 0 ? utileNettoCompetenza / fatturatoCompetenza : 0;
    
    // PFN / EBITDA (re-calculate using competence EBITDA and handle negative EBITDA correctly)
    let pfnEbitdaHealth: 'green' | 'orange' | 'red' = 'red';
    let pfnEbitdaScore = 0;
    if (ebitdaDiCompetenza <= 0) {
      if (spMetrics.pfn <= 0) {
        pfnEbitdaHealth = 'green';
        pfnEbitdaScore = 1;
      } else {
        pfnEbitdaHealth = 'red';
        pfnEbitdaScore = 0;
      }
    } else {
      const ratio = spMetrics.pfn / ebitdaDiCompetenza;
      if (ratio <= 3) {
        pfnEbitdaHealth = 'green';
        pfnEbitdaScore = 1;
      } else if (ratio <= 4.5) {
        pfnEbitdaHealth = 'orange';
        pfnEbitdaScore = 0.5;
      }
    }
    
    // EBITDA / Oneri Fin.
    let ebitdaOneriHealth: 'green' | 'orange' | 'red' = 'red';
    let ebitdaOneriScore = 0;
    if (ceMetrics.oneriFin <= 0) {
      ebitdaOneriHealth = 'green';
      ebitdaOneriScore = 1;
    } else {
      const ebitdaOneriRatio = ebitdaDiCompetenza / ceMetrics.oneriFin;
      if (ebitdaOneriRatio >= 3) {
        ebitdaOneriHealth = 'green';
        ebitdaOneriScore = 1;
      } else if (ebitdaOneriRatio >= 1.5) {
        ebitdaOneriHealth = 'orange';
        ebitdaOneriScore = 0.5;
      }
    }
    
    // Current Ratio
    let currentRatioHealth: 'green' | 'orange' | 'red' = 'red';
    let currentRatioScore = 0;
    if (spMetrics.currentRatio >= 1.2) {
      currentRatioHealth = 'green';
      currentRatioScore = 1;
    } else if (spMetrics.currentRatio >= 1.0) {
      currentRatioHealth = 'orange';
      currentRatioScore = 0.5;
    }
    
    // Solidità Patrimoniale
    let soliditaHealth: 'green' | 'orange' | 'red' = 'red';
    let soliditaScore = 0;
    if (spMetrics.soliditaPatr >= 0.3) {
      soliditaHealth = 'green';
      soliditaScore = 1;
    } else if (spMetrics.soliditaPatr >= 0.15) {
      soliditaHealth = 'orange';
      soliditaScore = 0.5;
    }
    
    // Utile Netto %
    let utileHealth: 'green' | 'orange' | 'red' = 'red';
    let utileScore = 0;
    if (utileNettoPercentCompetenza >= 0.03) {
      utileHealth = 'green';
      utileScore = 1;
    } else if (utileNettoPercentCompetenza >= 0) {
      utileHealth = 'orange';
      utileScore = 0.5;
    }
    
    // DSO (Giorni Incasso)
    let dsoHealth: 'green' | 'orange' | 'red' = 'red';
    let dsoScore = 0;
    if (spMetrics.dso <= 60) {
      dsoHealth = 'green';
      dsoScore = 1;
    } else if (spMetrics.dso <= 90) {
      dsoHealth = 'orange';
      dsoScore = 0.5;
    }
    
    // DPO (Giorni Pagamento)
    let dpoHealth: 'green' | 'orange' | 'red' = 'red';
    let dpoScore = 0;
    if (spMetrics.dpo >= 30 && spMetrics.dpo <= 90) {
      dpoHealth = 'green';
      dpoScore = 1;
    } else if ((spMetrics.dpo >= 20 && spMetrics.dpo < 30) || (spMetrics.dpo > 90 && spMetrics.dpo <= 120)) {
      dpoHealth = 'orange';
      dpoScore = 0.5;
    }
    
    return [
      { 
        label: 'PFN / EBITDA', 
        value: ebitdaDiCompetenza <= 0 
          ? (spMetrics.pfn <= 0 ? 'Cash Positive (N/A)' : 'EBITDA <= 0 (Inf.)') 
          : (spMetrics.pfn / ebitdaDiCompetenza).toFixed(2) + 'x',
        score: pfnEbitdaScore,
        target: '< 3x',
        health: pfnEbitdaHealth
      },
      { 
        label: 'EBITDA / Oneri Fin.', 
        value: ceMetrics.oneriFin > 0 
          ? (ebitdaDiCompetenza / ceMetrics.oneriFin).toFixed(2) + 'x' 
          : 'N/A',
        score: ebitdaOneriScore,
        target: '> 3x',
        health: ebitdaOneriHealth
      },
      { 
        label: 'Current Ratio', 
        value: spMetrics.currentRatio.toFixed(2),
        score: currentRatioScore,
        target: '> 1.2',
        health: currentRatioHealth
      },
      { 
        label: 'Solidità Patrimoniale', 
        value: formatPercent(spMetrics.soliditaPatr),
        score: soliditaScore,
        target: '> 30%',
        health: soliditaHealth
      },
      { 
        label: 'Utile Netto %', 
        value: formatPercent(utileNettoPercentCompetenza),
        score: utileScore,
        target: '> 3%',
        health: utileHealth
      },
      { 
        label: 'DSO (Giorni Incasso)', 
        value: Math.round(spMetrics.dso) + ' gg',
        score: dsoScore,
        target: '< 60 gg',
        health: dsoHealth
      },
      { 
        label: 'DPO (Giorni Pagamento)', 
        value: Math.round(spMetrics.dpo) + ' gg',
        score: dpoScore,
        target: '30–90 gg',
        health: dpoHealth
      }
    ];
  }, [spMetrics, ceMetrics, rimanenze, ratingYear, previsioneFiscale.utileDopoImposte]);

  const totalScore = indicators.reduce((a, b) => a + (b.score || 0), 0);
  const rating = totalScore >= 5.5 ? { label: 'AAA / AA — Eccellente', color: 'slate-900' } :
                 totalScore >= 4 ? { label: 'A / BBB — Solido', color: 'slate-700' } :
                 totalScore >= 2.5 ? { label: 'BB — Attenzione', color: 'slate-500' } :
                 { label: 'B / C — Critico', color: 'slate-400' };

  if (!activeSP) {
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
          <div className="flex items-center bg-slate-100 rounded-xl p-1">
            <select 
              value={activeSP.dataRiferimento}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent px-4 py-2 font-black text-slate-800 outline-none text-sm cursor-pointer"
            >
              {sortedSnapshots.map(s => (
                <option key={s.dataRiferimento} value={s.dataRiferimento}>
                  Snapshot del {new Date(s.dataRiferimento).toLocaleDateString('it-IT')}
                </option>
              ))}
            </select>
          </div>
          <PDFExportButton
            config={{
              titolo: `Report Rating Bancario ${ratingYear}`,
              sottotitolo: `Valutazione merito creditizio — aggiornato ${new Date().toLocaleDateString('it-IT')}`,
              elementId: 'rating-report-content',
              orientazione: 'portrait',
              nomeFile: `Rating_${ratingYear}`,
            }}
          />
        </div>
      </div>

      <div id="rating-report-content" className="space-y-6">
        {/* Header for PDF only (hidden in UI) */}
        <div className="hidden print-only bg-white p-6 rounded-3xl border border-slate-200 mb-6">
           <h2 className="text-2xl font-black text-slate-900">Rating Bancario {ratingYear}</h2>
           <p className="text-slate-500 text-sm">Valutazione automatica del merito creditizio del Gruppo Visentin</p>
        </div>


      {/* Rating Score Card */}
      <div className={`p-8 rounded-3xl border shadow-lg text-center ${rating.color === 'slate-900' ? 'bg-slate-900 border-slate-800 text-white' : rating.color === 'slate-700' ? 'bg-slate-700 border-slate-600 text-white' : rating.color === 'slate-500' ? 'bg-slate-500 border-slate-400 text-white' : 'bg-slate-400 border-slate-300 text-white'}`}>
        <div className="text-[10px] font-black uppercase tracking-[0.3em] opacity-70 mb-2">Giudizio Sintetico</div>
        <div className="text-4xl font-black mb-4">{rating.label}</div>
        <div className="flex justify-center gap-1">
          {[1, 2, 3, 4, 5, 6, 7].map(i => (
            <div key={i} className={`w-10 h-2 rounded-full ${i <= Math.round(totalScore) ? 'bg-white' : 'bg-black/20'}`} />
          ))}
        </div>
        <p className="text-xs mt-6 opacity-80 max-w-xl mx-auto italic">
          Questa valutazione si basa sugli indici di bilancio calcolati automaticamente. 
          Il rating reale della banca include anche la Centrale Rischi e fattori qualitativi.
        </p>
      </div>

      {/* Legenda Gradi di Valutazione */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4 no-print">
        <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
          Legenda Classi di Rating (Basilea 3)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 space-y-2">
            <span className="inline-block px-2.5 py-1 bg-slate-950 text-white text-[9px] font-black rounded-lg uppercase tracking-wider">
              AAA / AA — Eccellente
            </span>
            <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
              Massima stabilità. Rischio di credito minimo e solidissima capacità di rimborso del debito.
            </p>
          </div>
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 space-y-2">
            <span className="inline-block px-2.5 py-1 bg-slate-700 text-white text-[9px] font-black rounded-lg uppercase tracking-wider">
              A / BBB — Solido
            </span>
            <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
              Adeguata solidità finanziaria. Capacità di rimborso protetta, pur se parzialmente esposta a shock di mercato.
            </p>
          </div>
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 space-y-2">
            <span className="inline-block px-2.5 py-1 bg-slate-500 text-white text-[9px] font-black rounded-lg uppercase tracking-wider">
              BB — Attenzione
            </span>
            <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
              Presenza di debolezze o scostamenti temporanei dai target. Richiede monitoraggio gestionale attivo.
            </p>
          </div>
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 space-y-2">
            <span className="inline-block px-2.5 py-1 bg-slate-400 text-white text-[9px] font-black rounded-lg uppercase tracking-wider">
              B / C — Critico
            </span>
            <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
              Elevata tensione finanziaria o patrimoniale. Rischio di credito significativo con necessità di rientro.
            </p>
          </div>
        </div>
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

          // Determine color styling based on health
          const colorText = ind.health === 'green' ? 'text-emerald-600' : ind.health === 'orange' ? 'text-amber-500' : 'text-rose-600';
          const colorBgBar = ind.health === 'green' ? 'bg-emerald-600' : ind.health === 'orange' ? 'bg-amber-500' : 'bg-rose-600';
          const HealthIcon = ind.health === 'green' ? CheckCircle2 : AlertCircle;

          return (
            <div key={i} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{ind.label}</span>
                  {termId && <InfoTooltip termId={termId} />}
                </div>
                <HealthIcon size={16} className={colorText} />
              </div>
              <div className="flex items-baseline justify-between">
                <div className={`text-2xl font-black ${colorText}`}>{ind.value}</div>
                <div className="text-[10px] font-bold text-slate-400">Target: {ind.target}</div>
              </div>
              <div className="mt-4 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-1000 ${colorBgBar}`}
                  style={{ width: `${ind.health === 'green' ? 100 : ind.health === 'orange' ? 66 : 33}%` }}
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
            {activeSP && spMetrics && (
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
            {activeSP && spMetrics && (
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
