import React, { useState, useMemo } from 'react';
import { Transaction, SPSnapshot, AppView, CEData } from '../types';
import { buildCEData, calcCEMetrics, calcSPMetrics } from '../utils/gasCoreEngine';
import { exportSPPDF } from '../utils/spPdfExport';
import PDFExportButton from './PDFExportButton';
import InfoTooltip, { InfoTooltipWrapper } from './InfoTooltip';
import { HelpButton } from './HelpPanel';
import HelpPanel from './HelpPanel';
import { 
  Building2, 
  Wallet, 
  ArrowRightLeft, 
  ShieldCheck, 
  AlertTriangle,
  CheckCircle2,
  Save,
  Plus,
  Trash2,
  TrendingUp,
  History,
  BarChart2
} from 'lucide-react';
import { CERow, InitialBalanceBreakdown } from '../types';

interface SPViewProps {
  transactions: Transaction[];
  initialData: InitialBalanceBreakdown;
  snapshots: SPSnapshot[];
  onUpdateSnapshots: (snaps: SPSnapshot[]) => void;
  ceManualData: Record<string, Partial<CEData>>;
  onGoToManuale?: (section?: string, tab?: 'manuale' | 'glossario') => void;
}

const formatEuro = (val: number) => 
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(val);

const formatPercent = (val: number) => 
  new Intl.NumberFormat('it-IT', { style: 'percent', minimumFractionDigits: 1 }).format(val);

const EMPTY_SNAPSHOT: SPSnapshot = {
  dataRiferimento: new Date().toISOString().split('T')[0],
  immImmateriali: 0, immMateriali: 0, immobiliTerreni: 0, partecipazioni: 0,
  rimanenze: 0, creditiClienti: 0, creditiTributari: 0, liquidita: 0,
  capitaleSociale: 0, riserve: 0, utileEsercizio: 0,
  mutuiLT: 0, leasingLT: 0, tfr: 0,
  fidiRT: 0, debitiFornitori: 0, debitiTributari: 0, accontiClienti: 0, altriDebitiBT: 0,
  mutuiBT: 0
};

const ManualInput = ({ label, value, onChange, icon: Icon }: { label: string, value: number, onChange: (v: number) => void, icon?: any }) => (
  <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-xl hover:bg-slate-100 transition-colors">
    <div className="flex items-center gap-3">
      {Icon && <Icon size={16} className="text-slate-500" />}
      <span className="text-xs font-bold text-slate-700">{label}</span>
    </div>
    <div className="flex items-center bg-white border border-slate-300 border-dashed rounded px-3 py-1.5 shadow-sm">
      <span className="text-slate-400 mr-2 text-xs">✏️</span>
      <input
        type="number"
        value={value || ''}
        placeholder="0"
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        className="w-24 bg-transparent text-right text-sm font-black text-slate-800 outline-none"
      />
    </div>
  </div>
);

const SPView: React.FC<SPViewProps> = ({ transactions, initialData, snapshots, onUpdateSnapshots, ceManualData, onGoToManuale }) => {
  const [currentSnap, setCurrentSnap] = useState<SPSnapshot>(snapshots[0] || EMPTY_SNAPSHOT);
  const [isEditing, setIsEditing] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'input' | 'analisi' | 'storico'>('input');

  // Calcolo saldo finale cash flow dai dati reali
  const cashFlowSaldoFinale = useMemo(() => {
    const initialBalance = initialData.accounts.reduce((sum, acc) => sum + acc.balance, 0);
    const totalTransactions = transactions.reduce((sum, tx) => {
      return sum + (tx.type === 'INCOME' ? tx.amount : -tx.amount);
    }, 0);
    return initialBalance + totalTransactions;
  }, [transactions, initialData]);

  const ceMetrics = useMemo(() => {
    const year = new Date(currentSnap.dataRiferimento).getFullYear();
    const ceData = buildCEData(transactions, year, ceManualData[year.toString()]);
    return calcCEMetrics(ceData, transactions);
  }, [transactions, currentSnap.dataRiferimento, ceManualData]);

  const metrics = useMemo(() => calcSPMetrics(currentSnap, ceMetrics, transactions), [currentSnap, ceMetrics, transactions]);

  const handleSave = () => {
    const exists = snapshots.find(s => s.dataRiferimento === currentSnap.dataRiferimento);
    if (exists) {
      onUpdateSnapshots(snapshots.map(s => s.dataRiferimento === currentSnap.dataRiferimento ? currentSnap : s));
    } else {
      onUpdateSnapshots([...snapshots, currentSnap].sort((a, b) => b.dataRiferimento.localeCompare(a.dataRiferimento)));
    }
    setIsEditing(false);
  };

  const handleDelete = (date: string) => {
    onUpdateSnapshots(snapshots.filter(s => s.dataRiferimento !== date));
    if (currentSnap.dataRiferimento === date) {
      setCurrentSnap(snapshots.find(s => s.dataRiferimento !== date) || EMPTY_SNAPSHOT);
    }
  };

  const handleNew = () => {
    setCurrentSnap({ ...EMPTY_SNAPSHOT, dataRiferimento: new Date().toISOString().split('T')[0] });
    setIsEditing(true);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-200 no-print">
        <div>
          <h2 className="text-2xl font-black text-slate-900 flex items-center gap-3">
            <Building2 className="text-slate-900" />
            Stato Patrimoniale
          </h2>
          <p className="text-slate-500 text-sm mt-1">Fotografia della solidità e struttura finanziaria</p>
        </div>

        <div className="flex items-center gap-3">
          <HelpButton onClick={() => setShowHelp(true)} />
          <div className="flex items-center bg-slate-100 rounded-xl p-1">
            <select 
              value={currentSnap.dataRiferimento}
              onChange={(e) => {
                const found = snapshots.find(s => s.dataRiferimento === e.target.value);
                if (found) setCurrentSnap(found);
              }}
              className="bg-transparent px-4 py-2 font-black text-slate-800 outline-none text-sm"
            >
              {snapshots.map(s => (
                <option key={s.dataRiferimento} value={s.dataRiferimento}>{new Date(s.dataRiferimento).toLocaleDateString('it-IT')}</option>
              ))}
              {isEditing && <option value={currentSnap.dataRiferimento}>Nuovo Snapshot...</option>}
            </select>
          </div>
          <button 
            onClick={handleNew}
            className="p-2 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-all shadow-md"
          >
            <Plus size={20} />
          </button>

          <PDFExportButton
            config={{
              titolo: `Stato Patrimoniale — ${currentSnap?.dataRiferimento ?? 'Ultimo snapshot'}`,
              sottotitolo: `Gruppo Visentin SRL · Generato il ${new Date().toLocaleDateString('it-IT')}`,
              elementId: 'bilancio-content',
              orientazione: 'portrait',
              nomeFile: `SP_${(currentSnap?.dataRiferimento ?? 'snapshot').replace(/\//g, '-')}`,
            }}
            label="Esporta PDF"
          />
        </div>
      </div>

      {/* Sub-Tabs Navigation */}
      <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl w-fit no-print">
        <button
          onClick={() => setActiveSubTab('input')}
          className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
            activeSubTab === 'input' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Bilancio Riclassificato
        </button>
        <button
          onClick={() => setActiveSubTab('analisi')}
          className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
            activeSubTab === 'analisi' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Analisi & Indici
        </button>
        <button
          onClick={() => setActiveSubTab('storico')}
          className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
            activeSubTab === 'storico' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Storico Snapshot
        </button>
      </div>

      <div id="sp-report-content" className="space-y-6">
        {/* Header for PDF only (hidden in UI) */}
        <div className="hidden print-only bg-white p-6 rounded-3xl border border-slate-200 mb-6">
           <h2 className="text-2xl font-black text-slate-900">Stato Patrimoniale {new Date(currentSnap.dataRiferimento).toLocaleDateString('it-IT')}</h2>
           <p className="text-slate-500 text-sm">Fotografia della solidità e struttura finanziaria del Gruppo Visentin</p>
        </div>

        {activeSubTab === 'input' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in slide-in-from-bottom-4 duration-500">
            {/* ATTIVO */}
            <div className="space-y-6">
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-slate-800 p-4 text-white flex items-center justify-between">
                  <h3 className="font-black text-sm uppercase tracking-wider">Attivo Immobilizzato</h3>
                  <TrendingUp size={18} />
                </div>
                <div className="p-4 space-y-3">
                  <ManualInput label="Immobilizzazioni Immateriali" value={currentSnap.immImmateriali} onChange={v => setCurrentSnap(s => ({...s, immImmateriali: v}))} />
                  <ManualInput label="Immobilizzazioni Materiali" value={currentSnap.immMateriali} onChange={v => setCurrentSnap(s => ({...s, immMateriali: v}))} />
                  <ManualInput label="Immobili e Terreni" value={currentSnap.immobiliTerreni} onChange={v => setCurrentSnap(s => ({...s, immobiliTerreni: v}))} />
                  <ManualInput label="Partecipazioni" value={currentSnap.partecipazioni} onChange={v => setCurrentSnap(s => ({...s, partecipazioni: v}))} />
                  <div className="pt-4 border-t border-slate-100 flex justify-between items-center px-3">
                    <span className="text-[10px] font-black text-slate-400 uppercase">Totale Immobilizzato</span>
                    <span className="text-lg font-black text-slate-900">{formatEuro(metrics.totAttivoImm)}</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-slate-600 p-4 text-white flex items-center justify-between">
                  <h3 className="font-black text-sm uppercase tracking-wider">Attivo Circolante</h3>
                  <ArrowRightLeft size={18} />
                </div>
                <div className="p-4 space-y-3">
                  <ManualInput label="Rimanenze" value={currentSnap.rimanenze} onChange={v => setCurrentSnap(s => ({...s, rimanenze: v}))} />
                  <ManualInput label="Crediti Clienti" value={currentSnap.creditiClienti} onChange={v => setCurrentSnap(s => ({...s, creditiClienti: v}))} />
                  <ManualInput label="Crediti Tributari" value={currentSnap.creditiTributari} onChange={v => setCurrentSnap(s => ({...s, creditiTributari: v}))} />
                  <div className="space-y-2">
                    <ManualInput label="Disponibilità Liquide" value={currentSnap.liquidita} onChange={v => setCurrentSnap(s => ({...s, liquidita: v}))} icon={Wallet} />
                    <button 
                      onClick={() => setCurrentSnap(s => ({...s, liquidita: cashFlowSaldoFinale}))}
                      className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-bold text-slate-500 hover:bg-slate-100 transition-all flex items-center justify-center gap-2"
                    >
                      💡 Usa saldo Cash Flow ({formatEuro(cashFlowSaldoFinale)})
                    </button>
                  </div>
                  <div className="pt-4 border-t border-slate-100 flex justify-between items-center px-3">
                    <span className="text-[10px] font-black text-slate-400 uppercase">Totale Circolante</span>
                    <span className="text-lg font-black text-slate-900">{formatEuro(metrics.totAttivoCirc)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* PASSIVO & PN */}
            <div className="space-y-6">
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-slate-900 p-4 text-white flex items-center justify-between">
                  <h3 className="font-black text-sm uppercase tracking-wider">Patrimonio Netto</h3>
                  <ShieldCheck size={18} />
                </div>
                <div className="p-4 space-y-3">
                  <ManualInput label="Capitale Sociale" value={currentSnap.capitaleSociale} onChange={v => setCurrentSnap(s => ({...s, capitaleSociale: v}))} />
                  <ManualInput label="Riserve" value={currentSnap.riserve} onChange={v => setCurrentSnap(s => ({...s, riserve: v}))} />
                  <ManualInput label="Utile d'Esercizio" value={currentSnap.utileEsercizio} onChange={v => setCurrentSnap(s => ({...s, utileEsercizio: v}))} />
                  <div className="pt-4 border-t border-slate-100 flex justify-between items-center px-3">
                    <span className="text-[10px] font-black text-slate-400 uppercase">Totale PN</span>
                    <span className="text-lg font-black text-slate-900">{formatEuro(metrics.totPN)}</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-slate-800 p-4 text-white flex items-center justify-between">
                  <h3 className="font-black text-sm uppercase tracking-wider">Passività Lungo Termine</h3>
                  <History size={18} />
                </div>
                <div className="p-4 space-y-3">
                  <ManualInput label="Mutui e Finanziamenti LT" value={currentSnap.mutuiLT} onChange={v => setCurrentSnap(s => ({...s, mutuiLT: v}))} />
                  <ManualInput label="Leasing LT" value={currentSnap.leasingLT} onChange={v => setCurrentSnap(s => ({...s, leasingLT: v}))} />
                  <ManualInput label="TFR" value={currentSnap.tfr} onChange={v => setCurrentSnap(s => ({...s, tfr: v}))} />
                  <div className="pt-4 border-t border-slate-100 flex justify-between items-center px-3">
                    <span className="text-[10px] font-black text-slate-400 uppercase">Totale Passivo LT</span>
                    <span className="text-lg font-black text-slate-900">{formatEuro(metrics.totPassivoLT)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* PASSIVO BT */}
            <div className="space-y-6">
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-slate-700 p-4 text-white flex items-center justify-between">
                  <h3 className="font-black text-sm uppercase tracking-wider">Passività Breve Termine</h3>
                  <AlertTriangle size={18} />
                </div>
                <div className="p-4 space-y-3">
                  <ManualInput label="Fidi e Anticipi RT" value={currentSnap.fidiRT} onChange={v => setCurrentSnap(s => ({...s, fidiRT: v}))} />
                  <ManualInput label="Debiti Fornitori" value={currentSnap.debitiFornitori} onChange={v => setCurrentSnap(s => ({...s, debitiFornitori: v}))} />
                  <ManualInput label="Debiti Tributari/Previdenziali" value={currentSnap.debitiTributari} onChange={v => setCurrentSnap(s => ({...s, debitiTributari: v}))} />
                  <ManualInput label="Acconti Clienti" value={currentSnap.accontiClienti} onChange={v => setCurrentSnap(s => ({...s, accontiClienti: v}))} />
                  <ManualInput label="Altri Debiti BT" value={currentSnap.altriDebitiBT} onChange={v => setCurrentSnap(s => ({...s, altriDebitiBT: v}))} />
                  <ManualInput label="Quota Corrente Mutui/Leasing (entro 12m)" value={currentSnap.mutuiBT || 0} onChange={v => setCurrentSnap(s => ({...s, mutuiBT: v}))} />
                  <div className="pt-4 border-t border-slate-100 flex justify-between items-center px-3">
                    <span className="text-[10px] font-black text-slate-400 uppercase">Totale Passivo BT</span>
                    <span className="text-lg font-black text-slate-900">{formatEuro(metrics.totPassivoBT)}</span>
                  </div>
                </div>
              </div>

              <div className={`p-6 rounded-3xl border shadow-sm flex items-center gap-4 ${metrics.quadratura ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-rose-50 border-rose-100 text-rose-700'}`}>
                {metrics.quadratura ? <CheckCircle2 size={24} /> : <AlertTriangle size={24} />}
                <div>
                  <p className="text-xs font-black uppercase tracking-wider">Stato Quadratura</p>
                  <p className="text-sm font-bold">{metrics.quadratura ? 'Bilancio in Pareggio' : 'Sbilancio Rilevato'}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeSubTab === 'analisi' && (
          <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-[10px] font-black text-sky-600 uppercase">PFN</p>
                  <InfoTooltip termId="pfn" />
                </div>
                <p className="text-2xl font-black text-slate-900">{formatEuro(metrics.pfn)}</p>
                <p className={`text-[10px] font-bold mt-1 ${metrics.pfn <= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {metrics.pfn <= 0 ? 'Liquidità Netta' : 'Debito Netto'}
                </p>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-[10px] font-black text-emerald-600 uppercase">PFN / EBITDA</p>
                  <InfoTooltip termId="pfn_ebitda" />
                </div>
                <p className="text-2xl font-black text-slate-900">{metrics.pfnSuEbitda.toFixed(2)}x</p>
                <p className={`text-[10px] font-bold mt-1 ${metrics.pfnSuEbitda < 3 ? 'text-emerald-600' : metrics.pfnSuEbitda < 4 ? 'text-amber-600' : 'text-rose-600'}`}>
                  {metrics.pfnSuEbitda < 3 ? 'Ottimo' : metrics.pfnSuEbitda < 4 ? 'Attenzione' : 'Critico'}
                </p>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-[10px] font-black text-indigo-600 uppercase">Current Ratio</p>
                  <InfoTooltip termId="current_ratio" />
                </div>
                <p className="text-2xl font-black text-slate-900">{metrics.currentRatio.toFixed(2)}</p>
                <p className={`text-[10px] font-bold mt-1 ${metrics.currentRatio > 1.2 ? 'text-emerald-600' : metrics.currentRatio > 1 ? 'text-amber-600' : 'text-rose-600'}`}>
                  {metrics.currentRatio > 1.2 ? 'Solido' : metrics.currentRatio > 1 ? 'Equilibrato' : 'Illiquido'}
                </p>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-[10px] font-black text-amber-600 uppercase">Solidità</p>
                  <InfoTooltip termId="solidita_patrimoniale" />
                </div>
                <p className="text-2xl font-black text-slate-900">{formatPercent(metrics.soliditaPatr)}</p>
                <p className={`text-[10px] font-bold mt-1 ${metrics.soliditaPatr > 0.3 ? 'text-emerald-600' : metrics.soliditaPatr > 0.15 ? 'text-amber-600' : 'text-rose-600'}`}>
                  {metrics.soliditaPatr > 0.3 ? 'Ottima' : metrics.soliditaPatr > 0.15 ? 'Sufficiente' : 'Debole'}
                </p>
              </div>
            </div>

            {/* Analisi Strutturale */}
            <div className="bg-[#222222] rounded-3xl p-8 text-white shadow-xl">
              <h3 className="text-lg font-black mb-6 flex items-center gap-3">
                <BarChart2 className="text-sky-400" />
                Analisi Strutturale
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Composizione Attivo</p>
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Immobilizzato</span>
                      <span className="font-black">{formatPercent(metrics.totAttivoImm / (metrics.totAttivoImm + metrics.totAttivoCirc) || 0)}</span>
                    </div>
                    <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                      <div className="bg-sky-500 h-full" style={{ width: `${(metrics.totAttivoImm / (metrics.totAttivoImm + metrics.totAttivoCirc) || 0) * 100}%` }} />
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Circolante</span>
                      <span className="font-black">{formatPercent(metrics.totAttivoCirc / (metrics.totAttivoImm + metrics.totAttivoCirc) || 0)}</span>
                    </div>
                    <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                      <div className="bg-emerald-500 h-full" style={{ width: `${(metrics.totAttivoCirc / (metrics.totAttivoImm + metrics.totAttivoCirc) || 0) * 100}%` }} />
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Copertura Immobilizzazioni</p>
                  <div className="p-4 bg-slate-800/50 rounded-2xl border border-slate-700">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-slate-300">Indice di Copertura</span>
                      <span className={`text-lg font-black ${metrics.totPN / metrics.totAttivoImm > 1 ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {(metrics.totPN / metrics.totAttivoImm || 0).toFixed(2)}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500 leading-relaxed">
                      Indica quanto le immobilizzazioni sono finanziate dal patrimonio netto. Un valore {'>'} 1 è segno di grande solidità.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeSubTab === 'storico' && (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-black text-slate-900">Archivio Snapshot Patrimoniali</h3>
              <span className="px-3 py-1 bg-slate-100 text-slate-600 text-[10px] font-black rounded-full uppercase">
                {snapshots.length} salvataggi
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="py-4 px-6 text-[10px] font-black text-slate-500 uppercase tracking-wider">Data</th>
                    <th className="py-4 px-6 text-[10px] font-black text-slate-500 uppercase tracking-wider text-right">Tot. Attivo</th>
                    <th className="py-4 px-6 text-[10px] font-black text-slate-500 uppercase tracking-wider text-right">Patrimonio Netto</th>
                    <th className="py-4 px-6 text-[10px] font-black text-slate-500 uppercase tracking-wider text-right">PFN</th>
                    <th className="py-4 px-6 text-[10px] font-black text-slate-500 uppercase tracking-wider text-center">Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshots.map(s => {
                    const sMetrics = calcSPMetrics(s, ceMetrics, transactions);
                    return (
                      <tr key={s.dataRiferimento} className="border-t border-slate-100 hover:bg-slate-50 transition-colors group">
                        <td className="py-4 px-6 text-sm font-black text-slate-900">
                          {new Date(s.dataRiferimento).toLocaleDateString('it-IT')}
                        </td>
                        <td className="py-4 px-6 text-sm text-right font-mono text-slate-600">
                          {formatEuro(sMetrics.totAttivoImm + sMetrics.totAttivoCirc)}
                        </td>
                        <td className="py-4 px-6 text-sm text-right font-mono text-blue-600 font-bold">
                          {formatEuro(sMetrics.totPN)}
                        </td>
                        <td className="py-4 px-6 text-sm text-right font-mono">
                          <span className={sMetrics.pfn <= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                            {formatEuro(sMetrics.pfn)}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button 
                              onClick={() => { setCurrentSnap(s); setActiveSubTab('input'); }}
                              className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-all"
                              title="Carica"
                            >
                              <ArrowRightLeft size={16} />
                            </button>
                            <button 
                              onClick={() => handleDelete(s.dataRiferimento)}
                              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                              title="Elimina"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {snapshots.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-400 italic text-sm">
                        Nessuno snapshot salvato. Crea il primo cliccando su "Nuovo Snapshot".
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex gap-4">
        <button 
          onClick={handleSave}
          className="px-8 py-4 bg-slate-900 text-white rounded-2xl font-black shadow-2xl hover:bg-slate-800 transition-all flex items-center gap-3 active:scale-95"
        >
          <Save size={20} />
          SALVA SNAPSHOT
        </button>
        <button 
          onClick={() => handleDelete(currentSnap.dataRiferimento)}
          className="p-4 bg-white text-slate-600 border border-slate-100 rounded-2xl font-black shadow-2xl hover:bg-slate-50 transition-all active:scale-95"
        >
          <Trash2 size={20} />
        </button>
      </div>

      <HelpPanel 
        isOpen={showHelp}
        onClose={() => setShowHelp(false)}
        currentView={AppView.STATO_PATRIMONIALE}
        onGoToManuale={onGoToManuale}
      />
    </div>
  );
};

export default SPView;
