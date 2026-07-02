import React, { useState, useMemo } from 'react';
import { Transaction, TransactionType, CEData, CERow, BudgetData, RimanenzeAnno, RimanenzeData, AppView, Project, InitialBalanceBreakdown } from '../types';
import { buildCEData, calcCEMetrics, calcScostamenti, calcEffettoRimanenze, getDynamicCEType, getDynamicLoansInterests, calculateRepayment, parseUTCDate, calcPrevisioneFiscale } from '../utils/gasCoreEngine';
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
  projects?: Project[];
  initialData?: InitialBalanceBreakdown;
  aliquotaIRES?: number;
  aliquotaIRAP?: number;
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
  projects,
  initialData,
  aliquotaIRES = 24,
  aliquotaIRAP = 3.9,
}) => {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [activeTab, setActiveTab] = useState<'ytd' | 'projection' | 'monthly' | 'scostamenti'>('ytd');
  const [meseScostamento, setMeseScostamento] = useState<number | null>(null); // null = YTD
  const [modalita, setModalita] = useState<'cassa' | 'competenza'>('cassa');
  const [showHelp, setShowHelp] = useState(false);
  const [drawerKpi, setDrawerKpi] = useState<string | null>(null);

  const ceData = useMemo(() => 
    buildCEData(transactions, selectedYear, manualData[selectedYear.toString()], modalita, projects, initialData), 
    [transactions, selectedYear, manualData, modalita, projects, initialData]
  );

  const rawMetrics = useMemo(() => calcCEMetrics(ceData, transactions, projects, initialData), [ceData, transactions, projects, initialData]);

  const rimanenzeAnno = rimanenze?.[selectedYear.toString()];
  const previsioneFiscale = useMemo(() =>
    calcPrevisioneFiscale(
      transactions,
      selectedYear,
      rawMetrics,
      rimanenzeAnno,
      aliquotaIRES / 100,
      aliquotaIRAP / 100,
      true,
      initialData
    ),
    [transactions, selectedYear, rawMetrics, rimanenzeAnno, aliquotaIRES, aliquotaIRAP, initialData]
  );

  const metrics = useMemo(() => {
    const utileProj = rawMetrics.proiezioneEbt + rawMetrics.proiezioneStraordinario - previsioneFiscale.totaleImposteStimate;
    return {
      ...rawMetrics,
      proiezioneUtile: utileProj
    };
  }, [rawMetrics, previsioneFiscale.totaleImposteStimate]);

  const txAnno = useMemo(() => 
    (transactions || []).filter(tx => parseUTCDate((modalita === 'competenza' && tx.invoiceDate) ? tx.invoiceDate : tx.date).getUTCFullYear() === selectedYear),
    [transactions, selectedYear, modalita]
  );

  const scostamenti = useMemo(() => {
    return calcScostamenti(
      transactions,
      selectedYear,
      meseScostamento,
      budgetData?.[selectedYear.toString()],
      manualData[selectedYear.toString()]
    );
  }, [transactions, selectedYear, meseScostamento, budgetData, manualData]);

  const effettoRimanenze = useMemo(() => {
    if (!rimanenzeAnno) return null;
    return calcEffettoRimanenze(rimanenzeAnno, metrics);
  }, [rimanenzeAnno, metrics]);

  const { projBreakEven, projBreakEvenCassa } = useMemo(() => {
    const projCostiFissiTot = metrics.proiezioneCostiFissi + metrics.proiezioneCostiStudio + metrics.proiezioneAmmortamenti;
    const projPctCostiVar = metrics.proiezioneFatturato > 0 ? metrics.proiezioneCostiVariabili / metrics.proiezioneFatturato : 0;
    const breakEven = (1 - projPctCostiVar) > 0 ? projCostiFissiTot / (1 - projPctCostiVar) : 0;
    
    const projCostiFissiCassa = projCostiFissiTot - metrics.proiezioneAmmortamenti + metrics.costiCapitaleRate;
    const breakEvenCassa = (1 - projPctCostiVar) > 0 ? projCostiFissiCassa / (1 - projPctCostiVar) : 0;
    
    return { projBreakEven: breakEven, projBreakEvenCassa: breakEvenCassa };
  }, [metrics]);

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

    const txAnnoContribuenti = transactions.filter(tx =>
      parseUTCDate((modalita === 'competenza' && tx.invoiceDate) ? tx.invoiceDate : tx.date).getUTCFullYear() === selectedYear &&
      !tx.isForecast && tx.ceType
    );

    const today = new Date();
    // Proiezioni: consuntivi + previsionali non ancora saldati
    const txAnnoProiezioniBase = transactions.filter(tx => {
      if (parseUTCDate((modalita === 'competenza' && tx.invoiceDate) ? tx.invoiceDate : tx.date).getUTCFullYear() !== selectedYear) return false;
      if (!tx.ceType) return false;
      if (!tx.isForecast) return true;
      const isLinked = transactions.some(act => !act.isForecast && act.linkedForecastId === tx.id);
      return !isLinked;
    });

    const getPureForecastSum = (types: string[]): number => {
      const txs = transactions.filter(tx => {
        const type = getDynamicCEType(tx, projects);
        return tx.isForecast && 
          parseUTCDate((modalita === 'competenza' && tx.invoiceDate) ? tx.invoiceDate : tx.date).getUTCFullYear() === selectedYear && 
          type && types.includes(type);
      });
      const sum = txs.reduce((s, tx) => {
        const type = getDynamicCEType(tx, projects);
        const isIncome = type.startsWith('ricavo') || type === 'provento_finanziario' || (type === 'straordinario' && tx.type === 'INCOME');
        return s + (isIncome ? Math.abs(tx.amount) : -Math.abs(tx.amount));
      }, 0);

      if (types.includes('onere_finanziario')) {
        const interests = getDynamicLoansInterests(transactions, selectedYear, initialData);
        return sum - interests.reduce((a, b) => a + b, 0);
      }
      return sum;
    };

    const prevRicCore = getPureForecastSum(['ricavo_core']);
    const prevRicImmob = getPureForecastSum(['ricavo_immobiliare']);
    const prevRicAltro = getPureForecastSum(['ricavo_altro']);
    const prevFat = prevRicCore + prevRicImmob + prevRicAltro;
    const prevCVar = Math.abs(getPureForecastSum(['costo_variabile']));
    const prevCStu = Math.abs(getPureForecastSum(['costo_studio']));
    const prevCFis = Math.abs(getPureForecastSum(['costo_fisso']));
    const prevAmm = Math.abs(getPureForecastSum(['ammortamento']));
    const prevOnFin = Math.abs(getPureForecastSum(['onere_finanziario']));
    const prevPrFin = getPureForecastSum(['provento_finanziario']);
    const prevStr = getPureForecastSum(['straordinario']);
    
    const prevEbtBase = prevFat - prevCVar - prevCStu - prevCFis - prevAmm - prevOnFin + prevPrFin;
    const prevTaxes = (prevEbtBase + prevStr) > 0 ? (prevEbtBase + prevStr) * metrics.aliquotaEffettiva : 0;
    const prevUtile = prevEbtBase + prevStr - prevTaxes;
    const prevPrelievo = Math.abs(getPureForecastSum(['distribuzione_utile']));
    
    const prevPMargin = prevFat - prevCVar;
    const prevEbitda = prevPMargin - prevCStu - prevCFis;
    const prevEbit = prevEbitda - prevAmm;
    const prevEbt = prevEbtBase;
    const prevBreakEven = (prevCFis + prevCStu + prevAmm) / (1 - (prevFat > 0 ? prevCVar / prevFat : 0));

    const configs: Record<string, {
      nome: string; valore: number; percentuale?: number;
      steps: FormulaStep[]; ceTypes: string[];
      proiezioneValore?: number; proiezionePercentuale?: number;
      proiezioneSteps?: FormulaStep[];
      soloPrevisionaleValore?: number; soloPrevisionalePercentuale?: number;
      soloPrevisionaleSteps?: FormulaStep[];
    }> = {
      fatturato: {
        nome: 'Fatturato / Ricavi Core',
        valore: fat,
        percentuale: 1,
        steps: [
          { label: 'Ricavi Core (SAL, saldi, vendite)', valore: s12(ceData.ricaviCore), isPositivo: true },
          { label: 'Vendite Immobiliari', valore: s12(ceData.ricaviImmobiliare), isPositivo: true, indent: true },
          { label: 'Altri Ricavi', valore: s12(ceData.ricaviAltro), isPositivo: true, indent: true },
          { label: 'Fatturato Totale', valore: fat, isPositivo: true, isRisultato: true, percentualeSu: fat },
        ],
        ceTypes: ['ricavo_core', 'ricavo_altro', 'ricavo_immobiliare'],
        proiezioneValore: metrics.proiezioneFatturato,
        proiezionePercentuale: 1,
        proiezioneSteps: [
          { label: 'Ricavi Core [Proiezione]', valore: metrics.proiezioneRicaviCore, isPositivo: true },
          { label: 'Vendite Immobiliari [Proiezione]', valore: metrics.proiezioneRicaviImmobiliare, isPositivo: true, indent: true },
          { label: 'Altri Ricavi [Proiezione]', valore: metrics.proiezioneRicaviAltro, isPositivo: true, indent: true },
          { label: 'Fatturato Totale [Proiezione]', valore: metrics.proiezioneFatturato, isPositivo: true, isRisultato: true, percentualeSu: metrics.proiezioneFatturato },
        ],
        soloPrevisionaleValore: prevFat,
        soloPrevisionalePercentuale: 1,
        soloPrevisionaleSteps: [
          { label: 'Ricavi Core [Previsionale]', valore: prevRicCore, isPositivo: true },
          { label: 'Vendite Immobiliari [Previsionale]', valore: prevRicImmob, isPositivo: true, indent: true },
          { label: 'Altri Ricavi [Previsionale]', valore: prevRicAltro, isPositivo: true, indent: true },
          { label: 'Fatturato Totale [Previsionale]', valore: prevFat, isPositivo: true, isRisultato: true, percentualeSu: prevFat }
        ]
      },
      ricavo_core: {
        nome: 'Ricavi Core (SAL/Commesse)',
        valore: s12(ceData.ricaviCore),
        percentuale: fat > 0 ? s12(ceData.ricaviCore) / fat : 0,
        steps: [
          { label: 'Ricavi Core', valore: s12(ceData.ricaviCore), isPositivo: true, isRisultato: true, percentualeSu: fat }
        ],
        ceTypes: ['ricavo_core'],
        proiezioneValore: metrics.proiezioneRicaviCore,
        proiezionePercentuale: metrics.proiezioneFatturato > 0 ? metrics.proiezioneRicaviCore / metrics.proiezioneFatturato : 0,
        proiezioneSteps: [
          { label: 'Ricavi Core [Proiezione]', valore: metrics.proiezioneRicaviCore, isPositivo: true, isRisultato: true, percentualeSu: metrics.proiezioneFatturato }
        ],
        soloPrevisionaleValore: prevRicCore,
        soloPrevisionalePercentuale: prevFat > 0 ? prevRicCore / prevFat : 0,
        soloPrevisionaleSteps: [
          { label: 'Ricavi Core [Previsionale]', valore: prevRicCore, isPositivo: true, isRisultato: true, percentualeSu: prevFat }
        ]
      },
      ricavo_immobiliare: {
        nome: 'Vendite Immobiliari',
        valore: s12(ceData.ricaviImmobiliare),
        percentuale: fat > 0 ? s12(ceData.ricaviImmobiliare) / fat : 0,
        steps: [
          { label: 'Vendite Immobiliari (commesse immobiliari/acconti)', valore: s12(ceData.ricaviImmobiliare), isPositivo: true, isRisultato: true, percentualeSu: fat }
        ],
        ceTypes: ['ricavo_immobiliare'],
        proiezioneValore: metrics.proiezioneRicaviImmobiliare,
        proiezionePercentuale: metrics.proiezioneFatturato > 0 ? metrics.proiezioneRicaviImmobiliare / metrics.proiezioneFatturato : 0,
        proiezioneSteps: [
          { label: 'Vendite Immobiliari [Proiezione]', valore: metrics.proiezioneRicaviImmobiliare, isPositivo: true, isRisultato: true, percentualeSu: metrics.proiezioneFatturato }
        ],
        soloPrevisionaleValore: prevRicImmob,
        soloPrevisionalePercentuale: prevFat > 0 ? prevRicImmob / prevFat : 0,
        soloPrevisionaleSteps: [
          { label: 'Vendite Immobiliari [Previsionale]', valore: prevRicImmob, isPositivo: true, isRisultato: true, percentualeSu: prevFat }
        ]
      },
      ricavo_altro: {
        nome: 'Altri Ricavi (Affitti/Sviluppo)',
        valore: s12(ceData.ricaviAltro),
        percentuale: fat > 0 ? s12(ceData.ricaviAltro) / fat : 0,
        steps: [
          { label: 'Altri Ricavi (affitti, provvigioni, servizi)', valore: s12(ceData.ricaviAltro), isPositivo: true, isRisultato: true, percentualeSu: fat }
        ],
        ceTypes: ['ricavo_altro'],
        proiezioneValore: metrics.proiezioneRicaviAltro,
        proiezionePercentuale: metrics.proiezioneFatturato > 0 ? metrics.proiezioneRicaviAltro / metrics.proiezioneFatturato : 0,
        proiezioneSteps: [
          { label: 'Altri Ricavi [Proiezione]', valore: metrics.proiezioneRicaviAltro, isPositivo: true, isRisultato: true, percentualeSu: metrics.proiezioneFatturato }
        ],
        soloPrevisionaleValore: prevRicAltro,
        soloPrevisionalePercentuale: prevFat > 0 ? prevRicAltro / prevFat : 0,
        soloPrevisionaleSteps: [
          { label: 'Altri Ricavi [Previsionale]', valore: prevRicAltro, isPositivo: true, isRisultato: true, percentualeSu: prevFat }
        ]
      },
      costo_variabile: {
        nome: 'Costi Variabili (Materiali/Subappalti)',
        valore: cVar,
        percentuale: fat > 0 ? cVar / fat : 0,
        steps: [
          { label: 'Costi Variabili diretti di cantiere', valore: cVar, isPositivo: false, isRisultato: true, percentualeSu: fat }
        ],
        ceTypes: ['costo_variabile'],
        proiezioneValore: metrics.proiezioneCostiVariabili,
        proiezionePercentuale: metrics.proiezioneFatturato > 0 ? metrics.proiezioneCostiVariabili / metrics.proiezioneFatturato : 0,
        proiezioneSteps: [
          { label: 'Costi Variabili diretti di cantiere [Proiezione]', valore: metrics.proiezioneCostiVariabili, isPositivo: false, isRisultato: true, percentualeSu: metrics.proiezioneFatturato }
        ],
        soloPrevisionaleValore: prevCVar,
        soloPrevisionalePercentuale: prevFat > 0 ? prevCVar / prevFat : 0,
        soloPrevisionaleSteps: [
          { label: 'Costi Variabili diretti [Previsionale]', valore: prevCVar, isPositivo: false, isRisultato: true, percentualeSu: prevFat }
        ]
      },
      costo_studio: {
        nome: 'Costi Studio (Personale/Amm.)',
        valore: cStu,
        percentuale: fat > 0 ? cStu / fat : 0,
        steps: [
          { label: 'Personale tecnico e ammortamento studio', valore: cStu, isPositivo: false, isRisultato: true, percentualeSu: fat }
        ],
        ceTypes: ['costo_studio'],
        proiezioneValore: metrics.proiezioneCostiStudio,
        proiezionePercentuale: metrics.proiezioneFatturato > 0 ? metrics.proiezioneCostiStudio / metrics.proiezioneFatturato : 0,
        proiezioneSteps: [
          { label: 'Personale tecnico e ammortamento studio [Proiezione]', valore: metrics.proiezioneCostiStudio, isPositivo: false, isRisultato: true, percentualeSu: metrics.proiezioneFatturato }
        ],
        soloPrevisionaleValore: prevCStu,
        soloPrevisionalePercentuale: prevFat > 0 ? prevCStu / prevFat : 0,
        soloPrevisionaleSteps: [
          { label: 'Personale tecnico e studio [Previsionale]', valore: prevCStu, isPositivo: false, isRisultato: true, percentualeSu: prevFat }
        ]
      },
      costo_fixed: {
        nome: 'Altri Costi Fissi (Sedi/Marketing)',
        valore: cFis,
        percentuale: fat > 0 ? cFis / fat : 0,
        steps: [
          { label: 'Spese di sede, utenze, marketing, assicurazioni', valore: cFis, isPositivo: false, isRisultato: true, percentualeSu: fat }
        ],
        ceTypes: ['costo_fisso'],
        proiezioneValore: metrics.proiezioneCostiFissi,
        proiezionePercentuale: metrics.proiezioneFatturato > 0 ? metrics.proiezioneCostiFissi / metrics.proiezioneFatturato : 0,
        proiezioneSteps: [
          { label: 'Spese di sede, utenze, marketing, assicurazioni [Proiezione]', valore: metrics.proiezioneCostiFissi, isPositivo: false, isRisultato: true, percentualeSu: metrics.proiezioneFatturato }
        ],
        soloPrevisionaleValore: prevCFis,
        soloPrevisionalePercentuale: prevFat > 0 ? prevCFis / prevFat : 0,
        soloPrevisionaleSteps: [
          { label: 'Spese di sede, utenze, marketing [Previsionale]', valore: prevCFis, isPositivo: false, isRisultato: true, percentualeSu: prevFat }
        ]
      },
      costo_fisso: {
        nome: 'Altri Costi Fissi (Sedi/Marketing)',
        valore: cFis,
        percentuale: fat > 0 ? cFis / fat : 0,
        steps: [
          { label: 'Spese di sede, utenze, marketing, assicurazioni', valore: cFis, isPositivo: false, isRisultato: true, percentualeSu: fat }
        ],
        ceTypes: ['costo_fisso'],
        proiezioneValore: metrics.proiezioneCostiFissi,
        proiezionePercentuale: metrics.proiezioneFatturato > 0 ? metrics.proiezioneCostiFissi / metrics.proiezioneFatturato : 0,
        proiezioneSteps: [
          { label: 'Spese di sede, utenze, marketing, assicurazioni [Proiezione]', valore: metrics.proiezioneCostiFissi, isPositivo: false, isRisultato: true, percentualeSu: metrics.proiezioneFatturato }
        ],
        soloPrevisionaleValore: prevCFis,
        soloPrevisionalePercentuale: prevFat > 0 ? prevCFis / prevFat : 0,
        soloPrevisionaleSteps: [
          { label: 'Spese di sede, utenze, marketing [Previsionale]', valore: prevCFis, isPositivo: false, isRisultato: true, percentualeSu: prevFat }
        ]
      },
      ammortamento: {
        nome: 'Ammortamenti (Manuale)',
        valore: amm,
        percentuale: fat > 0 ? amm / fat : 0,
        steps: [
          { label: 'Ammortamento beni strumentali aziendali', valore: amm, isPositivo: false, isRisultato: true, percentualeSu: fat }
        ],
        ceTypes: ['ammortamento'],
        proiezioneValore: metrics.proiezioneAmmortamenti,
        proiezionePercentuale: metrics.proiezioneFatturato > 0 ? metrics.proiezioneAmmortamenti / metrics.proiezioneFatturato : 0,
        proiezioneSteps: [
          { label: 'Ammortamento beni strumentali aziendali [Proiezione]', valore: metrics.proiezioneAmmortamenti, isPositivo: false, isRisultato: true, percentualeSu: metrics.proiezioneFatturato }
        ],
        soloPrevisionaleValore: prevAmm,
        soloPrevisionalePercentuale: prevFat > 0 ? prevAmm / prevFat : 0,
        soloPrevisionaleSteps: [
          { label: 'Ammortamento beni strumentali [Previsionale]', valore: prevAmm, isPositivo: false, isRisultato: true, percentualeSu: prevFat }
        ]
      },
      onere_finanziario: {
        nome: 'Oneri Finanziari',
        valore: s12(ceData.oneriFin),
        percentuale: fat > 0 ? s12(ceData.oneriFin) / fat : 0,
        steps: [
          { label: 'Interessi passivi e commissioni bancarie', valore: s12(ceData.oneriFin), isPositivo: false, isRisultato: true, percentualeSu: fat }
        ],
        ceTypes: ['onere_finanziario'],
        proiezioneValore: metrics.proiezioneOneriFin,
        proiezionePercentuale: metrics.proiezioneFatturato > 0 ? metrics.proiezioneOneriFin / metrics.proiezioneFatturato : 0,
        proiezioneSteps: [
          { label: 'Interessi passivi e commissioni bancarie [Proiezione]', valore: metrics.proiezioneOneriFin, isPositivo: false, isRisultato: true, percentualeSu: metrics.proiezioneFatturato }
        ],
        soloPrevisionaleValore: prevOnFin,
        soloPrevisionalePercentuale: prevFat > 0 ? prevOnFin / prevFat : 0,
        soloPrevisionaleSteps: [
          { label: 'Interessi passivi e commissioni [Previsionale]', valore: prevOnFin, isPositivo: false, isRisultato: true, percentualeSu: prevFat }
        ]
      },
      provento_finanziario: {
        nome: 'Proventi Finanziari',
        valore: s12(ceData.proventiFin),
        percentuale: fat > 0 ? s12(ceData.proventiFin) / fat : 0,
        steps: [
          { label: 'Interessi attivi, proventi da partecipazioni', valore: s12(ceData.proventiFin), isPositivo: true, isRisultato: true, percentualeSu: fat }
        ],
        ceTypes: ['provento_finanziario'],
        proiezioneValore: metrics.proiezioneProventiFin,
        proiezionePercentuale: metrics.proiezioneFatturato > 0 ? metrics.proiezioneProventiFin / metrics.proiezioneFatturato : 0,
        proiezioneSteps: [
          { label: 'Interessi attivi, proventi da partecipazioni [Proiezione]', valore: metrics.proiezioneProventiFin, isPositivo: true, isRisultato: true, percentualeSu: metrics.proiezioneFatturato }
        ],
        soloPrevisionaleValore: prevPrFin,
        soloPrevisionalePercentuale: prevFat > 0 ? prevPrFin / prevFat : 0,
        soloPrevisionaleSteps: [
          { label: 'Interessi attivi, proventi [Previsionale]', valore: prevPrFin, isPositivo: true, isRisultato: true, percentualeSu: prevFat }
        ]
      },
      straordinario: {
        nome: 'Risultato Straordinario',
        valore: str,
        percentuale: fat > 0 ? str / fat : 0,
        steps: [
          { label: 'Proventi ed oneri straordinari (netti)', valore: str, isPositivo: str >= 0, isRisultato: true, percentualeSu: fat }
        ],
        ceTypes: ['straordinario'],
        proiezioneValore: metrics.proiezioneStraordinario,
        proiezionePercentuale: metrics.proiezioneFatturato > 0 ? metrics.proiezioneStraordinario / metrics.proiezioneFatturato : 0,
        proiezioneSteps: [
          { label: 'Proventi ed oneri straordinari (netti) [Proiezione]', valore: metrics.proiezioneStraordinario, isPositivo: metrics.proiezioneStraordinario >= 0, isRisultato: true, percentualeSu: metrics.proiezioneFatturato }
        ],
        soloPrevisionaleValore: prevStr,
        soloPrevisionalePercentuale: prevFat > 0 ? prevStr / prevFat : 0,
        soloPrevisionaleSteps: [
          { label: 'Proventi ed oneri straordinari [Previsionale]', valore: prevStr, isPositivo: prevStr >= 0, isRisultato: true, percentualeSu: prevFat }
        ]
      },
      imposta_ce: {
        nome: 'Imposte Stimate (Manuale)',
        valore: imp,
        percentuale: fat > 0 ? imp / fat : 0,
        steps: [
          { label: 'Imposte IRES/IRAP stimate dell\'anno', valore: imp, isPositivo: false, isRisultato: true, percentualeSu: fat }
        ],
        ceTypes: ['imposta_ce'],
        proiezioneValore: metrics.proiezioneEbt + metrics.proiezioneStraordinario - metrics.proiezioneUtile,
        proiezionePercentuale: metrics.proiezioneFatturato > 0 ? (metrics.proiezioneEbt + metrics.proiezioneStraordinario - metrics.proiezioneUtile) / metrics.proiezioneFatturato : 0,
        proiezioneSteps: [
          { label: 'Imposte IRES/IRAP stimate dell\'anno [Proiezione]', valore: metrics.proiezioneEbt + metrics.proiezioneStraordinario - metrics.proiezioneUtile, isPositivo: false, isRisultato: true, percentualeSu: metrics.proiezioneFatturato }
        ],
        soloPrevisionaleValore: prevTaxes,
        soloPrevisionalePercentuale: prevFat > 0 ? prevTaxes / prevFat : 0,
        soloPrevisionaleSteps: [
          { label: 'Imposte IRES/IRAP stimate [Previsionale]', valore: prevTaxes, isPositivo: false, isRisultato: true, percentualeSu: prevFat }
        ]
      },
      distribuzione_utile: {
        nome: 'Prelievo Utile Soci',
        valore: s12(ceData.compensoImprenditore),
        percentuale: fat > 0 ? s12(ceData.compensoImprenditore) / fat : 0,
        steps: [
          { label: 'Prelievi utili/Compenso soci', valore: s12(ceData.compensoImprenditore), isPositivo: false, isRisultato: true, percentualeSu: fat }
        ],
        ceTypes: ['distribuzione_utile'],
        proiezioneValore: metrics.proiezioneCompensoImprenditore,
        proiezionePercentuale: metrics.proiezioneFatturato > 0 ? metrics.proiezioneCompensoImprenditore / metrics.proiezioneFatturato : 0,
        proiezioneSteps: [
          { label: 'Prelievi utili/Compenso soci [Proiezione]', valore: metrics.proiezioneCompensoImprenditore, isPositivo: false, isRisultato: true, percentualeSu: metrics.proiezioneFatturato }
        ],
        soloPrevisionaleValore: prevPrelievo,
        soloPrevisionalePercentuale: prevFat > 0 ? prevPrelievo / prevFat : 0,
        soloPrevisionaleSteps: [
          { label: 'Prelievi utili/Compenso soci [Previsionale]', valore: prevPrelievo, isPositivo: false, isRisultato: true, percentualeSu: prevFat }
        ]
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
        proiezioneValore: metrics.proiezionePrimoMargine,
        proiezionePercentuale: metrics.proiezioneFatturato > 0 ? metrics.proiezionePrimoMargine / metrics.proiezioneFatturato : 0,
        proiezioneSteps: [
          { label: 'Fatturato [Proiezione]', valore: metrics.proiezioneFatturato, isPositivo: true },
          { label: 'Costi Variabili [Proiezione]', valore: metrics.proiezioneCostiVariabili, isPositivo: false, percentualeSu: metrics.proiezioneFatturato },
          { label: 'Primo Margine [Proiezione]', valore: metrics.proiezionePrimoMargine, isPositivo: metrics.proiezionePrimoMargine > 0, isRisultato: true, percentualeSu: metrics.proiezioneFatturato },
        ],
        soloPrevisionaleValore: prevPMargin,
        soloPrevisionalePercentuale: prevFat > 0 ? prevPMargin / prevFat : 0,
        soloPrevisionaleSteps: [
          { label: 'Fatturato [Previsionale]', valore: prevFat, isPositivo: true },
          { label: 'Costi Variabili [Previsionale]', valore: prevCVar, isPositivo: false, percentualeSu: prevFat },
          { label: 'Primo Margine [Previsionale]', valore: prevPMargin, isPositivo: prevPMargin > 0, isRisultato: true, percentualeSu: prevFat }
        ]
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
        proiezioneValore: metrics.proiezioneEbitda,
        proiezionePercentuale: metrics.proiezioneFatturato > 0 ? metrics.proiezioneEbitda / metrics.proiezioneFatturato : 0,
        proiezioneSteps: [
          { label: 'Primo Margine [Proiezione]', valore: metrics.proiezionePrimoMargine, isPositivo: true, percentualeSu: metrics.proiezioneFatturato },
          { label: 'Costi Studio [Proiezione]', valore: metrics.proiezioneCostiStudio, isPositivo: false, indent: true, percentualeSu: metrics.proiezioneFatturato },
          { label: 'Costi Fissi di Struttura [Proiezione]', valore: metrics.proiezioneCostiFissi, isPositivo: false, indent: true, percentualeSu: metrics.proiezioneFatturato },
          { label: 'EBITDA [Proiezione]', valore: metrics.proiezioneEbitda, isPositivo: metrics.proiezioneEbitda > 0, isRisultato: true, percentualeSu: metrics.proiezioneFatturato },
        ],
        soloPrevisionaleValore: prevEbitda,
        soloPrevisionalePercentuale: prevFat > 0 ? prevEbitda / prevFat : 0,
        soloPrevisionaleSteps: [
          { label: 'Primo Margine [Previsionale]', valore: prevPMargin, isPositivo: true, percentualeSu: prevFat },
          { label: 'Costi Studio [Previsionale]', valore: prevCStu, isPositivo: false, indent: true, percentualeSu: prevFat },
          { label: 'Costi Fissi [Previsionale]', valore: prevCFis, isPositivo: false, indent: true, percentualeSu: prevFat },
          { label: 'EBITDA [Previsionale]', valore: prevEbitda, isPositivo: prevEbitda > 0, isRisultato: true, percentualeSu: prevFat }
        ]
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
        proiezioneValore: metrics.proiezioneEbit,
        proiezionePercentuale: metrics.proiezioneFatturato > 0 ? metrics.proiezioneEbit / metrics.proiezioneFatturato : 0,
        proiezioneSteps: [
          { label: 'EBITDA [Proiezione]', valore: metrics.proiezioneEbitda, isPositivo: true, percentualeSu: metrics.proiezioneFatturato },
          { label: 'Ammortamenti [Proiezione]', valore: metrics.proiezioneAmmortamenti, isPositivo: false, indent: true },
          { label: 'EBIT [Proiezione]', valore: metrics.proiezioneEbit, isPositivo: metrics.proiezioneEbit > 0, isRisultato: true, percentualeSu: metrics.proiezioneFatturato },
        ],
        soloPrevisionaleValore: prevEbit,
        soloPrevisionalePercentuale: prevFat > 0 ? prevEbit / prevFat : 0,
        soloPrevisionaleSteps: [
          { label: 'EBITDA [Previsionale]', valore: prevEbitda, isPositivo: true, percentualeSu: prevFat },
          { label: 'Ammortamenti [Previsionale]', valore: prevAmm, isPositivo: false, indent: true },
          { label: 'EBIT [Previsionale]', valore: prevEbit, isPositivo: prevEbit > 0, isRisultato: true, percentualeSu: prevFat }
        ]
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
        proiezioneValore: metrics.proiezioneEbt,
        proiezionePercentuale: metrics.proiezioneFatturato > 0 ? metrics.proiezioneEbt / metrics.proiezioneFatturato : 0,
        proiezioneSteps: [
          { label: 'EBIT [Proiezione]', valore: metrics.proiezioneEbit, isPositivo: true, percentualeSu: metrics.proiezioneFatturato },
          { label: 'Oneri Finanziari [Proiezione]', valore: metrics.proiezioneOneriFin, isPositivo: false, indent: true },
          { label: 'Proventi Finanziari [Proiezione]', valore: metrics.proiezioneProventiFin, isPositivo: true, indent: true },
          { label: 'Risultato Straordinario [Proiezione]', valore: metrics.proiezioneStraordinario, isPositivo: metrics.proiezioneStraordinario > 0, indent: true },
          { label: 'EBT [Proiezione]', valore: metrics.proiezioneEbt, isPositivo: metrics.proiezioneEbt > 0, isRisultato: true, percentualeSu: metrics.proiezioneFatturato },
        ],
        soloPrevisionaleValore: prevEbt,
        soloPrevisionalePercentuale: prevFat > 0 ? prevEbt / prevFat : 0,
        soloPrevisionaleSteps: [
          { label: 'EBIT [Previsionale]', valore: prevEbit, isPositivo: true, percentualeSu: prevFat },
          { label: 'Oneri Finanziari [Previsionale]', valore: prevOnFin, isPositivo: false, indent: true },
          { label: 'Proventi Finanziari [Previsionale]', valore: prevPrFin, isPositivo: true, indent: true },
          { label: 'Risultato Straordinario [Previsionale]', valore: prevStr, isPositivo: prevStr > 0, indent: true },
          { label: 'EBT [Previsionale]', valore: prevEbt, isPositivo: prevEbt > 0, isRisultato: true, percentualeSu: prevFat }
        ]
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
        proiezioneValore: metrics.proiezioneUtile,
        proiezionePercentuale: metrics.proiezioneFatturato > 0 ? metrics.proiezioneUtile / metrics.proiezioneFatturato : 0,
        proiezioneSteps: [
          { label: 'EBT [Proiezione]', valore: metrics.proiezioneEbt, isPositivo: true, percentualeSu: metrics.proiezioneFatturato },
          { label: 'Imposte stimate [Proiezione]', valore: metrics.proiezioneEbt + metrics.proiezioneStraordinario - metrics.proiezioneUtile, isPositivo: false, indent: true },
          { label: 'Utile Netto [Proiezione]', valore: metrics.proiezioneUtile, isPositivo: metrics.proiezioneUtile > 0, isRisultato: true, percentualeSu: metrics.proiezioneFatturato },
        ],
        soloPrevisionaleValore: prevUtile,
        soloPrevisionalePercentuale: prevFat > 0 ? prevUtile / prevFat : 0,
        soloPrevisionaleSteps: [
          { label: 'EBT [Previsionale]', valore: prevEbt, isPositivo: true, percentualeSu: prevFat },
          { label: 'Imposte stimate [Previsionale]', valore: prevTaxes, isPositivo: false, indent: true },
          { label: 'Utile Netto [Previsionale]', valore: prevUtile, isPositivo: prevUtile > 0, isRisultato: true, percentualeSu: prevFat }
        ]
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
        proiezioneValore: metrics.proiezioneBreakEven,
        proiezioneSteps: [
          { label: 'Costi Fissi Totali [Proiezione]', valore: metrics.proiezioneCostiFissi + metrics.proiezioneCostiStudio + metrics.proiezioneAmmortamenti, isPositivo: false },
          { label: `Incidenza Costi Variabili [Proiezione]`, valore: metrics.proiezioneFatturato > 0 ? metrics.proiezioneCostiVariabili / metrics.proiezioneFatturato : 0, isPositivo: false, indent: true },
          { label: 'Margine di Contribuzione % [Proiezione]', valore: metrics.proiezioneFatturato > 0 ? (metrics.proiezioneFatturato - metrics.proiezioneCostiVariabili) / metrics.proiezioneFatturato : 0, isPositivo: true, indent: true },
          { label: 'Break-even [Proiezione]', valore: metrics.proiezioneBreakEven, isPositivo: true, isRisultato: true },
        ],
        soloPrevisionaleValore: prevBreakEven,
        soloPrevisionaleSteps: [
          { label: 'Costi Fissi Totali [Previsionale]', valore: prevCFis + prevCStu + prevAmm, isPositivo: false },
          { label: `Incidenza Costi Variabili [Previsionale]`, valore: prevFat > 0 ? prevCVar / prevFat : 0, isPositivo: false, indent: true },
          { label: 'Margine di Contribuzione % [Previsionale]', valore: prevFat > 0 ? (prevFat - prevCVar) / prevFat : 0, isPositivo: true, indent: true },
          { label: 'Break-even [Previsionale]', valore: prevBreakEven, isPositivo: true, isRisultato: true },
        ]
      },
    };

    const cfg = configs[kpiId];
    if (!cfg) return null;

    // Se stiamo guardando oneri finanziari, generiamo gli interessi virtuali previsionali
    let virtualLoanInterestTxs: Transaction[] = [];
    if (cfg.ceTypes.includes('onere_finanziario') && selectedYear >= today.getFullYear()) {
      const interests = getDynamicLoansInterests(transactions, selectedYear, initialData);
      
      const loansMap = new Map<string, { id: string; name: string; amount: number; details: any }>();

      if (initialData?.loans) {
        initialData.loans.forEach(l => {
            loansMap.set(l.id, { id: l.id, name: l.name, amount: l.originalAmount, details: l.details });
        });
      }

      transactions.forEach(t => {
        if (t.type === 'INCOME' && t.category === '[FINANZA] Finanziamenti Ricevuti' && t.loanDetails) {
          const isForecast = t.isForecast;
          const hasLinked = transactions.some(act => !act.isForecast && (act.linkedForecastId === t.id || (t.loanSourceId && act.loanSourceId === t.loanSourceId)));
          if (!(isForecast && hasLinked)) {
            const loanId = t.loanSourceId || t.id;
            if (!loansMap.has(loanId)) {
              const existsByName = Array.from(loansMap.values()).some(l => l.name.toLowerCase().trim() === t.description.toLowerCase().trim());
              if (!existsByName) {
                loansMap.set(loanId, { id: loanId, name: t.description, amount: t.amount, details: t.loanDetails });
              }
            }
          }
        }
      });

      const loans = Array.from(loansMap.values());

      for (let month = 0; month < 12; month++) {
        const d = new Date(selectedYear, month, 15);
        loans.forEach((l, idx) => {
          const hasActualForThisLoan = transactions.some(t => 
            !t.isForecast && 
            parseUTCDate((modalita === 'competenza' && t.invoiceDate) ? t.invoiceDate : t.date).getUTCFullYear() === selectedYear && 
            parseUTCDate((modalita === 'competenza' && t.invoiceDate) ? t.invoiceDate : t.date).getUTCMonth() === month &&
            getDynamicCEType(t, projects) === 'onere_finanziario' &&
            (t.loanSourceId === l.id || t.linkedForecastId === l.id || t.description.toLowerCase().trim().includes(l.name.toLowerCase().trim()))
          );

          if (!hasActualForThisLoan) {
            const rep = calculateRepayment(l.amount, l.details, d);
            if (rep.interest > 0) {
              virtualLoanInterestTxs.push({
                id: `virtual-interest-${l.name}-${month}-${idx}`,
                date: `${selectedYear}-${String(month + 1).padStart(2, '0')}-15`,
                description: `[STIMA MUTUO] Interessi: ${l.name}`,
                category: '[FINANZA] Interessi Passivi Finanziamenti',
                ceType: 'onere_finanziario',
                amount: rep.interest,
                type: TransactionType.EXPENSE,
                isForecast: true
              });
            }
          }
        });
      }
    }

    const filteredProiezioneTxs = txAnnoProiezioniBase.filter(tx => {
      const dType = getDynamicCEType(tx, projects);
      return cfg.ceTypes.includes(dType || '');
    });

    const projectionTxsFinal = [...filteredProiezioneTxs, ...virtualLoanInterestTxs];

    // Solo Previsionali
    const txAnnoSoloPrevisionaliBase = transactions.filter(tx => 
      parseUTCDate((modalita === 'competenza' && tx.invoiceDate) ? tx.invoiceDate : tx.date).getUTCFullYear() === selectedYear && 
      tx.isForecast && 
      tx.ceType
    );

    let virtualLoanInterestTxsSoloPrev: Transaction[] = [];
    if (cfg.ceTypes.includes('onere_finanziario') && selectedYear >= today.getFullYear()) {
      // interests variabile rimossa (dead code)
      
      const loansMap = new Map<string, { id: string; name: string; amount: number; details: any }>();

      if (initialData?.loans) {
        initialData.loans.forEach(l => {
            loansMap.set(l.id, { id: l.id, name: l.name, amount: l.originalAmount, details: l.details });
        });
      }

      transactions.forEach(t => {
        if (t.type === 'INCOME' && t.category === '[FINANZA] Finanziamenti Ricevuti' && t.loanDetails) {
          const isForecast = t.isForecast;
          const hasLinked = transactions.some(act => !act.isForecast && (act.linkedForecastId === t.id || (t.loanSourceId && act.loanSourceId === t.loanSourceId)));
          if (!(isForecast && hasLinked)) {
            const loanId = t.loanSourceId || t.id;
            if (!loansMap.has(loanId)) {
              const existsByName = Array.from(loansMap.values()).some(l => l.name.toLowerCase().trim() === t.description.toLowerCase().trim());
              if (!existsByName) {
                loansMap.set(loanId, { id: loanId, name: t.description, amount: t.amount, details: t.loanDetails });
              }
            }
          }
        }
      });

      const loans = Array.from(loansMap.values());

      for (let month = 0; month < 12; month++) {
        const d = new Date(selectedYear, month, 15);
        loans.forEach((l, idx) => {
          const hasForecastForThisLoan = transactions.some(t => 
            t.isForecast && 
            parseUTCDate(t.date).getUTCFullYear() === selectedYear && 
            parseUTCDate(t.date).getUTCMonth() === month &&
            getDynamicCEType(t, projects) === 'onere_finanziario' &&
            (t.loanSourceId === l.id || t.linkedForecastId === l.id || t.description.toLowerCase().trim().includes(l.name.toLowerCase().trim()))
          );

          if (!hasForecastForThisLoan) {
            const rep = calculateRepayment(l.amount, l.details, d);
            if (rep.interest > 0) {
              virtualLoanInterestTxsSoloPrev.push({
                id: `virtual-interest-soloprev-${l.name}-${month}-${idx}`,
                date: `${selectedYear}-${String(month + 1).padStart(2, '0')}-15`,
                description: `[STIMA MUTUO] Interessi: ${l.name}`,
                category: '[FINANZA] Interessi Passivi Finanziamenti',
                ceType: 'onere_finanziario',
                amount: rep.interest,
                type: TransactionType.EXPENSE,
                isForecast: true
              });
            }
          }
        });
      }
    }

    const filteredSoloPrevisionaleTxs = txAnnoSoloPrevisionaliBase.filter(tx => {
      const dType = getDynamicCEType(tx, projects);
      return cfg.ceTypes.includes(dType || '');
    });

    const soloPrevisionaleTxsFinal = [...filteredSoloPrevisionaleTxs, ...virtualLoanInterestTxsSoloPrev];

    return {
      kpiNome: cfg.nome,
      kpiValore: cfg.valore,
      kpiPercentuale: cfg.percentuale,
      formulaSteps: cfg.steps,
      transazioniContribuenti: txAnnoContribuenti.filter(tx => {
        const dType = getDynamicCEType(tx, projects);
        return cfg.ceTypes.includes(dType || '');
      }),
      anno: selectedYear,
      onClose: () => setDrawerKpi(null),
      // Props per proiezioni
      proiezioneKpiValore: cfg.proiezioneValore,
      proiezionePercentuale: cfg.proiezionePercentuale,
      proiezioneFormulaSteps: cfg.proiezioneSteps,
      proiezioneTransazioniContribuenti: projectionTxsFinal,
      // Props per solo previsionali
      soloPrevisionaleKpiValore: cfg.soloPrevisionaleValore,
      soloPrevisionalePercentuale: cfg.soloPrevisionalePercentuale,
      soloPrevisionaleFormulaSteps: cfg.soloPrevisionaleSteps,
      soloPrevisionaleTransazioniContribuenti: soloPrevisionaleTxsFinal,
    };
  };

  const renderRow = (label: string, data: number[], type: 'auto' | 'manual' | 'calc' | 'kpi', field?: keyof CEData, projOverride?: number, customKpiId?: string) => {
    const sum = data.reduce((a, b) => a + b, 0);
    const pct = metrics.fatturato > 0 ? sum / metrics.fatturato : 0;
    
    // Check if there are forecasts in the current year
    const hasForecasts = txAnno.some(tx => tx.isForecast);
    const projection = (hasForecasts && projOverride !== undefined)
      ? projOverride
      : (metrics.mesiTrascorsi > 0 ? (sum / metrics.mesiTrascorsi) * 12 : 0);

    const projectionPct = metrics.proiezioneFatturato > 0 ? projection / metrics.proiezioneFatturato : 0;

    // Determine the drawer KPI ID from name or standard mapping
    let kpiId = customKpiId;
    if (!kpiId) {
      if (label.includes('Ricavi Core')) kpiId = 'ricavo_core';
      else if (label.includes('Vendite Immobiliari')) kpiId = 'ricavo_immobiliare';
      else if (label.includes('Altri Ricavi')) kpiId = 'ricavo_altro';
      else if (label.includes('Costi Variabili')) kpiId = 'costo_variabile';
      else if (label.includes('Costi Studio')) kpiId = 'costo_studio';
      else if (label.includes('Altri Costi Fissi')) kpiId = 'costo_fisso';
      else if (label.includes('Ammortamenti')) kpiId = 'ammortamento';
      else if (label.includes('Oneri Finanziari')) kpiId = 'onere_finanziario';
      else if (label.includes('Proventi Finanziari')) kpiId = 'provento_finanziario';
      else if (label.includes('Risultato Straordinario')) kpiId = 'straordinario';
      else if (label.includes('Imposte Stimate')) kpiId = 'imposta_ce';
      else if (label.includes('Prelievo Utile')) kpiId = 'distribuzione_utile';
    }

    return (
      <tr className="hover:bg-slate-50/50 transition-colors border-b border-slate-100">
        <td 
          onClick={() => kpiId && setDrawerKpi(kpiId)}
          className={`py-3 px-4 text-xs font-bold text-slate-700 sticky left-0 bg-white z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] ${kpiId ? 'cursor-pointer hover:text-indigo-600 hover:bg-slate-50 transition-all' : ''}`}
        >
          <div className="flex items-center gap-2">
            {type === 'auto' && <div className="w-2 h-2 rounded-full bg-sky-500" title="Auto-popolato" />}
            {type === 'manual' && <div className="w-2 h-2 rounded-full bg-amber-500" title="Manuale" />}
            {type === 'calc' && <div className="w-2 h-2 rounded-full bg-emerald-500" title="Calcolato" />}
            {label}
            {kpiId && <span className="text-[9px] text-slate-300 font-normal ml-auto no-print">🔍 Spiega</span>}
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
        <td className="p-1 text-right text-[10px] font-medium text-violet-600 font-bold">
          {formatPercent(projectionPct)}
        </td>
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
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Fatturato YTD</span>
                <InfoTooltip 
                  termId="fatturato" 
                  calculatedValues={`Fatturato YTD:\n- Consuntivo YTD: ${formatEuro(metrics.fatturato)}\n- Proiezione 12m: ${formatEuro(metrics.proiezioneFatturato)}`}
                />
              </div>
              <button
                onClick={() => setDrawerKpi('fatturato')}
                className="text-[9px] font-black text-slate-400 hover:text-slate-600 uppercase tracking-widest transition-colors"
              >
                Spiega →
              </button>
            </div>
            <div className="text-2xl font-black text-slate-900">{formatEuro(metrics.fatturato)}</div>
            <div className="text-[10px] text-slate-500 mt-1">reale YTD</div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 text-[10px] text-violet-600 font-bold">
            Proiezione: {formatEuro(metrics.proiezioneFatturato)}
          </div>
        </div>
 
        <div className="p-5 rounded-3xl border shadow-sm bg-indigo-50 border-indigo-100 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-black text-indigo-600 uppercase tracking-wider">Primo Margine</span>
                <InfoTooltip 
                  termId="primo_margine" 
                  calculatedValues={`Primo Margine:\n- Consuntivo YTD: ${formatEuro(metrics.primoMargineTot)} (${formatPercent(metrics.primoMarginePercent)})\n- Proiezione 12m: ${formatEuro(metrics.proiezionePrimoMargine)} (${formatPercent(metrics.proiezioneFatturato > 0 ? metrics.proiezionePrimoMargine / metrics.proiezioneFatturato : 0)})`}
                />
              </div>
              <button
                onClick={() => setDrawerKpi('primo_margine')}
                className="text-[9px] font-black text-indigo-400 hover:text-indigo-600 uppercase tracking-widest transition-colors"
              >
                Spiega →
              </button>
            </div>
            <div className="text-2xl font-black text-slate-900">{formatPercent(metrics.primoMarginePercent)}</div>
            <div className="text-[10px] text-slate-500 mt-1">reale YTD ({formatEuro(metrics.primoMargineTot)})</div>
          </div>
          <div className="mt-3 pt-3 border-t border-indigo-200/50 text-[10px] text-indigo-700 font-bold">
            Proiezione: {formatPercent(metrics.proiezioneFatturato > 0 ? metrics.proiezionePrimoMargine / metrics.proiezioneFatturato : 0)} ({formatEuro(metrics.proiezionePrimoMargine)})
          </div>
        </div>
 
        <div className="p-5 rounded-3xl border shadow-sm bg-emerald-50 border-emerald-100 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-black text-emerald-600 uppercase tracking-wider">EBITDA %</span>
                <InfoTooltip 
                  termId="ebitda" 
                  calculatedValues={`EBITDA %:\n- Consuntivo YTD: ${formatEuro(metrics.ebitdaTot)} (${formatPercent(metrics.ebitdaPercent)})\n- Proiezione 12m: ${formatEuro(metrics.proiezioneEbitda)} (${formatPercent(metrics.proiezioneFatturato > 0 ? metrics.proiezioneEbitda / metrics.proiezioneFatturato : 0)})`}
                />
              </div>
              <button
                onClick={() => setDrawerKpi('ebitda')}
                className="text-[9px] font-black text-emerald-400 hover:text-emerald-600 uppercase tracking-widest transition-colors"
              >
                Spiega →
              </button>
            </div>
            <div className="text-2xl font-black text-slate-900">{formatPercent(metrics.ebitdaPercent)}</div>
            <div className="text-[10px] text-slate-500 mt-1">reale YTD ({formatEuro(metrics.ebitdaTot)})</div>
          </div>
          <div className="mt-3 pt-3 border-t border-emerald-200/50 text-[10px] text-emerald-700 font-bold">
            Proiezione: {formatPercent(metrics.proiezioneFatturato > 0 ? metrics.proiezioneEbitda / metrics.proiezioneFatturato : 0)} ({formatEuro(metrics.proiezioneEbitda)})
          </div>
        </div>
 
        <div className="p-5 rounded-3xl border shadow-sm bg-amber-50 border-amber-100 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-black text-amber-600 uppercase tracking-wider">EBIT %</span>
                <InfoTooltip 
                  termId="ebit" 
                  calculatedValues={`EBIT %:\n- Consuntivo YTD: ${formatEuro(metrics.ebitTot)} (${formatPercent(metrics.fatturato > 0 ? metrics.ebitTot / metrics.fatturato : 0)})\n- Proiezione 12m: ${formatEuro(metrics.proiezioneEbit)} (${formatPercent(metrics.proiezioneFatturato > 0 ? metrics.proiezioneEbit / metrics.proiezioneFatturato : 0)})`}
                />
              </div>
              <button
                onClick={() => setDrawerKpi('ebit')}
                className="text-[9px] font-black text-amber-400 hover:text-amber-600 uppercase tracking-widest transition-colors"
              >
                Spiega →
              </button>
            </div>
            <div className="text-2xl font-black text-slate-900">{formatPercent(metrics.fatturato > 0 ? metrics.ebitTot / metrics.fatturato : 0)}</div>
            <div className="text-[10px] text-slate-500 mt-1">reale YTD ({formatEuro(metrics.ebitTot)})</div>
          </div>
          <div className="mt-3 pt-3 border-t border-amber-200/50 text-[10px] text-amber-700 font-bold">
            Proiezione: {formatPercent(metrics.proiezioneFatturato > 0 ? metrics.proiezioneEbit / metrics.proiezioneFatturato : 0)} ({formatEuro(metrics.proiezioneEbit)})
          </div>
        </div>
 
        <div className="bg-[#222222] p-5 rounded-3xl border border-slate-800 shadow-lg text-white flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Punto di Pareggio</span>
                <InfoTooltip 
                  termId="break_even" 
                  calculatedValues={`Punto di Pareggio:\n- Competenza YTD: ${formatEuro(metrics.breakEven)}\n- Cassa YTD: ${formatEuro(metrics.breakEvenCassa)}\n- Proiezione Competenza 12m: ${formatEuro(projBreakEven)}\n- Proiezione Cassa 12m: ${formatEuro(projBreakEvenCassa)}`}
                />
              </div>
              <button
                onClick={() => setDrawerKpi('break_even')}
                className="text-[9px] font-black text-slate-500 hover:text-white uppercase tracking-widest transition-colors"
              >
                Spiega →
              </button>
            </div>
            <div className="text-2xl font-black">{formatEuro(metrics.breakEven)}</div>
            <div className="text-[10px] text-slate-400 mt-1">reale YTD (cassa: {formatEuro(metrics.breakEvenCassa)})</div>
          </div>
          <div className="mt-3 pt-3 border-t border-white/10 text-[10px] text-indigo-300 font-bold">
            Proiezione: {formatEuro(projBreakEven)} (cassa: {formatEuro(projBreakEvenCassa)})
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
                <th className="py-4 px-2 text-[10px] font-black text-slate-500 uppercase tracking-wider text-right">% Proi.</th>
              </tr>
            </thead>
            <tbody>
              {/* RICAVI */}
              <tr className="bg-slate-50/50"><td colSpan={activeTab === 'monthly' ? 17 : 5} className="py-2 px-4 text-[10px] font-black text-slate-900 uppercase">① Ricavi di Struttura</td></tr>
              {renderRow('Ricavi Core (SAL/Commesse)', ceData.ricaviCore, 'auto', undefined, metrics.proiezioneRicaviCore)}
              {renderRow('Vendite Immobiliari', ceData.ricaviImmobiliare, 'auto', undefined, metrics.proiezioneRicaviImmobiliare)}
              {renderRow('Altri Ricavi (Affitti/Sviluppo)', ceData.ricaviAltro, 'auto', undefined, metrics.proiezioneRicaviAltro)}
              <tr className="bg-slate-100 font-bold">
                <td className="py-3 px-4 text-xs sticky left-0 bg-slate-100 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">TOTALE RICAVI (A)</td>
                {activeTab === 'monthly' && metrics.totRicavi.map((v, i) => <CalcCell key={i} value={v} />)}
                <CalcCell value={metrics.fatturato} isKPI />
                <td className="p-1 text-right text-[10px]">100%</td>
                <ProjectionCell value={metrics.proiezioneFatturato} />
                <td className="p-1 text-right text-[10px] font-bold text-violet-600">100%</td>
              </tr>

              {/* COSTI VARIABILI */}
              <tr className="bg-slate-50/50"><td colSpan={activeTab === 'monthly' ? 17 : 5} className="py-2 px-4 text-[10px] font-black text-slate-600 uppercase">② Costi Variabili</td></tr>
              {renderRow('Costi Variabili (Materiali/Subappalti)', ceData.costiVariabili, 'auto', undefined, metrics.proiezioneCostiVariabili)}
              <tr className="bg-slate-50/30 font-bold">
                <td className="py-3 px-4 text-xs sticky left-0 bg-slate-50/30 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">TOTALE COSTI VARIABILI (B)</td>
                {activeTab === 'monthly' && metrics.totCostiVar.map((v, i) => <CalcCell key={i} value={v} />)}
                <CalcCell value={metrics.totCostiVar.reduce((a,b)=>a+b,0)} isKPI />
                <td className="p-1 text-right text-[10px]">{formatPercent(metrics.fatturato > 0 ? metrics.totCostiVar.reduce((a,b)=>a+b,0)/metrics.fatturato : 0)}</td>
                <ProjectionCell value={metrics.proiezioneCostiVariabili} />
                <td className="p-1 text-right text-[10px] font-bold text-violet-600">{formatPercent(metrics.proiezioneFatturato > 0 ? metrics.proiezioneCostiVariabili/metrics.proiezioneFatturato : 0)}</td>
              </tr>

              <tr className="bg-[#222222] text-white font-black">
                <td className="py-4 px-4 text-sm sticky left-0 bg-[#222222] z-10">PRIMO MARGINE (A - B)</td>
                {activeTab === 'monthly' && metrics.primoMargine.map((v, i) => <td key={i} className="text-right px-2 text-xs">{formatEuro(v)}</td>)}
                <td className="text-right px-4 text-sm">{formatEuro(metrics.primoMargineTot)}</td>
                <td className="text-right px-2 text-xs">{formatPercent(metrics.primoMarginePercent)}</td>
                <td className="text-right px-4 text-sm italic text-slate-400">📈 {formatEuro(metrics.proiezionePrimoMargine)}</td>
                <td className="text-right px-2 text-xs text-violet-300">{formatPercent(metrics.proiezioneFatturato > 0 ? metrics.proiezionePrimoMargine/metrics.proiezioneFatturato : 0)}</td>
              </tr>

              {/* COSTI FISSI */}
              <tr className="bg-slate-50/50"><td colSpan={activeTab === 'monthly' ? 17 : 5} className="py-2 px-4 text-[10px] font-black text-slate-600 uppercase">③ Costi Fissi di Struttura</td></tr>
              {renderRow('Costi Studio (Personale/Amm.)', ceData.costiStudio, 'auto', undefined, metrics.proiezioneCostiStudio)}
              {renderRow('Altri Costi Fissi (Sedi/Marketing)', ceData.costiFissi, 'auto', undefined, metrics.proiezioneCostiFissi)}
              {renderRow('Ammortamenti (Manuale)', ceData.ammortamenti, 'manual', 'ammortamenti', metrics.proiezioneAmmortamenti)}
              
              <tr className="bg-[#222222] text-white font-black">
                <td className="py-4 px-4 text-sm sticky left-0 bg-[#222222] z-10">EBITDA</td>
                {activeTab === 'monthly' && metrics.ebitda.map((v, i) => <td key={i} className="text-right px-2 text-xs">{formatEuro(v)}</td>)}
                <td className="text-right px-4 text-sm">{formatEuro(metrics.ebitdaTot)}</td>
                <td className="text-right px-2 text-xs">{formatPercent(metrics.ebitdaPercent)}</td>
                <td className="text-right px-4 text-sm italic text-slate-400">📈 {formatEuro(metrics.proiezioneEbitda)}</td>
                <td className="text-right px-2 text-xs text-violet-300">{formatPercent(metrics.proiezioneFatturato > 0 ? metrics.proiezioneEbitda/metrics.proiezioneFatturato : 0)}</td>
              </tr>

              {effettoRimanenze && (
                <tr className="bg-emerald-50/50 font-bold border-b border-emerald-100">
                  <td className="py-3 px-4 text-xs sticky left-0 bg-emerald-50/50 z-10 text-emerald-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                    <div className="flex flex-col">
                      <span>EBITDA DI COMPETENZA (OIC)</span>
                      <span className="text-[9px] font-normal text-emerald-600">Inclusa var. rimanenze: {formatEuro(effettoRimanenze.variazioneRimanenzeNetta)}</span>
                    </div>
                  </td>
                  {activeTab === 'monthly' && Array(12).fill(0).map((_, i) => <td key={i} className="px-2"></td>)}
                  <td className="text-right px-4 text-sm text-emerald-700">{formatEuro(metrics.ebitdaTot + effettoRimanenze.variazioneRimanenzeNetta)}</td>
                  <td className="text-right px-2 text-xs text-emerald-600">
                    {formatPercent(effettoRimanenze.fatturatoCompetenzaRettificato > 0 ? (metrics.ebitdaTot + effettoRimanenze.variazioneRimanenzeNetta) / effettoRimanenze.fatturatoCompetenzaRettificato : 0)}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              )}

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
                <ProjectionCell value={metrics.proiezioneEbit} />
                <td className="p-1 text-right text-[10px] font-bold text-violet-600">
                  {formatPercent(metrics.proiezioneFatturato > 0 ? metrics.proiezioneEbit / metrics.proiezioneFatturato : 0)}
                </td>
              </tr>

              {/* ONERI E IMPOSTE */}
              <tr className="bg-slate-50/50"><td colSpan={activeTab === 'monthly' ? 17 : 5} className="py-2 px-4 text-[10px] font-black text-slate-600 uppercase">④ Oneri, Proventi e Imposte</td></tr>
              {renderRow('Oneri Finanziari', ceData.oneriFin, 'auto', undefined, metrics.proiezioneOneriFin)}
              {renderRow('Proventi Finanziari', ceData.proventiFin, 'auto', undefined, metrics.proiezioneProventiFin)}
              {renderRow('Risultato Straordinario', ceData.straordinario, 'auto', undefined, metrics.proiezioneStraordinario)}
              
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
                <ProjectionCell value={metrics.proiezioneEbt} />
                <td className="p-1 text-right text-[10px] font-bold text-violet-600">{formatPercent(metrics.proiezioneFatturato > 0 ? metrics.proiezioneEbt/metrics.proiezioneFatturato : 0)}</td>
              </tr>

              {renderRow('Imposte Stimate (Manuale)', ceData.imposte, 'manual', 'imposte', previsioneFiscale.totaleImposteStimate)}

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
                <td className="text-right px-2 text-xs text-violet-300">{formatPercent(metrics.proiezioneFatturato > 0 ? metrics.proiezioneUtile/metrics.proiezioneFatturato : 0)}</td>
              </tr>

              {/* SOCI */}
              <tr className="bg-slate-50/50"><td colSpan={activeTab === 'monthly' ? 17 : 5} className="py-2 px-4 text-[10px] font-black text-slate-900 uppercase">⑤ Compenso Imprenditore</td></tr>
              {renderRow('Prelievo Utile Soci', ceData.compensoImprenditore, 'auto', undefined, metrics.proiezioneCompensoImprenditore)}
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
                {(() => {
                  const hasForecasts = txAnno.some(tx => tx.isForecast);
                  const getProjVal = (forecastVal: number, linearVal: number) => hasForecasts ? forecastVal : linearVal;
                  
                  return [
                    { label: 'Ricavi Totali', ytd: metrics.fatturato, proj: metrics.proiezioneFatturato, isBold: true },
                    { label: 'Costi Variabili', ytd: metrics.totCostiVar.reduce((a,b)=>a+b,0), proj: getProjVal(metrics.proiezioneCostiVariabili, (metrics.totCostiVar.reduce((a,b)=>a+b,0) / metrics.mesiTrascorsi) * 12) },
                    { label: 'Primo Margine', ytd: metrics.primoMargineTot, proj: getProjVal(metrics.proiezionePrimoMargine, (metrics.primoMargineTot / metrics.mesiTrascorsi) * 12), isBold: true, color: 'text-slate-900' },
                    { label: 'Costi di Struttura', ytd: metrics.costiFissiTot, proj: getProjVal(metrics.proiezioneCostiFissi + metrics.proiezioneCostiStudio + metrics.proiezioneAmmortamenti, (metrics.costiFissiTot / metrics.mesiTrascorsi) * 12) },
                    { label: 'EBITDA', ytd: metrics.ebitdaTot, proj: metrics.proiezioneEbitda, isBold: true, color: 'text-slate-900' },
                    { label: 'EBIT', ytd: metrics.ebitTot, proj: getProjVal(metrics.proiezioneEbit, (metrics.ebitTot / metrics.mesiTrascorsi) * 12) },
                    { label: 'Utile Netto', ytd: metrics.utileNettoTot, proj: metrics.proiezioneUtile, isBold: true, color: 'text-slate-900' },
                  ].map((row, i) => (
                    <tr key={row.label} className="hover:bg-slate-50/50 transition-colors">
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
                  ));
                })()}
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
                  key={m}
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
                      <tr key={riga.label} className="border-b border-slate-100 hover:bg-slate-50/50">
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
