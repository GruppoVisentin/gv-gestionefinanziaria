import React, { useMemo, useState } from 'react';
import { Transaction, AppView } from '../types';
import { calcPosizIoneIVA } from '../utils/gasCoreEngine';
import { Receipt, TrendingDown, TrendingUp, AlertCircle, Info, ChevronLeft, ChevronRight, FileDown } from 'lucide-react';
import InfoTooltip from './InfoTooltip';
import { HelpButton } from './HelpPanel';
import HelpPanel from './HelpPanel';
import { exportIVAPDF } from '../utils/ivaPdfExport';

interface IVAViewProps {
  transactions: Transaction[];
  onGoToManuale?: (section?: string, tab?: 'manuale' | 'glossario') => void;
}

const formatEuro = (val: number) =>
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(val);

const MONTHS = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

// Mesi di versamento per liquidazione trimestrale (indici 0-11)
// Versamento entro il 16 del secondo mese successivo al trimestre (maggio, agosto, novembre, dicembre per acconto)
const MESI_VERSAMENTO_TRIM = [4, 7, 10, 11]; // mag, ago, nov, dic (per trim gen-mar, apr-giu, lug-set, acconto ott-dic)

const IVAView: React.FC<IVAViewProps> = ({ transactions, onGoToManuale }) => {
  const currentYear = new Date().getFullYear();
  const [anno, setAnno] = useState(currentYear);
  const [showHelp, setShowHelp] = useState(false);
  const [vistaPrevisionale, setVistaPrevisionale] = useState(false);

  const riepilogo = useMemo(() =>
    calcPosizIoneIVA(transactions, anno, vistaPrevisionale),
    [transactions, anno, vistaPrevisionale]
  );

  const meseCorrente = anno === currentYear ? new Date().getMonth() : 11;

  return (
    <div id="iva-content" className="space-y-6 animate-in fade-in duration-500 pb-20">

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
        <div>
          <h2 className="text-2xl font-black text-slate-900 flex items-center gap-3">
            <Receipt className="text-violet-600" />
            Posizione IVA
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            IVA incassata vs pagata — previsione versamenti F24
          </p>
        </div>

        {/* Destra: selettore consuntivo/previsionale + selettore anno + tasto PDF */}
        <div className="flex items-center gap-3 flex-wrap justify-end no-print">
          <div className="flex items-center bg-slate-100 rounded-xl p-1">
            <button
              onClick={() => setVistaPrevisionale(false)}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                !vistaPrevisionale
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Consuntivo YTD
            </button>
            <button
              onClick={() => setVistaPrevisionale(true)}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                vistaPrevisionale
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Previsionale (Forecast)
            </button>
          </div>

          <div className="flex items-center bg-slate-100 rounded-xl p-1">
            <button
              onClick={() => setAnno(prev => prev - 1)}
              className="p-2 hover:bg-white rounded-lg transition-all text-slate-600"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="px-4 font-black text-slate-800">{anno}</span>
            <button
              onClick={() => setAnno(prev => prev + 1)}
              className="p-2 hover:bg-white rounded-lg transition-all text-slate-600"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <button
            onClick={() => exportIVAPDF({ riepilogo, anno, vistaPrevisionale })}
            className="flex items-center gap-1.5 px-4 py-2 border-2 border-slate-200 text-slate-600 hover:border-slate-400 hover:text-slate-800 text-sm font-bold rounded-xl transition-all active:scale-95 shadow-sm bg-white"
            title="Esporta PDF Tecnico Dettagliato"
          >
            <FileDown size={16} />
            <span>Esporta PDF</span>
          </button>
          <HelpButton onClick={() => setShowHelp(true)} />
        </div>
      </div>

      {/* KPI Annuali */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black text-blue-600 uppercase tracking-wider">IVA Incassata</span>
            <TrendingUp size={16} className="text-blue-600" />
          </div>
          <div className="text-2xl font-black text-blue-600">{formatEuro(riepilogo.totaleIvaIncassata)}</div>
          <div className="text-[10px] text-slate-500 mt-1">{vistaPrevisionale ? 'Incl. stime future' : 'Da clienti'} — anno {anno}</div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black text-rose-600 uppercase tracking-wider">IVA Pagata</span>
            <TrendingDown size={16} className="text-rose-600" />
          </div>
          <div className="text-2xl font-black text-rose-600">{formatEuro(riepilogo.totaleIvaPagata)}</div>
          <div className="text-[10px] text-slate-500 mt-1">{vistaPrevisionale ? 'Incl. stime future' : 'A fornitori'} — anno {anno}</div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black text-amber-600 uppercase tracking-wider">Già Versato / Stima</span>
            <Receipt size={16} className="text-amber-600" />
          </div>
          <div className="text-2xl font-black text-amber-600">{formatEuro(riepilogo.totaleVersato)}</div>
          <div className="text-[10px] text-slate-500 mt-1">{vistaPrevisionale ? 'Reali + stime F24 future' : 'F24 IVA registrati'}</div>
        </div>

        <div className={`p-5 rounded-3xl border shadow-sm ${
          riepilogo.creditoDebitoResiduo > 0
            ? 'bg-rose-50 border-rose-100'
            : 'bg-emerald-50 border-emerald-100'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1">
              <span className={`text-[10px] font-black uppercase tracking-wider ${
                riepilogo.creditoDebitoResiduo > 0 ? 'text-rose-600' : 'text-emerald-600'
              }`}>
                {riepilogo.creditoDebitoResiduo > 0 ? 'Debito Residuo' : 'Credito IVA'}
              </span>
              <InfoTooltip termId="posizione_iva" />
            </div>
            <AlertCircle size={16} className={riepilogo.creditoDebitoResiduo > 0 ? 'text-rose-600' : 'text-emerald-600'} />
          </div>
          <div className={`text-2xl font-black ${riepilogo.creditoDebitoResiduo > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
            {formatEuro(Math.abs(riepilogo.creditoDebitoResiduo))}
          </div>
          <div className={`text-[10px] mt-1 ${riepilogo.creditoDebitoResiduo > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
            {vistaPrevisionale 
              ? (riepilogo.creditoDebitoResiduo > 0 ? 'Previsione debito fine anno' : 'Previsione credito fine anno')
              : (riepilogo.creditoDebitoResiduo > 0 ? 'Da versare ancora' : 'A credito verso erario')
            }
          </div>
        </div>
      </div>

      {/* Nota frequenza */}
      <div className="flex flex-col gap-2 bg-slate-50 border border-slate-100 rounded-2xl p-4">
        <div className="flex items-start gap-3">
          <Info size={16} className="text-slate-500 shrink-0 mt-0.5" />
          <p className="text-[11px] text-slate-800 leading-relaxed">
            Regime rilevato: <span className="font-black uppercase">{riepilogo.frequenzaLiquidazione}</span> — 
            basato sui versamenti F24 IVA registrati nell'anno.
            {riepilogo.frequenzaLiquidazione === 'trimestrale' && (
              <> I mesi di versamento trimestrale sono Aprile, Luglio, Ottobre e Dicembre (con maggiorazione 1%).</>
            )}
            {' '}I valori si basano solo sulle transazioni con IVA compilata — verifica che il campo aliquota IVA sia valorizzato su tutte le transazioni rilevanti.
          </p>
        </div>
        {vistaPrevisionale && (
          <div className="text-[10px] text-violet-700 bg-violet-50/50 border border-violet-100 rounded-xl p-2.5 font-semibold flex items-center gap-2">
            <span>🔮</span>
            <span>
              <strong>Visione Previsionale Attiva:</strong> I mesi futuri evidenziati in viola includono transazioni stimate (isForecast = true). Le scadenze di versamento F24 future (*) sono proiettate in base ai saldi dei mesi precedenti.
            </span>
          </div>
        )}
      </div>

      {/* Tabella mensile */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="py-4 px-4 text-[10px] font-black text-slate-500 uppercase tracking-wider sticky left-0 bg-slate-50 z-20 min-w-[80px]">Mese</th>
                <th className="py-4 px-4 text-[10px] font-black text-slate-500 uppercase tracking-wider text-right min-w-[130px]">IVA Incassata</th>
                <th className="py-4 px-4 text-[10px] font-black text-slate-500 uppercase tracking-wider text-right min-w-[130px]">IVA Pagata</th>
                <th className="py-4 px-4 text-[10px] font-black text-slate-500 uppercase tracking-wider text-right min-w-[130px]">Saldo Periodo</th>
                <th className="py-4 px-4 text-[10px] font-black text-slate-500 uppercase tracking-wider text-right min-w-[130px]">F24 Versato</th>
                <th className="py-4 px-4 text-[10px] font-black text-slate-500 uppercase tracking-wider text-right min-w-[150px]">Posizione Netta</th>
                <th className="py-4 px-4 text-[10px] font-black text-slate-500 uppercase tracking-wider text-center min-w-[100px]">Versamento</th>
              </tr>
            </thead>
            <tbody>
              {riepilogo.mensile.map((m) => {
                const isFuturo = m.mese > meseCorrente;
                const isPrevisionale = !!m.isForecastMese;
                const isVersamTrim = riepilogo.frequenzaLiquidazione === 'trimestrale' &&
                  MESI_VERSAMENTO_TRIM.includes(m.mese);
                const isVersamMensile = riepilogo.frequenzaLiquidazione === 'mensile';
                const isScadenza = isVersamTrim || isVersamMensile;

                return (
                  <tr
                    key={m.mese}
                    className={`border-b border-slate-100 transition-colors ${
                      isPrevisionale 
                        ? 'bg-violet-50/20 hover:bg-violet-50/40 border-violet-100' 
                        : isFuturo 
                        ? 'opacity-60 hover:bg-slate-50/50' 
                        : 'hover:bg-slate-50/50'
                    } ${isScadenza && !isFuturo && !isPrevisionale ? 'bg-slate-50' : ''}`}
                  >
                    <td className={`py-3 px-4 text-xs font-black text-slate-700 sticky left-0 z-10 ${isPrevisionale ? 'bg-violet-50/50' : 'bg-white'}`}>
                      <div className="flex items-center gap-2">
                        {MONTHS[m.mese]}
                        {isPrevisionale ? (
                          <span className="px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 text-[8px] font-black uppercase tracking-wide">Forecast</span>
                        ) : isFuturo ? (
                          <span className="text-[9px] font-bold text-slate-400 uppercase">prev.</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right text-xs font-medium text-blue-600 font-mono">
                      {m.ivaIncassata > 0 ? formatEuro(m.ivaIncassata) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="py-3 px-4 text-right text-xs font-medium text-rose-600 font-mono">
                      {m.ivaPagata > 0 ? formatEuro(m.ivaPagata) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className={`py-3 px-4 text-right text-sm font-black font-mono ${m.saldoIVA >= 0 ? 'text-blue-700' : 'text-rose-700'}`}>
                      {m.saldoIVA !== 0 ? formatEuro(m.saldoIVA) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="py-3 px-4 text-right text-xs font-medium text-amber-600 font-mono">
                      {m.versamentoIVA > 0 ? (
                        <span className={isPrevisionale ? 'text-violet-600 font-black' : ''}>
                          {formatEuro(m.versamentoIVA)}
                          {isPrevisionale && ' *'}
                        </span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {m.posizionNetta !== 0 ? (
                        <span className={`inline-block px-2.5 py-1 rounded-lg text-xs font-black font-mono ${
                          m.posizionNetta > 0
                            ? 'bg-rose-50 text-rose-700'
                            : 'bg-emerald-50 text-emerald-700'
                        }`}>
                          {m.posizionNetta > 0 ? 'Da versare ' : 'Credito '}
                          {formatEuro(Math.abs(m.posizionNetta))}
                        </span>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {isScadenza ? (
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wide ${
                          isPrevisionale
                            ? 'bg-violet-100 text-violet-700 border border-violet-200 shadow-sm'
                            : isFuturo
                            ? 'bg-slate-100 text-slate-700'
                            : m.versamentoIVA > 0
                            ? 'bg-slate-200 text-slate-900'
                            : 'bg-slate-100 text-slate-400'
                        }`}>
                          {isPrevisionale ? 'Stima F24' : isFuturo ? 'Scadenza' : m.versamentoIVA > 0 ? 'Versato' : 'Non versato'}
                        </span>
                      ) : (
                        <span className="text-slate-200 text-[10px]">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 border-t-2 border-slate-200">
                <td className="py-4 px-4 text-xs font-black text-slate-700 sticky left-0 bg-slate-50 z-10 uppercase">Totale Anno</td>
                <td className="py-4 px-4 text-right text-sm font-black text-slate-900 font-mono">{formatEuro(riepilogo.totaleIvaIncassata)}</td>
                <td className="py-4 px-4 text-right text-sm font-black text-slate-700 font-mono">{formatEuro(riepilogo.totaleIvaPagata)}</td>
                <td className="py-4 px-4 text-right text-sm font-black text-slate-700 font-mono">{formatEuro(riepilogo.totaleIvaIncassata - riepilogo.totaleIvaPagata)}</td>
                <td className="py-4 px-4 text-right text-sm font-black text-slate-700 font-mono">{formatEuro(riepilogo.totaleVersato)}</td>
                <td className="py-4 px-4 text-right">
                  <span className={`inline-block px-3 py-1.5 rounded-xl text-sm font-black font-mono ${
                    riepilogo.creditoDebitoResiduo > 0
                      ? 'bg-slate-100 text-slate-800'
                      : 'bg-slate-200 text-slate-900'
                  }`}>
                    {riepilogo.creditoDebitoResiduo > 0 ? 'Debito ' : 'Credito '}
                    {formatEuro(Math.abs(riepilogo.creditoDebitoResiduo))}
                  </span>
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Note e avvertenze — visibili solo nel PDF */}
      <div className="bg-slate-50 rounded-2xl border border-slate-200 p-6 space-y-3">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
          Note e Avvertenze
        </p>
        <ul className="space-y-2 text-xs text-slate-500 leading-relaxed">
          <li className="flex items-start gap-2">
            <span className="text-slate-300 mt-0.5">•</span>
            I valori sono calcolati sulle transazioni con aliquota IVA compilata in GV CashFlow.
            Verificare che tutte le transazioni rilevanti abbiano il campo IVA valorizzato.
          </li>
          {vistaPrevisionale && (
            <li className="flex items-start gap-2 text-violet-700 font-semibold">
              <span className="text-violet-350 mt-0.5">•</span>
              I campi contrassegnati con (*) indicano versamenti F24 stimati proiettati automaticamente in base ai saldi IVA precedenti.
            </li>
          )}
          <li className="flex items-start gap-2">
            <span className="text-slate-300 mt-0.5">•</span>
            Il documento è generato automaticamente a scopo informativo interno.
            Verificare i dati con il commercialista prima di procedere ai versamenti F24.
          </li>
          <li className="flex items-start gap-2">
            <span className="text-slate-300 mt-0.5">•</span>
            {riepilogo.frequenzaLiquidazione === 'trimestrale'
              ? 'Scadenze versamento trimestrale: entro il 16 aprile, 16 luglio, 16 ottobre e 27 dicembre (con maggiorazione 1% per differimento).'
              : 'Scadenze versamento mensile: entro il 16 di ogni mese successivo al periodo di riferimento.'}
          </li>
          <li className="flex items-start gap-2">
            <span className="text-slate-300 mt-0.5">•</span>
            Regime rilevato automaticamente: <span className="font-bold uppercase">{riepilogo.frequenzaLiquidazione}</span>.
            Se il regime non è corretto verificare i versamenti F24 IVA registrati nell'anno.
          </li>
        </ul>
      </div>

      {showHelp && (
        <HelpPanel 
          isOpen={true}
          onClose={() => setShowHelp(false)}
          currentView={AppView.IVA_POSIZIONE}
          onGoToManuale={onGoToManuale}
        />
      )}
    </div>
  );
};

export default IVAView;
