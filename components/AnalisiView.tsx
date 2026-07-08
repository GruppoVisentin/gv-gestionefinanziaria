import React, { useState, useMemo, useEffect } from 'react';
import { Transaction, CEData, AppView, RimanenzeData, InitialBalanceBreakdown, Project } from '../types';
import { buildCEData, calcCEMetrics, calcPrevisioneFiscale, parseUTCDate } from '../utils/gasCoreEngine';
import { CATEGORY_TO_CE_TYPE } from '../constants';

const getCeType = (tx: Transaction): string => {
  return tx.ceType || (tx.category ? CATEGORY_TO_CE_TYPE[tx.category] : '') || '';
};
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
  FileText,
  UserPlus,
  Users,
  Trash2
} from 'lucide-react';
import { generateForecastInsights, generateCardInsight } from '../services/geminiService';
import ReactMarkdown from 'react-markdown';

interface AnalisiViewProps {
  transactions: Transaction[];
  ceManualData?: Record<string, Partial<CEData>>;
  oreStorico: Record<string, number>;
  setOreStorico: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  oreOperaiStorico: Record<string, any>;
  setOreOperaiStorico: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  rimanenze?: RimanenzeData;
  onGoToManuale?: (section?: string, tab?: 'manuale' | 'glossario') => void;
  aliquotaIRES: number;
  aliquotaIRAP: number;
  onChangeAliquotaIRES: (v: number) => void;
  onChangeAliquotaIRAP: (v: number) => void;
  initialData?: InitialBalanceBreakdown;
  projects?: Project[];
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
  oreOperaiStorico,
  setOreOperaiStorico,
  rimanenze,
  onGoToManuale,
  aliquotaIRES,
  aliquotaIRAP,
  onChangeAliquotaIRES,
  onChangeAliquotaIRAP,
  initialData,
  projects = [],
}) => {
  const [activeTab, setActiveTab] = useState<'indici' | 'preventivo' | 'orario' | 'sacri' | 'fiscale'>('indici');
  const [showHelp, setShowHelp] = useState(false);
  const [anno, setAnno] = useState(new Date().getFullYear());
  const [modalitaCalc, setModalitaCalc] = useState<'cantiere' | 'immobiliare'>('cantiere');
  const [vistaPrevFiscale, setVistaPrevFiscale] = useState(false);

  const currentYear = new Date().getFullYear();
  const availableYears = useMemo(() => {
    const yearsFromTx = new Set<number>(
      (transactions || []).map(tx => parseUTCDate(tx.date).getUTCFullYear())
    );
    // Always include current and past 2 years
    [currentYear - 2, currentYear - 1, currentYear].forEach(y => yearsFromTx.add(y));
    return Array.from(yearsFromTx).sort((a, b) => a - b);
  }, [transactions, currentYear]);

  // Calcolatore cantiere
  const [costoDiretto, setCostoDiretto] = useState<number>(0);
  const [costoDirettoStr, setCostoDirettoStr] = useState('');
  const [margineTarget, setMargineTarget] = useState<number>(10); // %

  // Calcolatore immobiliare
  const [costoTerreno, setCostoTerreno] = useState<number>(0);
  const [costoTerrenoStr, setCostoTerrenoStr] = useState('');
  const [costiCorrelati, setCostiCorrelati] = useState<number>(0);
  const [costiCorrelatiStr, setCostiCorrelatiStr] = useState('');
  const [costoCostruzione, setCostoCostruzione] = useState<number>(0);
  const [costoCostruzioneStr, setCostoCostruzioneStr] = useState('');
  const [margineTargetImm, setMargineTargetImm] = useState<number>(15); // %

  // Costo orario
  const [meseOrario, setMeseOrario] = useState(new Date().getMonth() + 1);
  const [costoContrattuale, setCostoContrattuale] = useState<number>(28);
  
  // Selezione Overhead per preventivo (consuntivo vs previsionale)
  const [preventivoOverheadType, setPreventivoOverheadType] = useState<'consuntivo' | 'previsionale'>('consuntivo');

  // Helpers per la formattazione input con separatore delle migliaia
  const formatAsYouType = (val: string) => {
    const [integers] = val.split(',');
    const clean = integers.replace(/\D/g, '');
    if (!clean) return '';
    return parseInt(clean, 10).toLocaleString('it-IT');
  };

  const parseCleanNumber = (val: string) => {
    const [integers] = val.split(',');
    const clean = integers.replace(/\D/g, '');
    return parseInt(clean, 10) || 0;
  };

  useEffect(() => {
    setCostoDirettoStr(costoDiretto ? costoDiretto.toLocaleString('it-IT') : '');
    setCostoTerrenoStr(costoTerreno ? costoTerreno.toLocaleString('it-IT') : '');
    setCostiCorrelatiStr(costiCorrelati ? costiCorrelati.toLocaleString('it-IT') : '');
    setCostoCostruzioneStr(costoCostruzione ? costoCostruzione.toLocaleString('it-IT') : '');
  }, [costoDiretto, costoTerreno, costiCorrelati, costoCostruzione]);

  const keyMese = `${anno}-${String(meseOrario).padStart(2, '0')}`;
  const oreInput = oreStorico[keyMese] || 0;

  const setOreInput = (val: number) => {
    setOreStorico(prev => ({ ...prev, [keyMese]: val }));
  };

  const activeWorkersList = useMemo((): any[] => {
    const stor = oreOperaiStorico || {};
    if (meseOrario === 0) {
      const agg: Record<string, { id: string; nome: string; tariffaContrattuale: number; oreConsuntivo: number; orePrevisionale: number }> = {};
      for (let m = 1; m <= 12; m++) {
        const k = `${anno}-${String(m).padStart(2, '0')}`;
        const list = stor[k] || [];
        list.forEach((w: any) => {
          const nameKey = (w.nome || '').trim().toLowerCase();
          if (!nameKey) return;
          if (!agg[nameKey]) {
            agg[nameKey] = {
              id: w.id || Math.random().toString(36).substring(2, 9),
              nome: w.nome,
              tariffaContrattuale: w.tariffaContrattuale || 28,
              oreConsuntivo: 0,
              orePrevisionale: 0
            };
          }
          agg[nameKey].oreConsuntivo += w.oreConsuntivo || 0;
          agg[nameKey].orePrevisionale += w.orePrevisionale || 0;
          if (w.tariffaContrattuale) {
            agg[nameKey].tariffaContrattuale = w.tariffaContrattuale;
          }
        });
      }
      return Object.values(agg);
    }
    return stor[keyMese] || [];
  }, [oreOperaiStorico, keyMese, meseOrario, anno]);

  const setWorkersList = (newList: any[]) => {
    if (setOreOperaiStorico && meseOrario !== 0) {
      const stor = oreOperaiStorico || {};
      setOreOperaiStorico({ ...stor, [keyMese]: newList });
    }
  };

  const parsedCostoOrarioData = useMemo(() => {
    const isWholeYear = meseOrario === 0;

    const actualTxs = (transactions || []).filter(tx => {
      const d = parseUTCDate(tx.date);
      const matchYear = d.getUTCFullYear() === anno;
      const matchMonth = isWholeYear ? true : d.getUTCMonth() + 1 === meseOrario;
      return matchYear 
          && matchMonth 
          && !tx.isForecast 
          && tx.ceType === 'costo_variabile';
    });

    const forecastTxs = (transactions || []).filter(tx => {
      const d = parseUTCDate(tx.date);
      const matchYear = d.getUTCFullYear() === anno;
      const matchMonth = isWholeYear ? true : d.getUTCMonth() + 1 === meseOrario;
      return matchYear 
          && matchMonth 
          && tx.isForecast 
          && tx.ceType === 'costo_variabile';
    });

    const isSalariesCategory = (cat?: string) => cat ? cat.includes('[PERSONALE] Stipendi Dipendenti Operativi') : false;
    const isContributionsCategory = (cat?: string) => cat ? cat.includes('[PERSONALE] Contributi Dipendenti Operativi') : false;

    const totStipendiActual = actualTxs.filter(tx => isSalariesCategory(tx.category)).reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    const totContributiActual = actualTxs.filter(tx => isContributionsCategory(tx.category)).reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    const totCostoActual = totStipendiActual + totContributiActual;

    const totStipendiPrev = forecastTxs.filter(tx => isSalariesCategory(tx.category)).reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    const totContributiPrev = forecastTxs.filter(tx => isContributionsCategory(tx.category)).reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    const totCostoPrev = totStipendiPrev + totContributiPrev;

    const list = activeWorkersList || [];
    
    let matchedActualSalaries = list.map(w => {
      const matchedTxs = actualTxs.filter(tx => 
        isSalariesCategory(tx.category) && 
        w.nome && 
        tx.description?.toLowerCase().includes(w.nome.toLowerCase())
      );
      return matchedTxs.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    });
    
    let matchedPrevSalaries = list.map(w => {
      const matchedTxs = forecastTxs.filter(tx => 
        isSalariesCategory(tx.category) && 
        w.nome && 
        tx.description?.toLowerCase().includes(w.nome.toLowerCase())
      );
      return matchedTxs.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    });

    let sumMatchedActual = matchedActualSalaries.reduce((a, b) => a + b, 0);
    let sumMatchedPrev = matchedPrevSalaries.reduce((a, b) => a + b, 0);

    const totalHoursActual = list.reduce((a, b) => a + (b.oreConsuntivo || 0), 0);
    const totalHoursPrev = list.reduce((a, b) => a + (b.orePrevisionale || 0), 0);

    // Distribuzione stipendi non allocati e scaling al Ground Truth (Bilancio)
    if (list.length > 0) {
      const unallocatedActual = Math.max(0, totStipendiActual - sumMatchedActual);
      if (unallocatedActual > 0) {
        matchedActualSalaries = matchedActualSalaries.map((s, i) => {
          if (totalHoursActual > 0) {
            return s + unallocatedActual * ((list[i].oreConsuntivo || 0) / totalHoursActual);
          }
          return s + unallocatedActual / list.length;
        });
      }
      const newSumActual = matchedActualSalaries.reduce((a, b) => a + b, 0);
      if (newSumActual > 0 && Math.abs(newSumActual - totStipendiActual) > 0.01) {
        const ratio = totStipendiActual / newSumActual;
        matchedActualSalaries = matchedActualSalaries.map(s => s * ratio);
      }

      const unallocatedPrev = Math.max(0, totStipendiPrev - sumMatchedPrev);
      if (unallocatedPrev > 0) {
        matchedPrevSalaries = matchedPrevSalaries.map((s, i) => {
          if (totalHoursPrev > 0) {
            return s + unallocatedPrev * ((list[i].orePrevisionale || 0) / totalHoursPrev);
          }
          return s + unallocatedPrev / list.length;
        });
      }
      const newSumPrev = matchedPrevSalaries.reduce((a, b) => a + b, 0);
      if (newSumPrev > 0 && Math.abs(newSumPrev - totStipendiPrev) > 0.01) {
        const ratio = totStipendiPrev / newSumPrev;
        matchedPrevSalaries = matchedPrevSalaries.map(s => s * ratio);
      }
    }

    const sumStipendiAllocatedActual = matchedActualSalaries.reduce((a, b) => a + b, 0);
    const sumStipendiAllocatedPrev = matchedPrevSalaries.reduce((a, b) => a + b, 0);

    const workersCalculated = list.map((w, idx) => {
      const stipActual = matchedActualSalaries[idx] || 0;
      const contrActual = sumStipendiAllocatedActual > 0 ? totContributiActual * (stipActual / sumStipendiAllocatedActual) : (totContributiActual / list.length);
      const totalCostActual = stipActual + contrActual;
      const costoOrarioActual = (w.oreConsuntivo || 0) > 0 ? totalCostActual / w.oreConsuntivo : 0;

      const stipPrev = matchedPrevSalaries[idx] || 0;
      const contrPrev = sumStipendiAllocatedPrev > 0 ? totContributiPrev * (stipPrev / sumStipendiAllocatedPrev) : (totContributiPrev / list.length);
      const totalCostPrev = stipPrev + contrPrev;
      const costoOrarioPrev = (w.orePrevisionale || 0) > 0 ? totalCostPrev / w.orePrevisionale : 0;

      return {
        ...w,
        stipActual,
        contrActual,
        totalCostActual,
        costoOrarioActual,
        stipPrev,
        contrPrev,
        totalCostPrev,
        costoOrarioPrev,
      };
    });

    const averageCostoOrarioActual = totalHoursActual > 0 ? totCostoActual / totalHoursActual : 0;
    const averageCostoOrarioPrev = totalHoursPrev > 0 ? totCostoPrev / totalHoursPrev : 0;

    const actualRates = workersCalculated.map(w => w.costoOrarioActual).filter(r => r > 0).sort((a, b) => a - b);
    let medianCostoOrarioActual = 0;
    if (actualRates.length > 0) {
      const mid = Math.floor(actualRates.length / 2);
      medianCostoOrarioActual = actualRates.length % 2 !== 0 ? actualRates[mid] : (actualRates[mid - 1] + actualRates[mid]) / 2;
    }

    const prevRates = workersCalculated.map(w => w.costoOrarioPrev).filter(r => r > 0).sort((a, b) => a - b);
    let medianCostoOrarioPrev = 0;
    if (prevRates.length > 0) {
      const mid = Math.floor(prevRates.length / 2);
      medianCostoOrarioPrev = prevRates.length % 2 !== 0 ? prevRates[mid] : (prevRates[mid - 1] + prevRates[mid]) / 2;
    }

    return {
      totStipendiActual,
      totContributiActual,
      totCostoActual,
      totStipendiPrev,
      totContributiPrev,
      totCostoPrev,
      workers: workersCalculated,
      totalHoursActual,
      averageCostoOrarioActual,
      medianCostoOrarioActual,
      totalHoursPrev,
      averageCostoOrarioPrev,
      medianCostoOrarioPrev,
    };
  }, [activeWorkersList, transactions, anno, meseOrario, oreOperaiStorico]);

  // Calcoli base
  const rates = useMemo(() => calculateOverheadRates(transactions, anno, initialData), [transactions, anno, initialData]);
  
  // Overhead Rate effettivamente scelto per il preventivo
  const ratesForPreventivo = useMemo(() => {
    if (preventivoOverheadType === 'previsionale') {
      return {
        ...rates,
        overheadRateStudio: rates.overheadRateStudioPrev,
        overheadRateFissi: rates.overheadRateFissiPrev,
        overheadRateCompleto: rates.overheadRateCompletoPrev,
      };
    }
    return rates;
  }, [rates, preventivoOverheadType]);

  const ceData = useMemo(() => {
    const manual = ceManualData ? ceManualData[anno.toString()] : undefined;
    return buildCEData(transactions, anno, manual, 'competenza', projects, initialData);
  }, [transactions, anno, ceManualData, projects, initialData]);

  const rawMetrics = useMemo(() => calcCEMetrics(ceData, transactions, projects, initialData), [ceData, transactions, projects, initialData]);

  const compensoSociPrev = useMemo(() => {
    return (transactions || [])
      .filter(tx => {
        const isLinked = transactions.some(act => !act.isForecast && act.linkedForecastId === tx.id);
        return getCeType(tx) === 'costo_studio' && 
        tx.isForecast &&
        !isLinked &&
        parseUTCDate(tx.date).getUTCFullYear() === anno &&
        (tx.category?.toLowerCase().includes('compenso amministratori') || 
         tx.category?.toLowerCase().includes('soci'))
      })
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
  }, [transactions, anno]);

  const metricsPrev = useMemo(() => {
    const txPrev = (transactions || []).filter(tx => {
      const isLinked = transactions.some(act => !act.isForecast && act.linkedForecastId === tx.id);
      const d = parseUTCDate(tx.date);
      return d.getUTCFullYear() === anno && getCeType(tx) && tx.isForecast && !isLinked;
    });

    const sumByType = (types: string[]) =>
      txPrev
        .filter(tx => types.includes(getCeType(tx)))
        .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

    const fatturato = sumByType(['ricavo_core', 'ricavo_altro', 'ricavo_immobiliare']);
    const costiVariabili = sumByType(['costo_variabile']);
    const costiFissi = sumByType(['costo_fisso']);
    const costiStudio = sumByType(['costo_studio']);
    const ammortamenti = sumByType(['ammortamento']);
    const oneriFin = sumByType(['onere_finanziario']);
    const proventiFin = sumByType(['provento_finanziario']);
    const straordinario = txPrev
      .filter(tx => getCeType(tx) === 'straordinario')
      .reduce((sum, tx) => sum + (tx.type === 'INCOME' ? Math.abs(tx.amount) : -Math.abs(tx.amount)), 0);

    const primoMargine = fatturato - costiVariabili;
    const primoMarginePercent = fatturato > 0 ? primoMargine / fatturato : 0;

    const ebitda = primoMargine - (costiFissi + costiStudio);
    const ebitdaPercent = fatturato > 0 ? ebitda / fatturato : 0;

    const ebit = ebitda - ammortamenti;
    const ebt = ebit - oneriFin + proventiFin;
    
    const imposte = sumByType(['imposta_ce']);
    const utileNetto = ebt + straordinario - imposte;
    const utileNettoPercent = fatturato > 0 ? utileNetto / fatturato : 0;

    const pctCostiVar = fatturato > 0 ? costiVariabili / fatturato : 0;
    const breakEven = (1 - pctCostiVar) > 0 ? (costiFissi + costiStudio + ammortamenti) / (1 - pctCostiVar) : 0;

    const costiCapitaleRate = txPrev
      .filter(tx => getCeType(tx) === 'capex' && tx.category?.includes('[FINANZA] Quota Capitale Rate Finanziamenti'))
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    const breakEvenCassa = (1 - pctCostiVar) > 0 ? (costiFissi + costiStudio + costiCapitaleRate) / (1 - pctCostiVar) : 0;

    return {
      fatturato,
      primoMargine,
      primoMarginePercent,
      ebitda,
      ebitdaPercent,
      utileNetto,
      utileNettoPercent,
      breakEven,
      breakEvenCassa
    };
  }, [transactions, anno]);

  const rimanenzeAnno = rimanenze?.[anno.toString()];

  const previsioneFiscale = useMemo(() =>
    calcPrevisioneFiscale(
      transactions,
      anno,
      rawMetrics,
      rimanenzeAnno,
      aliquotaIRES / 100,
      aliquotaIRAP / 100,
      vistaPrevFiscale,
      initialData
    ),
    [transactions, anno, rawMetrics, rimanenzeAnno, aliquotaIRES, aliquotaIRAP, vistaPrevFiscale, initialData]
  );

  const varRim = useMemo(() => {
    if (!rimanenzeAnno) return 0;
    return ((rimanenzeAnno.wipFine || 0) - (rimanenzeAnno.wipInizio || 0)) +
           ((rimanenzeAnno.materialiFine || 0) - (rimanenzeAnno.materialiInizio || 0)) +
           ((rimanenzeAnno.terreniFine || 0) - (rimanenzeAnno.terreniInizio || 0));
  }, [rimanenzeAnno]);

  const deltaWip = useMemo(() => {
    if (!rimanenzeAnno) return 0;
    return (rimanenzeAnno.wipFine || 0) - (rimanenzeAnno.wipInizio || 0);
  }, [rimanenzeAnno]);

  const metrics = useMemo(() => {
    // Valori Consuntivo (YTD)
    const ebitdaTot = rawMetrics.ebitdaTot + varRim;
    const ebitTot = rawMetrics.ebitTot + varRim;
    const ebtTot = rawMetrics.ebtTot + varRim;
    const utileNettoTot = rawMetrics.utileNettoTot + varRim;

    const fatturatoCompetenza = rawMetrics.fatturato + deltaWip;

    const ebitdaPercent = fatturatoCompetenza > 0 ? ebitdaTot / fatturatoCompetenza : 0;
    const ebitPercent = fatturatoCompetenza > 0 ? ebitTot / fatturatoCompetenza : 0;
    const ebtPercent = fatturatoCompetenza > 0 ? ebtTot / fatturatoCompetenza : 0;
    const utileNettoPercent = fatturatoCompetenza > 0 ? utileNettoTot / fatturatoCompetenza : 0;

    // Valori Previsionali (12m Proiezione)
    const proiezioneEbitda = rawMetrics.proiezioneEbitda + varRim;
    const proiezioneEbit = rawMetrics.proiezioneEbit + varRim;
    const proiezioneEbt = rawMetrics.proiezioneEbt + varRim;
    const proiezioneUtile = rawMetrics.proiezioneEbt + rawMetrics.proiezioneStraordinario + varRim - previsioneFiscale.totaleImposteStimate;

    const proiezioneFatturatoCompetenza = rawMetrics.proiezioneFatturato + deltaWip;

    const projCostiVariabiliCompetenza = rawMetrics.proiezioneCostiVariabili - (rimanenzeAnno ? ((rimanenzeAnno.materialiFine || 0) - (rimanenzeAnno.materialiInizio || 0) + (rimanenzeAnno.terreniFine || 0) - (rimanenzeAnno.terreniInizio || 0)) : 0);

    const proiezioneEbitdaPercent = proiezioneFatturatoCompetenza > 0 ? proiezioneEbitda / proiezioneFatturatoCompetenza : 0;
    const proiezioneEbitPercent = proiezioneFatturatoCompetenza > 0 ? proiezioneEbit / proiezioneFatturatoCompetenza : 0;
    const proiezioneUtileNettoPercent = proiezioneFatturatoCompetenza > 0 ? proiezioneUtile / proiezioneFatturatoCompetenza : 0;

    // Ricalcolo Break-even di competenza
    const projCostiFissiTot = proiezioneEbitda - proiezioneEbit; // Ammortamenti di competenza
    const projCostiFissiOperativi = rawMetrics.proiezioneCostiFissi + rawMetrics.proiezioneCostiStudio;
    const projCostiFissiCompleti = projCostiFissiOperativi + projCostiFissiTot;

    const projPctCostiVar = proiezioneFatturatoCompetenza > 0 ? projCostiVariabiliCompetenza / proiezioneFatturatoCompetenza : 0;
    const breakEven = (1 - projPctCostiVar) > 0 ? projCostiFissiCompleti / (1 - projPctCostiVar) : 0;

    const projCostiFissiCassa = projCostiFissiOperativi + rawMetrics.costiCapitaleRate;
    const breakEvenCassa = (1 - projPctCostiVar) > 0 ? projCostiFissiCassa / (1 - projPctCostiVar) : 0;

    return {
      ...rawMetrics,
      ebitdaTot,
      ebitTot,
      ebtTot,
      utileNettoTot,
      fatturato: fatturatoCompetenza,
      ebitdaPercent,
      ebitPercent,
      ebtPercent,
      utileNettoPercent,
      proiezioneEbitda,
      proiezioneEbit,
      proiezioneEbt,
      proiezioneUtile,
      proiezioneFatturato: proiezioneFatturatoCompetenza,
      proiezioneCostiVariabili: projCostiVariabiliCompetenza,
      proiezioneEbitdaPercent,
      proiezioneEbitPercent,
      proiezioneUtileNettoPercent,
      breakEven,
      breakEvenCassa
    };
  }, [rawMetrics, varRim, deltaWip, previsioneFiscale.totaleImposteStimate, rimanenzeAnno]);


  const { projBreakEven, projBreakEvenCassa } = useMemo(() => {
    const projCostiFissiTot = metrics.proiezioneCostiFissi + metrics.proiezioneCostiStudio + metrics.proiezioneAmmortamenti;
    const projPctCostiVar = metrics.proiezioneFatturato > 0 ? metrics.proiezioneCostiVariabili / metrics.proiezioneFatturato : 0;
    const breakEven = (1 - projPctCostiVar) > 0 ? projCostiFissiTot / (1 - projPctCostiVar) : 0;
    const projCostiFissiCassa = projCostiFissiTot - metrics.proiezioneAmmortamenti + metrics.costiCapitaleRate;
    const breakEvenCassa = (1 - projPctCostiVar) > 0 ? projCostiFissiCassa / (1 - projPctCostiVar) : 0;
    return { projBreakEven: breakEven, projBreakEvenCassa: breakEvenCassa };
  }, [metrics]);

  const proiezionePrimoMarginePercent = useMemo(() => {
    const projPrimoMargine = metrics.proiezioneFatturato - metrics.proiezioneCostiVariabili;
    return metrics.proiezioneFatturato > 0 ? projPrimoMargine / metrics.proiezioneFatturato : 0;
  }, [metrics]);

  const proiezioneEbitdaPercent = useMemo(() => {
    return metrics.proiezioneFatturato > 0 ? metrics.proiezioneEbitda / metrics.proiezioneFatturato : 0;
  }, [metrics]);

  const proiezioneUtileNettoPercent = useMemo(() => {
    return metrics.proiezioneFatturato > 0 ? metrics.proiezioneUtile / metrics.proiezioneFatturato : 0;
  }, [metrics]);

  const proiezioneCompensoSoci = useMemo(() => {
    return rates.compensoSoci + compensoSociPrev;
  }, [rates.compensoSoci, compensoSociPrev]);

  // Risultati Calcolatori (usano ratesForPreventivo)
  const resCantiere = useMemo(() => 
    calcolaPreventivoCantiere(costoDiretto, margineTarget / 100, ratesForPreventivo),
    [costoDiretto, margineTarget, ratesForPreventivo]
  );

  const resImmobiliare = useMemo(() => 
    calcolaPreventivoImmobiliare(costoTerreno, costoCostruzione, costiCorrelati, margineTargetImm / 100, ratesForPreventivo),
    [costoTerreno, costoCostruzione, costiCorrelati, margineTargetImm, ratesForPreventivo]
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 md:p-6 rounded-3xl shadow-sm border border-slate-200 no-print">
        <div>
          <h2 className="text-xl md:text-2xl font-black text-slate-900 flex items-center gap-3">
            <BarChart2 className="text-slate-900" size={22} />
            Analisi & Indici
          </h2>
          <p className="text-slate-500 text-xs md:text-sm mt-1">Logica Overhead e Calcolatori Professionali</p>
        </div>
        <div className="flex items-center gap-2 md:gap-4 flex-wrap">
          <HelpButton onClick={() => setShowHelp(true)} />
          {/* Year selector — scrollable in case of many years */}
          <div className="overflow-x-auto scrollbar-hide">
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl min-w-max">
              {availableYears.map(y => (
                <button
                  key={y}
                  onClick={() => setAnno(y)}
                  className={`px-3 py-1.5 rounded-lg text-xs md:text-sm font-bold transition-all whitespace-nowrap ${anno === y ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  {y}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={() => exportAnalisiPDF({
              anno,
              rates,
              metrics,
              resCantiere,
              resImmobiliare,
              resOrario,
              previsioneFiscale,
              vistaPrevFiscale
            })}
            className="flex items-center gap-2 px-3 md:px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-black hover:bg-slate-800 transition-all shadow-sm"
          >
            <FileText size={14} />
            <span className="hidden sm:inline">Esporta PDF Analisi</span>
            <span className="sm:hidden">PDF</span>
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
      <div className="w-full min-w-0 overflow-x-auto scrollbar-hide">
        <div className="flex bg-slate-200/50 p-1 rounded-2xl min-w-max">
        {[
          { id: 'indici', label: 'Indici Struttura', labelShort: 'Indici', icon: BarChart2 },
          { id: 'preventivo', label: 'Preventivo', labelShort: 'Preventivo', icon: Calculator },
          { id: 'orario', label: 'Costo Orario', labelShort: 'Orario', icon: Clock },
          { id: 'sacri', label: '7+1 Numeri Sacri', labelShort: '7+1 Sacri', icon: Sparkles },
          { id: 'fiscale', label: 'Previsione Fiscale', labelShort: 'Fiscale', icon: Calculator },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-1.5 px-3 md:px-5 py-2.5 rounded-xl text-xs md:text-sm font-black whitespace-nowrap transition-all ${activeTab === tab.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:bg-white/50'}`}
          >
            <tab.icon size={15} />
            <span className="hidden sm:inline">{tab.label}</span>
            <span className="sm:hidden">{tab.labelShort}</span>
          </button>
        ))}
        </div>
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
                      <InfoTooltipWrapper>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Incidenza Studio sul Fatturato</p>
                        <InfoTooltip 
                          termId="incidenza_studio_fatturato" 
                          calculatedValues={`Incidenza Studio sul Fatturato:\n- Consuntivo: Costi Studio ${formatEuro(rates.totaleCostiStudio)} / Fatturato ${formatEuro(rates.fatturato)} = ${formatPercent(rates.incidenzaStudioFatturato)}\n- Previsionale: Costi Studio Target ${formatEuro(rates.totaleCostiStudioPrev)} / Fatturato Target ${formatEuro(rates.fatturatoPrev)} = ${formatPercent(rates.incidenzaStudioFatturatoPrev)}`}
                        />
                      </InfoTooltipWrapper>
                      <p className="text-xs text-slate-500">Personale ufficio + Tecnici / Fatturato</p>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <span className="text-3xl font-black text-sky-600">{formatPercent(rates.incidenzaStudioFatturato)}</span>
                        <div className={`w-3 h-3 rounded-full ${getStatusColor(rates.incidenzaStudioFatturato, { red: 0.25, yellow: 0.15 })}`} />
                      </div>
                      <p className="text-sm font-bold text-sky-400">{formatEuro(rates.totaleCostiStudio)}</p>
                      <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase">
                        Target Prev: <span className="text-slate-600">{formatPercent(rates.incidenzaStudioFatturatoPrev)}</span> ({formatEuro(rates.totaleCostiStudioPrev)})
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <InfoTooltipWrapper>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Incidenza Costi Fissi (escl. Studio) sul Fatturato</p>
                        <InfoTooltip 
                          termId="incidenza_fissi_puro_fatturato" 
                          calculatedValues={`Incidenza Costi Fissi (escl. Studio):\n- Consuntivo: Costi Fissi Puri ${formatEuro(rates.totaleOverheadPuro)} / Fatturato ${formatEuro(rates.fatturato)} = ${formatPercent(rates.incidenzaFissiFatturato)}\n- Previsionale: Costi Fissi Target ${formatEuro(rates.totaleOverheadPuroPrev)} / Fatturato Target ${formatEuro(rates.fatturatoPrev)} = ${formatPercent(rates.incidenzaFissiFatturatoPrev)}`}
                        />
                      </InfoTooltipWrapper>
                      <p className="text-xs text-slate-500">Spese generali e struttura fissa pura / Fatturato</p>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <span className="text-3xl font-black text-purple-600">{formatPercent(rates.incidenzaFissiFatturato)}</span>
                        <div className={`w-3 h-3 rounded-full ${getStatusColor(rates.incidenzaFissiFatturato, { red: 0.15, yellow: 0.12 })}`} />
                      </div>
                      <p className="text-sm font-bold text-purple-400">{formatEuro(rates.totaleOverheadPuro)}</p>
                      <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase">
                        Target Prev: <span className="text-slate-600">{formatPercent(rates.incidenzaFissiFatturatoPrev)}</span> ({formatEuro(rates.totaleOverheadPuroPrev)})
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <InfoTooltipWrapper>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Incidenza Costi Fissi Totali sul Fatturato</p>
                        <InfoTooltip 
                          termId="incidenza_fissi_fatturato" 
                          calculatedValues={`Incidenza Overhead Totale:\n- Consuntivo: Costi Fissi ${formatEuro(rates.totaleOverheadCompleto)} / Fatturato ${formatEuro(rates.fatturato)} = ${formatPercent(rates.incidenzaCompletaFatturato)}\n- Previsionale: Costi Fissi Target ${formatEuro(rates.totaleOverheadCompletoPrev)} / Fatturato Target ${formatEuro(rates.fatturatoPrev)} = ${formatPercent(rates.incidenzaCompletaFatturatoPrev)}`}
                        />
                      </InfoTooltipWrapper>
                      <p className="text-xs text-slate-500">Tutti i costi fissi / Fatturato</p>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <span className="text-3xl font-black text-indigo-600">{formatPercent(rates.incidenzaCompletaFatturato)}</span>
                        <div className={`w-3 h-3 rounded-full ${getStatusColor(rates.incidenzaCompletaFatturato, { red: 0.35, yellow: 0.25 })}`} />
                      </div>
                      <p className="text-sm font-bold text-indigo-400">{formatEuro(rates.totaleOverheadCompleto)}</p>
                      <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase">
                        Target Prev: <span className="text-slate-600">{formatPercent(rates.incidenzaCompletaFatturatoPrev)}</span> ({formatEuro(rates.totaleOverheadCompletoPrev)})
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-between items-start pt-4 border-t border-slate-100">
                    <div className="space-y-1">
                      <InfoTooltipWrapper>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Oneri Finanziari (sotto EBITDA)</p>
                        <InfoTooltip 
                          termId="oneri_finanziari_incidenza" 
                          calculatedValues={`Oneri Finanziari sul Fatturato:\n- Consuntivo: Oneri Finanziari ${formatEuro(rates.totaleOneriFin)} / Fatturato ${formatEuro(rates.fatturato)} = ${formatPercent(rates.totaleOneriFin / (rates.fatturato > 0 ? rates.fatturato : 1))}\n- Previsionale: Oneri Finanziari Target ${formatEuro(rates.totaleOneriFinPrev)} / Fatturato Target ${formatEuro(rates.fatturatoPrev)} = ${formatPercent(rates.totaleOneriFinPrev / (rates.fatturatoPrev > 0 ? rates.fatturatoPrev : 1))}`}
                        />
                      </InfoTooltipWrapper>
                      <p className="text-xs text-slate-500">Interessi passivi e commissioni</p>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <span className="text-2xl font-black text-amber-600">{formatPercent(rates.totaleOneriFin / (rates.fatturato > 0 ? rates.fatturato : 1))}</span>
                      </div>
                      <p className="text-sm font-bold text-amber-400">{formatEuro(rates.totaleOneriFin)}</p>
                      <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase">
                        Target Prev: <span className="text-slate-600">{formatPercent(rates.totaleOneriFinPrev / (rates.fatturatoPrev > 0 ? rates.fatturatoPrev : 1))}</span> ({formatEuro(rates.totaleOneriFinPrev)})
                      </p>
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
                      <InfoTooltipWrapper>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Overhead Rate — Studio</p>
                        <InfoTooltip 
                          termId="overhead_rate_studio" 
                          color="text-slate-500 hover:text-white"
                          calculatedValues={`Overhead Rate Studio:\n- Consuntivo: Costi Studio ${formatEuro(rates.totaleCostiStudio)} / Costi Diretti ${formatEuro(rates.totaleCostiDiretti)} = ${formatPercent(rates.overheadRateStudio)}\n- Previsionale: Costi Studio Target ${formatEuro(rates.totaleCostiStudioPrev)} / Costi Diretti Target ${formatEuro(rates.totaleCostiDirettiPrev)} = ${formatPercent(rates.overheadRateStudioPrev)}`}
                        />
                      </InfoTooltipWrapper>
                      <p className="text-xs text-slate-500">Ogni 100€ di costi diretti, {formatEuro(rates.overheadRateStudio * 100)} vanno allo studio</p>
                    </div>
                    <div className="text-right">
                      <span className="text-3xl font-black text-white">{formatPercent(rates.overheadRateStudio)}</span>
                      <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase">
                        Target Prev: <span className="text-slate-300">{formatPercent(rates.overheadRateStudioPrev)}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <InfoTooltipWrapper>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Overhead Rate — Costi Fissi (escl. Studio)</p>
                        <InfoTooltip 
                          termId="overhead_rate_fissi" 
                          color="text-slate-500 hover:text-white"
                          calculatedValues={`Overhead Rate Costi Fissi (escl. Studio):\n- Consuntivo: Costi Fissi Puri ${formatEuro(rates.totaleOverheadPuro)} / Costi Diretti ${formatEuro(rates.totaleCostiDiretti)} = ${formatPercent(rates.overheadRateFissi)}\n- Previsionale: Costi Fissi Target ${formatEuro(rates.totaleOverheadPuroPrev)} / Costi Diretti Target ${formatEuro(rates.totaleCostiDirettiPrev)} = ${formatPercent(rates.overheadRateFissiPrev)}`}
                        />
                      </InfoTooltipWrapper>
                      <p className="text-xs text-slate-500">Costi fissi puri / Costi diretti</p>
                    </div>
                    <div className="text-right">
                      <span className="text-3xl font-black text-white">{formatPercent(rates.overheadRateFissi)}</span>
                      <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase">
                        Target Prev: <span className="text-slate-300">{formatPercent(rates.overheadRateFissiPrev)}</span>
                      </p>
                    </div>
                  </div>

                  <div className="p-6 bg-white/5 rounded-2xl border border-white/10">
                    <div className="flex justify-between items-center">
                      <div className="space-y-1">
                        <InfoTooltipWrapper>
                          <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Overhead Rate — Costi Fissi Totali</p>
                          <InfoTooltip 
                            termId="overhead_rate_totale" 
                            color="text-slate-500 hover:text-white" 
                            calculatedValues={`Overhead Rate Costi Fissi Totali:\n- Consuntivo: Costi Fissi Totali ${formatEuro(rates.totaleOverheadCompleto)} / Costi Diretti ${formatEuro(rates.totaleCostiDiretti)} = ${formatPercent(rates.overheadRateCompleto)}\n- Previsionale: Costi Fissi Target ${formatEuro(rates.totaleOverheadCompletoPrev)} / Costi Diretti Target ${formatEuro(rates.totaleCostiDirettiPrev)} = ${formatPercent(rates.overheadRateCompletoPrev)}`}
                          />
                        </InfoTooltipWrapper>
                        <p className="text-[10px] text-slate-400">USA QUESTO NEI PREVENTIVI</p>
                      </div>
                      <div className="text-right flex flex-col items-end">
                        <div className="flex items-center gap-2 justify-end">
                          <span className="text-4xl font-black text-white">{formatPercent(rates.overheadRateCompleto)}</span>
                          <div className={`w-4 h-4 rounded-full ${getStatusColor(rates.overheadRateCompleto, { red: 0.45, yellow: 0.30 })}`} />
                        </div>
                        <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase">
                          Target Prev: <span className="text-slate-300">{formatPercent(rates.overheadRateCompletoPrev)}</span>
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Legenda dei Limiti e della Bontà dei Valori */}
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
              <h4 className="text-sm font-black text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-3 flex items-center gap-2">
                <Sparkles size={16} className="text-indigo-600" />
                Guida all'Analisi e Bontà dei Valori (% su Fatturato)
              </h4>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Legenda 1: Incidenza Studio */}
                <div className="space-y-4">
                  <div>
                    <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">1. Incidenza Studio sul Fatturato</p>
                    <p className="text-xs text-slate-500 mt-1 font-medium">Misura il peso relativo del personale interno e dei collaboratori tecnici sui ricavi dello studio.</p>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="p-3 bg-emerald-50/50 border border-emerald-100 rounded-xl space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2 font-black text-emerald-800">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Eccellente / Ottimo
                        </span>
                        <span className="font-black text-emerald-600">&lt; 10%</span>
                      </div>
                      <p className="text-[11px] text-slate-600 leading-relaxed">Struttura estremamente agile ed efficiente. Altissima produttività o forte leva sui margini operativi.</p>
                    </div>

                    <div className="p-3 bg-blue-50/50 border border-blue-100 rounded-xl space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2 font-black text-blue-800">
                          <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span> Buono / In Equilibrio
                        </span>
                        <span className="font-black text-blue-600">10% - 15%</span>
                      </div>
                      <p className="text-[11px] text-slate-600 leading-relaxed">Rapporto ideale tra costi tecnici e capacità produttiva. Indica una gestione solida ed equilibrata.</p>
                    </div>

                    <div className="p-3 bg-amber-50/50 border border-amber-100 rounded-xl space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2 font-black text-amber-800">
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Attenzione
                        </span>
                        <span className="font-black text-amber-600">15% - 25%</span>
                      </div>
                      <p className="text-[11px] text-slate-600 leading-relaxed">Costi fissi del personale elevati. Monitorare la produttività per evitare che cali di fatturato erodano il margine.</p>
                    </div>

                    <div className="p-3 bg-rose-50/50 border border-rose-100 rounded-xl space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2 font-black text-rose-800">
                          <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span> Critico / Rischio Elevato
                        </span>
                        <span className="font-black text-rose-600">&gt; 25%</span>
                      </div>
                      <p className="text-[11px] text-slate-600 leading-relaxed">Struttura sovradimensionata rispetto al fatturato attuale. Forte rischio di perdite; necessario ottimizzare o incrementare i ricavi.</p>
                    </div>
                  </div>
                </div>

                {/* Legenda 2: Incidenza Overhead Totale */}
                <div className="space-y-4">
                  <div>
                    <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">2. Incidenza Overhead Totale (Tutti i Costi Fissi / Fatturato)</p>
                    <p className="text-xs text-slate-500 mt-1 font-medium">Esprime l'incidenza totale delle spese di struttura stabili (Studio + costi generali, affitti, utenze, assicurazioni, ecc.) sul fatturato.</p>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="p-3 bg-emerald-50/50 border border-emerald-100 rounded-xl space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2 font-black text-emerald-800">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Eccellente / Ottimo
                        </span>
                        <span className="font-black text-emerald-600">&lt; 20%</span>
                      </div>
                      <p className="text-[11px] text-slate-600 leading-relaxed">Struttura snella con bassi costi fissi totali. Massima flessibilità e alta capacità di assorbire cali di mercato.</p>
                    </div>

                    <div className="p-3 bg-blue-50/50 border border-blue-100 rounded-xl space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2 font-black text-blue-800">
                          <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span> Buono / Sostenibile
                        </span>
                        <span className="font-black text-blue-600">20% - 30%</span>
                      </div>
                      <p className="text-[11px] text-slate-600 leading-relaxed">Standard ottimale per uno studio strutturato. Garantisce efficienza operativa e margini di sicurezza sani.</p>
                    </div>

                    <div className="p-3 bg-amber-50/50 border border-amber-100 rounded-xl space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2 font-black text-amber-800">
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Attenzione
                        </span>
                        <span className="font-black text-amber-600">30% - 35%</span>
                      </div>
                      <p className="text-[11px] text-slate-600 leading-relaxed">Spese di struttura elevate. I margini operativi si riducono notevolmente, lasciando poco spazio per imprevisti finanziari.</p>
                    </div>

                    <div className="p-3 bg-rose-50/50 border border-rose-100 rounded-xl space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2 font-black text-rose-800">
                          <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span> Critico / Ristrutturare
                        </span>
                        <span className="font-black text-rose-600">&gt; 35%</span>
                      </div>
                      <p className="text-[11px] text-slate-600 leading-relaxed">Struttura troppo pesante. Oltre un terzo dei ricavi è assorbito dai costi fissi di funzionamento. Richiede interventi correttivi urgenti.</p>
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
                          type="text"
                          value={costoDirettoStr}
                          placeholder="0"
                          onChange={(e) => {
                            const formatted = formatAsYouType(e.target.value);
                            setCostoDirettoStr(formatted);
                            setCostoDiretto(parseCleanNumber(formatted));
                          }}
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

                  <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 space-y-4">
                    <div className="flex items-center gap-2">
                      <Info size={16} className="text-slate-400" />
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-relaxed">
                        Selezione Overhead Rate ({anno})
                      </p>
                    </div>
                    
                    <div className="space-y-3">
                      <label className="flex items-center gap-3 cursor-pointer text-xs font-bold text-slate-700 hover:text-slate-900 transition-colors select-none">
                        <input 
                          type="radio" 
                          name="preventivoOverheadTypeCantiere" 
                          value="consuntivo" 
                          checked={preventivoOverheadType === 'consuntivo'}
                          onChange={() => setPreventivoOverheadType('consuntivo')}
                          className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500 cursor-pointer"
                        />
                        <span>usa overhead consuntivo ad oggi del {anno}: <strong className="text-indigo-600">{formatPercent(rates.overheadRateCompleto)}</strong></span>
                      </label>

                      <label className="flex items-center gap-3 cursor-pointer text-xs font-bold text-slate-700 hover:text-slate-900 transition-colors select-none">
                        <input 
                          type="radio" 
                          name="preventivoOverheadTypeCantiere" 
                          value="previsionale" 
                          checked={preventivoOverheadType === 'previsionale'}
                          onChange={() => setPreventivoOverheadType('previsionale')}
                          className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500 cursor-pointer"
                        />
                        <span>usa overhead previsionale {anno}: <strong className="text-indigo-600">{formatPercent(rates.overheadRateCompletoPrev)}</strong></span>
                      </label>
                    </div>
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
                          type="text"
                          value={costoTerrenoStr}
                          placeholder="0"
                          onChange={(e) => {
                            const formatted = formatAsYouType(e.target.value);
                            setCostoTerrenoStr(formatted);
                            setCostoTerreno(parseCleanNumber(formatted));
                          }}
                          className="w-full bg-transparent text-3xl font-black text-slate-900 outline-none"
                        />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Costi Correlati (Passthrough)</label>
                      <div className="flex items-center bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 focus-within:border-slate-400 transition-all">
                        <span className="text-2xl font-black text-slate-400 mr-4">€</span>
                        <input 
                          type="text"
                          value={costiCorrelatiStr}
                          placeholder="0"
                          onChange={(e) => {
                            const formatted = formatAsYouType(e.target.value);
                            setCostiCorrelatiStr(formatted);
                            setCostiCorrelati(parseCleanNumber(formatted));
                          }}
                          className="w-full bg-transparent text-3xl font-black text-slate-900 outline-none"
                        />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Costo Costruzione (Base Overhead)</label>
                      <div className="flex items-center bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 focus-within:border-slate-400 transition-all">
                        <span className="text-2xl font-black text-slate-400 mr-4">€</span>
                        <input 
                          type="text"
                          value={costoCostruzioneStr}
                          placeholder="0"
                          onChange={(e) => {
                            const formatted = formatAsYouType(e.target.value);
                            setCostoCostruzioneStr(formatted);
                            setCostoCostruzione(parseCleanNumber(formatted));
                          }}
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

                  <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 space-y-4 mt-6">
                    <div className="flex items-center gap-2">
                      <Info size={16} className="text-slate-400" />
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-relaxed">
                        Selezione Overhead Rate ({anno})
                      </p>
                    </div>
                    
                    <div className="space-y-3">
                      <label className="flex items-center gap-3 cursor-pointer text-xs font-bold text-slate-700 hover:text-slate-900 transition-colors select-none">
                        <input 
                          type="radio" 
                          name="preventivoOverheadTypeImmobiliare" 
                          value="consuntivo" 
                          checked={preventivoOverheadType === 'consuntivo'}
                          onChange={() => setPreventivoOverheadType('consuntivo')}
                          className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500 cursor-pointer"
                        />
                        <span>usa overhead consuntivo ad oggi del {anno}: <strong className="text-indigo-600">{formatPercent(rates.overheadRateCompleto)}</strong></span>
                      </label>

                      <label className="flex items-center gap-3 cursor-pointer text-xs font-bold text-slate-700 hover:text-slate-900 transition-colors select-none">
                        <input 
                          type="radio" 
                          name="preventivoOverheadTypeImmobiliare" 
                          value="previsionale" 
                          checked={preventivoOverheadType === 'previsionale'}
                          onChange={() => setPreventivoOverheadType('previsionale')}
                          className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500 cursor-pointer"
                        />
                        <span>usa overhead previsionale {anno}: <strong className="text-indigo-600">{formatPercent(rates.overheadRateCompletoPrev)}</strong></span>
                      </label>
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
                        <span className="text-[10px] font-black text-slate-500">ROI (su costo): {formatPercent(resImmobiliare.roiOperazione)}</span>
                      </div>
                      <div className="text-5xl font-black text-emerald-400 tracking-tighter">{formatEuro(resImmobiliare.prezzoVenditaMinimo)}</div>
                    </div>
                  </div>

                  <div className="bg-white/5 p-6 rounded-2xl border border-white/10 flex flex-col gap-2">
                    <div className="flex items-center gap-3">
                      <Info size={16} className="text-slate-400 shrink-0" />
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed">
                        Sul terreno e sui costi correlati non si applica overhead perché sono costi di acquisizione, non di produzione.
                      </p>
                    </div>
                    <p className="text-[9px] text-slate-500 leading-normal pl-7">
                      * Il ROI dell'operazione è calcolato sui costi totali (Margine Utile / Costo Totale Operazione).
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'orario' && (
          <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
            {/* Selettori Anno/Mese */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                  <Clock className="text-slate-700" size={20} />
                  Calcolo Costo Orario Operai
                </h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Analisi oraria dipendente per dipendente e calcolo stipendi/contributi</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Anno</label>
                  <select 
                    value={anno}
                    onChange={(e) => setAnno(parseInt(e.target.value))}
                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 font-bold text-slate-900 outline-none focus:border-slate-400"
                  >
                    {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Mese</label>
                  <select 
                    value={meseOrario}
                    onChange={(e) => setMeseOrario(parseInt(e.target.value))}
                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 font-bold text-slate-900 outline-none focus:border-slate-400 w-36"
                  >
                    <option value={0}>Intero Anno</option>
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {new Date(0, i).toLocaleString('it-IT', { month: 'long' })}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Riassunti Generali */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Consuntivo */}
              <div className="bg-[#222222] p-8 rounded-[32px] text-white shadow-xl space-y-4">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">A - Costo Orario Consuntivo</p>
                <div className="grid grid-cols-2 gap-4 border-b border-white/5 pb-4">
                  <div>
                    <p className="text-[10px] text-slate-500 font-bold">Stipendi Totali</p>
                    <p className="text-base font-black text-white">{formatEuro(parsedCostoOrarioData.totStipendiActual)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 font-bold">Contributi Totali</p>
                    <p className="text-base font-black text-white">{formatEuro(parsedCostoOrarioData.totContributiActual)}</p>
                  </div>
                </div>
                <div className="flex justify-between items-baseline pt-2">
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Costo Orario Medio</p>
                    <p className="text-3xl font-black text-rose-400">{formatEuro(parsedCostoOrarioData.averageCostoOrarioActual)}/h</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Costo Mediano</p>
                    <p className="text-xl font-bold text-slate-300">{formatEuro(parsedCostoOrarioData.medianCostoOrarioActual)}/h</p>
                  </div>
                </div>
                <p className="text-[9px] text-slate-500 italic">Basato su {parsedCostoOrarioData.totalHoursActual} ore lavorate totali {meseOrario === 0 ? "nell'anno" : "nel mese"}</p>
              </div>

              {/* Previsionale */}
              <div className="bg-slate-900 p-8 rounded-[32px] text-white shadow-xl space-y-4 border border-white/5">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">B - Costo Orario Previsionale</p>
                <div className="grid grid-cols-2 gap-4 border-b border-white/5 pb-4">
                  <div>
                    <p className="text-[10px] text-slate-500 font-bold">Stipendi Previsti</p>
                    <p className="text-base font-black text-white">{formatEuro(parsedCostoOrarioData.totStipendiPrev)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 font-bold">Contributi Previsti</p>
                    <p className="text-base font-black text-white">{formatEuro(parsedCostoOrarioData.totContributiPrev)}</p>
                  </div>
                </div>
                <div className="flex justify-between items-baseline pt-2">
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Costo Medio Previsto</p>
                    <p className="text-3xl font-black text-indigo-400">{formatEuro(parsedCostoOrarioData.averageCostoOrarioPrev)}/h</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Mediano Previsto</p>
                    <p className="text-xl font-bold text-slate-300">{formatEuro(parsedCostoOrarioData.medianCostoOrarioPrev)}/h</p>
                  </div>
                </div>
                <p className="text-[9px] text-slate-500 italic">Basato su {parsedCostoOrarioData.totalHoursPrev} ore pianificate totali {meseOrario === 0 ? "nell'anno" : "nel mese"}</p>
              </div>
            </div>

            {/* Tabella di inserimento ore per singolo operaio */}
            <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm space-y-6">
              <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                <div>
                  <h4 className="font-black text-slate-900 uppercase tracking-tight">Elenco Ore Lavorate per Operaio</h4>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Inserisci i dipendenti e le rispettive ore per il calcolo preciso del costo orario reale</p>
                </div>
                {meseOrario !== 0 && (
                  <button
                    onClick={() => {
                      const newWorker = {
                        id: Math.random().toString(36).substring(2, 9),
                        nome: '',
                        tariffaContrattuale: 28,
                        oreConsuntivo: 0,
                        orePrevisionale: 0,
                      };
                      setWorkersList([...activeWorkersList, newWorker]);
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all"
                  >
                    <UserPlus size={14} />
                    Aggiungi Operaio
                  </button>
                )}
              </div>

              {meseOrario === 0 && activeWorkersList.length > 0 && (
                <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 text-xs text-blue-700 font-medium flex items-center gap-2">
                  <Info size={16} className="text-blue-500 shrink-0" />
                  <span>
                    <strong>Visualizzazione Annuale Aggregata:</strong> I dati visualizzati sono la somma di tutte le ore inserite mese per mese nel {anno}. Seleziona un mese specifico dal menu in alto per modificare le ore o i dati dei dipendenti.
                  </span>
                </div>
              )}

              {activeWorkersList.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <Users size={40} className="mx-auto mb-3 opacity-30 text-slate-500" />
                  <p className="font-bold text-slate-700">
                    {meseOrario === 0 ? 'Nessun operaio inserito per questo anno.' : 'Nessun operaio inserito per questo mese.'}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {meseOrario === 0 
                      ? 'Seleziona un mese specifico per aggiungere operai e compilare le ore.' 
                      : 'Clicca su "Aggiungi Operaio" per iniziare il calcolo specifico dipendente per dipendente.'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-400">
                        <th className="pb-3 text-[10px] font-black uppercase tracking-widest w-1/4">Nome Operaio</th>
                        <th className="pb-3 text-[10px] font-black uppercase tracking-widest text-center w-1/6">
                          Tariffa Contratto
                          <span className="block text-[8px] font-normal text-slate-400 normal-case leading-none mt-0.5">(fornito dal consulente del lavoro o calcolato da contratto)</span>
                        </th>
                        <th className="pb-3 text-[10px] font-black uppercase tracking-widest text-center w-1/6">Ore Consuntivo</th>
                        <th className="pb-3 text-[10px] font-black uppercase tracking-widest text-center w-1/6">Costo Reale Cons.</th>
                        <th className="pb-3 text-[10px] font-black uppercase tracking-widest text-center w-1/6">Ore Eseguite</th>
                        <th className="pb-3 text-[10px] font-black uppercase tracking-widest text-center w-1/6">Costo Reale Prev.</th>
                        <th className="pb-3 w-12"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {parsedCostoOrarioData.workers.map((w, idx) => (
                        <tr key={w.id} className="hover:bg-slate-50/50">
                          <td className="py-3">
                            <input 
                              type="text"
                              value={w.nome}
                              placeholder="Nome Operaio"
                              disabled={meseOrario === 0}
                              onChange={(e) => {
                                const newList = [...activeWorkersList];
                                newList[idx].nome = e.target.value;
                                setWorkersList(newList);
                              }}
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-900 outline-none focus:border-slate-400 disabled:opacity-75 disabled:bg-slate-100 disabled:text-slate-500"
                            />
                          </td>
                          <td className="py-3 text-center">
                            <div className="inline-flex items-center bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 w-24 disabled:opacity-75 disabled:bg-slate-100">
                              <span className="text-slate-400 text-xs mr-1">€</span>
                              <input 
                                type="number"
                                value={w.tariffaContrattuale || ''}
                                placeholder="28"
                                disabled={meseOrario === 0}
                                onChange={(e) => {
                                  const newList = [...activeWorkersList];
                                  newList[idx].tariffaContrattuale = parseFloat(e.target.value) || 0;
                                  setWorkersList(newList);
                                }}
                                className="w-full bg-transparent text-center text-xs font-bold text-slate-900 outline-none disabled:text-slate-500"
                              />
                            </div>
                          </td>
                          <td className="py-3 text-center">
                            <input 
                              type="number"
                              value={w.oreConsuntivo || ''}
                              placeholder="0"
                              disabled={meseOrario === 0}
                              onChange={(e) => {
                                const newList = [...activeWorkersList];
                                newList[idx].oreConsuntivo = parseFloat(e.target.value) || 0;
                                setWorkersList(newList);
                              }}
                              className="w-20 text-center bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-900 outline-none focus:border-slate-400 disabled:opacity-75 disabled:bg-slate-100 disabled:text-slate-500"
                            />
                          </td>
                          <td className="py-3 text-center">
                            <span className={`text-xs font-black ${w.costoOrarioActual > w.tariffaContrattuale ? 'text-rose-500' : w.costoOrarioActual > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                              {w.costoOrarioActual > 0 ? `${formatEuro(w.costoOrarioActual)}/h` : '-'}
                            </span>
                          </td>
                          <td className="py-3 text-center">
                            <input 
                              type="number"
                              value={w.orePrevisionale || ''}
                              placeholder="0"
                              disabled={meseOrario === 0}
                              onChange={(e) => {
                                const newList = [...activeWorkersList];
                                newList[idx].orePrevisionale = parseFloat(e.target.value) || 0;
                                setWorkersList(newList);
                              }}
                              className="w-20 text-center bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-900 outline-none focus:border-slate-400 disabled:opacity-75 disabled:bg-slate-100 disabled:text-slate-500"
                            />
                          </td>
                          <td className="py-3 text-center">
                            <span className={`text-xs font-black ${w.costoOrarioPrev > w.tariffaContrattuale ? 'text-rose-400' : w.costoOrarioPrev > 0 ? 'text-indigo-500' : 'text-slate-400'}`}>
                              {w.costoOrarioPrev > 0 ? `${formatEuro(w.costoOrarioPrev)}/h` : '-'}
                            </span>
                          </td>
                          <td className="py-3 text-right">
                            {meseOrario !== 0 ? (
                              <button
                                onClick={() => {
                                  const newList = activeWorkersList.filter((_, i) => i !== idx);
                                  setWorkersList(newList);
                                }}
                                className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                                title="Rimuovi Operaio"
                              >
                                <Trash2 size={14} />
                              </button>
                            ) : (
                              <div className="w-8"></div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex gap-4 p-6 bg-slate-50 rounded-2xl border border-slate-100 mt-4">
                <Info size={20} className="text-slate-400 shrink-0" />
                <div className="text-[10px] text-slate-500 leading-relaxed uppercase font-bold space-y-1">
                  <p>Istruzioni di Calcolo:</p>
                  <ul className="list-disc pl-4 space-y-0.5 normal-case font-medium text-slate-500 text-[11px]">
                    <li>Se il nome dell'operaio è incluso nella causale/descrizione dello stipendio in contabilità, l'app gli attribuisce lo stipendio esatto.</li>
                    <li>Se non viene trovato alcun riscontro per i nomi in lista, gli stipendi registrati nel mese vengono suddivisi proporzionalmente alle ore lavorate da ciascun operaio.</li>
                    <li>I contributi mensili (es. modello F24 cumulativo) vengono suddivisi proporzionalmente allo stipendio netto calcolato per ciascun operaio.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'sacri' && (
          <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
              {[
                { 
                  id: 1, 
                  label: 'Fatturato YTD', 
                  termId: 'fatturato',
                  value: formatEuro(metrics.fatturato), 
                  prevValue: formatEuro(metrics.proiezioneFatturato),
                  desc: 'Ricavi core realizzati',
                  status: 'blue', 
                  icon: BarChart2,
                  proj: formatEuro(metrics.fatturato * (12 / rates.mesiTrascorsi)),
                  calculatedValues: `Fatturato YTD:\n- Consuntivo YTD: ${formatEuro(metrics.fatturato)} (su ${rates.mesiTrascorsi} mesi)\n- Proiezione Lineare 12 mesi: ${formatEuro(metrics.fatturato * (12 / rates.mesiTrascorsi))}`
                },
                { 
                  id: 2, 
                  label: 'Primo Margine %', 
                  termId: 'primo_margine',
                  value: formatPercent(metrics.primoMarginePercent), 
                  prevValue: formatPercent(proiezionePrimoMarginePercent),
                  prevValRaw: proiezionePrimoMarginePercent,
                  desc: 'Margine dopo costi diretti',
                  status: 'emerald', 
                  icon: Target,
                  proj: formatPercent(metrics.primoMarginePercent),
                  calculatedValues: `Primo Margine:\n- Consuntivo YTD: ${formatEuro(metrics.primoMargineTot)} (${formatPercent(metrics.primoMarginePercent)})\n- Proiezione Lineare 12m: ${formatEuro(metrics.primoMargineTot * (12 / rates.mesiTrascorsi))} (${formatPercent(metrics.primoMarginePercent)})`,
                  soglie: {
                    valore: metrics.primoMarginePercent,
                    tipo: 'piu_alto_meglio',
                    fasce: [
                      { min: 0.15, label: 'Ottimo', colore: 'ottimo' },
                      { min: 0.10, max: 0.15, label: 'Buono', colore: 'buono' },
                      { min: 0.05, max: 0.10, label: 'Attenzione', colore: 'attenzione' },
                      { max: 0.05, label: 'Critico', colore: 'critico' },
                    ]
                  },
                  prevSoglie: {
                    valore: proiezionePrimoMarginePercent,
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
                  prevValue: formatPercent(proiezioneEbitdaPercent),
                  prevValRaw: proiezioneEbitdaPercent,
                  desc: 'Margine operativo lordo',
                  status: 'indigo', 
                  icon: TrendingUp,
                  proj: formatPercent(metrics.ebitdaPercent),
                  calculatedValues: `EBITDA:\n- Consuntivo YTD: ${formatEuro(metrics.ebitdaTot)} (${formatPercent(metrics.ebitdaPercent)})\n- Proiezione Lineare 12m: ${formatEuro(metrics.ebitdaTot * (12 / rates.mesiTrascorsi))} (${formatPercent(metrics.ebitdaPercent)})`,
                  soglie: {
                    valore: metrics.ebitdaPercent,
                    tipo: 'piu_alto_meglio',
                    fasce: [
                      { min: 0.10, label: 'Ottimo', colore: 'ottimo' },
                      { min: 0.07, max: 0.10, label: 'Buono', colore: 'buono' },
                      { min: 0.04, max: 0.07, label: 'Attenzione', colore: 'attenzione' },
                      { max: 0.04, label: 'Critico', colore: 'critico' },
                    ]
                  },
                  prevSoglie: {
                    valore: proiezioneEbitdaPercent,
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
                  prevValue: formatPercent(proiezioneUtileNettoPercent),
                  prevValRaw: proiezioneUtileNettoPercent,
                  desc: 'Utile dopo tasse e ammortamenti',
                  status: 'violet', 
                  icon: Zap,
                  proj: formatPercent(metrics.utileNettoPercent),
                  calculatedValues: `Utile Netto:\n- Consuntivo YTD: ${formatEuro(metrics.utileNettoTot)} (${formatPercent(metrics.utileNettoPercent)})\n- Proiezione Lineare 12m: ${formatEuro(metrics.utileNettoTot * (12 / rates.mesiTrascorsi))} (${formatPercent(metrics.utileNettoPercent)})`,
                  soglie: {
                    valore: metrics.utileNettoPercent,
                    tipo: 'piu_alto_meglio',
                    fasce: [
                      { min: 0.06, label: 'Ottimo', colore: 'ottimo' },
                      { min: 0.04, max: 0.06, label: 'Buono', colore: 'buono' },
                      { min: 0.02, max: 0.04, label: 'Attenzione', colore: 'attenzione' },
                      { max: 0.02, label: 'Critico', colore: 'critico' },
                    ]
                  },
                  prevSoglie: {
                    valore: proiezioneUtileNettoPercent,
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
                  prevValue: formatEuro(projBreakEven),
                  desc: 'Fatturato minimo per pareggio',
                  status: 'rose', 
                  icon: AlertCircle,
                  proj: formatEuro(metrics.breakEven),
                  extra: formatEuro(metrics.breakEvenCassa),
                  extraLabel: 'Di cassa',
                  prevExtra: formatEuro(projBreakEvenCassa),
                  calculatedValues: `Punto di Pareggio:\n- Competenza YTD: ${formatEuro(metrics.breakEven)}\n- Cassa YTD: ${formatEuro(metrics.breakEvenCassa)}\n- Stato rispetto a Fatturato: ${metrics.fatturato >= metrics.breakEven ? 'RAGGIUNTO (Fatturato YTD ' + formatEuro(metrics.fatturato) + ' >= Pareggio ' + formatEuro(metrics.breakEven) + ')' : 'MANCANO ' + formatEuro(metrics.breakEven - metrics.fatturato)}`,
                  soglie: {
                    valore: metrics.fatturato,
                    tipo: 'piu_alto_meglio',
                    customLabel: metrics.fatturato >= metrics.breakEven ? 'Raggiunto' : 'Mancano ' + formatEuro(metrics.breakEven - metrics.fatturato),
                    fasce: [
                      { min: metrics.breakEven, label: 'Raggiunto', colore: 'ottimo' },
                      { min: metrics.breakEven * 0.8, max: metrics.breakEven, label: 'Quasi', colore: 'attenzione' },
                      { max: metrics.breakEven * 0.8, label: 'Lontano', colore: 'critico' },
                    ]
                  },
                  prevSoglie: {
                    valore: metrics.proiezioneFatturato,
                    tipo: 'piu_alto_meglio',
                    customLabel: metrics.proiezioneFatturato >= projBreakEven ? 'Raggiunto' : 'Mancano ' + formatEuro(projBreakEven - metrics.proiezioneFatturato),
                    fasce: [
                      { min: projBreakEven, label: 'Raggiunto', colore: 'ottimo' },
                      { min: projBreakEven * 0.8, max: projBreakEven, label: 'Quasi', colore: 'attenzione' },
                      { max: projBreakEven * 0.8, label: 'Lontano', colore: 'critico' },
                    ]
                  }
                },
                { 
                  id: 6, 
                  label: 'Incidenza Studio %', 
                  termId: 'incidenza_studio_fatturato',
                  value: formatPercent(rates.incidenzaStudioFatturato), 
                  prevValue: formatPercent(rates.incidenzaStudioFatturatoPrev),
                  prevValRaw: rates.incidenzaStudioFatturatoPrev,
                  desc: 'Costo tecnici su fatturato',
                  status: 'sky', 
                  icon: Calculator,
                  proj: formatPercent(rates.incidenzaStudioFatturato),
                  calculatedValues: `Incidenza Studio sul Fatturato:\n- Consuntivo: Costi Studio ${formatEuro(rates.totaleCostiStudio)} / Fatturato ${formatEuro(rates.fatturato)} = ${formatPercent(rates.incidenzaStudioFatturato)}\n- Previsionale: Costi Studio Target ${formatEuro(rates.totaleCostiStudioPrev)} / Fatturato Target ${formatEuro(rates.fatturatoPrev)} = ${formatPercent(rates.incidenzaStudioFatturatoPrev)}`,
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
                  prevValue: formatPercent(rates.incidenzaFissiFatturatoPrev),
                  prevValRaw: rates.incidenzaFissiFatturatoPrev,
                  desc: 'Costi struttura su fatturato',
                  status: 'amber', 
                  icon: BarChart2,
                  proj: formatPercent(rates.incidenzaFissiFatturato),
                  calculatedValues: `Incidenza Costi Fissi (escl. Studio):\n- Consuntivo: Costi Fissi Puri ${formatEuro(rates.totaleOverheadPuro)} / Fatturato ${formatEuro(rates.fatturato)} = ${formatPercent(rates.incidenzaFissiFatturato)}\n- Previsionale: Costi Fissi Target ${formatEuro(rates.totaleOverheadPuroPrev)} / Fatturato Target ${formatEuro(rates.fatturatoPrev)} = ${formatPercent(rates.incidenzaFissiFatturatoPrev)}`,
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
                  prevValue: formatEuro(proiezioneCompensoSoci),
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
                  },
                  prevSoglie: {
                    valore: metrics.proiezioneUtile > 0 ? proiezioneCompensoSoci / metrics.proiezioneUtile : 1,
                    tipo: 'piu_basso_meglio',
                    fasce: [
                      { max: 0.30, label: 'Ottimo', colore: 'ottimo' },
                      { min: 0.30, max: 0.50, label: 'Buono', colore: 'buono' },
                      { min: 0.50, max: 0.80, label: 'Attenzione', colore: 'attenzione' },
                      { min: 0.80, label: 'Critico', colore: 'critico' },
                    ]
                  }
                },
              ].map((num) => {
                const numWithData = {
                  ...num,
                  hasNoData: metrics.fatturato === 0,
                  prevHasNoData: metrics.proiezioneFatturato === 0,
                };
                return (
                  <div key={num.id} className="flex flex-col gap-3">
                    <div className="flex-1 flex flex-col">
                      <SacredCard num={numWithData} />
                    </div>
                    <SacredForecastCard num={numWithData} />
                  </div>
                );
              })}
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

            {/* VALUTAZIONE AI SU PREVISIONALE */}
            <AICoachForecastInsights metricsPrev={metricsPrev} rates={rates} />
          </div>
        )}

        {activeTab === 'fiscale' && (
          <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">

            {/* Toggle e Info Previsionale */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="font-black text-slate-900 text-sm">Metodo di Calcolo Fiscale</h3>
                <p className="text-[11px] text-slate-500">
                  Scegli tra i dati reali consolidati a consuntivo (YTD) e la proiezione dell'intero anno (forecast).
                </p>
              </div>
              <div className="flex items-center bg-slate-100 rounded-xl p-1 self-start md:self-auto">
                <button
                  onClick={() => setVistaPrevFiscale(false)}
                  className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${
                    !vistaPrevFiscale
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Consuntivo YTD
                </button>
                <button
                  onClick={() => setVistaPrevFiscale(true)}
                  className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${
                    vistaPrevFiscale
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Previsionale (Forecast)
                </button>
              </div>
            </div>

            {vistaPrevFiscale && (
              <div className="flex items-start gap-3 bg-violet-50 border border-violet-100 rounded-2xl p-4 animate-in fade-in duration-300">
                <Sparkles size={16} className="text-violet-500 shrink-0 mt-0.5" />
                <div className="text-[11px] text-violet-800 leading-relaxed">
                  <span className="font-bold">Vista Previsionale Attiva:</span> Le imposte (IRES e IRAP) sono stimate sull'intero anno corrente {anno} includendo i ricavi previsionali (SAL futuri, acconti) e i costi forecast censiti a piano. I versamenti F24 indicati includono le stime dei versamenti futuri.
                </div>
              </div>
            )}

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
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        {vistaPrevFiscale ? 'EBT Proiettato' : 'EBT per cassa'}
                      </p>
                      <p className="text-xs text-slate-500">
                        {vistaPrevFiscale ? 'EBT stimato fine anno' : 'Da CE consuntivo'}
                      </p>
                    </div>
                    <span className="text-sm font-black text-slate-700 font-mono">{formatEuro(previsioneFiscale.ebtCompetenza)}</span>
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
                      <p className="text-xs text-slate-500">
                        {vistaPrevFiscale ? 'Ricavi Proiettati + Δ WIP' : 'Ricavi + Δ WIP'}
                      </p>
                    </div>
                    <span className="text-sm font-black text-slate-700 font-mono">{formatEuro(previsioneFiscale.valoreProduzione)}</span>
                  </div>

                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Costi Deducibili IRAP</p>
                      <p className="text-xs text-slate-500">Costi operativi escluso personale dipendente</p>
                    </div>
                    <span className="text-sm font-black text-slate-700 font-mono">
                      -{formatEuro(previsioneFiscale.costiDeducibiliIRAP)}
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
                        <p className="text-xs font-black text-slate-300">
                          {vistaPrevFiscale ? 'F24 Versati + Previsti' : 'F24 Già Versati'}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {vistaPrevFiscale ? 'Reali + forecast ' + anno : 'Da cash flow ' + anno}
                        </p>
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

const AICoachForecastInsights: React.FC<{ metricsPrev: any; rates: any }> = ({ metricsPrev, rates }) => {
  const [insights, setInsights] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasForecastData = metricsPrev.fatturato > 0;

  const fetchInsights = async () => {
    if (isLoading || !hasForecastData) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await generateForecastInsights(metricsPrev, rates);
      if (result) {
        setInsights(result);
        setHasLoaded(true);
      } else {
        setError('Nessuna risposta ricevuta dall\'AI.');
      }
    } catch (e) {
      setError('Errore nella comunicazione con l\'AI Coach.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-[#0f172a] rounded-[32px] border border-slate-800 shadow-xl p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-500/20 rounded-xl flex items-center justify-center">
            <Sparkles size={20} className="text-indigo-400" />
          </div>
          <div>
            <h3 className="font-black text-white uppercase tracking-tight text-sm">AI Coach — Valutazione Previsionale</h3>
            <p className="text-[10px] text-slate-400 mt-0.5">Analisi strategica e azioni correttive basate sui dati previsionali</p>
          </div>
        </div>
        {!hasLoaded && (
          <button
            onClick={fetchInsights}
            disabled={isLoading || !hasForecastData}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black transition-all ${
              !hasForecastData
                ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                : isLoading
                ? 'bg-indigo-600/50 text-indigo-300 cursor-wait'
                : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-500/20'
            }`}
          >
            {isLoading ? (
              <>
                <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Analisi in corso...
              </>
            ) : (
              <>
                <Sparkles size={14} />
                Genera Analisi AI
              </>
            )}
          </button>
        )}
        {hasLoaded && (
          <button
            onClick={fetchInsights}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black text-slate-400 border border-slate-700 hover:border-slate-500 hover:text-slate-300 transition-all"
          >
            <svg className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Rigenera
          </button>
        )}
      </div>

      {/* No forecast data state */}
      {!hasForecastData && (
        <div className="flex items-start gap-3 bg-slate-800/50 border border-slate-700 rounded-2xl p-5">
          <AlertCircle size={16} className="text-slate-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-slate-400 font-bold leading-relaxed">
            Nessun dato previsionale trovato per l'anno selezionato. Carica le transazioni previsionali per ricevere l'analisi AI.
          </p>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="flex items-start gap-3 bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4">
          <AlertCircle size={14} className="text-rose-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-rose-400 font-bold">{error}</p>
        </div>
      )}

      {/* Idle / prompt state */}
      {hasForecastData && !hasLoaded && !isLoading && !error && (
        <div className="flex flex-col items-center justify-center py-8 gap-4">
          <div className="w-16 h-16 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
            <Sparkles size={28} className="text-indigo-400" />
          </div>
          <div className="text-center space-y-1">
            <p className="text-sm font-black text-slate-300">Pronto all'analisi</p>
            <p className="text-[11px] text-slate-500 font-bold max-w-xs leading-relaxed">
              Clicca "Genera Analisi AI" per ricevere una valutazione strategica sui dati previsionali e azioni correttive suggerite dall'AI.
            </p>
          </div>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-8 gap-4">
          <div className="relative">
            <div className="w-12 h-12 rounded-full border-2 border-indigo-500/30 border-t-indigo-500 animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Sparkles size={16} className="text-indigo-400" />
            </div>
          </div>
          <p className="text-xs font-black text-slate-400">L'AI sta analizzando i dati previsionali...</p>
        </div>
      )}

      {/* Results */}
      {hasLoaded && insights && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Fatturato Target', value: new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(metricsPrev.fatturato), icon: BarChart2, color: 'text-sky-400' },
              { label: 'Primo Margine', value: new Intl.NumberFormat('it-IT', { style: 'percent', minimumFractionDigits: 1 }).format(metricsPrev.primoMarginePercent), icon: TrendingUp, color: 'text-emerald-400' },
              { label: 'EBITDA', value: new Intl.NumberFormat('it-IT', { style: 'percent', minimumFractionDigits: 1 }).format(metricsPrev.ebitdaPercent), icon: Target, color: 'text-indigo-400' },
              { label: 'Utile Netto', value: new Intl.NumberFormat('it-IT', { style: 'percent', minimumFractionDigits: 1 }).format(metricsPrev.utileNettoPercent), icon: Zap, color: 'text-violet-400' },
            ].map(item => (
              <div key={item.label} className="bg-slate-800/50 border border-slate-700 rounded-2xl p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <item.icon size={14} className={item.color} />
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{item.label}</span>
                </div>
                <p className={`text-lg font-black ${item.color}`}>{item.value}</p>
              </div>
            ))}
          </div>

          {/* AI narrative */}
          <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles size={14} className="text-indigo-400" />
              <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Valutazione Strategica AI</span>
            </div>
            <div className="prose prose-invert prose-sm max-w-none text-slate-300 text-[12px] leading-relaxed [&_strong]:text-white [&_strong]:font-black [&_h2]:text-white [&_h3]:text-white [&_ul]:space-y-1 [&_li]:text-slate-300">
              <ReactMarkdown>{insights}</ReactMarkdown>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const getDinamicoAzioniCorrettive = (id: number, fasciaColore?: string) => {
  if (!fasciaColore) return "Nessuna azione correttiva necessaria (dati non sufficienti o assenti).";
  
  if (fasciaColore === 'ottimo') {
    return "Prestazione eccellente ed ottimale. Continuare con il monitoraggio periodico e mantenere i controlli correnti.";
  }
  if (fasciaColore === 'buono') {
    return "Livello soddisfacente. Si raccomanda di mantenere l'attenzione sui margini operativi per prevenire scostamenti negativi.";
  }
  
  const isCritico = fasciaColore === 'critico';
  const prefix = isCritico ? "⚠️ [CRITICITÀ ALTA] " : "⚠️ [ATTENZIONE] ";

  switch(id) {
    case 1:
      return prefix + "Il fatturato è al di sotto delle aspettative. Si rende necessario accelerare la fatturazione dei SAL, sollecitare i clienti e verificare lo stato dei contratti in portafoglio.";
    case 2:
      return prefix + "Margine basso sui costi diretti. Rinegoziare con urgenza le tariffe dei subappaltatori principali e ottimizzare gli acquisti di materiali per i cantieri.";
    case 3:
      return prefix + "Margine operativo insoddisfacente. Avviare un piano di contenimento degli sprechi in cantiere e ottimizzare l'efficienza della manodopera diretta.";
    case 4:
      return prefix + "Utile netto ridotto. Ottimizzare la gestione fiscale ed avviare un confronto con gli istituti di credito per ridurre gli oneri finanziari correnti.";
    case 5:
      return prefix + "Il fatturato attuale è troppo vicino o inferiore al punto di pareggio. Occorre ridurre immediatamente le spese fisse non strategiche o incrementare il volume d'affari complessivo.";
    case 6:
      return prefix + "L'incidenza delle spese tecniche è eccessiva rispetto al fatturato. Valutare una riorganizzazione del personale di studio o l'ottimizzazione delle ore dedicate alle commesse.";
    case 7:
      return prefix + "I costi fissi di struttura pesano troppo. Avviare una revisione delle spese generali (es. canoni, utenze, abbonamenti software) e tagliare i costi superflui.";
    case 8:
      return prefix + "I compensi/prelievi soci drenano troppe risorse rispetto all'utile netto generato. Si consiglia di calibrare e allineare temporaneamente la remunerazione della proprietà alla reale capacità di cassa.";
    default:
      return "Monitorare l'andamento ed implementare le azioni correttive del controllo di gestione.";
  }
};

const SacredCard = ({ num }: { num: any }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [aiAction, setAiAction] = useState<string | null>(null);
  const [isLoadingAi, setIsLoadingAi] = useState(false);
  const [hasFetchedAi, setHasFetchedAi] = useState(false);

  const fascia = (num.soglie && !num.hasNoData) ? getFascia(num.soglie, num.soglie.valore) : undefined;
  const config = fascia ? COLORE_SOGLIA[fascia.colore] : undefined;

  // Fetch AI action when drawer is opened for the first time
  const handleToggle = async () => {
    const willExpand = !isExpanded;
    setIsExpanded(willExpand);
    if (willExpand && !hasFetchedAi && fascia && !num.hasNoData) {
      setIsLoadingAi(true);
      try {
        const result = await generateCardInsight(
          num.id,
          num.label,
          num.value,
          fascia.colore,
          num.desc,
          num.calculatedValues
        );
        setAiAction(result || null);
      } catch {
        setAiAction(null);
      } finally {
        setIsLoadingAi(false);
        setHasFetchedAi(true);
      }
    }
  };

  // Calcolo percentuale per la barra di progresso (semplificato)
  const getProgress = () => {
    if (!num.soglie) return 0;
    const { valore, tipo, fasce } = num.soglie;
    
    // Trova il range totale per mappare 0-100%
    const allValues = fasce.flatMap((f: any) => [f.min, f.max]).filter((v: any): v is number => v !== undefined);
    const minS = Math.min(...allValues, valore);
    const maxS = Math.max(...allValues, valore);
    const range = maxS - minS;
    
    if (range === 0) return 50;
    const rawPerc = ((valore - minS) / range) * 100;
    return tipo === 'piu_alto_meglio' ? rawPerc : 100 - rawPerc;
  };

  // Fallback static action (used while loading or if AI unavailable)
  const staticFallback = getDinamicoAzioniCorrettive(num.id, fascia?.colore);

  return (
    <div className={`bg-white rounded-[32px] border ${config?.border || 'border-slate-200'} shadow-sm overflow-hidden flex flex-col transition-all duration-300 h-full`}>
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
            {num.termId && <InfoTooltip termId={num.termId} calculatedValues={num.calculatedValues} />}
            {num.hasNoData ? (
              <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase bg-slate-100 text-slate-400 border border-slate-200">
                N/D
              </span>
            ) : (
              fascia && (
                <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase ${config?.bg} ${config?.text} border ${config?.border}`}>
                  {num.soglie?.customLabel || fascia.label}
                </span>
              )
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
          {num.soglie && !num.hasNoData && (
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
        onClick={handleToggle}
        className={`w-full p-4 ${config?.bg || 'bg-slate-50'} border-t ${config?.border || 'border-slate-100'} flex items-center justify-between text-[10px] font-black ${config?.text || 'text-slate-500'} uppercase tracking-widest hover:opacity-80 transition-all`}
      >
        <span className="flex items-center gap-1.5">
          <Sparkles size={11} />
          Azioni Correttive AI
        </span>
        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {isExpanded && (
        <div className={`p-4 ${config?.bg || 'bg-slate-50'} border-t ${config?.border || 'border-slate-100'} animate-in slide-in-from-top-2`}>
          {isLoadingAi ? (
            // Loading state
            <div className="flex items-center gap-2.5">
              <svg className="animate-spin w-3.5 h-3.5 shrink-0 opacity-60" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className={`text-[10px] font-bold italic ${config?.text || 'text-slate-500'}`}>
                L'AI sta elaborando la raccomandazione...
              </span>
            </div>
          ) : (
            // Result or fallback
            <div className="flex gap-2">
              <Sparkles size={12} className={`shrink-0 mt-0.5 ${config?.text || 'text-slate-400'}`} />
              <div className={`text-[10px] font-bold leading-relaxed ${config?.text || 'text-slate-600'}`}>
                {aiAction || staticFallback}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const TEXT_SOGLIA_DARK: Record<string, string> = {
  ottimo: 'text-emerald-400',
  buono: 'text-sky-400',
  attenzione: 'text-amber-400',
  critico: 'text-rose-400',
};

const SacredForecastCard = ({ num }: { num: any }) => {
  const s = num.prevSoglie || num.soglie;
  const val = num.prevSoglie ? num.prevSoglie.valore : (num.prevValRaw !== undefined ? num.prevValRaw : null);
  
  const fascia = (s && val !== null) ? getFascia(s, val) : undefined;
  const textColor = fascia ? TEXT_SOGLIA_DARK[fascia.colore] : 'text-indigo-300';
  const badgeBg = fascia ? (
    fascia.colore === 'ottimo' ? 'bg-emerald-500/20 text-emerald-300' : 
    fascia.colore === 'buono' ? 'bg-sky-500/20 text-sky-300' : 
    fascia.colore === 'attenzione' ? 'bg-amber-500/20 text-amber-300' : 
    'bg-rose-500/20 text-rose-300'
  ) : 'bg-indigo-500/20 text-indigo-300';

  return (
    <div className="bg-slate-900 text-white rounded-[24px] border border-slate-800 shadow-sm p-4 flex flex-col justify-between h-[110px] transition-all duration-300 hover:border-slate-700">
      <div className="flex justify-between items-start">
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5">
            <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{num.label}</h4>
            <span className={`px-1.5 py-0.2 text-[7px] font-black rounded uppercase ${badgeBg}`}>
              {s?.customLabel || fascia?.label || 'Target'}
            </span>
          </div>
          <p className="text-[9px] text-slate-400 leading-tight">Proiezione Chiusura (Forecast)</p>
        </div>
        <div className="text-slate-500">
          <num.icon size={16} />
        </div>
      </div>
      
      <div className="flex items-baseline justify-between">
        <div className={`text-lg font-black ${textColor}`}>{num.prevValue}</div>
        {num.prevExtra && (
          <span className="text-[8px] text-slate-400 font-bold uppercase">
            {num.extraLabel}: <strong className={`${textColor} font-black`}>{num.prevExtra}</strong>
          </span>
        )}
      </div>
    </div>
  );
};

export default AnalisiView;
