import React, { useMemo, useState } from 'react';
import {
  HardHat, TrendingUp, TrendingDown, Scale, ChevronDown,
  CalendarClock, CheckCircle2, Clock, Link2,
} from 'lucide-react';
import { Project, Transaction, TransactionType } from '../types';
import { CURRENCY_FORMATTER, DATE_FORMATTER } from '../constants';
import { parseUTCDate } from '../utils/gasCoreEngine';

interface VistaCantiereViewProps {
  projects: Project[];
  transactions: Transaction[];
}

const formatEuro = (v: number) => CURRENCY_FORMATTER.format(v);

const VistaCantiereView: React.FC<VistaCantiereViewProps> = ({ projects, transactions }) => {
  const progettiAttivi = useMemo(
    () => [...projects].filter(p => p.status === 'ACTIVE').sort((a, b) => a.name.localeCompare(b.name)),
    [projects]
  );

  const [selezionato, setSelezionato] = useState<string>(progettiAttivi[0]?.name ?? '');
  const progetto = progettiAttivi.find(p => p.name === selezionato);

  const righeCantiere = useMemo(
    () => transactions
      .filter(t => t.project === selezionato)
      .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [transactions, selezionato]
  );

  const stats = useMemo(() => {
    const entrateConsuntivo = righeCantiere.filter(t => t.type === TransactionType.INCOME && !t.isForecast);
    const usciteConsuntivo = righeCantiere.filter(t => t.type === TransactionType.EXPENSE && !t.isForecast);
    const entratePrevisione = righeCantiere.filter(t => t.type === TransactionType.INCOME && t.isForecast);
    const uscitePrevisione = righeCantiere.filter(t => t.type === TransactionType.EXPENSE && t.isForecast);

    const somma = (arr: Transaction[]) => arr.reduce((s, t) => s + (t.grossAmount ?? t.amount ?? 0), 0);

    return {
      entrateConsuntivo: somma(entrateConsuntivo),
      usciteConsuntivo: somma(usciteConsuntivo),
      margineConsuntivo: somma(entrateConsuntivo) - somma(usciteConsuntivo),
      entratePrevisione: somma(entratePrevisione),
      uscitePrevisione: somma(uscitePrevisione),
      numRighe: righeCantiere.length,
    };
  }, [righeCantiere]);

  if (progettiAttivi.length === 0) {
    return (
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-10 text-center">
        <HardHat size={40} className="mx-auto text-slate-300 mb-3" />
        <p className="text-slate-500 font-semibold">Nessun cantiere attivo trovato.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* ── Intestazione + selettore cantiere ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Vista Cantiere</h2>
          <p className="text-slate-500 text-sm font-medium">Entrate e uscite collegate a una singola commessa</p>
        </div>
        <div className="relative">
          <select
            value={selezionato}
            onChange={e => setSelezionato(e.target.value)}
            className="appearance-none bg-white border border-slate-200 rounded-2xl px-5 py-3 pr-10 font-bold text-slate-800 shadow-sm cursor-pointer min-w-[260px]"
          >
            {progettiAttivi.map(p => (
              <option key={p.id} value={p.name}>{p.name}</option>
            ))}
          </select>
          <ChevronDown size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
      </div>

      {progetto && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span className="font-bold text-slate-800">{progetto.client}</span>
          <span className="text-slate-400">{progetto.location}</span>
          {progetto.puntaNetCantiereId != null ? (
            <span className="flex items-center gap-1.5 text-emerald-600 font-semibold text-xs bg-emerald-50 px-2.5 py-1 rounded-full">
              <Link2 size={12} /> Collegato a PuntaNet (cantiere {progetto.puntaNetCantiereId})
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-amber-600 font-semibold text-xs bg-amber-50 px-2.5 py-1 rounded-full">
              Non collegato a un cantiere PuntaNet
            </span>
          )}
        </div>
      )}

      {/* ── Riepilogo ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-2 text-emerald-600 mb-2">
            <TrendingUp size={18} />
            <span className="text-[11px] font-black uppercase tracking-wider">Entrate consuntivo</span>
          </div>
          <p className="text-2xl font-black text-slate-900">{formatEuro(stats.entrateConsuntivo)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-2 text-rose-600 mb-2">
            <TrendingDown size={18} />
            <span className="text-[11px] font-black uppercase tracking-wider">Uscite consuntivo</span>
          </div>
          <p className="text-2xl font-black text-slate-900">{formatEuro(stats.usciteConsuntivo)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-2 text-indigo-600 mb-2">
            <Scale size={18} />
            <span className="text-[11px] font-black uppercase tracking-wider">Margine attuale</span>
          </div>
          <p className={`text-2xl font-black ${stats.margineConsuntivo >= 0 ? 'text-slate-900' : 'text-rose-600'}`}>
            {formatEuro(stats.margineConsuntivo)}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-2 text-slate-500 mb-2">
            <CalendarClock size={18} />
            <span className="text-[11px] font-black uppercase tracking-wider">Previsione residua</span>
          </div>
          <p className="text-sm font-bold text-emerald-600">+ {formatEuro(stats.entratePrevisione)}</p>
          <p className="text-sm font-bold text-rose-500">- {formatEuro(stats.uscitePrevisione)}</p>
        </div>
      </div>

      {/* ── Elenco movimenti ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Movimenti ({stats.numRighe})</p>
        </div>
        <div className="max-h-[600px] overflow-y-auto divide-y divide-slate-50">
          {righeCantiere.length === 0 && (
            <p className="text-center text-slate-400 text-sm py-10">Nessun movimento collegato a questo cantiere.</p>
          )}
          {righeCantiere.map(t => {
            const isEntrata = t.type === TransactionType.INCOME;
            return (
              <div key={t.id} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors">
                <div className="min-w-0 flex-1 mr-4">
                  <p className="text-sm font-bold text-slate-800 truncate">{t.description}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-slate-400">{DATE_FORMATTER.format(parseUTCDate(t.date))}</span>
                    <span className="text-[11px] text-slate-400">·</span>
                    <span className="text-[11px] text-slate-400">{t.category}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {t.isForecast ? (
                    <span className="flex items-center gap-1 text-[10px] font-black text-amber-600 uppercase bg-amber-50 px-2 py-1 rounded-lg">
                      <Clock size={11} /> Previsione
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[10px] font-black text-emerald-600 uppercase bg-emerald-50 px-2 py-1 rounded-lg">
                      <CheckCircle2 size={11} /> Consuntivo
                    </span>
                  )}
                  <span className={`text-sm font-black font-mono ${isEntrata ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {isEntrata ? '+' : '-'}{formatEuro(t.grossAmount ?? t.amount)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default VistaCantiereView;
